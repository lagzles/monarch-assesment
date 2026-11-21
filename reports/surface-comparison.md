# Public API vs observed UI surface

Generated 2026-11-21T04:00:14.287Z from 6119 HAR entries across 3 capture(s).

## Headline

- Observed first-party endpoints: **168**
- Mapped to a public-API business action: **23**
- Internal-only endpoints (no public equivalent recorded): **145**
- Public API actions catalogued: **292**
- Public actions with an observed UI link: **20**
- UI-only actions with an observed UI link: **1**
- Public actions with no observed UI link in this capture: **272**

## Equivalence summary

| Business action | UI surface (observed) | Public API action | Equivalence |
|---|---|---|---|
| Create a list | `POST contacts-api-v2.brevo.com/lists/create` | `contacts.create_list` (`POST /contacts/lists`) | same_capability_different_surface |
| Delete a list | `DELETE contacts-api-v2.brevo.com/lists/{id}` | `contacts.delete_list` (`DELETE /contacts/lists/{listId}`) | same_capability_different_surface |
| Create a contact | `POST contacts-api.brevo.com/contact/backend/contacts/add-contact` | `contacts.create_contact` (`POST /contacts`) | same_capability_different_surface |
| Delete a contact | `DELETE contacts-api.brevo.com/contact/backend/contacts/{id}` | `contacts.delete_contact` (`DELETE /contacts/{identifier}`) | same_capability_different_surface |
| Add a contact to one or more lists | `POST contacts-api.brevo.com/contact/backend/contacts/lists` | `contacts.add_contact_to_list` (`POST /contacts/lists/{listId}/contacts/add`) | partial |
| Create a company | `POST crm-backend-api.brevo.com/crm/backend/company` | `crm.create_company` (`POST /companies`) | same_capability_different_surface |
| Delete a company | `DELETE crm-backend-api.brevo.com/crm/backend/company/{id}` | `crm.delete_company` (`DELETE /companies/{id}`) | same_capability_different_surface |
| List contact lists | `GET contacts-api-v2.brevo.com/lists/get-lists` | `contacts.get_lists` (`GET /contacts/lists`) | same_capability_different_surface |
| List contact folders | `GET contacts-api-v2.brevo.com/lists/get-folders` | `contacts.get_folders` (`GET /contacts/folders`) | same_capability_different_surface |
| Get a contact's details | `GET contacts-api.brevo.com/contact/backend/contacts/{id}` | `contacts.get_contact_info` (`GET /contacts/{identifier}`) | same_capability_different_surface |
| List contact attributes | `GET contacts-api.brevo.com/contact/backend/settings/get-attributes` | `contacts.get_attributes` (`GET /contacts/attributes`) | same_capability_different_surface |
| List lists and segments for contact assignment | `GET contacts-api.brevo.com/contact/backend/contacts/lists_and_segments` | `contacts.get_lists` (`GET /contacts/lists`) | partial |
| List companies | `GET crm-backend-api.brevo.com/crm/backend/companies` | `crm.list_companies` (`GET /companies`) | same_capability_different_surface |
| Get a company | `GET crm-backend-api.brevo.com/crm/backend/company/{id}` | `crm.get_company` (`GET /companies/{id}`) | same_capability_different_surface |
| List company attributes | `GET crm-backend-api.brevo.com/crm/backend/attribute/companies` | `crm.list_company_attributes` (`GET /crm/attributes/companies`) | same_capability_different_surface |
| List deal attributes | `GET crm-backend-api.brevo.com/crm/backend/attributes/deals` | `crm.list_deal_attributes` (`GET /crm/attributes/deals`) | same_capability_different_surface |
| Query/search contacts | `POST segments-api.brevo.com/segment/query` | `contacts.get_contacts` (`GET /contacts`) | partial |
| Count contacts | `POST segments-api.brevo.com/segment/count` | `contacts.get_contacts` (`GET /contacts`) | partial |
| Create an email campaign | `POST email-campaigns-backend.brevo.com/email-campaign/api/regular/setup` | `email_campaigns.create_email_campaign` (`POST /emailCampaigns`) | same_capability_different_surface |
| Delete an email campaign | `DELETE email-campaigns-backend.brevo.com/email-campaign/api/campaigns` | `email_campaigns.delete_email_campaign` (`DELETE /emailCampaigns/{campaignId}`) | same_capability_different_surface |
| Create an email template | `POST unified-templates.brevo.com/email/templates` | `templates.create_smtp_template` (`POST /smtp/templates`) | same_capability_different_surface |
| Delete an email template | `DELETE email-campaigns-backend.brevo.com/email-template/api/templates` | `templates.delete_smtp_template` (`DELETE /smtp/templates/{templateId}`) | same_capability_different_surface |
| Create a sign-up form | `POST forms-api.brevo.com/forms-api/forms` | `forms.create_sign_up_form` (UI-only) | ui_only_confirmed |

## Detail

### Create a list

- **UI observed:** `POST contacts-api-v2.brevo.com/lists/create` → 201 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Listas > Criar uma lista
- **Public API:** `contacts.create_list` → `POST /contacts/lists` on `api.brevo.com` · success 201 · idempotency non_idempotent · risk medium
- **Public request fields:** folderId, name
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api-v2.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; UI request body not captured by the HAR exporter
- **Note:** UI posts to contacts-api-v2 /lists/create (201, {id}). Public API posts to api.brevo.com/v3/contacts/lists. The HAR did not capture the UI request body (bodySize=0).

### Delete a list

- **UI observed:** `DELETE contacts-api-v2.brevo.com/lists/{id}` → 204 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Listas > Excluir lista
- **Public API:** `contacts.delete_list` → `DELETE /contacts/lists/{listId}` on `api.brevo.com` · success 204 · idempotency idempotent · risk high
- **Public request fields:** listId
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api-v2.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI deletes via contacts-api-v2 /lists/{id} (204). Public API deletes /contacts/lists/{listId}.

### Create a contact

- **UI observed:** `POST contacts-api.brevo.com/contact/backend/contacts/add-contact` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Adicionar contatos
- **Public API:** `contacts.create_contact` → `POST /contacts` on `api.brevo.com` · success 201 · idempotency non_idempotent · risk medium
- **Public request fields:** attributes, email, emailBlacklisted, ext_id, forceMerge, getId, listIds, smsBlacklisted, smtpBlacklistSender, updateEnabled
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; UI request body not captured by the HAR exporter; response fields: UI [contact_id] vs public [id]
- **Note:** UI posts to contacts-api /contact/backend/contacts/add-contact (200, {contact_id}). Public API posts /contacts. The HAR did not capture the UI request body (bodySize=0).

### Delete a contact

- **UI observed:** `DELETE contacts-api.brevo.com/contact/backend/contacts/{id}` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Excluir definitivamente
- **Public API:** `contacts.delete_contact` → `DELETE /contacts/{identifier}` on `api.brevo.com` · success 204 · idempotency idempotent · risk high
- **Public request fields:** identifier, identifierType
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI deletes via contacts-api /contact/backend/contacts/{id} (200). Public API deletes /contacts/{identifier}.

### Add a contact to one or more lists

- **UI observed:** `POST contacts-api.brevo.com/contact/backend/contacts/lists` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Adicionar contatos > Listas
- **Public API:** `contacts.add_contact_to_list` → `POST /contacts/lists/{listId}/contacts/add` on `api.brevo.com` · success 201 · idempotency non_idempotent · risk medium
- **Public request fields:** body, listId
- **Equivalence:** partial
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; UI request body not captured by the HAR exporter
- **Note:** UI updates contact list membership via contacts-api /contact/backend/contacts/lists. Public API exposes /contacts/lists/{listId}/contacts/add. The UI call may combine membership changes.

### Create a company

- **UI observed:** `POST crm-backend-api.brevo.com/crm/backend/company` → 200 · auth `session_cookie` · body captured: yes
- **UI path:** CRM > Empresas > Criar empresa
- **Public API:** `crm.create_company` → `POST /companies` on `api.brevo.com` · success 200 · idempotency non_idempotent · risk medium
- **UI request fields:** attributes, gtm, linkedContactsIds, linkedDealsIds
- **Public request fields:** attributes, countryCode, linkedContactsIds, linkedDealsIds, name
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; request fields: UI [attributes, gtm, linkedContactsIds, linkedDealsIds] vs public [attributes, countryCode, linkedContactsIds, linkedDealsIds, name]; response fields: UI [attributes, createdBy, id, linkedContactsIds, linkedDealsIds] vs public [id]
- **Note:** UI body: {attributes:{name,owner,domain}, linkedContactsIds, linkedDealsIds, gtm}. Public API posts /companies with a different schema. This is the clearest payload-level difference captured.

### Delete a company

- **UI observed:** `DELETE crm-backend-api.brevo.com/crm/backend/company/{id}` → 204 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Empresas > Excluir empresa
- **Public API:** `crm.delete_company` → `DELETE /companies/{id}` on `api.brevo.com` · success 204 · idempotency idempotent · risk high
- **Public request fields:** id
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI deletes via crm-backend-api /crm/backend/company/{id} (204). Public API deletes /companies/{id}.

### List contact lists

- **UI observed:** `GET contacts-api-v2.brevo.com/lists/get-lists` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Listas
- **Public API:** `contacts.get_lists` → `GET /contacts/lists` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** limit, offset, sort
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api-v2.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [data, total_count] vs public [count, lists]
- **Note:** UI reads contacts-api-v2 /lists/get-lists. Public API reads GET /contacts/lists.

### List contact folders

- **UI observed:** `GET contacts-api-v2.brevo.com/lists/get-folders` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Listas > Pastas
- **Public API:** `contacts.get_folders` → `GET /contacts/folders` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** limit, offset, sort
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api-v2.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [folders_data, total_dynamic_list_count, total_list_count] vs public [count, folders]
- **Note:** UI reads contacts-api-v2 /lists/get-folders. Public API reads GET /contacts/folders.

### Get a contact's details

- **UI observed:** `GET contacts-api.brevo.com/contact/backend/contacts/{id}` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Detalhe do contato
- **Public API:** `contacts.get_contact_info` → `GET /contacts/{identifier}` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** endDate, identifier, identifierType, startDate
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [_id, assignTo, attributes, blacklistForList, consentGroups, contact, createdAt, ecommerce, email, emailBlacklisted, emailTag, id, is_anonymous, listid, messagesSentCount, pushActive, pushSubscribed, sc, smsBlacklisted, smtpDeliveredCount, subscriptions, uniqueClickedMessageCount, uniqueOpenedMessageCount, userHistory, whatsappBlacklisted] vs public [attributes, consentGroups, createdAt, email, emailBlacklisted, id, listIds, listUnsubscribed, modifiedAt, smsBlacklisted, statistics, whatsappBlacklisted]
- **Note:** UI reads contacts-api /contact/backend/contacts/{id}. Public API reads GET /contacts/{identifier}.

### List contact attributes

- **UI observed:** `GET contacts-api.brevo.com/contact/backend/settings/get-attributes` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Configurações > Atributos
- **Public API:** `contacts.get_attributes` → `GET /contacts/attributes` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Equivalence:** same_capability_different_surface
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI reads contacts-api /contact/backend/settings/get-attributes. Public API reads GET /contacts/attributes.

### List lists and segments for contact assignment

- **UI observed:** `GET contacts-api.brevo.com/contact/backend/contacts/lists_and_segments` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Contatos > Adicionar contatos > Listas
- **Public API:** `contacts.get_lists` → `GET /contacts/lists` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** limit, offset, sort
- **Equivalence:** partial
- **Differences:** host: contacts-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [category, folder, list, segment] vs public [count, lists]
- **Note:** UI returns folders, lists and segments in one call. Public API splits this into GET /contacts/lists and GET /contacts/segments.

### List companies

- **UI observed:** `GET crm-backend-api.brevo.com/crm/backend/companies` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Empresas
- **Public API:** `crm.list_companies` → `GET /companies` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** createdSince, filters[attributes.name], limit, linkedContactsIds, linkedDealsIds, modifiedSince, page, sort, sortBy
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [items, pager, refs] vs public [items]
- **Note:** UI reads crm-backend-api /crm/backend/companies. Public API reads GET /companies.

### Get a company

- **UI observed:** `GET crm-backend-api.brevo.com/crm/backend/company/{id}` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Empresas > Detalhe
- **Public API:** `crm.get_company` → `GET /companies/{id}` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Public request fields:** id
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; response fields: UI [attributes, createdBy, id, linkedContactsIds, linkedDealsIds, refs] vs public [attributes, id, linkedContactsIds, linkedDealsIds]
- **Note:** UI reads crm-backend-api /crm/backend/company/{id}. Public API reads GET /companies/{id}.

### List company attributes

- **UI observed:** `GET crm-backend-api.brevo.com/crm/backend/attribute/companies` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Empresas > Formulário
- **Public API:** `crm.list_company_attributes` → `GET /crm/attributes/companies` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI reads crm-backend-api /crm/backend/attribute/companies. Public API reads GET /crm/attributes/companies.

### List deal attributes

- **UI observed:** `GET crm-backend-api.brevo.com/crm/backend/attributes/deals` → 200 · auth `session_cookie` · body captured: no
- **UI path:** CRM > Oportunidades > Formulário
- **Public API:** `crm.list_deal_attributes` → `GET /crm/attributes/deals` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **Equivalence:** same_capability_different_surface
- **Differences:** host: crm-backend-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI reads crm-backend-api /crm/backend/attributes/deals. Public API reads GET /crm/attributes/deals.

### Query/search contacts

- **UI observed:** `POST segments-api.brevo.com/segment/query` → 200 · auth `session_cookie` · body captured: yes
- **UI path:** CRM > Contatos
- **Public API:** `contacts.get_contacts` → `GET /contacts` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **UI request fields:** fe_query, force_refresh, limit, page
- **Public request fields:** createdSince, filter, ids, limit, listIds, modifiedSince, offset, segmentId, sort
- **Equivalence:** partial
- **Differences:** host: segments-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; request fields: UI [fe_query, force_refresh, limit, page] vs public [createdSince, filter, ids, limit, listIds, modifiedSince, offset, segmentId, sort]; response fields: UI [data, metadata] vs public [contacts, count]
- **Note:** UI sends {fe_query, page, limit, force_refresh} to segments-api /segment/query. Public API exposes GET /contacts with different pagination/filter parameters.

### Count contacts

- **UI observed:** `POST segments-api.brevo.com/segment/count` → 200 · auth `session_cookie` · body captured: yes
- **UI path:** CRM > Contatos
- **Public API:** `contacts.get_contacts` → `GET /contacts` on `api.brevo.com` · success 200 · idempotency idempotent · risk low
- **UI request fields:** fe_query, searchBy
- **Public request fields:** createdSince, filter, ids, limit, listIds, modifiedSince, offset, segmentId, sort
- **Equivalence:** partial
- **Differences:** host: segments-api.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; request fields: UI [fe_query, searchBy] vs public [createdSince, filter, ids, limit, listIds, modifiedSince, offset, segmentId, sort]; response fields: UI [contact_count, total_count] vs public [contacts, count]
- **Note:** UI gets counts from segments-api /segment/count. The public API has no dedicated count endpoint; a caller must paginate GET /contacts.

### Create an email campaign

- **UI observed:** `POST email-campaigns-backend.brevo.com/email-campaign/api/regular/setup` → 201 · auth `session_cookie` · body captured: yes
- **UI path:** Marketing > Campanhas > E-mail > Criar campanha
- **Public API:** `email_campaigns.create_email_campaign` → `POST /emailCampaigns` on `api.brevo.com` · success 201 · idempotency non_idempotent · risk medium
- **UI request fields:** camp_name, folder_path, tag_ids
- **Public request fields:** abTesting, attachmentUrl, emailExpirationDate, footer, header, htmlContent, htmlUrl, increaseRate, initialQuota, inlineImageActivation, ipWarmupEnable, mirrorActive, name, params, previewText, recipients, replyTo, scheduledAt, sendAtBestTime, sender, splitRule, subject, subjectA, subjectB, tag, templateId, toField, unsubscriptionPageId, updateFormId, utmCampaign, utmContent, utmId, utmMedium, utmSource, utmTerm, winnerCriteria, winnerDelay
- **Equivalence:** same_capability_different_surface
- **Differences:** host: email-campaigns-backend.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; request fields: UI [camp_name, folder_path, tag_ids] vs public [abTesting, attachmentUrl, emailExpirationDate, footer, header, htmlContent, htmlUrl, increaseRate, initialQuota, inlineImageActivation, ipWarmupEnable, mirrorActive, name, params, previewText, recipients, replyTo, scheduledAt, sendAtBestTime, sender, splitRule, subject, subjectA, subjectB, tag, templateId, toField, unsubscriptionPageId, updateFormId, utmCampaign, utmContent, utmId, utmMedium, utmSource, utmTerm, winnerCriteria, winnerDelay]
- **Note:** UI setup body: {camp_name, folder_path, tag_ids} -> 201 {id}, then the editor loads the campaign. Public API POST /emailCampaigns takes the full campaign definition (sender, subject, recipients, content) in one call.

### Delete an email campaign

- **UI observed:** `DELETE email-campaigns-backend.brevo.com/email-campaign/api/campaigns` → 200 · auth `session_cookie` · body captured: no
- **UI path:** Marketing > Campanhas > Excluir
- **Public API:** `email_campaigns.delete_email_campaign` → `DELETE /emailCampaigns/{campaignId}` on `api.brevo.com` · success 204 · idempotency idempotent · risk high
- **Public request fields:** campaignId
- **Equivalence:** same_capability_different_surface
- **Differences:** host: email-campaigns-backend.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI deletes via email-campaigns-backend /email-campaign/api/campaigns. Public API deletes /emailCampaigns/{campaignId}.

### Create an email template

- **UI observed:** `POST unified-templates.brevo.com/email/templates` → 201 · auth `session_cookie` · body captured: yes
- **UI path:** Marketing > Modelos > Criar modelo > Modelo de e-mail
- **Public API:** `templates.create_smtp_template` → `POST /smtp/templates` on `api.brevo.com` · success 201 · idempotency non_idempotent · risk medium
- **UI request fields:** attachment_url, content, from_email, from_name, id, is_active, name, preview, profile_update_form, reply_to, sender_id, subject, tag, to_field, tracking, type
- **Public request fields:** attachmentUrl, htmlContent, htmlUrl, isActive, replyTo, sender, subject, tag, templateName, toField
- **Equivalence:** same_capability_different_surface
- **Differences:** host: unified-templates.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2; request fields: UI [attachment_url, content, from_email, from_name, id, is_active, name, preview, profile_update_form, reply_to, sender_id, subject, tag, to_field, tracking, type] vs public [attachmentUrl, htmlContent, htmlUrl, isActive, replyTo, sender, subject, tag, templateName, toField]
- **Note:** UI body includes {name, subject, from_email, from_name, sender_id, content, reply_to, tag, tracking}. Public API POST /smtp/templates uses sender/templateName/subject/htmlContent and a different tracking shape.

### Delete an email template

- **UI observed:** `DELETE email-campaigns-backend.brevo.com/email-template/api/templates` → 204 · auth `session_cookie` · body captured: no
- **UI path:** Marketing > Modelos > Excluir
- **Public API:** `templates.delete_smtp_template` → `DELETE /smtp/templates/{templateId}` on `api.brevo.com` · success 204 · idempotency idempotent · risk high
- **Public request fields:** templateId
- **Equivalence:** same_capability_different_surface
- **Differences:** host: email-campaigns-backend.brevo.com vs api.brevo.com; auth: session_cookie vs api_key/oauth2
- **Note:** UI deletes via email-campaigns-backend /email-template/api/templates. Public API deletes /smtp/templates/{templateId}.

### Create a sign-up form

- **UI observed:** `POST forms-api.brevo.com/forms-api/forms` → 201 · auth `session_cookie` · body captured: no
- **UI path:** Marketing > Formulários > Criar um formulário de inscrição
- **Catalog action:** `forms.create_sign_up_form` (UI-only; no public endpoint) · risk medium
- **Equivalence:** ui_only_confirmed
- **Differences:** no public API equivalent; observed endpoint confirms a UI-only catalog action
- **Note:** No public API equivalent. The observed internal endpoint forms-api /forms-api/forms (201) confirms the UI-only action and its response shape. The request body was not captured (bodySize=0).

## Internal-only endpoints

These were observed in the UI but have no public-API equivalent recorded in this capture. They are internal, session-authenticated and unstable.

- `GET app.brevo.com/campaigns/listing` (200) — app_backend
- `GET app.brevo.com/contact/forms-app/subscription` (200) — app_backend
- `GET app.brevo.com/contact/list` (200) — app_backend
- `GET app.brevo.com/contact/list-listing` (200) — app_backend
- `GET app.brevo.com/ecommerce/overview` (200) — app_backend
- `GET app.brevo.com/loyalty` (200) — app_backend
- `GET app.brevo.com/marketing/landing-pages` (200) — app_backend
- `GET app.brevo.com/payments` (200) — app_backend
- `GET app.brevo.com/sms-campaign/listing` (200) — app_backend
- `GET app.brevo.com/templates/listing` (200) — app_backend
- `GET app.brevo.com/undefined/` (200) — app_backend
- `GET account-management-backend.brevo.com/api/settings` (200) — internal_api
- `GET account-management-backend.brevo.com/api/settings/list-timezone` (200) — internal_api
- `GET agent-insight.brevo.com/api/agent/chats` (200) — internal_api
- `GET agent-insight.brevo.com/api/agent/organization` (200) — internal_api
- `GET ai-assistant-backend.brevo.com/organization` (200) — internal_api
- `GET analytics-api.brevo.com/settings` (200) — internal_api
- `GET app-store-backend.brevo.com/extensibility/integrations` (200) — internal_api
- `GET asset-sharing.brevo.com/api/notifications` (200) — internal_api
- `GET automation-engine-http-public.brevo.com/dependency/check/list` (200) — internal_api
- `GET automation-engine-http-public.brevo.com/processing-details` (200) — internal_api
- `POST automation.brevo.com/web/activate` (201) — internal_api
- `GET billing.brevo.com/billing/api/organization/currency` (200) — internal_api
- `GET campaign-common-api.brevo.com/feature-toggle/unleash` (200) — internal_api
- `GET campaign-common-api.brevo.com/getTotalUsersConfig` (200) — internal_api
- `GET campaign-common-api.brevo.com/v2/FeatureToggle` (200) — internal_api
- `GET contact-service-api.brevo.com/v1/consent-groups` (200) — internal_api
- `GET contact-service-api.brevo.com/v1/consent-groups/status` (200) — internal_api
- `GET contacts-api-v2.brevo.com/events/presentation_config` (200) — internal_api
- `GET contacts-api-v2.brevo.com/feature-toggle` (200) — internal_api
- `GET contacts-api-v2.brevo.com/v3/app/objects/contact/attributes` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/contacts/{id}/calc-attributes` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/contacts/{id}/header` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/contacts/activities` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/contacts/is_duplicate_contact` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/segment/properties` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/settings` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/settings/crm-account` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/settings/task-types` (200) — internal_api
- `GET contacts-api.brevo.com/contact/backend/transactional/senders/{email}` (200) — internal_api
- `GET conversations-app.brevo.com/feApi/chatWidgetLoader` (200) — internal_api
- `GET conversations-app.brevo.com/feApi/liveUpdatesToken` (200) — internal_api
- `GET conversations-app.brevo.com/feApi/orgFeaturesAndChannels` (200) — internal_api
- `GET conversations-app.brevo.com/sockjs/info` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/castanets.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/clogtick.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/maraca.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/sleighbells.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/triangle.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/washboard.mp3` (200) — internal_api
- `GET conversations-app.brevo.com/static/sounds/windchimes.mp3` (200) — internal_api
- `GET conversions-backend.brevo.com/conversions-goals/all` (422) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/account-settings` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/accounts` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/attributes` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/attributes/rules` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/companies/timeline` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/company/{id}/contacts` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/contact-attributes` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/contacts/preview` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/crm-config/get-form-attributes` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/deals` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/feature-accessibility` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/object-config/attribute-group-view` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/organization-info` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/organization/config` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/pipeline/details` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/pipeline/pipeline-template` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/plan-manager-info` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/rate-limit-status` (200) — internal_api
- `GET crm-backend-api.brevo.com/crm/backend/tasktypes` (200) — internal_api
- `POST custom-ua-logger.brevo.com/user-event-logs/event/form-apps` (200) — internal_api
- `GET editor-api.brevo.com/editor-api/fonts` (200) — internal_api
- `GET editor-api.brevo.com/editor-api/localization/languages` (200) — internal_api
- `GET editor-api.brevo.com/editor-api/localization/settings` (200) — internal_api
- `GET editor-api.brevo.com/editor-api/profile-forms` (200) — internal_api
- `GET editor-api.brevo.com/editor-api/unsubscribe-forms` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/campaign-count` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/campaign/{id}` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/campaigns` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/campaigns/stats` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/config` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-campaign/api/sending-health` (200) — internal_api
- `GET email-campaigns-backend.brevo.com/email-template/api/templates` (200) — internal_api
- `GET events-management-http.brevo.com/categories` (200) — internal_api
- `GET folder-engine.brevo.com/folders/get-details` (200) — internal_api
- `GET folder-engine.brevo.com/folders/layers` (204) — internal_api
- `GET forms-api.brevo.com/forms-api/account` (200) — internal_api
- `GET forms-api.brevo.com/forms-api/attributes` (200) — internal_api
- `GET forms-api.brevo.com/forms-api/contact-lists` (200) — internal_api
- `GET forms-api.brevo.com/forms-api/email-templates` (200) — internal_api
- `GET forms-api.brevo.com/forms-api/forms` (200) — internal_api
- `DELETE forms-api.brevo.com/forms-api/forms/{id}` (204) — internal_api
- `GET forms-api.brevo.com/forms-api/forms/{id}/data` (200) — internal_api
- `GET get.brevo.com/pr/grc/pk_z9jboYytP0N5B7cMeEtQDnTnhLgsbw5s` (200) — internal_api
- `GET get.brevo.com/pr/js` (200) — internal_api
- `GET loyalty-api.brevo.com/loyalty/get-user-permissions` (200) — internal_api
- `GET loyalty-api.brevo.com/loyalty/programs` (200) — internal_api
- `GET marketing-campaign-api.brevo.com/marketing-campaign/api/client/config` (200) — internal_api
- `GET marketing-campaign-api.brevo.com/marketing-campaign/api/client/info` (200) — internal_api
- `GET marketing-campaign-api.brevo.com/marketing-campaign/api/client/toggle-features` (200) — internal_api
- `GET marketing-campaign-api.brevo.com/marketing-campaign/api/senders/{id}/{email}/validate` (200) — internal_api
- `GET marketing-campaign-api.brevo.com/marketing-campaign/api/senders/active` (200) — internal_api
- `GET marketing-common-api.brevo.com/client/feature-toggles` (200) — internal_api
- `GET marketing-common-api.brevo.com/client/info` (200) — internal_api
- `GET marketing-common-api.brevo.com/client/upgrade-flags` (200) — internal_api
- `GET marketing-common-api.brevo.com/settings/utm-settings` (200) — internal_api
- `GET metrics.brevo.com/_/service_worker/6b40/sw_iframe.html` (200) — internal_api
- `GET metrics.brevo.com/g/collect` (200) — internal_api
- `GET onboarding-api-v2.brevo.com/dashboard-information` (200) — internal_api
- `GET onboarding-backend-api.brevo.com/phone/call-enabled` (200) — internal_api
- `GET onboarding-backend-api.brevo.com/settings/ai/agents` (200) — internal_api
- `GET onboarding-backend-api.brevo.com/sms/countries` (200) — internal_api
- `GET ph.brevo.com/array/phc_nQp2LHBNr2FYxDzLpDmYVN7NraM2gjPZJtUTnSgCbX4L/config` (200) — internal_api
- `POST ph.brevo.com/flags/` (200) — internal_api
- `GET segments-api.brevo.com/segment/all-contact-owners` (200) — internal_api
- `GET segments-api.brevo.com/segment/events/status` (200) — internal_api
- `GET segments-api.brevo.com/segment/events/unified` (200) — internal_api
- `GET segments-api.brevo.com/segment/lists` (200) — internal_api
- `POST segments-api.brevo.com/segment/paginated_count` (200) — internal_api
- `GET segments-api.brevo.com/segment/unified_object/paths/contact/associations` (200) — internal_api
- `GET sidebar-backend.brevo.com/sidebar/api/header/info` (200) — internal_api
- `GET sidebar-backend.brevo.com/sidebar/api/metaInfo` (200) — internal_api
- `GET sidebar-backend.brevo.com/sidebar/api/v2/brevo/config/listing` (200) — internal_api
- `GET sidebar-backend.brevo.com/sidebar/api/v2/credit` (200) — internal_api
- `GET sidebar-backend.brevo.com/sidebar/api/v4/brevo/listing` (200) — internal_api
- `GET static.brevo.com/js/countries-production.json` (200) — internal_api
- `GET tag-engine.brevo.com/tags` (200) — internal_api
- `GET tag-engine.brevo.com/v2/tags` (200) — internal_api
- `GET unified-objects.brevo.com/app/objects/company/ext_id/{id}` (404) — internal_api
- `GET unified-objects.brevo.com/app/objects/contact/object_id/{id}` (200) — internal_api
- `GET unified-objects.brevo.com/app/objects/plan` (200) — internal_api
- `GET views-manager-service.brevo.com/view/listing/hidden` (200) — internal_api
- `GET views-manager-service.brevo.com/view/listing/visible` (200) — internal_api
- `GET wallet-app.brevo.com/passes/active` (200) — internal_api
- `GET whatsapp-api.brevo.com/whatsapp-campaign/api/client/info` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/contact/{id}/workflows` (404) — internal_api
- `GET workflow-apis.brevo.com/v1/sidebar/contactCount` (200/202) — internal_api
- `GET workflow-apis.brevo.com/v1/sidebar/deferredCount` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/workflow/bannerDetails` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/workflow/listing` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/workflow/metaInfo` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/workflow/option-info` (200) — internal_api
- `POST workflow-apis.brevo.com/v1/workflow/sendEvent` (200) — internal_api
- `GET workflow-apis.brevo.com/v1/workflow/showDeferredNotification` (202) — internal_api

## Public-only actions (sample)

Catalogued public actions that were not exercised by the captured UI flows. This is expected: the capture covered contacts, lists and companies only.

- `account_admin.associate_ip_to_sub_account` — POST /corporate/subAccount/ip/associate
- `account_admin.create_sub_account` — POST /corporate/subAccount
- `account_admin.create_sub_account_api_key` — POST /corporate/subAccount/key
- `account_admin.create_sub_account_group` — POST /corporate/group
- `account_admin.delete_sub_account` — DELETE /corporate/subAccount/{id}
- `account_admin.delete_sub_account_group` — DELETE /corporate/group/{id}
- `account_admin.dissociate_ip_from_sub_account` — PUT /corporate/subAccount/ip/dissociate
- `account_admin.generate_sso_token` — POST /corporate/ssoToken
- `account_admin.generate_sub_account_sso_token` — POST /corporate/subAccount/ssoToken
- `account_admin.get_account` — GET /account
- `account_admin.get_account_activity` — GET /organization/activities
- `account_admin.get_admin_user_permissions` — GET /corporate/user/{email}/permissions
- `account_admin.get_master_account` — GET /corporate/masterAccount
- `account_admin.get_sub_account` — GET /corporate/subAccount/{id}
- `account_admin.get_sub_account_group` — GET /corporate/group/{id}
- `account_admin.get_user_permission` — GET /organization/user/{email}/permissions
- `account_admin.invite_admin_user` — POST /corporate/user/invitation/send
- `account_admin.invite_user` — POST /organization/user/invitation/send
- `account_admin.list_corporate_invited_users` — GET /corporate/invited/users
- `account_admin.list_corporate_ips` — GET /corporate/ip
- `account_admin.list_invited_users` — GET /organization/invited/users
- `account_admin.list_sub_account_groups` — GET /corporate/groups
- `account_admin.list_sub_accounts` — GET /corporate/subAccount
- `account_admin.remove_sub_account_from_group` — PUT /corporate/group/unlink/{groupId}/subAccounts
- `account_admin.resend_or_cancel_admin_invitation` — PUT /corporate/user/invitation/{action}/{email}
- `account_admin.resend_or_cancel_user_invitation` — PUT /organization/user/invitation/{action}/{email}
- `account_admin.revoke_admin_user` — DELETE /corporate/user/revoke/{email}
- `account_admin.revoke_user_permission` — PUT /organization/user/invitation/revoke/{email}
- `account_admin.toggle_sub_account_applications` — PUT /corporate/subAccount/{id}/applications/toggle
- `account_admin.update_admin_user_permissions` — PUT /corporate/user/{email}/permissions
- `account_admin.update_sub_account_group` — PUT /corporate/group/{id}
- `account_admin.update_sub_account_plan` — PUT /corporate/subAccount/{id}/plan
- `account_admin.update_sub_accounts_plan` — PUT /corporate/subAccounts/plan
- `account_admin.update_user_permission` — POST /organization/user/update/permissions
- `contacts.create_attribute` — POST /contacts/attributes/{attributeCategory}/{attributeName}
- `contacts.create_consent_group` — POST /contacts/consent-groups
- `contacts.create_doi_contact` — POST /contacts/doubleOptinConfirmation
- `contacts.create_folder` — POST /contacts/folders
- `contacts.delete_attribute` — DELETE /contacts/attributes/{attributeCategory}/{attributeName}
- `contacts.delete_consent_group` — DELETE /contacts/consent-groups/{id}

