# Coverage report

Generated from spec cc2890ed25d8… on 2026-11-21T03:55:50.536Z.

## Headline

- **358** business actions in the catalog
- **292** executable through the public API
- **58** UI-only actions (no public API)
- **8** actions only partially supported by the API
- UI inventory: **203** actions catalogued, 67.5% fully executable via API, 71.4% full or partial

## Reliability signals

- 175/176 write actions ship an input schema
- 292 API actions document at least one error
- 111 API actions ship a request or response example
- 202 actions are linked to a UI path
- 21 public actions have an observed internal UI link; 168 internal endpoints captured
- Live verified: 87 · write-flow verified: 20 · transactional verified: 1 · event verified: 1 · plan-gated: 8 · spec-only: 197 · failed: 0

## Confidence

- 0.90–1.00: 251
- 0.80–0.89: 49
- 0.70–0.79: 58
- <0.70: 0

## Gaps by domain

| Domain | API | Partial | UI-only |
|---|---:|---:|---:|
| Marketing automation | 0 | 0 | 11 |
| Landing pages | 0 | 0 | 8 |
| Forms | 0 | 0 | 7 |
| Contacts & audiences | 35 | 2 | 3 |
| Integrations & plugins | 0 | 0 | 5 |
| Push, pop-ups & in-app | 0 | 0 | 5 |
| Email campaigns | 13 | 3 | 1 |
| Analytics & reports | 0 | 0 | 3 |
| CRM (companies, deals, tasks, notes) | 38 | 0 | 3 |
| Deliverability | 0 | 0 | 3 |
| Ad Studio | 0 | 0 | 2 |
| Meetings | 0 | 0 | 2 |
| Phone | 0 | 0 | 2 |
| Transactional email | 16 | 2 | 0 |
| Conversations | 10 | 0 | 1 |
| eCommerce | 18 | 0 | 1 |
| SMS campaigns | 10 | 1 | 0 |
| Templates | 7 | 0 | 1 |

## UI-only actions

- `ad_studio.create_static_ad` — Create a static ad (ad_studio)
- `ad_studio.create_video_ad` — Create a video ad (ad_studio)
- `analytics_reports.export_campaign_statistics` — Export campaign statistics (analytics_reports)
- `analytics_reports.view_cross_channel_dashboard` — View the cross-channel dashboard (analytics_reports)
- `analytics_reports.view_retention_dashboard` — View the retention dashboard (analytics_reports)
- `contacts.create_saved_view_contacts` — Create a saved view for contacts (contacts)
- `contacts.create_segment` — Create a segment (contacts)
- `contacts.split_segment_into_lists` — Split a segment into lists (contacts)
- `conversations.configure_chat_widget` — Configure a chat widget (conversations)
- `crm.create_pipeline` — Create a pipeline (crm)
- `crm.edit_deal_stages` — Edit deal stages (crm)
- `crm.export_companies` — Export companies (crm)
- `deliverability.clean_contact_list` — Clean a contact list (deliverability)
- `deliverability.view_sender_reputation` — View sender reputation (deliverability)
- `deliverability.warm_up_dedicated_ip` — Warm up a dedicated IP (deliverability)
- `ecommerce.view_ecommerce_dashboard` — View the eCommerce dashboard (ecommerce)
- `email_campaigns.duplicate_campaign` — Duplicate a campaign (email_campaigns)
- `forms.add_captcha_protection` — Add CAPTCHA protection (forms)
- `forms.configure_double_opt` — Configure double opt-in (forms)
- `forms.create_pop_up_form` — Create a pop-up form (forms)
- `forms.create_profile_update_form` — Create a profile update form (forms)
- `forms.create_sign_up_form` — Create a sign-up form (forms)
- `forms.create_unsubscribe_form` — Create an unsubscribe form (forms)
- `forms.notify_team_form_submission` — Notify the team on form submission (forms)
- `integrations.connect_brevo_mcp_server` — Connect the Brevo MCP server (integrations)
- `integrations.connect_shopify` — Connect Shopify (integrations)
- `integrations.connect_woocommerce` — Connect WooCommerce (integrations)
- `integrations.generate_api_key` — Generate an API key (integrations)
- `integrations.install_wordpress_plugin` — Install the WordPress plugin (integrations)
- `landing_pages.add_form_landing_page` — Add a form to a landing page (landing_pages)
- `landing_pages.create_landing_page` — Create a landing page (landing_pages)
- `landing_pages.duplicate_landing_page` — Duplicate a landing page (landing_pages)
- `landing_pages.edit_landing_page_structure_content` — Edit landing page structure and content (landing_pages)
- `landing_pages.host_landing_page_custom_domain` — Host a landing page on a custom domain (landing_pages)
- `landing_pages.manage_sub_pages` — Manage sub-pages (landing_pages)
- `landing_pages.preview_landing_page` — Preview a landing page (landing_pages)
- `landing_pages.publish_landing_page` — Publish a landing page (landing_pages)
- `marketing_automation.add_automation_trigger` — Add an automation trigger (marketing_automation)
- `marketing_automation.add_condition_rule` — Add a condition or rule (marketing_automation)
- `marketing_automation.add_delay_wait_step` — Add a delay or wait step (marketing_automation)
- `marketing_automation.add_send_email_step` — Add a send-email step (marketing_automation)
- `marketing_automation.add_sms_whatsapp_step` — Add an SMS or WhatsApp step (marketing_automation)
- `marketing_automation.create_automation` — Create an automation (marketing_automation)
- `marketing_automation.create_automation_aura_ai` — Create an automation with Aura AI (marketing_automation)
- `marketing_automation.manually_enroll_contacts` — Manually enroll contacts (marketing_automation)
- `marketing_automation.pause_resume_automation` — Pause or resume an automation (marketing_automation)
- `marketing_automation.use_pre_built_automation` — Use a pre-built automation (marketing_automation)
- `marketing_automation.view_automation_statistics_logs` — View automation statistics and logs (marketing_automation)
- `meetings.book_meeting` — Book a meeting (meetings)
- `meetings.create_meeting_link` — Create a meeting link (meetings)
- `phone.buy_phone_number` — Buy a phone number (phone)
- `phone.route_make_call` — Route or make a call (phone)
- `push_popups.configure_pressure_settings_utm_parameters` — Configure pressure settings and UTM parameters (push_popups)
- `push_popups.create_pop_up_app_campaign` — Create a pop-up or in-app campaign (push_popups)
- `push_popups.create_push_campaign` — Create a push campaign (push_popups)
- `push_popups.set_up_web_push` — Set up web push (push_popups)
- `push_popups.view_push_campaign_reports` — View push campaign reports (push_popups)
- `templates.create_sms_template` — Create an SMS template (templates)

## Partial actions

- `contacts.blocklist_resubscribe_contact` — Blocklist or resubscribe a contact → `transactional_email.unblock_or_resubscribe_contact`
- `contacts.update_contact_score` — Update a contact score → `contacts.update_contact`
- `email_campaigns.create_test_campaign` — Create an A/B test campaign → `email_campaigns.create_email_campaign`
- `email_campaigns.pause_resume_campaign` — Pause or resume a campaign → `email_campaigns.update_campaign_status`
- `email_campaigns.schedule_email_campaign` — Schedule an email campaign → `email_campaigns.update_email_campaign`
- `sms_campaigns.schedule_sms_campaign` — Schedule an SMS campaign → `sms_campaigns.update_sms_campaign`
- `transactional_email.schedule_transactional_email` — Schedule a transactional email → `transactional_email.send_transac_email`
- `transactional_email.send_batch_transactional_emails` — Send a batch of transactional emails → `transactional_email.send_transac_email`
