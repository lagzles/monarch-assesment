# Known gaps and limitations

This file is deliberately adversarial to the submission. If an evaluator opens the catalog and finds a hole, it should already be listed here.

## Coverage gaps

| # | Gap | Impact | Why it exists | Mitigation / next step |
|---|---|---|---|---|
| 1 | **Webhook event types are not modeled as actions.** The catalog has webhook CRUD, but not "subscribe to `contact.created`" as a first-class business action. | An agent cannot discover which events exist or what each payload means. | The OpenAPI spec documents webhook CRUD, not the event catalog. | Next: scrape `developers.brevo.com` event docs into an `events` artifact and attach allowed event types to `webhooks.create_webhook`. |
| 2 | **Marketing automation is UI-only in the catalog.** 11 automation actions (create workflow, add trigger/step, enroll, pause, logs) have no public API action. | Coverage stops at the UI boundary; an agent cannot build workflows. | Brevo's public API does not expose workflow CRUD. | Correctly marked `ui_only` instead of faking it. Next: document the internal UI network calls if ToS permits, or use the MCP server if it exposes them. |
| 3 | **Landing pages, forms, push, Ad Studio, meetings and phone are UI-only** (58 actions). | Those intents require a human. | No public API. | Explicit `execution.kind: ui_only` + UI paths, so the agent escalates rather than hallucinating. |
| 4 | **Some UI actions are merged into a broad API action.** E.g. many contact edits collapse into `contacts.update_contact`. | An agent searching for a specific UI label may land on a broad action. | One API call genuinely serves several UI flows. | `matched_ui_actions` preserves the UI names/paths; retrieval includes those tokens. |
| 5 | **Scheduling is partial, not first-class.** Campaign scheduling is a `scheduledAt` field; there is no "schedule campaign" endpoint. | `api_partial` actions require the agent to compose fields correctly. | API design. | Marked `api_partial` with `related_action`; input schemas expose the field. |
| 6 | **Social media / ads beyond Ad Studio** were not inventoried. | Possibly missing actions if Brevo's current plan exposes them. | Not surfaced in the public help-center categories inspected. | Needs a logged-in product walkthrough. |
| 7 | **Plan-gated features are not modeled per action.** Loyalty, payments, phone, coupons, WhatsApp and eCommerce depend on the account plan. Live checks confirmed this: on a free account, WhatsApp campaigns, coupon collections, products and orders returned `403` (`plan not eligible` / `section not activated`). | An action may exist in the catalog but fail with a plan error for a given account. | Plan rules are dynamic and account-specific. | Next: add `requires_plan` / `feature_flag` metadata from docs + live probing; surface the observed `account_entitlement` already captured in `verification`. |
| 8 | **API key scopes / user permissions are not per-action.** | An agent may assume it can execute an action its key cannot. | Spec documents `api-key` auth but not per-endpoint scopes. | Next: attach a `required_permissions` field after testing with restricted keys. |

## Reliability gaps

| # | Gap | Impact | Mitigation |
|---|---|---|---|
| 9 | **Live verification covers 67 actions (23 read + 20 write + advanced + 1 transactional), not all 292.** 224 remain `spec_only`; 1 is `plan_gated`. | Examples/error codes outside the checked set are documented but not observed. | `npm run verify`, `npm run verify:flows`, `npm run verify:advanced` and `npm run verify:transactional` cover the current set. Next: account-admin mutations on a disposable sub-account. |
| 10 | **UI coverage is mixed: documentation for 203 actions, browser evidence for six flows.** Real browser captures covered contacts, lists, companies, email campaigns, forms and templates: 137 internal endpoints observed, 23 mappings across 21 catalog actions (20 public + 1 UI-only), 114 internal-only. The rest of the 203-action inventory still comes from public help-center pages. | UI paths and mappings outside the captured flows remain documentation-derived. | Captured evidence is committed in `curated/observed-endpoints.json` and attached to actions as `observed_ui`; the rest is marked `unverified`. Next: capture SMS/WhatsApp, automations, landing pages, eCommerce, loyalty and conversations. |
| 11 | **Risk scoring is heuristic.** 103 high-risk actions include conservative false positives (e.g. test sends). | Agents may over-ask for confirmation. | Overrides in `curated/overrides.json`; policy is visible and reviewable. |
| 12 | **Idempotency is derived from method + naming.** `POST` is assumed non-idempotent unless the name says upsert. | Retry logic may be too conservative or too loose. | Conservative default; per-action override available. |
| 13 | **Rate limits are the Free/Starter general tier only.** Advanced/Enterprise tiers differ. | Throughput guidance may be wrong for paid accounts. | `rate_limit.tier` notes the source; next: encode all three tiers. |
| 14 | **Output schemas are dereferenced only to depth 8.** Deep recursive objects are cut with `x-recursive-ref`. | Some nested response fields are summarized, not fully expanded. | Deliberate trade-off for size; the spec path remains in `evidence`. |
| 15 | **One write action has no input schema** (`ecommerce.activate_ecommerce_app`). | The agent must call it with an empty body. | Surfaced as a validator warning; documented. |
| 16 | **Enum truncation at 60 values** and description truncation at 280–600 chars. | Very large enums/descriptions are abbreviated. | Marked with `x-enum-truncated`; full text remains in `sources/brevo-openapi.yml`. |
| 17 | **Some UI write request bodies were not captured.** For `POST contacts-api-v2 /lists/create` and `POST contacts-api /contacts/add-contact`, the HAR exporter recorded `bodySize=0`. | The internal payload schema for those calls is unknown; only the response shape (`{id}`, `{contact_id}`) is recorded. | Public action schemas still cover execution. Next: wrap `fetch`/XHR or use the CDP `Fetch` domain to capture bodies. |
| 18 | **Internal endpoints are evidence, not executable actions.** 114 observed endpoints have no public equivalent. | An agent cannot call them with an API key; they need a browser session and internal CSRF/session state. | Kept in `curated/observed-endpoints.json` with `stability: internal`; never emitted as tools. |
| 19 | **CRM deals, tasks and segments were plan-gated in the UI on the free account.** The UI redirected to a CRM onboarding/upgrade page. | The UI capture could not include them. | The public API was tested separately: deals/tasks/notes full CRUD succeeded via the API key. Segments remain UI-only in the capture. |
| 20 | **Send was accepted but delivery is not confirmed.** `sendTest` and `sendNow` returned 204, but the campaign ended `suspended` with `sent=0`/`delivered=0`. | The catalog cannot claim delivery for these actions. | Recorded as a caveat in `verification.note`; next: verify inbox/webhook delivery and investigate credits/sender readiness. |
| 21 | **Campaign lifecycle blocks deletion after scheduling.** `DELETE /emailCampaigns/{id}` returns 403 for scheduled/sent campaigns; only `suspended`/`archive` work. | Three test campaigns remain in the account: 12 archived, 14/15 suspended. They cannot send. | Documented; delete them manually in the UI if desired. |
| 22 | **Two prerequisites blocked expected writes.** The professional sender was rejected with DMARC/domain-authentication required, and account activity is Enterprise-only. | Those actions are not verified for this account. | Recorded as prerequisite-skipped / `plan_gated`; retry after authenticating the domain or upgrading. |

## Data-quality caveats

- **Campaign creation requires a non-empty audience.** The public API returns `400 "There are no contacts associated with the given recipients info"` if the target list has no contacts. The flow verifier creates and confirms a recipient before creating the campaign.
- **Spec anomalies are preserved.** Some operations lack `operationId`; several tags duplicate (`Companies`/`companies`, `Deals`/`deals`); `sendAysncTransactionalSms` is misspelled upstream. The catalog normalizes ids without hiding the original in `evidence.operation_id`.
- **Conditional requirements are not machine-enforced.** E.g. `createContact` requires email *or* `ext_id` *or* SMS; the spec expresses this in prose, not JSON Schema. `required` reflects only what is structurally required.
- **Errors are descriptions, not schemas.** Status codes and meanings are captured, but error body shapes are not modeled per endpoint.
- **No monetary/credit cost model.** Email/SMS/WhatsApp credits and payment fees are not attached to actions.
- **No pagination helper metadata.** List endpoints expose query params, but cursor/offset semantics are not normalized into a shared `pagination` field.

## Delivery diagnosis (read-only)

- Plan: **free, 300 send credits** (`sendLimit`). Credits are not the blocker.
- Sender: **1 active sender**, domain `gmail.com`, no dedicated IPs. Sender activation is not the blocker.
- Domains: **no authenticated sender domain** in the account.
- Campaigns 12/14/15: `suspended`, `sent=0`, `delivered=0`, sender domain `gmail.com`.
- **Likely blocker:** sending from a free-mail domain (`gmail.com`) without an authenticated sending domain. Gmail publishes DMARC that Brevo cannot authenticate, and Brevo commonly suspends campaigns from free-mail senders.
- **Recommendation:** use a domain you control, authenticate it (Brevo code, DKIM, DMARC), create the sender on that domain, then retry `sendTest` to one address. Transactional SMTP may work for a delivery test, but do not expect `gmail.com` campaign sending to succeed.
- **Transactional test:** one `POST /smtp/email` returned 201 with a `messageId`, but no delivery event/log was visible; recorded as accepted with delivery not confirmed.
- Negative contracts: **25/25 passed** across contacts, lists, companies, campaigns, templates, webhooks, senders, domains and account permissions.

## What I would do first with more time

1. **Extend the browser capture** to SMS/WhatsApp, automations, landing pages, eCommerce, loyalty and conversations. The current capture covers contacts, lists, companies, campaigns, forms and templates.
2. **Recover the missing request bodies** for the UI list/contact creates with a fetch/XHR interceptor or CDP `Fetch`.
3. **Extend write-flow verification** to account-admin mutations on a disposable sub-account: invitations, permission changes, sub-account creation, API keys and plan updates.
4. **Model webhook events and automation triggers** — the largest gap between "what the product does" and "what the catalog knows".
5. **Add plan/permission requirements per action**, validated with a restricted key.
6. **Build a retrieval + execution evaluation harness** (50 realistic intents; precision@k, steps-to-correct-action, unsafe-action rate).
7. **Generate an MCP server** from `catalog/agent-tools.json` so the catalog is directly callable by Claude/Cursor.
8. **Walk the logged-in UI** for the remaining 58 UI-only actions and attach screenshots/accessibility snapshots to raise confidence.
9. **Encode full rate-limit tiers and cost/credit impact** so an agent can plan volume safely.

## Account admin mutations not executed

These have high blast radius and were intentionally left out of automation:

- `POST /organization/user/invitation/send` — invite a user (sends email, creates a pending user).
- `PUT /organization/user/invitation/{action}/{email}` — resend/cancel an invitation.
- `PUT /organization/user/invitation/revoke/{email}` — revoke an invitation.
- `POST /organization/user/update/permissions` — change a user's permissions.
- `POST /corporate/subAccount` — create a sub-account (plan/billing impact).
- `PUT /corporate/subAccount/{id}/plan` and `PUT /corporate/subAccounts/plan` — change plans.
- `POST /corporate/subAccount/key` — create an API key for a sub-account.
- `POST /corporate/subAccount/ssoToken` and `POST /corporate/ssoToken` — generate SSO tokens.
- `PUT /corporate/subAccount/{id}/applications/toggle` — enable/disable apps.
- `POST /corporate/user/invitation/send` — invite an admin user.
- `PUT /corporate/user/{email}/permissions` — change admin permissions.
- `DELETE /corporate/user/revoke/{email}` — revoke an admin user.
- `POST /corporate/subAccount/ip/associate` and `PUT /corporate/subAccount/ip/dissociate` — IP association.
- `POST`, `PUT`, `DELETE` under `/corporate/group` — sub-account group management.

Read-only account-admin endpoints were exercised: account details, invited users, user permissions and processes. Account activity is plan-gated.

## Explicit non-goals

- Reverse-engineering private/undocumented endpoints.
- Storing credentials or session tokens.
- Producing a human-facing UI; the consumer is an agent.
- Claiming completeness: Brevo changes frequently, and this is a point-in-time snapshot with a pinned spec checksum.
