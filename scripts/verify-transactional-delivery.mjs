import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'transactional-delivery.json');

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
  console.error('Usage: node scripts/verify-transactional-delivery.mjs --to=address@example.com --confirm-send');
  process.exit(0);
}
if (!confirmSend && !dryRun) {
  console.error('Refusing to send: pass --confirm-send to authorize one transactional email.');
  process.exit(0);
}

const headers = { accept: 'application/json', 'api-key': apiKey };
const redact = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}');
const domainOf = (email) => (String(email || '').includes('@') ? String(email).split('@').pop() : null);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const get = async (pathName) => {
  const response = await fetch(`${BASE}${pathName}`, { headers, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text };
};

const senders = await get('/senders');
const senderList = senders.json?.senders || [];
const sender = senderList.find((item) => item.active !== false) || senderList[0];
if (!sender) {
  console.error('No sender available; cannot send transactional email.');
  process.exit(1);
}

if (dryRun) {
  console.log(`Dry run: would send one transactional email from sender ${sender.id} (${domainOf(sender.email)}) to ${domainOf(to)}.`);
  process.exit(0);
}

const checkedAt = new Date().toISOString();
const payload = {
  sender: { id: sender.id },
  to: [{ email: to }],
  subject: 'Agent catalog verification',
  htmlContent: '<html><body><p>Agent catalog verification — one transactional test email.</p></body></html>',
  tags: ['agent-catalog-verify'],
};

const start = Date.now();
let status = null;
let json = null;
let text = '';
try {
  const response = await fetch(`${BASE}/smtp/email`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  status = response.status;
  text = await response.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
} catch (error) {
  text = String(error);
}

const accepted = status === 201 || status === 202;
const messageId = json?.messageId || json?.messageIds?.[0] || null;
let messages = null;
let events = null;
if (accepted && messageId) {
  await sleep(5000);
  const list = await get(`/smtp/emails?messageId=${encodeURIComponent(messageId)}&limit=10`);
  messages = list.status === 200 ? list.json : null;
  const eventList = await get(`/smtp/statistics/events?email=${encodeURIComponent(to)}&limit=20`);
  events = eventList.status === 200 ? eventList.json : null;
}

const sentEvents = (events?.events || []).filter((event) => String(event.email || '').toLowerCase() === String(to).toLowerCase());
const eventNames = [...new Set(sentEvents.map((event) => event.event))];

const result = {
  checked_at: checkedAt,
  base_url: BASE,
  recipient_domain: domainOf(to),
  sender: { id: sender.id, domain: domainOf(sender.email) },
  dry_run: false,
  accepted,
  http_status: status,
  message_id: messageId,
  duration_ms: Date.now() - start,
  messages,
  events: events ? {
    status: 200,
    count: sentEvents.length,
    event_names: eventNames,
    delivery_confirmed: eventNames.some((name) => ['delivered', 'opened', 'click', 'uniqueOpened'].includes(name)),
  } : null,
  note: accepted
    ? (eventNames.length ? `accepted; events observed: ${eventNames.join(', ')}` : 'accepted; no delivery event observed yet')
    : redact(text).slice(0, 240),
  verification: {
    'transactional_email.send_transac_email': {
      status: accepted ? 'live_verified' : 'live_failed',
      checked_at: checkedAt,
      method: 'transactional: POST /smtp/email',
      http_status: status,
      note: accepted
        ? (eventNames.length ? `accepted; events: ${eventNames.join(', ')}` : 'accepted; delivery not confirmed')
        : redact(text).slice(0, 240),
      kind: 'transactional_flow',
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);

const lines = [
  '# Transactional delivery test',
  '',
  `- Recipient domain: \`${result.recipient_domain}\``,
  `- Sender: id ${sender.id}, domain \`${result.sender.domain}\``,
  `- HTTP: ${status}`,
  `- Message id: ${messageId || 'n/a'}`,
  `- Accepted: ${accepted}`,
  `- Events observed: ${eventNames.length ? eventNames.join(', ') : 'none yet'}`,
  `- Delivery confirmed: ${result.events?.delivery_confirmed ?? false}`,
  `- Note: ${result.note}`,
  '',
];
fs.writeFileSync(path.join(ROOT, 'reports', 'transactional-delivery.md'), `${lines.join('\n')}\n`);

console.log(`Transactional test: HTTP ${status}; messageId=${messageId || 'n/a'}; events=${eventNames.join(',') || 'none'}; deliveryConfirmed=${result.events?.delivery_confirmed ?? false}`);
console.log('Wrote reports/transactional-delivery.md and reports/live/transactional-delivery.json.');
if (!accepted) process.exit(1);
