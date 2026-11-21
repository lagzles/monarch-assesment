# Validation evidence

Consolidated results from the live verification scripts. Raw reports are in `reports/`.

## Summary

| Suite | Result |
|---|---|
| Read-only GET checks | **23/23 reachable**, 4 plan-gated |
| Spec-only read sweep | **19** 2xx, **7** plan-gated, 3 reachable 400s, 0 rate-limited |
| Public write flows | **28/28 steps**, 20 actions |
| Advanced flows | **68 ok**, 0 unexpected failures, 1 plan-gated, 5 prerequisite skips |
| Events and webhooks | `POST /events` **204**, `GET /events` **200**, webhook CRUD ok, 1 transactional **201**, 0 webhook requests |
| Negative contracts | **25/25 passed**, no data created |
| Transactional send | **201 accepted**, delivery not confirmed |
| Remaining UI domains | Captured; all inaccessible or plan-gated on this account |
| Live failures | **0** |

Catalog state: **87 live-verified**, **20 write-flow**, **1 transactional**, **1 event**, **8 plan-gated**, **197 spec-only**.

## Read-only checks

`npm run verify` — 23 GETs with a real API key:

- 18 returned `200`.
- 1 returned a legitimate `400` (`Webhook record does not exist`).
- 4 returned `403` because the free plan does not include WhatsApp campaigns, coupons or eCommerce.
- 403s were classified as plan gating, not auth failure.

Report: `reports/live/verification.json`.

## Public write flows

`npm run verify:flows` — 28 steps across 20 actions:

- List: create → get → delete.
- Contact: create → get → add to list → delete.
- Company: create → get → delete.
- Campaign: create draft → get → delete (with a recipient).
- Template: create → get → delete.

The first run failed on campaign creation with `400 "There are no contacts associated with the given recipients info"`. Fixed by creating a recipient and confirming it via `GET /contacts/lists/{id}/contacts` before creating the campaign. Final: **28/28**.

Report: `reports/live/flow-verification.json`.

## Advanced flows

`npm run verify:advanced` — 68 steps:

- CRM: deal create/get/update/delete; task create/get/update/delete; note create/get/update/delete (note associated to a test company).
- Webhooks: create/get/update/delete with a disposable `webhook.site` URL.
- Senders/domains: personal sender already existed (skipped, not modified); professional sender blocked by DMARC/domain-authentication prerequisite; test `.example.com` domain create/get/delete.
- Scheduling: `scheduledAt` accepted and read back; campaign suspended and archived.
- Sending: `sendTest` 204; `sendNow` 204 but `sent=0`/`delivered=0`, campaign suspended — delivery not confirmed.
- Account admin read-only: account, invited users, user permissions, processes; account activity plan-gated (Enterprise-only).

Report: `reports/live/advanced-flow-verification.json`.

## Spec-only read sweep

`npm run verify:spec-only` — safe GETs for actions still `spec_only`, with fixture IDs resolved from collections and defaults for paging:

- **32 GETs executed** across contacts, CRM, transactional email, templates, senders/domains, inbound, processes, email campaigns, account admin, eCommerce, loyalty, coupons and payments.
- **19 returned 2xx** and were promoted to `live_verified` / `read_check`.
- **7 returned 403** and were marked `plan_gated`: account admin/sub-accounts, eCommerce categories and external feeds (Enterprise).
- **3 returned 403 for a feature flag/permission** (`CONSENT_GROUP_NOT_ENABLED`, eCommerce `Forbidden`); recorded as `reachable_403`, not promoted.
- **3 returned validation 400s** (`A/B test` campaign mismatch, invalid UUID batch id, missing `email`/`messageId`/`templateId` filter); the endpoints are reachable but remain `spec_only`.
- **0 rate-limited**; the script stops on 429 and records skipped actions.
- **7 GETs skipped** because no fixture ID existed (companies/deals/tasks/notes/files/domain names).

Report: `reports/live/spec-only-sweep.json`; overlay: `reports/live/spec-only-overlay.json`.

## Events and webhooks

`npm run verify:events -- --to=... --confirm-send`:

- Test contact created and deleted.
- `POST /events` with `event_name: agent_catalog_verify` and `identifiers: { email_id }` returned **204**.
- `POST /events` initially returned 400 for two reasons, both documented: `identifiers.email` is invalid (use `email_id`), and `event_date` later than Brevo's clock is rejected. Omitting `event_date` is the safe path.
- `GET /events?event_name=...` returned **200**.
- Webhook create/delete succeeded against a disposable `webhook.site` URL.
- One transactional email returned **201** (accepted), but **0 webhook requests** arrived within 20s; event delivery is **not confirmed**.

`catalog/webhook-events.json` documents 18 event types and type compatibility. `catalog/automation-triggers.json` documents 66 UI-only automation triggers, their plan requirements and whether an API/webhook path can feed them.

Report: `reports/events-webhooks.md`, `reports/live/events-webhooks.json`.

## Remaining UI domains

A third browser capture session probed the domains not covered by the first two:

- **SMS:** `/sms-campaign/listing` returned a generic error page; the campaigns listing exposes only the E-mail tab.
- **eCommerce:** `/ecommerce/overview` returned “Não foi possível exibir esta página”.
- **Landing pages:** `/marketing/landing-pages` returned an error page.
- **Payments:** `/payments` returned an error page.
- **Loyalty:** accessible only as an Enterprise upgrade page.
- **Automations:** onboarding page loaded, but “Criar sua primeira automação” was disabled; no editor flow captured.
- **Conversations:** the conversations app loaded, but the accessibility snapshot had no interactive elements.
- **HAR result:** 1,156 requests → **168 first-party endpoints** (157 internal + 11 app backend), merged into `curated/observed-endpoints.json`. **0** new public-action matches; 23 mappings remain (21 actions), 145 internal-only.

These are access/plan limitations, not failed assertions. No SMS/WhatsApp message, automation, landing page, payment or loyalty object was created.

## Negative contracts

`npm run verify:negative` — 25 expected-error cases:

- Missing required fields on create endpoints.
- Get/update/delete of non-existent ids.
- Invalid email, invalid domain, invalid status.
- Invalid permissions lookup.

All returned the expected 4xx; **no data was created**. Report: `reports/negative-contracts.md`.

## Transactional send

`npm run verify:transactional -- --to=... --confirm-send`:

- **One** `POST /smtp/email` returned **201** with a `messageId`.
- `/smtp/emails` and `/smtp/statistics/events` returned empty afterwards.
- Recorded as `transactional_flow` + `live_verified` for API acceptance, with **delivery not confirmed** in the note.

Report: `reports/transactional-delivery.md`.

## Delivery diagnosis

`npm run diagnose:delivery` (read-only):

- Plan: free, **300 send credits** (`sendLimit`).
- Sender: **1 active sender**, domain `gmail.com`, no dedicated IPs.
- Domains: **no authenticated sender domain**.
- Campaigns 12/14/15: `suspended`, `sent=0`, `delivered=0`, sender `gmail.com`.
- **Likely blocker:** free-mail sender domain without an authenticated sending domain. Gmail publishes DMARC that Brevo cannot authenticate; Brevo commonly suspends campaigns from free-mail senders.
- **Recommendation:** authenticate a domain you control, create the sender there and retry `sendTest` to one address.

Report: `reports/delivery-diagnosis.md`.

## Cleanup and residual state

- Contacts, lists, companies, deals, tasks, notes, templates and domains: **zero test matches** on a follow-up GET.
- Senders: personal sender was pre-existing and untouched; professional sender was never created.
- Webhooks: deleted; disposable `webhook.site` token removed.
- Event test contact: deleted; no event data retained in the repository.
- Campaigns 12/14/15: **archived**; the API/UI do not allow deleting scheduled/sent campaigns. They cannot send.
- No account-admin mutation was executed.

## Reproduce

```bash
npm run verify
npm run verify:flows
npm run verify:advanced -- --only=all --confirm-send --email=...
npm run verify:spec-only -- --domains=contacts,crm --limit=30
npm run verify:events -- --to=... --confirm-send
npm run verify:negative
npm run diagnose:delivery
npm run verify:transactional -- --to=... --confirm-send
```

No credentials are stored in the reports. Raw HARs/profile remain in `.capture/` (gitignored) and should be deleted before publishing.
