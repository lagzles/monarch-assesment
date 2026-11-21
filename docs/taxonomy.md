# Domain taxonomy

The spec's own tags are not a good retrieval model: they contain duplicates (`Companies` / `companies`, `Deals` / `deals`), implementation groupings (`Balance`, `Program`, `Reward`, `Tier`, `Wallet`), and account-internal buckets (`Master account`, `User`, `Process`). An agent asked to "launch a loyalty program" should not have to know that Brevo splits it across five tags.

So operations are mapped into **32 business domains**, using path rules first and tag fallbacks second (`curated/taxonomy.json`). Each domain records a label, a description, a UI area and retrieval keywords.

## Domains

| Domain | Label | Total | API | Partial | UI-only |
|---|---|---:|---:|---:|---:|
| `loyalty` | Loyalty & wallet | 52 | 52 | 0 | 0 |
| `crm` | CRM (companies, deals, tasks, notes) | 41 | 38 | 0 | 3 |
| `contacts` | Contacts & audiences | 40 | 35 | 2 | 3 |
| `account_admin` | Account administration | 34 | 34 | 0 | 0 |
| `ecommerce` | eCommerce | 19 | 18 | 0 | 1 |
| `transactional_email` | Transactional email | 18 | 16 | 2 | 0 |
| `email_campaigns` | Email campaigns | 17 | 13 | 3 | 1 |
| `senders_and_domains` | Senders, domains & IPs | 12 | 12 | 0 | 0 |
| `conversations` | Conversations | 11 | 10 | 0 | 1 |
| `marketing_automation` | Marketing automation | 11 | 0 | 0 | 11 |
| `sms_campaigns` | SMS campaigns | 11 | 10 | 1 | 0 |
| `whatsapp_campaigns` | WhatsApp campaigns | 9 | 9 | 0 | 0 |
| `landing_pages` | Landing pages | 8 | 0 | 0 | 8 |
| `templates` | Templates | 8 | 7 | 0 | 1 |
| `forms` | Forms | 7 | 0 | 0 | 7 |
| `webhooks` | Webhooks | 6 | 6 | 0 | 0 |
| `coupons` | Coupons | 5 | 5 | 0 | 0 |
| `external_feeds` | External feeds (RSS) | 5 | 5 | 0 | 0 |
| `integrations` | Integrations & plugins | 5 | 0 | 0 | 5 |
| `push_popups` | Push, pop-ups & in-app | 5 | 0 | 0 | 5 |
| `transactional_sms` | Transactional SMS | 5 | 5 | 0 | 0 |
| `custom_objects` | Custom objects | 4 | 4 | 0 | 0 |
| `analytics_reports` | Analytics & reports | 3 | 0 | 0 | 3 |
| `deliverability` | Deliverability | 3 | 0 | 0 | 3 |
| `events` | Events & tracking | 3 | 3 | 0 | 0 |
| `inbound` | Inbound email parsing | 3 | 3 | 0 | 0 |
| `payments` | Payments | 3 | 3 | 0 | 0 |
| `ad_studio` | Ad Studio | 2 | 0 | 0 | 2 |
| `meetings` | Meetings | 2 | 0 | 0 | 2 |
| `phone` | Phone | 2 | 0 | 0 | 2 |
| `processes` | Background processes | 2 | 2 | 0 | 0 |
| `transactional_whatsapp` | Transactional WhatsApp | 2 | 2 | 0 | 0 |

## Mapping decisions worth explaining

- **Loyalty is one domain, not five.** `Balance`, `Program`, `Reward`, `Tier` and `Wallet` all describe one product capability. Collapsing them makes "create a loyalty program" and "redeem a voucher" peers, which is how an agent thinks.
- **`Senders` + `Domains` + dedicated IPs merge into `senders_and_domains`.** They are configured together and share the deliverability job-to-be-done.
- **`Companies` / `companies` and `Deals` / `deals` are duplicate tags.** Path rules route both to `crm`; the tag fallback map keeps the duplicate keys explicitly so nothing silently falls into `other`.
- **Contact folders, lists, segments, attributes and consent groups stay in `contacts`.** They are all audience-management primitives; splitting them would fragment retrieval for "add contact to a list".
- **`Custom Objects` is its own domain.** It is a generic schema mechanism used by CRM but not limited to it, and its operations are generic (`{object_type}`).
- **Account internals are grouped into `account_admin`.** `Master account`, `User`, `Account` and `Organization` operations share a risk profile (identity, permissions, plans), which is more useful than four tiny domains.
- **UI-only domains exist on purpose.** `marketing_automation`, `landing_pages`, `forms`, `push_popups`, `ad_studio`, `meetings`, `phone`, `analytics_reports`, `integrations` and `deliverability` have no public API. Keeping them as first-class domains makes the coverage boundary explicit instead of hiding it.
- **`analytics_reports` and `deliverability` are mostly UI-only** because the API exposes per-channel statistics under each channel (`transactional_email`, `email_campaigns`, `ecommerce`), not a unified analytics surface.
- **`processes` is small but important.** Async import/export jobs need a "track the job" action; without it an agent cannot close the loop.

## Path-rule precedence

The rules are sorted by prefix length, so the most specific match wins:

```
/smtp/templates        -> templates
/smtp                  -> transactional_email
/senders/domains       -> senders_and_domains
/senders               -> senders_and_domains
/transactionalSMS/templates -> templates
/transactionalSMS      -> transactional_sms
/crm/pipeline          -> crm
/crm/deals             -> crm
/contacts              -> contacts
```

Tag fallback is only used when no path rule matches, which keeps domain assignment stable when Brevo re-tags an operation.

## Adding a domain

1. Add the domain (label, description, UI area, keywords) to `curated/taxonomy.json`.
2. Add a path rule if the API surface is new.
3. Rebuild: `npm run build && npm run validate && npm run report`.
4. The validator warns if a domain has no actions, so dead taxonomy does not accumulate.
