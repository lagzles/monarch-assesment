# Submission — Brevo business action catalog

**Target system:** Brevo (brevo.com) · **Audience:** AI agents, not humans · **Format:** machine-readable catalog + evidence + reproduction scripts.

## What this is

An agent-ready catalog of **358 business actions** a user can perform in Brevo. Each action carries intent, preconditions, input schema, endpoint mapping, side effects, risk, idempotency, evidence, confidence and verification state. The catalog is built from the pinned OpenAPI 3.0.1 spec, a 203-action UI inventory, three browser capture sessions and live API verification.

**Start here for agents:** [`AGENT.md`](AGENT.md)
**Validation evidence:** [`VALIDATION.md`](VALIDATION.md)
**Human-readable overview:** [`README.md`](README.md)

## At a glance

| Metric | Value |
|---|---|
| Business actions | **358** |
| Public-API executable | **292** |
| UI-only | **58** |
| Partial | **8** |
| Domains | **32** |
| UI actions inventoried | **203** |
| Internal endpoints observed in the browser | **168** (157 internal + 11 app backend) |
| UI → catalog mappings | **23** across **21 actions** (20 public + 1 UI-only) |
| Internal-only endpoints | **145** |
| Live-verified actions | **87** (read + write + advanced + transactional + event) |
| Write-flow verified | **20** |
| Transactional verified | **1** (accepted; delivery not confirmed) |
| Event verified | **1** (`POST /events` → 204) |
| Plan-gated | **8** (account admin, eCommerce, external feeds, WhatsApp/coupons) |
| Spec-only | **197** |
| Spec-only read sweep | **19** 2xx; **7** plan-gated; 3 feature/permission 403s; 3 reachable 400s |
| Webhook event types | **18** |
| Automation triggers | **66** |
| Negative contract cases | **25/25 passed** |
| Live failures | **0** |

Full generated numbers: [`reports/coverage.md`](reports/coverage.md).

## What the catalog contains

- `catalog/catalog.json` — full catalog with metadata.
- `catalog/catalog.jsonl` — one action per line.
- `catalog/index.json` — id lookup, per-domain lists, lexical retrieval index.
- `catalog/agent-tools.json` — 292 OpenAI-style tool definitions with `x-brevo` metadata.
- `catalog/observed-links.json` — observed UI endpoint ↔ catalog action comparison.
- `catalog/automation-triggers.json` — 66 automation triggers with plan requirements and API support.
- `catalog/webhook-events.json` — 18 webhook event types and type compatibility.
- `catalog/actions/<domain>.json` — 32 per-domain slices.
- `catalog/manifest.json` — spec checksum, versions and counts.

## Execution model

| `execution.kind` | Meaning | Agent behavior |
|---|---|---|
| `api` | Fully executable through the public API | May execute after risk/confirmation checks |
| `api_partial` | API covers part of the intent | Execute the API part, escalate the rest |
| `ui_only` | No public API | Do not simulate; give the UI path and ask a human |

## Reliability model

- **Evidence:** `openapi` operation id, `ui_inventory` path, or `observed_ui` browser endpoint.
- **Confidence:** 0–1; 251 actions ≥ 0.90, 49 in 0.80–0.89, 58 in 0.70–0.79.
- **Verification:** `spec_only`, `live_verified` (`read_check` / `write_flow` / `advanced_flow` / `transactional_flow` / `event_flow`), `plan_gated`, `live_failed`.
- **Caveats:** `transactional_flow` and `sendTest`/`sendNow` were accepted by the API but delivery was not confirmed (`sent=0`). Webhook CRUD worked, but no webhook event was observed within 20s after one transactional send.

## Approach (summary)

The brief asks for business actions, not endpoints. The strategy was **action-first, API-second**:

1. Parse all 292 OpenAPI operations into business actions with resolved schemas.
2. Design a 32-domain taxonomy by product area, not by API tag.
3. Inventory 203 UI actions from the public help center and MCP module list.
4. Capture real browser traffic for contacts, lists, companies, campaigns, forms and templates; redact it; compare the internal UI surface with the public API.
5. Verify read paths, public write flows, advanced flows, negative contracts, a safe spec-only GET sweep, one custom event and one transactional send.
6. Model webhook event types and UI-only automation triggers as separate evidence artifacts.
7. Keep provenance and confidence on every action; never map UI-only work to a nearby endpoint.

Full reasoning: [`docs/approach.md`](docs/approach.md).

## How AI was used

The implementation agent (Command Code) built the parser, taxonomy, catalog, validator, HAR importer, comparison, flow verifiers and docs. The candidate set the scope, supplied the free account and API key, authorized test data/sends, and owns the final decisions. Concrete AI mistakes and fixes are documented (camelCase ids, dangling references, wrong coverage denominator, HAR body capture, task date format, note entity requirement, campaign status lifecycle, delivery caveat).

Full write-up: [`docs/ai-usage.md`](docs/ai-usage.md).

## Known gaps and limitations

Top items (full list in [`docs/gaps.md`](docs/gaps.md)):

- **Delivery is blocked on the free account:** 300 credits and an active sender, but the sender domain is `gmail.com` and no domain is authenticated. Campaigns are suspended with `sent=0`/`delivered=0`. Use a domain you control and authenticate it.
- **Transactional email was accepted (201)** but no delivery event/log was visible; delivery not confirmed.
- **Webhook delivery was not confirmed:** create/update/delete worked, but a transactional send produced no webhook request within 20s.
- **Automation workflow CRUD is UI-only.** The catalog documents 66 triggers and their API support; only custom-event ingestion is live-verified.
- **Account admin mutations were not executed** (invitations, permissions, sub-accounts, API keys, plans) because of blast radius.
- **Scheduled/sent campaigns cannot be deleted**; test campaigns 12/14/15 are archived and cannot send.
- **UI inventory outside the captured flows is documentation-derived**, not live-observed.
- **Remaining UI modules were inaccessible on this account:** SMS, eCommerce, Landing pages and Payments returned error pages; Loyalty showed an Enterprise upgrade; Automations stopped at onboarding; Conversations loaded without interactive elements.
- **Some internal request bodies were not captured** (`bodySize=0`).
- **CRM deals/tasks/notes** work via the public API even though the UI was plan-gated; segments remain UI-only in the capture.
- **Plan gating is partially modeled:** 8 actions are marked `plan_gated` from live 403s; plan requirements per action are still incomplete.

## Reproduce

```bash
npm install
npm run all           # build, validate, coverage
npm run compare       # public API vs observed UI surface
npm run verify        # read-only live checks
npm run verify:flows  # public write flows with cleanup
npm run verify:advanced -- --only=all --confirm-send --email=...
npm run verify:spec-only -- --domains=contacts,crm --limit=30
npm run verify:events -- --to=... --confirm-send
npm run verify:negative
npm run diagnose:delivery
npm run verify:transactional -- --to=... --confirm-send
```

The pinned spec is `sources/brevo-openapi.yml`; its sha256 is in `catalog/manifest.json`.

## Repository map

```
AGENT.md                  Machine-first guide for another AI
SUBMISSION.md             This deliverable summary
VALIDATION.md             Consolidated validation evidence
README.md                 Human overview and format
catalog/                  Catalog artifacts (including automation-triggers.json and webhook-events.json)
curated/                  Taxonomy, overrides, UI inventory, observed endpoints
scripts/                  Build, validation, capture, verification
sources/                  Pinned OpenAPI spec and provenance notes
reports/                  Coverage, comparison, negative contracts, diagnosis, sweep, events
docs/                     Approach, AI usage, gaps, taxonomy
```

## Assessment mapping

| Brief asks for | Where |
|---|---|
| Catalog itself, agent-friendly | `catalog/*`, `AGENT.md` |
| Short write-up of approach | `docs/approach.md`, `SUBMISSION.md` |
| How AI was used | `docs/ai-usage.md` |
| Known gaps and limitations | `docs/gaps.md`, `VALIDATION.md` |
| Code/scripts, ideally a repo link | `scripts/*`; repo publication is the remaining step |
| Credentials policy | `.gitignore`, `.env.example`, `README.md` |

## Credentials and test data

- No credentials are stored in the repository. `.env` is gitignored; `.env.example` is empty.
- Raw HARs, cookies and the Chrome profile are in `.capture/` (gitignored). Delete `.capture/` before publishing.
- Test contacts, lists, companies, deals, tasks, notes, templates and domains were cleaned up; a follow-up GET found zero matches.
- Campaigns 12/14/15 remain archived because Brevo does not allow deleting scheduled/sent campaigns; they cannot send.
- No account-admin mutation was executed.

## Status

Technical deliverables are complete. The published baseline commit is **private** under the candidate's personal account (`lagzles/monarch-assesment`). This validation pass added new artifacts (spec-only sweep, events/webhooks, automation triggers, 168-endpoint capture) that are currently **uncommitted**; commit and push them before sending. Then grant the evaluator read access (or make the repository public at send time) and send the submission email. No credentials are included.
