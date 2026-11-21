# Brevo business action catalog

An agent-ready catalog of **what a user can actually do inside Brevo** — not a dump of API endpoints.

The catalog answers, for every business action: what it does, when an agent should use it, what it needs, what it changes, how risky it is, whether it is idempotent, and how to execute it (public API, partial API, or UI-only). Every entry carries provenance and a confidence score so an agent — or the engineer supervising it — can decide whether to act.

> Target system: [Brevo](https://www.brevo.com) · Built for **AI agents**, not humans · Derived from the official OpenAPI 3.0.1 spec plus **public product documentation** (help-center pages; no logged-in session or network capture).
>
> **Agent entry point:** [`AGENT.md`](AGENT.md) · **Submission summary:** [`SUBMISSION.md`](SUBMISSION.md) · **Validation:** [`VALIDATION.md`](VALIDATION.md)

## At a glance

| Metric | Value |
|---|---|
| Business actions catalogued | **358** |
| Executable through the public API | **292** |
| UI-only actions (no public API) | **58** |
| Partially supported by the API | **8** |
| Product domains | **32** |
| API paths / operations parsed | 208 / 292 |
| UI actions inventoried | 203 · **67.5%** fully executable via API, **71.4%** full or partial |
| Actions flagged high risk / requiring confirmation | 103 |
| Live-verified API actions | **67** (23 read checks + 20 write-flow + advanced flows + 1 transactional; overlaps) |
| Write-flow verified actions | **20** (list, contact, company, campaign, template) |
| Transactional verified actions | **1** (accepted 201; delivery not confirmed) |
| Plan-gated actions | **1** (account activity, Enterprise-only) |
| Spec-only actions | **224** |
| Negative contract cases | **25/25 passed** |
| Delivery diagnosis | Free-mail sender (`gmail.com`) with no authenticated domain |
| Internal endpoints observed in the browser | **137** (contacts, lists, companies, campaigns, forms, templates) |
| Public actions linked to an observed UI endpoint | **21** (20 public + 1 UI-only; 23 mappings, 114 internal-only) |

Full numbers: [`reports/coverage.md`](reports/coverage.md).

## Repository layout

```
catalog/
  catalog.json          Full catalog (metadata + 358 actions)
  catalog.jsonl         One action per line, for streaming/retrieval
  index.json            Id lookup, per-domain lists, lexical search index
  agent-tools.json      OpenAI-style tool definitions for the 292 API actions
  observed-links.json   Observed UI endpoint -> public action comparison
  manifest.json         Spec checksum, versions, counts
  actions/<domain>.json Per-domain slices (32 files)
curated/
  taxonomy.json         Domain taxonomy, tag mapping, path rules, UI areas
  overrides.json        Business enrichment for high-value actions
  ids.json              Stable ids for operations missing an operationId
  ui-actions.json       203-action UI inventory (covered / partial / UI-only)
  observed-endpoints.json   Redacted endpoints captured from a real browser session
  observed-to-public.json   Human-reviewed mapping to public API actions
schema/action.schema.json  JSON Schema for a catalog action
scripts/
  fetch-openapi.mjs     Refresh the upstream spec
  build-catalog.mjs     Spec + taxonomy + curation + UI inventory -> catalog
  validate.mjs          Schema, reference, duplicate, credential and count checks
  coverage-report.mjs   Coverage and reliability report
  verify-live.mjs       Read-only live verification with a real API key
  verify-flows.mjs      Public POST/GET/DELETE write-flow verification with cleanup
  verify-advanced-flows.mjs  CRM, webhooks, senders/domains, scheduling, send flows
  verify-negative-contracts.mjs  Expected-error contract tests
  diagnose-delivery.mjs  Read-only delivery blocker diagnosis
  verify-transactional-delivery.mjs  One-shot transactional delivery test
  import-har.mjs        Redact/normalize a browser HAR into observed endpoints
  compare-surfaces.mjs  Compare observed internal endpoints with public actions
  search.mjs            Agent-facing CLI search over the catalog
sources/
  brevo-openapi.yml     Pinned upstream spec (sha256 cc2890ed…)
reports/
  coverage.md/.json     Generated coverage report
  capture-diff.md       Observed endpoints and catalog matches
  surface-comparison.md Public API vs observed UI surface
  live/flow-verification.json  Write-flow verification results (redacted)
  live/advanced-flow-verification.json  Advanced flow results, including plan-gated
  negative-contracts.md  Negative contract cases and expected errors
  delivery-diagnosis.md  Read-only diagnosis of the delivery blocker
  transactional-delivery.md  One transactional send test and event check
docs/
  approach.md           How the problem was framed and solved
  ai-usage.md           How AI was used, including what it got wrong
  gaps.md               Known gaps and next steps
  taxonomy.md           Domain design and mapping rationale
```

## Quickstart

```bash
npm install
npm run all          # build -> validate -> coverage report
npm run compare      # compare observed UI endpoints with public actions
npm run verify:flows # exercise public POST/GET/DELETE flows with cleanup
npm run verify:advanced -- --only=all --confirm-send --email=you@example.com
npm run verify:negative  # expect-error contract cases (no data created)
npm run diagnose:delivery # read-only delivery blocker diagnosis
npm run verify:transactional -- --to=you@example.com --confirm-send
npm run search "add contact to list"
npm run search "schedule email campaign" -- --limit=5
npm run search "send password reset email" -- --json
```

Optional live verification (never required to read the catalog):

```bash
cp .env.example .env      # add BREVO_API_KEY
npm run verify            # read-only GET checks, writes reports/live/verification.json
npm run build             # applies the verification overlay to the catalog
```

## What one action looks like

```jsonc
{
  "id": "contacts.add_contact_to_list",
  "domain": "contacts",
  "name": "Add existing contacts to a list",
  "intent": "Add one or more existing contacts to a specific list.",
  "action_type": "update",
  "risk_level": "medium",
  "confirmation_required": false,
  "idempotency": "non_idempotent",
  "inputs": {
    "type": "object",
    "properties": {
      "listId": { "type": "integer", "format": "int64", "x-in": "path" },
      "body": { "x-in": "body", "oneOf": [
        { "type": "object", "properties": { "emails": { "type": "array", "maxItems": 150, "items": { "type": "string", "format": "email" } } } },
        { "type": "object", "properties": { "ids": { "type": "array", "maxItems": 150, "items": { "type": "integer" } } } }
      ] }
    },
    "required": ["listId", "body"]
  },
  "execution": {
    "kind": "api",
    "endpoint": { "method": "POST", "path": "/contacts/lists/{listId}/contacts/add", "base_url": "https://api.brevo.com/v3" },
    "tool_name": "contacts__add_contact_to_list"
  },
  "side_effects": ["Changes list membership", "May trigger list-triggered automations"],
  "reversibility": "reversible",
  "auth": { "schemes": ["api_key", "oauth2"], "api_key_header": "api-key" },
  "rate_limit": { "tier": "general", "requests_per_hour": 36000, "requests_per_second": 10 },
  "evidence": {
    "source": "openapi",
    "operation_id": "addContactToList",
    "ui_area": "CRM > Contacts",
    "ui_path": "CRM > Contacts > Lists > Add contacts"
  },
  "confidence": 0.99,
  "verification": { "status": "spec_only", "checked_at": null }
}
```

Every action also carries `when_to_use`, `when_not_to_use`, `preconditions`, `outputs`, `errors`, `synonyms`, `related_actions` and `matched_ui_actions` where available.

## Execution model (important for agents)

The `execution.kind` field tells an agent how far it can go without a human:

| Kind | Meaning | Agent behavior |
|---|---|---|
| `api` | Fully executable through the public API. | May execute after checking risk/confirmation. |
| `api_partial` | The API performs part of the intent; another step needs the UI or another call. | Execute the API part, then escalate the remainder. |
| `ui_only` | No public API. The action exists only in the Brevo UI. | Do not pretend to execute. Explain the UI path and ask a human to perform it. |

This distinction is deliberate: a catalog that silently maps UI-only work to a nearby endpoint is worse than one that admits the gap.

## How an agent consumes it

1. **Retrieve** — query `catalog/index.json` (lexical index) or `catalog.jsonl`, or call `npm run search "<intent>"`.
2. **Disambiguate** — compare `intent`, `when_to_use`, `when_not_to_use`, `synonyms`, `risk_level`.
3. **Check safety** — if `confirmation_required` is true or `risk_level` is `high`, ask a human before executing.
4. **Execute** — use `execution.endpoint` + `request` (path/query/body mapping) + `auth` + `rate_limit`. Tool-calling runtimes can load `catalog/agent-tools.json` directly.
5. **Verify** — respect `idempotency`; read `outputs.success_status`, `outputs.schema` and `errors` to interpret the result.

## Reliability model

Three independent signals, all visible per action:

- **Evidence** — `evidence.source` (`openapi` or `ui_inventory`), the operation id, spec version and UI path. Actions exercised in the browser also carry `observed_ui` (internal endpoint, UI path, equivalence and capture time).
- **Confidence** — 0–1, based on source type, presence of documented input/output schemas, curated enrichment and live checks. Distribution: 251 actions ≥ 0.90, 49 in 0.80–0.89, 58 in 0.70–0.79.
- **Verification** — `spec_only` (default), `live_verified`, `plan_gated` or `live_failed`, with timestamp and HTTP status. Read checks come from `npm run verify`; write flows from `npm run verify:flows`; advanced flows from `npm run verify:advanced`. All overlays are applied by `npm run build`.

Automated guardrails (`npm run validate`): action JSON Schema, unique ids and tool names, every `related_actions`/`execution.related_action` reference resolves, API actions have endpoints/auth, UI-only actions have UI paths and no endpoint, `catalog.jsonl` and manifest counts match, and no credential-looking values are present.

## Coverage strategy

- **API layer:** all 292 operations from the official OpenAPI 3.0.1 spec, normalized into business actions with resolved `$ref` schemas, examples, errors, rate limits and risk metadata.
- **UI layer:** 203 actions inventoried from Brevo's **public help-center pages** (fetched over HTTP) and the MCP module taxonomy. These are documentation-derived, not observed in a logged-in session. 137 map to API actions; 58 are UI-only; 8 are partial.
- **Observed surface:** two browser sessions captured **137 internal endpoints** across contacts, lists, companies, campaigns, forms and templates. **23 mappings** across **21 catalog actions** (20 public + 1 UI-only) connect them to the same business capability; **114** are internal-only. The UI calls microservices such as `contacts-api-v2.brevo.com`, `contacts-api.brevo.com`, `crm-backend-api.brevo.com`, `segments-api.brevo.com`, `email-campaigns-backend.brevo.com`, `forms-api.brevo.com` and `unified-templates.brevo.com`, not `api.brevo.com/v3`. See [`reports/surface-comparison.md`](reports/surface-comparison.md).
- **Merging:** when a UI action is fully covered by an API action, it is merged into that action (`matched_ui_actions`), avoiding duplicate near-identical entries. Observed browser evidence is attached as `observed_ui` on the public action.
- **Advanced write flows:** CRM deals/tasks/notes, webhooks, senders/domains, campaign scheduling, send test/now and account reads were exercised with the public API. 68 steps ran, 5 were skipped by prerequisites (existing sender, DMARC, campaign lifecycle) and 1 action is plan-gated (account activity, Enterprise-only). Send test/now returned success but delivery was not confirmed (stats sent=0), so it is recorded with a caveat.
- **Negative contracts:** 25 expected-error cases across contacts, lists, companies, campaigns, templates, webhooks, senders, domains and account permissions. All returned the expected 4xx; no data was created.
- **Delivery diagnosis:** 300 send credits, 1 active sender, but the sender domain is `gmail.com` and there is no authenticated sending domain. Campaigns are suspended with `sent=0`/`delivered=0`; the likely blocker is the free-mail sender domain without domain authentication.
- **Transactional test:** one `POST /smtp/email` returned 201 with a `messageId`, but no delivery event/log was visible; recorded as accepted with delivery not confirmed.

## Credentials policy

No credentials are stored anywhere in this repository. `.env` is gitignored, `.env.example` contains an empty key, and the verification script reads the key from the environment at runtime and never logs it. Authentication is *described* (`api-key` header, OAuth 2.0), never embedded.

## Deliverables map

| Brief asks for | Where |
|---|---|
| The catalog itself, in an agent-friendly format | `catalog/catalog.json`, `catalog.jsonl`, `index.json`, `agent-tools.json` |
| Machine-first guide for another agent | [`AGENT.md`](AGENT.md) |
| Deliverable summary and assessment mapping | [`SUBMISSION.md`](SUBMISSION.md) |
| Consolidated validation evidence | [`VALIDATION.md`](VALIDATION.md) |
| Short write-up of the approach | [`docs/approach.md`](docs/approach.md) |
| How AI was used | [`docs/ai-usage.md`](docs/ai-usage.md) |
| Known gaps and limitations | [`docs/gaps.md`](docs/gaps.md) |
| Public API vs observed UI surface | [`reports/surface-comparison.md`](reports/surface-comparison.md), [`catalog/observed-links.json`](catalog/observed-links.json) |
| Code and scripts | `scripts/`, `curated/`, `schema/` |

## Notes and attribution

Brevo's OpenAPI specification is the property of Brevo and is included with a single redaction of an upstream placeholder example key (see `sources/README.md`). Product names and UI paths are used descriptively. This repository was produced as a take-home assessment.
