# Approach and plan

## 1. How I framed the problem

The brief asks for a catalog of **business actions** — "everything a user would be able to do when clicking around the product" — consumed by **AI agents**, not people. That phrasing rules out two common shortcuts:

1. **Dumping the OpenAPI spec.** It is an API inventory, not a business inventory. It misses landing pages, forms, automations and other UI-only work, and it describes endpoints in transport terms rather than intent.
2. **Writing human documentation.** Prose is not retrievable, not type-checked, and cannot be executed.

I defined "agent-ready" as four properties and used them as design constraints:

| Property | What it means | How the catalog delivers it |
|---|---|---|
| **Discoverable** | An agent can find the right action from a natural-language intent. | Stable ids, business-domain taxonomy, `intent`, `when_to_use`, `synonyms`, lexical index, JSONL, a search CLI. |
| **Executable** | The action carries everything needed to perform it. | Method, path, base URL, auth, path/query/body mapping, JSON input schema, output schema, errors, rate limits. |
| **Safe** | The agent knows when *not* to act alone. | `risk_level`, `confirmation_required`, `idempotency`, `reversibility`, `side_effects`, `preconditions`. |
| **Trustworthy** | A supervisor can audit why an action is believed to be correct. | Evidence (spec operation id / UI path), confidence score, verification status, validation pipeline. |

The guiding principle: **never invent capability**. If the public API does not support something, the catalog says `ui_only` instead of mapping it to a nearby endpoint.

## 2. Source strategy

| Layer | Source | Why |
|---|---|---|
| Executable truth | Official OpenAPI 3.0.1 spec (`api.brevo.com/v3/swagger_definition_v3.yml`, pinned in `sources/`) | Authoritative for paths, parameters, schemas, responses and errors. 208 paths / 292 operations. |
| Product surface | Brevo **public help-center pages** (CRM, Marketing, Automations, Commerce, Conversations, Transactional), fetched over HTTP | Reveals features the API does not expose: landing pages, forms, push, Ad Studio, meetings, phone, automation editor. Browser captures are used as evidence where the UI was accessible; see the provenance note below. |
| Agent taxonomy cross-check | Brevo's public MCP server documentation (27 modules) | Confirms the product is already grouped into agent-sized domains; used as a sanity check, not copied blindly. |
| Operational metadata | Brevo docs: authentication, rate limits | Auth schemes and the Free/Starter rate-limit table per route. |

Pinning the spec is intentional: coverage numbers and ids stay reproducible even if Brevo changes the live document. `manifest.json` records the sha256.

**Important provenance distinction:** the API layer is spec-derived (292 actions, 87 of them additionally checked live with a real key). The UI layer is **primarily documentation-derived** from public help-center pages. Three browser sessions were also used as evidence: the first two covered contacts, lists, companies, email campaigns, forms and templates; the third probed SMS, eCommerce, landing pages, payments, loyalty, automations and conversations, all of which were inaccessible or plan-gated on the free account. UI paths outside the captured flows are reconstructions and are marked `unverified`.

That browser pass used Command Code `agent-browser` (CDP + HAR) on a free Brevo account to observe what the UI actually calls. The three captures produced **168 first-party endpoints** (157 internal API + 11 app backend), mapping **23** observed endpoints across **21 catalog actions** (20 public + 1 UI-only), and leaving **145** internal-only. The UI does not call `api.brevo.com/v3`; it calls microservices such as `contacts-api-v2.brevo.com`, `contacts-api.brevo.com`, `crm-backend-api.brevo.com`, `segments-api.brevo.com`, `email-campaigns-backend.brevo.com`, `forms-api.brevo.com` and `unified-templates.brevo.com`. The third session added no new public mappings because the target modules were not accessible on this plan. This is documented in [`reports/surface-comparison.md`](../reports/surface-comparison.md).

## 3. Plan I executed

```
0. Research        Read the brief, verify Brevo's public API/MCP surface
1. Acquire         Download + pin OpenAPI spec; capture help-center product map
2. Design          Business-domain taxonomy (32 domains), action schema, id strategy
3. Extract         Parse 292 operations: resolve $refs, flatten inputs, examples, errors
4. Classify        action_type, risk, confirmation, idempotency, reversibility, rate limit
5. Curate          34 high-value actions enriched by hand (intent, pre/postconditions, peers)
6. UI inventory    203 UI actions (documentation-derived): 137 covered, 8 partial, 58 UI-only
7. Merge           Merge covered UI actions into API actions; keep partial/UI-only separate
8. Package         catalog.json / JSONL / per-domain slices / index / agent-tools.json
9. Validate        JSON Schema, duplicate ids/tools, reference resolution, counts, secrets
10. Report         Coverage, reliability and confidence metrics
11. Verify (opt)    Read-only live checks with a real key; stored as an overlay
12. Observe UI       Three browser + HAR passes: 168 first-party endpoints, 23 mappings, 145 internal-only
13. Verify reads     Spec-only GET sweep: 19 2xx, 7 plan-gated, 3 reachable 400s, 0 rate-limited
14. Verify writes    Public POST/GET/DELETE flows with test data and cleanup: 28 steps, 20 actions
15. Verify advanced  CRM, webhooks, senders/domains, scheduling, send flows, account reads: 68 ok, 1 plan-gated, 5 skipped
16. Verify events    Custom event 204; GET /events 200; webhook CRUD; 0 webhook requests; delivery not confirmed
```

## 4. Key decisions and trade-offs

### 4.1 Business-action-first, API-second
The primary key is a business id (`contacts.add_contact_to_list`), not an endpoint. The endpoint is one field inside `execution`. This keeps the catalog stable if Brevo changes a path, and lets UI-only actions live in the same model.

### 4.2 Taxonomy by product area, not by API tag
The spec has 35 tags, including duplicates and internal groupings (`companies` vs `Companies`, `Balance`/`Program`/`Reward`/`Tier` under loyalty, `Master account`). Mirroring tags would make retrieval worse. I mapped them into 32 business domains with explicit path rules + tag fallbacks in `curated/taxonomy.json`. Examples: all loyalty constructs collapse into `loyalty`; `Senders` + `Domains` become `senders_and_domains`; contact folders/lists/segments/attributes stay in `contacts`.

### 4.3 Three execution kinds, not two
`api`, `api_partial`, `ui_only`. The middle case matters: "schedule an email campaign" is real, but the API expresses it as a `scheduledAt` field on create/update rather than a dedicated endpoint. Marking it `partial` is more honest than claiming full coverage or dropping it.

### 4.4 Merge UI actions that are fully covered
If a UI action is fully served by an API action, it becomes `matched_ui_actions` on that action (name + UI path) instead of a duplicate entry. This keeps the catalog deduplicated while preserving the UI evidence. Partial and UI-only actions remain standalone entries because they represent distinct intents.

### 4.5 Deterministic generation, curated enrichment
Everything derivable comes from the spec at build time. Human/AI curation lives in small diffable files (`overrides.json`, `ids.json`, `ui-actions.json`) and can never overwrite a derived endpoint or schema. This makes review easy and prevents curation from drifting from the source of truth.

### 4.6 Risk is conservative, but transparent
Risk is derived from action type + domain + route (`delete`/`send`/payment/loyalty/admin → high), then overridable per action. High risk implies `confirmation_required: true`. Some results are deliberately conservative (e.g. "delete a contact from a list" is high), and the policy is visible in `scripts/build-catalog.mjs` and per-action overrides rather than hidden in prose.

### 4.7 No credentials, ever
The repo contains no key. `.env` is gitignored; `.env.example` is empty; live verification reads the key from the environment, never logs it, and uses read-only GETs by default (`--write` opt-in for a create/delete contact round-trip). The browser capture follows the same rule: raw HAR files live in `.capture/` (gitignored), headers/cookies/tokens and emails are redacted by `scripts/import-har.mjs`, and only the normalized `curated/observed-endpoints.json` is committed.

### 4.8 Public API and internal UI API are different surfaces
The live capture proved that "UI action covered by the API" means **capability equivalence**, not the same endpoint. Creating a list in the UI calls `contacts-api-v2.brevo.com/lists/create`; the public equivalent is `POST api.brevo.com/v3/contacts/lists`. Creating a company in the UI posts `{attributes:{name,owner,domain}, linkedContactsIds, linkedDealsIds, gtm}` to `crm-backend-api.brevo.com/crm/backend/company`; the public equivalent is `POST /companies` with a different schema. The catalog keeps the public action as the stable execution surface and attaches `observed_ui` as evidence of the UI's real behavior. Internal endpoints are marked `stability: internal` and are never presented as public tools. This distinction is valuable to an agent: the public path is stable and key-authenticated; the internal path is session-authenticated and can change without notice.

### 4.9 Write flows are verified, not inferred
`scripts/verify-flows.mjs` executes the public POST/GET/DELETE sequences for the written capability: list, contact, company, email campaign and template. It creates uniquely named test data, verifies it with a GET, and cleans everything up in `finally`. The first campaign run failed with `400 "There are no contacts associated with the given recipients info"` because the test list was empty; the fix was to create a recipient contact and confirm it via `GET /contacts/lists/{id}/contacts` before creating the campaign. Result: **28/28 steps pass**, and the catalog promotes 20 actions to `verification.kind: write_flow` + `live_verified`. Test-data cleanup was confirmed with a follow-up GET over contacts, lists, companies, campaigns and templates (zero matches).

### 4.10 Advanced flows and plan gating
A second verifier (`scripts/verify-advanced-flows.mjs`) exercised the remaining safe-to-test areas:
- **CRM:** deal create/get/update/delete, task create/get/update/delete (after fixing the date to full ISO), and note create/get/update/delete (after associating it to a test company).
- **Webhooks:** create/get/update/delete with a disposable `webhook.site` URL.
- **Senders/domains:** the personal sender already existed (skipped, not modified); the professional sender was blocked by Brevo's DMARC/domain-authentication prerequisite; a test `.example.com` domain was created, read and deleted.
- **Scheduling:** `scheduledAt` was accepted and read back; the campaign was suspended and archived. Scheduled campaigns cannot be deleted, only suspended/archived.
- **Sending:** `sendTest` returned 204; `sendNow` returned 204, but campaign stats showed `sent=0`/`delivered=0` and the campaign was suspended, so delivery is **not confirmed**. This is recorded as a caveat, not a success claim.
- **Account admin read-only:** account, invited users, user permissions and processes returned responses; account activity is **plan-gated** (`Upgrade to Enterprise plan`).

Result: 68 steps ok, 0 unexpected failures, 1 plan-gated action and 5 prerequisite skips. Test contacts, lists, companies, deals, tasks, notes, templates and domains were cleaned up (zero matches on a follow-up GET). Campaigns 12/14/15 could not be deleted after being scheduled; 12 was archived, 14/15 are suspended and cannot send.

### 4.11 Negative contracts and the delivery blocker
A separate negative-contract suite ran 25 expected-error cases across contacts, lists, companies, campaigns, templates, webhooks, senders, domains and account permissions: **25/25 passed**, and no data was created. A read-only delivery diagnosis found 300 send credits and an active sender, but the sender domain is `gmail.com` and there is no authenticated sending domain. Campaigns are suspended with `sent=0`/`delivered=0`. The likely blocker is the free-mail sender domain without domain authentication; the fix is to authenticate a domain you control, create the sender there and retry `sendTest`.

A one-shot transactional test (`POST /smtp/email`) to the personal address returned **201** with a `messageId`, but no delivery event/log was visible afterwards. It is recorded as accepted with **delivery not confirmed**.

Given 24 hours and an open-ended brief, I optimized for:

1. **Breadth of coverage** — all 292 API operations across every product area, plus the UI-only domains the API cannot reach.
2. **Depth where agents are dangerous** — contacts, campaigns, transactional email, senders/domains, payments, loyalty: full input schemas, side effects, preconditions, risk and confirmation.
3. **Reliability infrastructure** — a validator that fails the build, a coverage report, and a live-verification path, rather than hand-waving that the catalog is correct.
4. **Agent packaging** — JSONL + lexical index + OpenAI-style tool definitions + a search CLI, so the catalog can be consumed without writing glue code.

I explicitly did **not** spend time on:

- A UI or dashboard (the consumer is an agent).
- Exhaustive per-action prose (intent + when-to-use is enough; the schema carries the detail).
- Reverse-engineering undocumented private endpoints (fragile, ToS-sensitive, and not reproducible).

## 6. Results

| Metric | Value |
|---|---|
| Business actions | 358 |
| Public-API executable | 292 |
| UI-only | 58 |
| Partial | 8 |
| Domains | 32 |
| UI inventory | 203 actions; 67.5% fully API-covered, 71.4% full or partial |
| Write actions with input schema | 175/176 |
| API actions with documented errors | 292 |
| Actions linked to a UI path | 202 |
| Live-verified API actions | 87 (read + 20 write-flow + advanced flows + 1 transactional + 1 event; overlaps) |
| Write-flow verified actions | 20 (list, contact, company, campaign, template) |
| Transactional verified actions | 1 (accepted 201; delivery not confirmed) |
| Event-verified actions | 1 (`POST /events` → 204) |
| Plan-gated actions | 8 (account admin, eCommerce, external feeds, WhatsApp/coupons) |
| Spec-only actions | 197 |
| Spec-only read sweep | 19 2xx; 7 plan-gated |
| Webhook event types | 18 |
| Automation triggers | 66 |
| Negative contract cases | 25/25 passed |
| Delivery diagnosis | Free-mail sender (gmail.com) with no authenticated domain |
| Internal endpoints observed in a browser | 168 (157 internal + 11 app backend) |
| Catalog actions linked to an observed UI endpoint | 21 (20 public + 1 UI-only; 23 mappings, 145 internal-only) |
| UI evidence | Documentation-derived for the 203-action inventory; browser/network evidence for contacts, lists, companies, campaigns, forms, templates and module access probes |

The validator passes with zero errors and zero unmatched references. The single remaining warning is `ecommerce.activate_ecommerce_app`, which genuinely has no request body in the spec.

## 7. What I would do next (with more time)

1. **Extend write-flow verification** to the remaining account-admin mutations on a disposable sub-account: invitations, permission changes, sub-account creation, API keys and plan updates.
2. **Resolve delivery** by authenticating a domain you control and creating a sender on it; the diagnosis points to `gmail.com` as the blocker. Then retry `sendTest` to one address and confirm inbox/webhook delivery.
3. **Retry the browser capture on an entitled account** for SMS/WhatsApp, automations, landing pages, eCommerce, loyalty and conversations. The current capture covers contacts, lists, companies, campaigns, forms, templates and module error/upgrade pages; 145 internal endpoints already have no recorded public equivalent.
4. **Recover the missing request bodies** for the UI list/contact creates. The HAR exporter recorded `bodySize=0` for some `fetch` calls; a fetch/XHR interceptor or CDP `Fetch` domain can capture them.
5. **Model webhook payload schemas and automation actions** — event names and 66 triggers are documented, but payloads and workflow CRUD are not.
6. **Add plan/permission requirements per action** (which plan and which key scopes are required), validated with a restricted key.
7. **Build an agent evaluation harness** with 50 realistic intents and measure retrieval precision@k and execution success.
8. **Generate an MCP server** directly from `catalog/agent-tools.json`, mapping each tool to its endpoint.

## 8. Assumptions

- "Business action" includes both write operations and the reads an agent needs to act safely (search, list, inspect); reads are marked `action_type: read` and `risk_level: low`.
- The public API is the intended execution surface; UI-only actions are documented but flagged as requiring a human.
- **UI coverage is primarily documentation-derived.** The 203 UI actions come from public help-center pages; browser evidence exists for nine flows (contacts, lists, companies, campaigns, forms, templates, automations onboarding, conversations and module access probes). UI paths outside those flows are inferred and capped at 0.72 confidence until verified. The remaining domains (SMS, eCommerce, landing pages, payments, loyalty) were inaccessible or plan-gated on this account.
- Rate limits are the Free/Starter general tier from the public docs; higher tiers exist and are noted as a single tier value.
- Brevo plan gating (loyalty, payments, WhatsApp, phone) is not modeled per action; live checks did reveal 8 plan-gated actions on the free account.
