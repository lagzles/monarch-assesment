import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'events-webhooks.json');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const apiKey = (env.BREVO_API_KEY || env.brevo_key || env.BREVO_KEY || env.brevo_api_key || '').trim();
if (!apiKey) {
  console.error('No REST API key found.');
  process.exit(0);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};
const has = (name) => args.includes(`--${name}`);
const to = flag('to');
const confirmSend = has('confirm-send');
const dryRun = has('dry-run');
if (!to) {
  console.error('Usage: node scripts/verify-events-webhooks.mjs --to=address@example.com --confirm-send');
  process.exit(0);
}
if (!confirmSend && !dryRun) {
  console.error('Pass --confirm-send to authorize one transactional email for event generation.');
  process.exit(0);
}

const headers = { accept: 'application/json', 'api-key': apiKey };
const redact = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}')
  .replace(/webhook\.site\/[0-9a-f-]{36}/gi, 'webhook.site/{token}');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const checkedAt = new Date().toISOString();

const call = async (method, pathName, body) => {
  const response = await fetch(`${BASE}${pathName}`, {
    method,
    headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text };
};

const get = (pathName) => call('GET', pathName);
const post = (pathName, body) => call('POST', pathName, body);
const del = (pathName) => call('DELETE', pathName);

if (dryRun) {
  console.log(`Dry run: create a test contact, POST /events, create webhook, send one transactional email to ${to.split('@').pop()}, check events.`);
  process.exit(0);
}

const senders = await get('/senders');
const sender = (senders.json?.senders || []).find((item) => item.active !== false) || senders.json?.senders?.[0];
if (!sender) {
  console.error('No sender available.');
  process.exit(1);
}

const contactEmail = `agent-catalog-event+${stamp}@example.com`;
let contactCreated = false;
let webhookId = null;
let webhookToken = null;
let webhookUrl = null;
let eventsStatus = null;
let eventListStatus = null;
let sendStatus = null;
let webhookRequests = null;
let eventNames = [];

try {
  const contact = await post('/contacts', {
    email: contactEmail,
    attributes: { FNAME: 'Agent', LNAME: 'EventVerify' },
    updateEnabled: false,
  });
  contactCreated = contact.status === 201 || contact.status === 204;

  const event = await post('/events', {
    event_name: 'agent_catalog_verify',
    identifiers: { email: contactEmail },
    event_date: new Date().toISOString(),
    event_properties: { source: 'catalog-validation' },
  });
  eventsStatus = event.status;

  const eventList = await get('/events?event_name=agent_catalog_verify&limit=10');
  eventListStatus = eventList.status;

  try {
    const tokenResponse = await fetch('https://webhook.site/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const tokenJson = await tokenResponse.json();
    webhookToken = tokenJson.uuid;
    webhookUrl = `https://webhook.site/${webhookToken}`;
  } catch { /* skip webhook if token creation fails */ }

  if (webhookUrl) {
    const webhook = await post('/webhooks', {
      url: webhookUrl,
      type: 'transactional',
      events: ['request', 'sent', 'delivered', 'opened', 'click'],
      description: `agent-catalog-event-verify-${stamp}`,
    });
    webhookId = webhook.json?.id ?? null;

    const send = await post('/smtp/email', {
      sender: { id: sender.id },
      to: [{ email: to }],
      subject: 'Agent catalog webhook verification',
      htmlContent: '<html><body><p>Agent catalog webhook verification.</p></body></html>',
      tags: ['agent-catalog-event-verify'],
    });
    sendStatus = send.status;

    await sleep(20000);
    try {
      const requests = await fetch(`https://webhook.site/token/${webhookToken}/requests?sorting=newest`, { headers: { accept: 'application/json' } });
      const json = await requests.json();
      const data = json.data || json.requests || [];
      webhookRequests = data.length;
      for (const request of data) {
        const content = request.content || request.body || '';
        try {
          const payload = typeof content === 'string' ? JSON.parse(content) : content;
          if (payload.event) eventNames.push(payload.event);
          if (payload.events) eventNames.push(...payload.events);
        } catch { /* ignore non-JSON */ }
      }
      eventNames = [...new Set(eventNames)];
    } catch { /* no request data */ }
  }
} finally {
  if (webhookId) await del(`/webhooks/${webhookId}`);
  if (webhookToken) {
    try { await fetch(`https://webhook.site/token/${webhookToken}`, { method: 'DELETE' }); } catch { /* ignore */ }
  }
  if (contactCreated) await del(`/contacts/${encodeURIComponent(contactEmail)}`);
}

const accepted = sendStatus === 201 || sendStatus === 202;
const result = {
  checked_at: checkedAt,
  base_url: BASE,
  contact_created: contactCreated,
  custom_event_status: eventsStatus,
  event_list_status: eventListStatus,
  webhook_created: Boolean(webhookId),
  transactional_status: sendStatus,
  transactional_accepted: accepted,
  webhook_requests: webhookRequests,
  event_names: eventNames,
  delivery_confirmed: eventNames.length > 0,
  note: eventNames.length
    ? `webhook received events: ${eventNames.join(', ')}`
    : (accepted ? 'transactional accepted; no webhook event observed within 20s' : 'transactional send failed'),
  verification: {
    'events.create_event': {
      status: eventsStatus === 201 || eventsStatus === 204 ? 'live_verified' : 'live_failed',
      checked_at: checkedAt,
      method: 'events: POST /events',
      http_status: eventsStatus,
      note: eventsStatus === 201 || eventsStatus === 204 ? 'custom event ingested' : 'custom event rejected',
      kind: 'event_flow',
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

const lines = [
  '# Events and webhooks verification',
  '',
  `- Test contact created: ${contactCreated}`,
  `- POST /events: ${eventsStatus}`,
  `- GET /events: ${eventListStatus}`,
  `- Webhook created: ${Boolean(webhookId)}`,
  `- Transactional email: ${sendStatus} (accepted: ${accepted})`,
  `- Webhook requests received: ${webhookRequests ?? 'n/a'}`,
  `- Event names observed: ${eventNames.length ? eventNames.join(', ') : 'none'}`,
  `- Delivery confirmed: ${result.delivery_confirmed}`,
  `- Note: ${result.note}`,
  '',
];
fs.writeFileSync(path.join(ROOT, 'reports', 'events-webhooks.md'), `${lines.join('\n')}\n`);

console.log(`Events: POST /events=${eventsStatus}, GET /events=${eventListStatus}; webhook requests=${webhookRequests ?? 'n/a'}; events=${eventNames.join(',') || 'none'}; send=${sendStatus}.`);
console.log('Wrote reports/events-webhooks.md and reports/live/events-webhooks.json.');
