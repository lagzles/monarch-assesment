# AGENT.md — How another AI should consume this catalog

This file is the machine-first entry point. It tells an AI agent what to load, how to choose an action, when to stop and ask a human, and how to interpret verification.

## 1. Load order

1. `catalog/index.json` — `by_id`, `domains`, `lexical_index`.
2. `catalog/catalog.jsonl` — one action per line (streaming).
3. `catalog/agent-tools.json` — 292 OpenAI-style tool definitions with `x-brevo` metadata.
4. `catalog/catalog.json` — full catalog with metadata.
5. `catalog/observed-links.json` — observed UI endpoint → catalog action comparison.

Do not load the 1.17 MB OpenAPI spec at runtime unless you are debugging a schema. The catalog already contains resolved, flattened inputs.

## 2. Retrieve an action

1. Tokenize the user intent (lowercase, split on non-alphanumerics, drop stopwords).
2. Score candidates with `index.lexical_index` against `name`, `intent`, `synonyms`, `tags`.
3. Rank with a small boost for `execution.kind: "api"`.
4. If no candidate is obvious, run `npm run search "<intent>" -- --json`.
5. Read `intent`, `when_to_use`, `when_not_to_use`, `preconditions`, `synonyms`.

Example intents and expected ids:

| Intent | Action id |
|---|---|
| add a contact to a list | `contacts.add_contact_to_list` |
| send a password reset email | `transactional_email.send_transac_email` |
| create a draft email campaign | `email_campaigns.create_email_campaign` |
| schedule an email campaign | `email_campaigns.update_email_campaign` |
| create a company | `crm.create_company` |
| create a task | `crm.create_task` |
| create a webhook | `webhooks.create_webhook` |

## 3. Decide whether to execute

Read these fields in order:

1. **`execution.kind`**
   - `api`: executable through the public API.
   - `api_partial`: the API covers part; execute that part, then escalate the rest.
   - `ui_only`: no public API. Do **not** call an endpoint. Explain `execution.ui_path` and ask a human.
2. **`risk_level` / `confirmation_required`**
   - `high` or `confirmation_required: true` → ask a human before executing.
   - `low`/`medium` → proceed if preconditions hold.
3. **`preconditions`** — check entities exist, sender/domain authenticated, list non-empty, etc.
4. **`idempotency`** — `non_idempotent` means do not blind-retry; use a GET to confirm state.
5. **`rate_limit`** and **`auth`**.
6. **`verification.status`** — see section 5.

## 4. Execute

The endpoint is in `execution.endpoint`:

```json
{ "method": "POST", "path": "/contacts/lists/{listId}/contacts/add", "base_url": "https://api.brevo.com/v3" }
```

Map inputs using `request`:

- `request.path_params` → replace `{param}` in the path.
- `request.query_params` → query string.
- `request.header_params` → headers.
- `request.body` → JSON body (`request.body.schema` describes it).
- `inputs.schema` is a flattened JSON Schema with `x-in` on each property (`path`, `query`, `header`, `body`).

Auth: `auth.api_key_header` is `api-key`. OAuth 2.0 bearer is also supported and described in `auth`.

Interpret results with `outputs.success_status`, `outputs.schema`, and `errors`. On failure:

- `400` / `422` → fix inputs; do not retry unchanged.
- `401` / `403` → key/permission/plan issue.
- `404` → resource missing.
- `429` → respect `rate_limit` and retry with backoff.
- `5xx` → retry with backoff only if `idempotency` allows.

## 5. Verification semantics

| `verification.status` | Meaning |
|---|---|
| `spec_only` | Documented in the pinned OpenAPI spec; not called live. |
| `live_verified` | Called live. `verification.kind` says how: `read_check`, `write_flow`, `advanced_flow`, `transactional_flow`. |
| `plan_gated` | Endpoint exists, but the account plan does not include it. Do not blind-retry; report the plan limitation. |
| `live_failed` | The live call failed. Inspect `note`; treat with low confidence. |
| `unverified` | UI-derived action without live confirmation (usually `ui_only`). |

Important caveats:

- `transactional_flow` means `POST /smtp/email` was **accepted** (201) but delivery was not confirmed. Do not claim inbox delivery.
- `advanced_flow` for `sendTest`/`sendNow` also has a delivery caveat (`sent=0`, campaign suspended).
- `plan_gated` is not a failure of the endpoint; it is an account entitlement limit.

## 6. `observed_ui` is evidence, not an execution path

Actions exercised in the browser carry `observed_ui`:

```json
{
  "observed_id": "observed.contacts_api_v2.post_lists_create",
  "host": "contacts-api-v2.brevo.com",
  "method": "POST",
  "path": "/lists/create",
  "equivalence": "same_capability_different_surface",
  "request_body_captured": false
}
```

These are **internal, session-authenticated** endpoints. Do not call them with an API key and do not treat them as public contracts. Use `execution.endpoint` for execution.

## 7. Safety rules

- Never execute `risk_level: "high"` or `confirmation_required: true` without explicit human approval.
- Never send real email/SMS/WhatsApp as a "test" without a controlled recipient and explicit approval.
- Never delete a resource unless the user asked for deletion and you have confirmed the target.
- Do not put credentials in prompts, logs, catalog files, or reports.
- Do not invent endpoints. If no action matches, say so.
- For `ui_only`, escalate to a human with the UI path; do not simulate success.

## 8. Common flows

### Add a contact to a list

1. `contacts.create_list` or `contacts.get_lists` to resolve the list id.
2. `contacts.add_contact_to_list` with `listId` and `emails`/`ids`/`extIds`.
3. `contacts.get_contacts_from_list` to verify.

### Create a draft email campaign

1. Resolve a sender (`senders_and_domains.get_senders`) and a recipient list.
2. Ensure the list has at least one contact; otherwise the API returns `400 "There are no contacts associated with the given recipients info"`.
3. `email_campaigns.create_email_campaign` with `name`, `sender`, `recipients`, `subject`, `htmlContent`.
4. `email_campaigns.get_email_campaign` to verify the draft.
5. Do not call `sendNow` without explicit approval.

### Schedule a campaign

1. Create the draft as above.
2. `email_campaigns.update_email_campaign` with `scheduledAt` (`YYYY-MM-DDTHH:mm:ss.SSSZ`).
3. `GET` to confirm `scheduledAt`.
4. To cancel: `PUT /emailCampaigns/{id}/status` with `{"status":"suspended"}` (not `cancel`/`draft`).
5. Scheduled/sent campaigns cannot be deleted (`403`); archive with `{"status":"archive"}`.

### Webhooks

1. `webhooks.create_webhook` with a URL you control, `type: "transactional"`, `events: ["delivered"]`.
2. `webhooks.get_webhook`, `webhooks.update_webhook`, `webhooks.delete_webhook`.

## 9. Known blockers and gaps

- **Delivery diagnosis:** the account has 300 credits and an active sender, but the sender domain is `gmail.com` and there is no authenticated sending domain. Campaigns are suspended with `sent=0`/`delivered=0`. Likely blocker: free-mail sender without domain authentication. Use a domain you control and authenticate it.
- **Account admin mutations** were not executed. See `docs/gaps.md`.
- **Test campaigns** 12/14/15 are archived and cannot be deleted via API/UI after scheduling; they cannot send.
- **UI inventory** outside contacts, lists, companies, campaigns, forms and templates is documentation-derived, not live-observed.
- **Internal request bodies** for some UI creates were not captured (`bodySize=0`).

## 10. Reproduce / refresh

```bash
npm install
npm run all          # build, validate, coverage
npm run compare      # observed UI vs public API
npm run verify       # read-only GET checks
npm run verify:flows # public write flows with cleanup
npm run verify:advanced -- --only=all --confirm-send --email=...
npm run verify:negative
npm run diagnose:delivery
npm run verify:transactional -- --to=... --confirm-send
```

The spec is pinned in `sources/brevo-openapi.yml`; `catalog/manifest.json` records its sha256.

## 11. If you only remember one thing

The public API is the execution surface. The browser capture is evidence of what the UI does. The catalog merges both without pretending they are the same wire protocol.
