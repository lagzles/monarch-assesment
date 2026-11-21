import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'spec-only-sweep.json');
const OVERLAY = path.join(ROOT, 'reports', 'live', 'spec-only-overlay.json');

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
const domains = new Set((flag('domains') || '').split(',').map((value) => value.trim()).filter(Boolean));
const includeWrites = has('include-writes');
const limit = Number(flag('limit') || 40);
const delayMs = Number(flag('delay-ms') || 250);
const dryRun = has('dry-run');

const headers = { accept: 'application/json', 'api-key': apiKey };
const redact = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const get = async (pathName) => {
  const response = await fetch(`${BASE}${pathName}`, { headers, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text };
};

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const candidates = catalog.actions.filter((action) => {
  if (action.verification.status !== 'spec_only') return false;
  if (action.execution.kind !== 'api') return false;
  if (domains.size && !domains.has(action.domain)) return false;
  if (!includeWrites && action.execution.endpoint.method !== 'GET') return false;
  return true;
});

if (dryRun) {
  console.log(`Dry run: ${candidates.length} spec-only candidates.`);
  for (const action of candidates.slice(0, limit)) {
    console.log(`${action.execution.endpoint.method} ${action.execution.endpoint.path} (${action.domain})`);
  }
  process.exit(0);
}

const fixtures = {};
const account = await get('/account');
fixtures.accountEmail = account.json?.email || null;
const contacts = await get('/contacts?limit=1');
fixtures.contact = contacts.json?.contacts?.[0]?.email || contacts.json?.contacts?.[0]?.id || null;
const lists = await get('/contacts/lists?limit=1');
fixtures.listId = lists.json?.lists?.[0]?.id ?? null;
const folders = await get('/contacts/folders?limit=1');
fixtures.folderId = folders.json?.folders?.[0]?.id ?? null;
const campaigns = await get('/emailCampaigns?limit=10');
fixtures.campaignId = campaigns.json?.campaigns?.[0]?.id ?? 12;
const templates = await get('/smtp/templates?limit=1');
fixtures.templateId = templates.json?.templates?.[0]?.id ?? null;
const senders = await get('/senders');
fixtures.senderId = senders.json?.senders?.[0]?.id ?? null;
const processes = await get('/processes?limit=1');
fixtures.processId = processes.json?.processes?.[0]?.id ?? null;
const inbound = await get('/inbound/events?limit=1');
fixtures.uuid = inbound.json?.events?.[0]?.uuid ?? null;

const placeholderMap = {
  identifier: fixtures.contact,
  listId: fixtures.listId,
  folderId: fixtures.folderId,
  campaignId: fixtures.campaignId,
  templateId: fixtures.templateId,
  senderId: fixtures.senderId,
  processId: fixtures.processId,
  uuid: fixtures.uuid,
};

const results = [];
let stoppedForRateLimit = false;
let executed = 0;

for (const action of candidates) {
  if (executed >= limit) break;
  if (stoppedForRateLimit) {
    results.push({ action_id: action.id, status: 'skipped', reason: 'stopped after rate limit' });
    continue;
  }
  const method = action.execution.endpoint.method;
  if (method !== 'GET') {
    results.push({ action_id: action.id, status: 'skipped', reason: 'write requires fixture/cleanup' });
    continue;
  }
  let pathName = action.execution.endpoint.path;
  let unresolved = null;
  pathName = pathName.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = placeholderMap[name];
    if (value === undefined || value === null || value === '') {
      unresolved = name;
      return `{${name}}`;
    }
    return encodeURIComponent(String(value));
  });
  if (unresolved) {
    results.push({ action_id: action.id, status: 'skipped', reason: `no fixture for {${unresolved}}` });
    continue;
  }

  const query = new URLSearchParams();
  const properties = action.inputs?.properties || {};
  if (properties.limit) query.set('limit', '1');
  if (properties.offset) query.set('offset', '0');
  if (properties.page) query.set('page', '1');
  if (properties.sort) query.set('sort', 'desc');
  const requiredNames = action.inputs?.required || [];
  const missingRequired = requiredNames.filter((name) => properties[name]?.['x-in'] === 'query' && !query.has(name));
  if (missingRequired.length) {
    results.push({ action_id: action.id, status: 'skipped', reason: `missing required query: ${missingRequired.join(', ')}` });
    continue;
  }
  if (query.toString()) pathName += `${pathName.includes('?') ? '&' : '?'}${query.toString()}`;

  const started = Date.now();
  let response;
  try {
    response = await get(pathName);
  } catch (error) {
    results.push({ action_id: action.id, status: 'network_error', path: redact(pathName), note: String(error).slice(0, 180) });
    continue;
  }
  executed += 1;
  const ok = response.status >= 200 && response.status < 300;
  const planGated = response.status === 403 && /plan|not eligible|not activated|permission_denied|enterprise/i.test(response.text);
  const rateLimited = response.status === 429;
  if (rateLimited) stoppedForRateLimit = true;
  results.push({
    action_id: action.id,
    status: ok ? 'reachable_2xx' : planGated ? 'plan_gated' : rateLimited ? 'rate_limited' : `reachable_${response.status}`,
    method,
    path: redact(pathName),
    http_status: response.status,
    ok,
    plan_gated: planGated,
    duration_ms: Date.now() - started,
    note: ok ? null : redact(response.text).slice(0, 200),
  });
  await sleep(delayMs);
}

const verification = {};
for (const result of results) {
  if (result.ok) {
    verification[result.action_id] = {
      status: 'live_verified',
      checked_at: new Date().toISOString(),
      method: `sweep: GET ${result.path}`,
      http_status: result.http_status,
      note: 'reachability sweep: HTTP 2xx',
      kind: 'read_check',
    };
  } else if (result.plan_gated) {
    verification[result.action_id] = {
      status: 'plan_gated',
      checked_at: new Date().toISOString(),
      method: `sweep: GET ${result.path}`,
      http_status: result.http_status,
      account_entitlement: 'not_eligible_on_plan',
      note: result.note,
      kind: 'read_check',
    };
  }
}

const summary = {
  candidates: candidates.length,
  executed,
  reachable_2xx: results.filter((result) => result.status === 'reachable_2xx').length,
  plan_gated: results.filter((result) => result.plan_gated).length,
  skipped: results.filter((result) => result.status === 'skipped').length,
  rate_limited: results.filter((result) => result.status === 'rate_limited').length,
};

let finalResults = results;
let finalVerification = verification;
if (has('merge') && fs.existsSync(OUT)) {
  const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const resultMap = new Map((previous.results || []).map((result) => [result.action_id, result]));
  for (const result of results) resultMap.set(result.action_id, result);
  finalResults = [...resultMap.values()];
  const previousOverlay = fs.existsSync(OVERLAY) ? JSON.parse(fs.readFileSync(OVERLAY, 'utf8')) : { verification: {} };
  finalVerification = { ...(previousOverlay.verification || {}), ...verification };
}

const finalSummary = {
  candidates: finalResults.length,
  executed: finalResults.filter((result) => result.http_status != null).length,
  reachable_2xx: finalResults.filter((result) => result.status === 'reachable_2xx').length,
  reachable_400: finalResults.filter((result) => result.status === 'reachable_400').length,
  reachable_403: finalResults.filter((result) => result.status === 'reachable_403').length,
  plan_gated: finalResults.filter((result) => result.plan_gated).length,
  skipped: finalResults.filter((result) => result.status === 'skipped').length,
  rate_limited: finalResults.filter((result) => result.status === 'rate_limited').length,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ checked_at: new Date().toISOString(), base_url: BASE, summary: finalSummary, results: finalResults }, null, 2)}\n`);
fs.writeFileSync(OVERLAY, `${JSON.stringify({ checked_at: new Date().toISOString(), verification: finalVerification }, null, 2)}\n`);

console.log(`Spec-only sweep: ${finalSummary.executed} executed, ${finalSummary.reachable_2xx} 2xx, ${finalSummary.plan_gated} plan-gated, ${finalSummary.rate_limited} rate-limited, ${finalSummary.skipped} skipped.`);
console.log(`Wrote ${path.relative(ROOT, OUT)} and ${path.relative(ROOT, OVERLAY)}.`);
