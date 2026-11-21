# Events and webhooks verification

- Test contact created: true
- POST /events: 204
- GET /events: 200
- Webhook created: true
- Transactional email: 201 (accepted: true)
- Webhook requests received: 0
- Event names observed: none
- Delivery confirmed: false
- Note: custom event ingested; webhook created/deleted; no webhook request observed within 20s (delivery not confirmed)
