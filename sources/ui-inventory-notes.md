# UI inventory notes

The UI layer was built from Brevo's **public** product surface, not from a logged-in
session. This keeps the submission reproducible and free of account data, but it means UI
paths and plan gating are `unverified` by design. The `ui_path` values are reconstructed
from article titles and descriptions; they are **not** observed click paths.

## Areas inspected (2026-11-20)

| Area | Help-center source | Actions found |
|---|---|---|
| CRM > Contacts, lists, segments, attributes, consent groups, blocklist | `help.brevo.com/hc/en-us/sections/18478077752466` | 22 |
| CRM > Companies, deals, pipelines, tasks, notes, files | `help.brevo.com/hc/en-us/sections/18476595639314` | 17 |
| Marketing > Email campaigns | `help.brevo.com/hc/en-us/sections/18478400108178` | 12 |
| Marketing > SMS | `help.brevo.com/hc/en-us/sections/18478501015826` | 7 |
| Marketing > WhatsApp | `help.brevo.com/hc/en-us/sections/18478639569170` | 5 |
| Marketing > Forms, landing pages, push/pop-ups, Ad Studio | Marketing category sections | 20 |
| Marketing > Wallet | Marketing category sections | covered under loyalty |
| Automations (new + classic editor) | `help.brevo.com/hc/en-us/sections/18475760154258` | 11 |
| Commerce > eCommerce, loyalty, payments, coupons | `help.brevo.com/hc/en-us/sections/31687633423250` | 30 |
| Conversations > chat, meetings, phone | `help.brevo.com/hc/en-us/categories/360000273040` | 11 |
| Transactional > email, SMS, templates, inbound | `help.brevo.com/hc/en-us/sections/18475881120658` | 18 |
| Account, senders/domains, webhooks, integrations | Help-center account + developers docs | 30 |
| Deliverability, analytics | Help-center sections | 6 |

## Browser capture (2026-11-21)

A second pass used a real browser session on the free account, not just documentation:

- Tool: Command Code `agent-browser` (CDP + HAR) with a dedicated Chrome profile.
- Flows: Contacts (create/delete contact), Lists (create/delete list), Companies (create/delete company), Email campaigns (create draft/delete), Forms (create/delete sign-up form), Templates (create/delete email template). No sends or payments.
- Result: **4,963 HAR entries across two captures → 137 first-party endpoints**, across `contacts-api`, `contacts-api-v2`, `segments-api`, `crm-backend-api`, `email-campaigns-backend`, `forms-api`, `unified-templates` and others.
- **23 mappings** across **21 catalog actions** (20 public + 1 UI-only); **114 internal-only**.
- Test data was created and deleted; the redaction scan over committed artifacts is clean.
- Landing pages and CRM deals/tasks/segments were plan-gated (redirected to onboarding/upgrade), so they were not captured.

Artifacts: `curated/observed-endpoints.json`, `curated/observed-to-public.json`, `reports/surface-comparison.md`, `catalog/observed-links.json`.

## What this source proves / does not prove

- **Proves:** the feature area exists, its business intent, and — for contacts, lists, companies, campaigns, forms and templates — the actual internal endpoint and UI labels used by the product.
- **Does not prove:** the exact current click path or plan availability for the 203 documentation-derived actions outside the captured flows; those remain `verification.status: unverified` and capped at 0.72 confidence.
- **Does not imply public API compatibility:** the captured internal endpoints are session-authenticated and unstable. They are evidence, not executable public tools.

## How to upgrade this inventory

1. Log in to a free Brevo account.
2. For each `ui_only` action, capture the actual navigation path and, ideally, an
   accessibility snapshot or screenshot.
3. Update `curated/ui-actions.json` with the confirmed `ui_path`, then run
   `npm run build && npm run validate && npm run report`.

The catalog schema already has a place for this (`evidence.ui_path`, `confidence`,
`verification.status`); no code change is needed.
