import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'negative-contract-verification.json');

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

const headers = { accept: 'application/json', 'api-key': apiKey };
const redact = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}');

const cases = [
  { action_id: 'contacts.create_list', name: 'list without required fields', method: 'POST', path: '/contacts/lists', body: {}, expected: [400, 422] },
  { action_id: 'contacts.get_list', name: 'get non-existent list', method: 'GET', path: '/contacts/lists/999999999', expected: [400, 404] },
  { action_id: 'contacts.update_list', name: 'update non-existent list', method: 'PUT', path: '/contacts/lists/999999999', body: { name: 'x' }, expected: [400, 404] },
  { action_id: 'contacts.delete_list', name: 'delete non-existent list', method: 'DELETE', path: '/contacts/lists/999999999', expected: [400, 404] },
  { action_id: 'contacts.create_contact', name: 'contact with invalid email', method: 'POST', path: '/contacts', body: { email: 'not-an-email' }, expected: [400, 422] },
  { action_id: 'contacts.get_contact_info', name: 'get non-existent contact', method: 'GET', path: '/contacts/not-a-contact%40example.com', expected: [400, 404] },
  { action_id: 'contacts.delete_contact', name: 'delete non-existent contact', method: 'DELETE', path: '/contacts/not-a-contact%40example.com', expected: [400, 404] },
  { action_id: 'crm.create_company', name: 'company without name', method: 'POST', path: '/companies', body: {}, expected: [400, 422] },
  { action_id: 'crm.get_company', name: 'get non-existent company', method: 'GET', path: '/companies/000000000000000000000000', expected: [400, 404] },
  { action_id: 'crm.delete_company', name: 'delete non-existent company', method: 'DELETE', path: '/companies/000000000000000000000000', expected: [400, 404] },
  { action_id: 'email_campaigns.create_email_campaign', name: 'campaign without sender', method: 'POST', path: '/emailCampaigns', body: { name: 'x' }, expected: [400, 422] },
  { action_id: 'email_campaigns.get_email_campaign', name: 'get non-existent campaign', method: 'GET', path: '/emailCampaigns/999999999', expected: [400, 404] },
  { action_id: 'email_campaigns.send_email_campaign_now', name: 'send non-existent campaign', method: 'POST', path: '/emailCampaigns/999999999/sendNow', expected: [400, 404] },
  { action_id: 'email_campaigns.update_campaign_status', name: 'invalid campaign status', method: 'PUT', path: '/emailCampaigns/999999999/status', body: { status: 'not-a-status' }, expected: [400, 404] },
  { action_id: 'templates.create_smtp_template', name: 'template without sender/subject', method: 'POST', path: '/smtp/templates', body: { templateName: 'x' }, expected: [400, 422] },
  { action_id: 'templates.get_smtp_template', name: 'get non-existent template', method: 'GET', path: '/smtp/templates/999999999', expected: [400, 404] },
  { action_id: 'templates.delete_smtp_template', name: 'delete non-existent template', method: 'DELETE', path: '/smtp/templates/999999999', expected: [400, 404] },
  { action_id: 'webhooks.create_webhook', name: 'webhook without url', method: 'POST', path: '/webhooks', body: {}, expected: [400, 422] },
  { action_id: 'webhooks.get_webhook', name: 'get non-existent webhook', method: 'GET', path: '/webhooks/999999999', expected: [400, 404] },
  { action_id: 'webhooks.delete_webhook', name: 'delete non-existent webhook', method: 'DELETE', path: '/webhooks/999999999', expected: [400, 404] },
  { action_id: 'senders_and_domains.create_sender', name: 'sender with invalid email', method: 'POST', path: '/senders', body: { email: 'not-an-email', name: 'x' }, expected: [400, 422] },
  { action_id: 'senders_and_domains.delete_sender', name: 'delete non-existent sender', method: 'DELETE', path: '/senders/999999999', expected: [400, 404] },
  { action_id: 'senders_and_domains.create_domain', name: 'domain with empty name', method: 'POST', path: '/senders/domains', body: { name: '' }, expected: [400, 422] },
  { action_id: 'senders_and_domains.delete_domain', name: 'delete non-existent domain', method: 'DELETE', path: '/senders/domains/does-not-exist.example.com', expected: [400, 404] },
  { action_id: 'account_admin.get_user_permission', name: 'permissions for unknown user', method: 'GET', path: '/organization/user/not-a-user%40example.com/permissions', expected: [400, 404] },
];

const results = [];
const checkedAt = new Date().toISOString();
for (const testCase of cases) {
  const start = Date.now();
  let status = null;
  let text = '';
  try {
    const response = await fetch(`${BASE}${testCase.path}`, {
      method: testCase.method,
      headers: testCase.body ? { ...headers, 'content-type': 'application/json' } : headers,
      body: testCase.body ? JSON.stringify(testCase.body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    text = String(error);
  }
  const ok = testCase.expected.includes(status);
  results.push({
    action_id: testCase.action_id,
    case: testCase.name,
    method: testCase.method,
    path: redact(testCase.path),
    expected: testCase.expected,
    http_status: status,
    ok,
    duration_ms: Date.now() - start,
    note: ok ? null : redact(text).slice(0, 220),
  });
}

const summary = {
  cases: results.length,
  passed: results.filter((result) => result.ok).length,
  failed: results.filter((result) => !result.ok).length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ checked_at: checkedAt, base_url: BASE, summary, results }, null, 2)}\n`);

const lines = [
  '# Negative contract verification',
  '',
  `Checked ${results.length} cases; ${summary.passed} passed, ${summary.failed} failed.`,
  '',
  '| Action | Case | Expected | Actual | Result |',
  '|---|---|---|---|---|',
  ...results.map((result) => `| \`${result.action_id}\` | ${result.case} | ${result.expected.join('/')} | ${result.http_status ?? 'error'} | ${result.ok ? 'OK' : 'FAIL'} |`),
  '',
];
fs.writeFileSync(path.join(ROOT, 'reports', 'negative-contracts.md'), `${lines.join('\n')}\n`);

console.log(`Negative contracts: ${summary.passed}/${summary.cases} passed, ${summary.failed} failed.`);
console.log('Wrote reports/negative-contracts.md and reports/live/negative-contract-verification.json.');
if (summary.failed) process.exit(1);
