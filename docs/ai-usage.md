# How AI was used

## Origination

The core idea for this submission came from me (the candidate): use an AI model with a **real Brevo API key** to evaluate the API surface, instead of relying only on documentation. I provided the free Brevo account, the REST API key and the scope. The AI agent (Command Code) designed and implemented the extraction pipeline, taxonomy, catalog format, validation, verification and packaging.

The sections below separate what the agent did, what I decided or provided, and what still needs my review. Where a claim is documentation-derived rather than observed, it says so.

## Stack

| Layer | Tool | Role |
|---|---|---|
| Implementation agent | Command Code (AI coding agent) | Repo scaffolding, parser/generator scripts, taxonomy design, curation drafts, docs. |
| Research | Web search + page fetch (public pages only) | Brevo OpenAPI spec, authentication/rate-limit docs, help-center articles, MCP module list. Browser automation was used separately for the capture pass. |
| Deterministic extraction | Node.js + `js-yaml` | Parse 1.17 MB OpenAPI YAML, resolve `$ref`, flatten schemas/params/examples/errors. |
| Validation | `ajv` + custom checks | JSON Schema, duplicate ids/tool names, reference resolution, counts, secret scan. |
| Verification | Node.js `fetch` against Brevo API | 23 read-only GET checks + spec-only sweep (19 2xx, 7 plan-gated) + 28 write-flow steps (20 actions) + 68 advanced-flow steps + 1 event flow + 1 transactional send; overlays into the catalog. |
| Browser capture | Command Code `agent-browser` (CDP + HAR) | Drove a dedicated Chrome profile on my free account, recorded network traffic, imported and redacted the HAR. |
| Packaging | Node.js | JSON/JSONL/per-domain slices/index/OpenAI-style tool definitions. |

## Division of labor

| Phase | Agent did | I decided / provided | Still needs my review |
|---|---|---|---|
| Origination | Proposed the catalog architecture and executed it. | **I proposed using an AI model with a real API key to evaluate endpoints**, and provided the account, key and scope (API + UI inventory, English artifacts). | — |
| Understand the brief | Extracted the PDF and summarized requirements and grading weights. | Confirmed the scope and language. | — |
| Source discovery | Found the official OpenAPI URL, help-center areas and MCP module list; measured 208 paths / 292 operations. | Approved using the public spec and my free account. | The browser/network capture scope (completed later). |
| Taxonomy | Drafted 32 business domains and the tag/path mapping from the operation list. | Set the direction: business-action-first, not tag mirroring. | The domain groupings themselves (not line-reviewed yet). |
| Extraction | Wrote `spec.mjs` + `build-catalog.mjs`: `$ref` resolution, input flattening, examples, errors, rate limits, risk/idempotency heuristics. | Approved the approach. | The risk/idempotency heuristics. |
| Curation | Drafted business framing for 34 high-value actions. | Asked for business-level intent, not endpoint prose. | The 34 curated actions, line by line. |
| UI inventory | Drafted 203 UI actions from **public help-center pages**; browser capture came later as evidence. | Chose to include UI coverage; did not provide UI observations. | The UI paths and UI-only claims. |
| Packaging | Generated catalog, JSONL, slices, index, `agent-tools.json`, search CLI. | Asked for something an agent could consume directly. | The final artifact set and naming. |
| Reliability | Built the validator, coverage report and live-verification script. | Supplied the API key and the "no credentials in the repo" rule. | The pass/fail bar and risk policy. |
| Live verification | Ran 23 read-only GET checks with my key and the spec-only sweep; applied the overlay. | Provided the key. | The interpretation of the results (8 plan-gated endpoints, 19 read promotions). |
| Browser capture | Drove the logged-in UI through contacts, lists, companies, email campaigns, forms and templates; then probed SMS, eCommerce, landing pages, payments, loyalty, automations and conversations; recorded HARs; wrote the importer and the public-vs-internal comparison. | Approved using the free account for test data; the agent created and deleted the test entities. | The 23 observed-to-catalog mappings and the access/plan findings. |
| Write-flow verification | Wrote and ran `verify-flows.mjs`: public POST/GET/DELETE flows for list, contact, company, campaign and template, with cleanup. | Approved creating/deleting test data with the API key. | The 20 actions promoted to write-flow verified. |
| Advanced flow verification | Wrote and ran `verify-advanced-flows.mjs`: CRM deals/tasks/notes, webhooks, senders/domains, scheduling, send test/now and account reads, with cleanup and plan-gated classification. | Authorized test data and send tests to one address. | The advanced result interpretation, especially that sendNow did not confirm delivery. |
| Negative contracts + diagnosis | Wrote and ran `verify-negative-contracts.mjs` (25 expected-error cases) and `diagnose-delivery.mjs` (read-only blocker analysis). | Authorized the negative tests; no data created. | The diagnosis conclusion (free-mail sender without authenticated domain). |
| Spec-only sweep | Wrote and ran `verify-spec-only.mjs`: safe GETs with fixtures and rate-limit stop. | Authorized read-only checks with the key. | The 19 2xx / 7 plan-gated classification. |
| Events/webhooks | Wrote and ran `verify-events-webhooks.mjs`: custom event, webhook CRUD and one transactional send. | Authorized one send to the personal address. | The finding that delivery is not confirmed (0 webhook requests). |
| Remaining UI probes | Opened the remaining domains and recorded access/plan limitations. | Authorized the browser session. | No new mappings were possible on this account. |
| Transactional delivery test | Sent exactly one `POST /smtp/email` to the personal address and checked logs/events. | Authorized `--confirm-send` for one message. | The interpretation that 201 does not confirm delivery. |
| Docs | Drafted README, approach, gaps, this document. | — | The whole narrative, in my voice. |

## What the AI got wrong — and how it was caught

This is the part that matters. None of these were caught by "reading the output and trusting it"; they were caught by machine checks or cross-referencing the spec.

1. **Broken slug generation for camelCase operation ids.**
   The first build produced ids like `contacts.getcontacts` and `contacts.createlist`. The cause: tokenizing `getContacts` as a single token instead of splitting camelCase first. It surfaced because 36 UI references no longer resolved during validation. Fix: `slugify()` before stopword removal. Result: `contacts.get_contacts`, `contacts.create_list`.

2. **An override that matched nothing.**
   `conversations.send_message` was keyed by `operationId: sendMessage`, but the Conversations endpoints have **no `operationId`** in the spec. The override silently never applied. Fix: match by `method + path` instead, and add `curated/ids.json` for the many operations missing ids (`POST /conversations/messages` → `conversations.send_message`).

3. **A duplicate action created by a dangling reference.**
   `senders_and_domains.validate_sender_otp` was referenced as `validate_sender_by_otp`. Because the reference did not resolve, the UI action fell through and was emitted as an extra UI-only entry (`validate_sender_otp_2`). The validator surfaced the unknown reference; fixing the id removed the duplicate.

4. **A wrong denominator in the coverage report.**
   The first report said "275/176 write actions ship an input schema" — a nonsensical ratio caused by counting all API actions in the numerator but write actions in the denominator. Caught by reading the generated markdown, not by the schema validator. Fix: use `write_actions_with_input_schema`.

5. **Over-broad "high risk" classification.**
   `send_test_email` and `remove_contact_from_list` were classified high-risk/confirm because the verb heuristic saw "send"/"delete". This is conservative rather than dangerous, but noisy for agents. Kept as-is for now and documented; the override file is the intended place to relax specific actions after human review.

6. **UI-only coverage is documentation-derived, except for the captured flows.**
   The 58 UI-only actions and their paths mostly come from public help-center articles. Three browser captures observed contacts, lists, companies, email campaigns, forms, templates, automations onboarding, conversations and module access probes: **168 first-party endpoints** (157 internal + 11 app backend), 23 mappings across 21 catalog actions (20 public + 1 UI-only), 145 internal-only. The third capture added no public mappings because SMS, eCommerce, landing pages, payments, loyalty and the automation editor were inaccessible or plan-gated. The remaining inventory is still capped at 0.72 confidence and marked `verification.status: unverified`.

7. **Numeric path IDs were not normalized.**
   The first HAR import produced `observed.contacts_api_v2.delete_lists_3` because the normalizer only replaced segments of three or more digits. Fixed to replace any all-digit segment while preserving version segments (`v2`, `v3`). Result: `/lists/{id}`.

8. **An email address leaked into a path.**
   One internal endpoint had the contact email as a path segment (`/transactional/senders/<email>`). The redaction scan caught it. Fixed `normalizePath` to replace email segments with `{email}` and re-imported.

9. **Some UI request bodies were not captured by the HAR exporter.**
   `POST /lists/create` and `POST /contacts/add-contact` recorded `bodySize=0`, even though the actions succeeded. The importer now marks `request_body_captured: false` instead of pretending the body was empty by design. The public action schemas still cover execution; the next step is a fetch/XHR interceptor or CDP `Fetch`.

10. **The campaign write flow failed on an empty audience.**
    The first `POST /emailCampaigns` returned `400 "There are no contacts associated with the given recipients info"` because the test list had no contacts. Fix: create a recipient contact in the list and confirm it via `GET /contacts/lists/{id}/contacts` before creating the campaign. After the fix, 28/28 write-flow steps pass.

11. **Encoded emails leaked into the write-flow report.**
    `redactEmail` handled `name@example.com` but not `name%40example.com` in URL paths. The leak scan caught it; the regex now covers both forms and the report was regenerated.

12. **CRM task creation rejected a date-only value.**
    `POST /crm/tasks` returned `400 "Date format 2026-11-22 is not valid"`; it expects a full ISO timestamp. Fixed to send `new Date(...).toISOString()`.

13. **CRM note creation requires an entity association.**
    `POST /crm/notes` returned `400 "entity ids cannot be empty"`. Fixed by creating a test company and passing `companyIds` when creating/updating the note.

14. **Campaign cancellation used the wrong status.**
    `PUT /emailCampaigns/{id}/status` with `cancel` returned `400 "cancel is an invalid status for scheduled campaign"`. The working transition is `suspended`, followed by `archive`. Scheduled/sent campaigns cannot be deleted (`403`), only suspended/archived.

15. **`sendNow` accepted the call but did not confirm delivery.**
    `POST /emailCampaigns/{id}/sendNow` returned `204`, but the campaign status was `suspended` and stats showed `sent=0`/`delivered=0`. The catalog records this caveat instead of claiming delivery.

16. **Two prerequisites blocked expected writes.**
    The professional sender was rejected with `400 "Your DMARC policy requires your domain to be authenticated"`, and account activity returned `400 "Upgrade to Enterprise plan"`. The script classifies these as prerequisite-skipped and plan-gated, not failures.

## Provenance status (what is observed vs documented)

| Layer | Source | Observed how | Status |
|---|---|---|---|
| 292 API actions | Pinned OpenAPI 3.0.1 spec | Parsed from the spec, not probed endpoint-by-endpoint | `spec_only` |
| 87 of those API actions | Brevo REST API | Read GETs, write flows, advanced flows, one event flow and one transactional send | `live_verified` (multiple kinds) |
| 203 UI actions | Public help-center pages + MCP module taxonomy | Fetched over HTTP; browser evidence for nine flows | `unverified` (0.72) outside captured flows |
| 168 internal endpoints | Real browser sessions (contacts, lists, companies, campaigns, forms, templates, automations onboarding, conversations, module access probes) | `agent-browser` + CDP + HAR, authenticated session, redacted | Observed; 23 mappings across 21 actions (20 public + 1 UI-only), 145 internal-only |
| 20 write-flow actions | Brevo REST API (public) | Real POST/GET/DELETE flows with unique test data and cleanup | `live_verified` (`write_flow`) |
| Advanced flow actions | Brevo REST API (public) | CRM, webhooks, senders/domains, scheduling, send test/now, account reads | `live_verified` (`advanced_flow`); 1 `plan_gated` in this suite, 8 in the catalog; 5 prerequisite skips |
| Event flow | Brevo REST API (public) | `POST /events` 204, `GET /events` 200 | `live_verified` (`event_flow`) |
| 8 partial actions | Spec + public docs | Documentation-derived | Mixed |

No private or internal endpoints are presented as public API tools. The `ui_path` values outside the captured flows are reconstructions from article titles/descriptions, not observed click paths. The captured flows have real UI labels and internal endpoints attached as `observed_ui`.

## Guardrails that keep the output honest

- **No invented endpoints.** Every executable action's method/path/base URL comes from the pinned spec at build time. Curation cannot override `execution.endpoint`.
- **Evidence is mandatory.** Each action records its source (`openapi` or `ui_inventory`), operation id (or null), UI area/path and spec version.
- **Confidence is explicit.** 0.90+ for well-documented API actions, 0.86 for write operations without a body, 0.72 for UI-only. Live verification nudges confidence up/down.
- **Three execution kinds.** The catalog cannot pretend a UI-only action is executable; `api_partial` forces the agent to escalate the remainder.
- **Build fails on structural problems.** `npm run validate` checks the schema, unique ids and tool names, all references, manifest/JSONL counts, and that UI-only actions have no endpoint. A broken catalog cannot be published silently.
- **Secrets never enter the repo.** The key is read from `.env` at runtime, `.env` is gitignored, and no tool output or artifact contains it.
- **Raw captures stay out of git.** `.capture/`, `*.har`, `cookies*.json` and `reports/capture/` are ignored. The importer redacts cookies, auth headers, emails in path segments and JWT-like strings before anything is committed.

## What was verified, and by what

**Automated (reproducible):**
- Every number in the README and reports is generated; `npm run all` rebuilds and revalidates.
- JSON Schema, unique ids/tool names, all references, manifest/JSONL counts, credential-shaped strings.
- Spec checksum is recorded in `catalog/manifest.json`.

**Live (agent-run with my key):**
- 23/23 checked endpoints were reachable: 18 with `200`, 1 with a legitimate `400` ("webhook record does not exist"), and 4 with `403` because the free plan does not include WhatsApp campaigns, coupons or eCommerce.
- The 403s were classified as plan gating, not auth failure. The overlay is in `reports/live/verification.json` and applied to the catalog.

**Browser capture (agent-run in a dedicated Chrome profile):**
- 5,000+ HAR entries across three captures -> **168 first-party endpoints** (157 internal + 11 app backend); **23 mappings** across **21 catalog actions** (20 public + 1 UI-only), **145 internal-only**. The third capture probed SMS, eCommerce, landing pages, payments, loyalty, automations and conversations; those modules were inaccessible or plan-gated, so it added no public mappings.
- Test list, contact, company, draft campaign, form and template created and deleted; no email/SMS/WhatsApp was sent.
- The redaction scan over committed artifacts is clean: no cookies, auth headers, emails in paths, API keys or JWT-like strings.

**Write-flow verification (agent-run with my key):**
- 28/28 steps across 20 public actions: create/list/get/delete for lists, contacts, companies, campaigns and templates.
- Cleanup ran in `finally`; a follow-up GET over contacts, lists, companies, campaigns and templates found **zero test matches**.
- The campaign flow required a non-empty recipient list; the fix is documented in item 10 above.

**Advanced flow verification (agent-run with my key):**
- 68 steps ok, 0 unexpected failures, 1 plan-gated (account activity, Enterprise-only), 5 prerequisite skips.
- CRM deals/tasks/notes full CRUD; webhooks create/get/update/delete with a disposable URL; test domain create/get/delete.
- Sending: `sendTest` and `sendNow` returned 204, but delivery was **not confirmed** (`sent=0`, campaign suspended). Recorded as a caveat.
- Cleanup: zero test matches for contacts, lists, companies, deals, tasks, notes, templates and domains. Campaigns 12/14/15 could not be deleted after scheduling; 12 archived, 14/15 suspended.

**Negative contracts + delivery diagnosis (agent-run, read-only where applicable):**
- 25/25 negative cases passed; no data was created.
- Plan has 300 credits; 1 active sender; no authenticated domain; sender domain is `gmail.com`.
- Campaigns are suspended with `sent=0`/`delivered=0`.
- Likely blocker: free-mail sender domain without an authenticated sending domain. Recommendation: authenticate a domain you control and retry.

**Transactional delivery test (agent-run with my key):**
- One `POST /smtp/email` returned **201** with a `messageId`.
- No delivery event/log was visible afterwards (`/smtp/emails` and `/smtp/statistics/events` returned empty).
- Recorded as `transactional_flow` + `live_verified` for API acceptance, with **delivery not confirmed** in the note.

**Events and webhooks (agent-run with my key):**
- `POST /events` returned **204** with `identifiers.email_id`; `GET /events` returned 200.
- Webhook create/delete succeeded against a disposable `webhook.site` URL.
- One transactional send returned **201**, but **0 webhook requests** arrived within 20s; delivery is **not confirmed**.

**Checked by the agent, not by me line-by-line:**
- The 34 curated actions against the spec's request/response schemas (e.g. `createContact`'s `forceMerge`/`getId`, `addContactToList`'s 150-item limit).
- The taxonomy against the full operation list (every operation resolves to a domain).
- UI-only claims against multiple help-center articles per domain.

**Not yet verified:**
- The remaining UI-only actions in SMS/WhatsApp, eCommerce, landing pages, payments, loyalty, automations and conversations. Those domains were inaccessible or plan-gated on this account; the captured evidence is recorded, but no new mappings were possible.
- Webhook payload schemas and automation workflow CRUD; event names and 66 triggers are documented, but workflow execution is UI-only.
- The 197 `spec_only` actions that still lack a fixture or a safe write path.
- Positive sender/domain success: requires a domain you control and DNS authentication; `.example.com` only validates the CRUD contract.
- Account admin mutations: invitations, permission changes, sub-account creation, API keys and plan updates.
- End-to-end send delivery (inbox/webhook) and the credit/sender conditions behind `sent=0`; the transactional test was accepted but delivery was not confirmed.
- The missing internal request bodies for some UI creates (`bodySize=0` in the HAR).
- Plan/permission requirements per action.

## What I would not delegate to AI

- The final risk/confirmation policy for destructive or financial actions.
- Any claim that a live endpoint behaves as documented without actually calling it.
- Legal/ToS judgments about reverse-engineering private endpoints — which is why internal endpoints are kept as redacted evidence with `stability: internal`, never emitted as public tools.
