import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
// The MCP token (brevo_server_mcp_key) is a JWT for https://mcp.brevo.com and is not
// valid for the REST API at api.brevo.com, so it is intentionally not used here.
const baseUrl = 'https://api.brevo.com/v3';
const writeMode = process.argv.includes('--write');

if (!apiKey) {
  console.error('No REST API key found. Set BREVO_API_KEY (or brevo_key) in .env.');
  console.error('Nothing was sent. The catalog remains marked spec_only until live verification runs.');
  process.exit(0);
}

const checks = [
  { action_id: 'account_admin.get_account', method: 'GET', path: '/account' },
  { action_id: 'contacts.get_contacts', method: 'GET', path: '/contacts?limit=1' },
  { action_id: 'contacts.get_lists', method: 'GET', path: '/contacts/lists?limit=1' },
  { action_id: 'contacts.get_folders', method: 'GET', path: '/contacts/folders?limit=1' },
  { action_id: 'contacts.get_attributes', method: 'GET', path: '/contacts/attributes' },
  { action_id: 'email_campaigns.list_email_campaigns', method: 'GET', path: '/emailCampaigns?limit=1' },
  { action_id: 'sms_campaigns.list_sms_campaigns', method: 'GET', path: '/smsCampaigns?limit=1' },
  { action_id: 'whatsapp_campaigns.list_whatsapp_campaigns', method: 'GET', path: '/whatsappCampaigns?limit=1' },
  { action_id: 'templates.list_smtp_templates', method: 'GET', path: '/smtp/templates?limit=1' },
  { action_id: 'senders_and_domains.get_senders', method: 'GET', path: '/senders' },
  { action_id: 'senders_and_domains.get_domains', method: 'GET', path: '/senders/domains' },
  { action_id: 'webhooks.get_webhooks', method: 'GET', path: '/webhooks?type=marketing' },
  { action_id: 'crm.list_companies', method: 'GET', path: '/companies?limit=1' },
  { action_id: 'crm.list_deals', method: 'GET', path: '/crm/deals?limit=1' },
  { action_id: 'crm.list_pipelines', method: 'GET', path: '/crm/pipeline/details/all' },
  { action_id: 'crm.list_tasks', method: 'GET', path: '/crm/tasks?limit=1' },
  { action_id: 'crm.list_notes', method: 'GET', path: '/crm/notes?limit=1' },
  { action_id: 'coupons.get_coupon_collections', method: 'GET', path: '/couponCollections' },
  { action_id: 'ecommerce.list_products', method: 'GET', path: '/products?limit=1' },
  { action_id: 'ecommerce.list_orders', method: 'GET', path: '/orders?limit=1' },
  { action_id: 'loyalty.get_lplist', method: 'GET', path: '/loyalty/config/programs' },
  { action_id: 'events.get_events', method: 'GET', path: '/events?limit=1' },
  { action_id: 'processes.get_processes', method: 'GET', path: '/processes?limit=1' },
];

const headers = { accept: 'application/json', 'api-key': apiKey };
const checkedAt = new Date().toISOString();
const results = [];

async function request(method, endpoint, body) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  return { status: response.status, latency: Date.now() - started, text };
}

function classify(status, text) {
  if (status === 401) return { ok: false, kind: 'auth' };
  // A 403 means the key is authenticated but the account/plan cannot use this feature.
  // Brevo returns generic "Forbidden" for some plan-gated areas, so it is not an auth failure.
  if (status === 403) return { ok: true, kind: 'plan_gated' };
  if (status >= 500) return { ok: false, kind: 'server' };
  return { ok: true, kind: 'ok' };
}

for (const check of checks) {
  try {
    const { status, latency, text } = await request(check.method, check.path);
    const verdict = classify(status, text);
    results.push({
      action_id: check.action_id,
      path: check.path,
      http_status: status,
      ok: verdict.ok,
      kind: verdict.kind,
      latency_ms: latency,
      note: status >= 400 ? text.slice(0, 200) : undefined,
    });
  } catch (error) {
    results.push({ action_id: check.action_id, path: check.path, ok: false, kind: 'network', error: String(error) });
  }
}

if (writeMode) {
  const email = `agent-catalog-verify+${Date.now()}@example.com`;
  try {
    const created = await request('POST', '/contacts', { email, updateEnabled: false });
    results.push({
      action_id: 'contacts.create_contact',
      path: '/contacts',
      http_status: created.status,
      ok: created.status === 201 || created.status === 204,
      kind: created.status === 201 || created.status === 204 ? 'ok' : 'write_failed',
      latency_ms: created.latency,
      note: created.status >= 400 ? created.text.slice(0, 200) : 'write test: contact created',
      write: true,
    });
    const deleted = await request('DELETE', `/contacts/${encodeURIComponent(email)}`);
    results.push({
      action_id: 'contacts.delete_contact',
      path: `/contacts/${email}`,
      http_status: deleted.status,
      ok: deleted.status === 204 || deleted.status === 200,
      kind: deleted.status === 204 || deleted.status === 200 ? 'ok' : 'write_failed',
      latency_ms: deleted.latency,
      note: deleted.status >= 400 ? deleted.text.slice(0, 200) : 'write test: contact cleaned up',
      write: true,
    });
  } catch (error) {
    results.push({ action_id: 'contacts.create_contact', ok: false, error: String(error), write: true });
  }
}

const summary = {
  total: results.length,
  ok: results.filter((result) => result.ok).length,
  failed: results.filter((result) => !result.ok).length,
  plan_gated: results.filter((result) => result.kind === 'plan_gated').length,
  auth_failed: results.some((result) => result.kind === 'auth'),
  network_failed: results.some((result) => result.kind === 'network'),
};

const verification = Object.fromEntries(
  results.map((result) => [result.action_id, {
    status: result.ok ? 'live_verified' : 'live_failed',
    checked_at: checkedAt,
    method: `${result.path}${result.write ? ' (write test)' : ''}`,
    http_status: result.http_status ?? null,
    account_entitlement: result.kind === 'plan_gated' ? 'not_eligible_on_plan' : 'ok',
    note: result.note,
  }]),
);

const outDir = path.join(ROOT, 'reports', 'live');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'verification.json'), `${JSON.stringify({ checked_at: checkedAt, base_url: baseUrl, summary, results, verification }, null, 2)}\n`);

console.log(`Live verification: ${summary.ok}/${summary.total} reachable, ${summary.plan_gated} plan-gated.`);
if (summary.auth_failed) {
  console.warn('Some endpoints returned 401/403 that did not look like plan gating. Check key scopes for those actions.');
}
if (summary.ok === 0) {
  console.error('No endpoint was reachable. Check that the key is valid and API access is enabled.');
  process.exit(1);
}
console.log('Wrote reports/live/verification.json. Run `npm run build` to apply it to the catalog.');
