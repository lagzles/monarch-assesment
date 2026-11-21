# Delivery diagnosis

## Findings

- Plan has 300 send credits (free); credits are probably not the blocker.
- 1 active sender(s) found; sender activation is not the blocker.
- No authenticated sender domain found in the account.
- Sender domain(s) gmail.com are free-mail domains; their DMARC policy cannot be authenticated by Brevo, which commonly blocks/suspends campaign sending.
- Campaign 14 is suspended with sent=0/delivered=0; the API accepted the send call but the campaign did not dispatch.
- Campaign sender domain is gmail.com.

**Likely blocker:** free-mail sender domain without an authenticated sending domain

## Recommendations

- Use a domain you control (not gmail.com) and authenticate it in Brevo (Brevo code, DKIM, DMARC).
- Create the sender on that authenticated domain, then retry sendTest to a single address you control.
- Keep the recipient list to one contact and check the campaign statistics after sendTest.
- If a custom domain is not available, use transactional SMTP/email for a delivery test; do not expect gmail.com campaign sending to work.

