# Validation evidence

Consolidated results from the live verification scripts. Raw reports are in `reports/`.

## Summary

| Suite | Result |
|---|---|
| Read-only GET checks | **23/23 reachable**, 4 plan-gated |
| Public write flows | **28/28 steps**, 20 actions |
| Advanced flows | **68 ok**, 0 unexpected failures, 1 plan-gated, 5 prerequisite skips |
| Negative contracts | **25/25 passed**, no data created |
| Transactional send | **201 accepted**, delivery not confirmed |
| Live failures | **0** |

Catalog state: **67 live-verified**, **20 write-flow**, **1 transactional**, **1 plan-gated**, **224 spec-only**.

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
- Campaigns 12/14/15: **archived**; the API/UI do not allow deleting scheduled/sent campaigns. They cannot send.
- No account-admin mutation was executed.

## Reproduce

```bash
npm run verify
npm run verify:flows
npm run verify:advanced -- --only=all --confirm-send --email=...
npm run verify:negative
npm run diagnose:delivery
npm run verify:transactional -- --to=... --confirm-send
```

No credentials are stored in the reports. Raw HARs/profile remain in `.capture/` (gitignored) and should be deleted before publishing.
