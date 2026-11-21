# Negative contract verification

Checked 25 cases; 25 passed, 0 failed.

| Action | Case | Expected | Actual | Result |
|---|---|---|---|---|
| `contacts.create_list` | list without required fields | 400/422 | 400 | OK |
| `contacts.get_list` | get non-existent list | 400/404 | 404 | OK |
| `contacts.update_list` | update non-existent list | 400/404 | 404 | OK |
| `contacts.delete_list` | delete non-existent list | 400/404 | 404 | OK |
| `contacts.create_contact` | contact with invalid email | 400/422 | 400 | OK |
| `contacts.get_contact_info` | get non-existent contact | 400/404 | 404 | OK |
| `contacts.delete_contact` | delete non-existent contact | 400/404 | 404 | OK |
| `crm.create_company` | company without name | 400/422 | 400 | OK |
| `crm.get_company` | get non-existent company | 400/404 | 404 | OK |
| `crm.delete_company` | delete non-existent company | 400/404 | 404 | OK |
| `email_campaigns.create_email_campaign` | campaign without sender | 400/422 | 400 | OK |
| `email_campaigns.get_email_campaign` | get non-existent campaign | 400/404 | 404 | OK |
| `email_campaigns.send_email_campaign_now` | send non-existent campaign | 400/404 | 404 | OK |
| `email_campaigns.update_campaign_status` | invalid campaign status | 400/404 | 400 | OK |
| `templates.create_smtp_template` | template without sender/subject | 400/422 | 400 | OK |
| `templates.get_smtp_template` | get non-existent template | 400/404 | 404 | OK |
| `templates.delete_smtp_template` | delete non-existent template | 400/404 | 404 | OK |
| `webhooks.create_webhook` | webhook without url | 400/422 | 400 | OK |
| `webhooks.get_webhook` | get non-existent webhook | 400/404 | 404 | OK |
| `webhooks.delete_webhook` | delete non-existent webhook | 400/404 | 404 | OK |
| `senders_and_domains.create_sender` | sender with invalid email | 400/422 | 400 | OK |
| `senders_and_domains.delete_sender` | delete non-existent sender | 400/404 | 404 | OK |
| `senders_and_domains.create_domain` | domain with empty name | 400/422 | 400 | OK |
| `senders_and_domains.delete_domain` | delete non-existent domain | 400/404 | 404 | OK |
| `account_admin.get_user_permission` | permissions for unknown user | 400/404 | 400 | OK |

