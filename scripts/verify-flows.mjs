import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'flow-verification.json');

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
  console.error('No REST API key found. Set BREVO_API_KEY (or brevo_key) in .env.');
  process.exit(0);
}

const args = process.argv.slice(2);
const only = new Set(
  args
    .filter((arg) => arg.startsWith('--only='))
    .flatMap((arg) => arg.slice('--only='.length).split(','))
    .map((value) => value.trim())
    .filter(Boolean),
);
const dryRun = args.includes('--dry-run');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const checkedAt = new Date().toISOString();
const results = [];
const startedFlow = Date.now();

const headers = { accept: 'application/json', 'api-key': apiKey };
const redactEmail = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}');
const redactPath = (value) => redactEmail(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(entry) {
  results.push({ ...entry, path: redactPath(entry.path || '') });
}

async function call(actionId, step, method, pathName, body, expected) {
  const started = Date.now();
  let status = null;
  let json = null;
  let text = '';
  try {
    const response = await fetch(`${BASE}${pathName}`, {
      method,
      headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    status = response.status;
    text = await response.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  } catch (error) {
    record({ action_id: actionId, step, method, path: pathName, expected, ok: false, http_status: null, duration_ms: Date.now() - started, note: String(error).slice(0, 200) });
    return { ok: false, status: null, json: null, text: '' };
  }
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const ok = expectedList.includes(status);
  record({
    action_id: actionId,
    step,
    method,
    path: pathName,
    expected: expectedList,
    ok,
    http_status: status,
    duration_ms: Date.now() - started,
    note: ok ? null : redactEmail(text).slice(0, 220),
  });
  return { ok, status, json, text };
}

async function getWithRetry(actionId, step, pathName, attempts = 3) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await call(actionId, step, 'GET', pathName, null, 200);
    if (last.ok) return last;
    if (last.status === 401 || last.status === 403) return last;
    await sleep(1000);
  }
  return last;
}

function skip(actionId, step, reason) {
  record({ action_id: actionId, step, method: 'SKIP', path: '', expected: [], ok: true, skipped: true, http_status: null, duration_ms: 0, note: reason });
}

let senderRef = null;
let senderName = null;
let folderId = null;
let createdFolder = false;

async function preflight() {
  const account = await call('account_admin.get_account', 'preflight account', 'GET', '/account', null, 200);
  if (!account.ok) {
    console.error(`Preflight failed: GET /account returned ${account.status}. Check the API key.`);
    return false;
  }

  const senders = await call('senders_and_domains.get_senders', 'preflight senders', 'GET', '/senders', null, 200);
  const list = senders.json?.senders || [];
  const sender = list.find((item) => item.active !== false && (item.id || item.email)) || list.find((item) => item.id || item.email);
  if (sender) {
    senderRef = sender.id ? { id: sender.id } : { email: sender.email };
    senderName = sender.name || null;
  }

  const folders = await call('contacts.get_folders', 'preflight folders', 'GET', '/contacts/folders?limit=50', null, 200);
  folderId = folders.json?.folders?.[0]?.id ?? null;
  if (!folderId) {
    const created = await call('contacts.create_folder', 'preflight create folder', 'POST', '/contacts/folders', { name: `agent-catalog-verify-folder-${stamp}` }, [201, 200]);
    folderId = created.json?.id ?? null;
    createdFolder = Boolean(folderId);
  }
  return true;
}

async function verifyListFlow() {
  if (!folderId) return skip('contacts.create_list', 'create list', 'No folder available and folder creation failed.');
  const name = `agent-catalog-verify-list-${stamp}`;
  let id = null;
  try {
    const created = await call('contacts.create_list', 'create list', 'POST', '/contacts/lists', { name, folderId }, [201, 200]);
    id = created.json?.id ?? null;
    if (!created.ok || !id) return;
    await getWithRetry('contacts.get_list', 'get list', `/contacts/lists/${id}`);
  } finally {
    if (id) await call('contacts.delete_list', 'cleanup list', 'DELETE', `/contacts/lists/${id}`, null, [204, 200]);
  }
}

async function createList(label) {
  const created = await call('contacts.create_list', `create ${label} list`, 'POST', '/contacts/lists', { name: `agent-catalog-verify-list-${label}-${stamp}`, folderId }, [201, 200]);
  return created.ok ? created.json?.id ?? null : null;
}

async function deleteList(id, label) {
  if (!id) return;
  await call('contacts.delete_list', `cleanup ${label} list`, 'DELETE', `/contacts/lists/${id}`, null, [204, 200]);
}

async function verifyContactFlow() {
  if (!folderId) return skip('contacts.create_contact', 'create contact', 'No folder available for the supporting lists.');
  const listA = await createList('a');
  const listB = await createList('b');
  const email = `agent-catalog-verify+${stamp}@example.com`;
  try {
    if (!listA) return;
    const created = await call('contacts.create_contact', 'create contact', 'POST', '/contacts', {
      email,
      attributes: { FNAME: 'Agent', LNAME: 'CatalogVerify' },
      listIds: [listA],
      updateEnabled: false,
    }, [201, 204]);
    if (!created.ok) return;

    await getWithRetry('contacts.get_contact_info', 'get contact', `/contacts/${encodeURIComponent(email)}`);

    if (listB) {
      await call('contacts.add_contact_to_list', 'add contact to list', 'POST', `/contacts/lists/${listB}/contacts/add`, { emails: [email] }, [201, 204, 200]);
    }
  } finally {
    await call('contacts.delete_contact', 'cleanup contact', 'DELETE', `/contacts/${encodeURIComponent(email)}`, null, [204, 200, 404]);
    await deleteList(listB, 'b');
    await deleteList(listA, 'a');
  }
}

async function verifyCompanyFlow() {
  const name = `agent-catalog-verify-company-${stamp}`;
  let id = null;
  try {
    const created = await call('crm.create_company', 'create company', 'POST', '/companies', {
      name,
      attributes: { domain: `agent-catalog-verify-${stamp}.example.com` },
    }, [201, 200]);
    id = created.json?.id ?? null;
    if (!created.ok || !id) return;
    await getWithRetry('crm.get_company', 'get company', `/companies/${id}`);
  } finally {
    if (id) await call('crm.delete_company', 'cleanup company', 'DELETE', `/companies/${id}`, null, [204, 200, 404]);
  }
}

async function verifyCampaignFlow() {
  if (!folderId) return skip('email_campaigns.create_email_campaign', 'create campaign', 'No folder available for the supporting list.');
  if (!senderRef) return skip('email_campaigns.create_email_campaign', 'create campaign', 'No sender available in the account.');
  const listId = await createList('campaign');
  const email = `agent-catalog-verify-campaign+${stamp}@example.com`;
  let contactCreated = false;
  let id = null;
  try {
    if (!listId) return;
    const contact = await call('contacts.create_contact', 'create campaign recipient', 'POST', '/contacts', {
      email,
      attributes: { FNAME: 'Agent', LNAME: 'CampaignVerify' },
      listIds: [listId],
      updateEnabled: false,
    }, [201, 204]);
    contactCreated = contact.ok;
    if (!contactCreated) return;

    // The campaign API rejects recipients with zero contacts; wait for indexing.
    await getWithRetry('contacts.get_contacts_from_list', 'verify campaign recipient', `/contacts/lists/${listId}/contacts?limit=1`, 6);

    const created = await call('email_campaigns.create_email_campaign', 'create campaign', 'POST', '/emailCampaigns', {
      name: `agent-catalog-verify-campaign-${stamp}`,
      sender: senderRef,
      recipients: { listIds: [listId] },
      subject: 'Agent catalog verification',
      previewText: 'Verification only',
      htmlContent: '<html><body><p>Agent catalog verification</p></body></html>',
    }, [201, 200]);
    id = created.json?.id ?? null;
    if (!created.ok || !id) return;
    await getWithRetry('email_campaigns.get_email_campaign', 'get campaign', `/emailCampaigns/${id}`);
  } finally {
    if (id) await call('email_campaigns.delete_email_campaign', 'cleanup campaign', 'DELETE', `/emailCampaigns/${id}`, null, [204, 200, 404]);
    if (contactCreated) await call('contacts.delete_contact', 'cleanup campaign contact', 'DELETE', `/contacts/${encodeURIComponent(email)}`, null, [204, 200, 404]);
    await deleteList(listId, 'campaign');
  }
}

async function verifyTemplateFlow() {
  if (!senderRef) return skip('templates.create_smtp_template', 'create template', 'No sender available in the account.');
  let id = null;
  try {
    const created = await call('templates.create_smtp_template', 'create template', 'POST', '/smtp/templates', {
      templateName: `agent-catalog-verify-template-${stamp}`,
      subject: 'Agent catalog verification',
      sender: senderRef,
      htmlContent: '<html><body><p>Agent catalog verification</p></body></html>',
      isActive: false,
    }, [201, 200]);
    id = created.json?.id ?? null;
    if (!created.ok || !id) return;
    await getWithRetry('templates.get_smtp_template', 'get template', `/smtp/templates/${id}`);
  } finally {
    if (id) await call('templates.delete_smtp_template', 'cleanup template', 'DELETE', `/smtp/templates/${id}`, null, [204, 200, 404]);
  }
}

function selected(name) {
  return only.size === 0 || only.has(name);
}

async function main() {
  if (dryRun) {
    console.log('Dry run: no request will be sent.');
    console.log('Flows:', ['list', 'contact', 'company', 'campaign', 'template'].filter(selected).join(', '));
    return;
  }

  if (!(await preflight())) {
    process.exit(1);
  }

  if (selected('list')) await verifyListFlow();
  if (selected('contact')) await verifyContactFlow();
  if (selected('company')) await verifyCompanyFlow();
  if (selected('campaign')) await verifyCampaignFlow();
  if (selected('template')) await verifyTemplateFlow();

  if (createdFolder && folderId) {
    await call('contacts.delete_folder', 'cleanup folder', 'DELETE', `/contacts/folders/${folderId}`, null, [204, 200, 404]);
  }

  const verification = {};
  for (const result of results) {
    if (!result.action_id || result.skipped) continue;
    const previous = verification[result.action_id];
    const status = result.ok ? 'live_verified' : 'live_failed';
    if (!previous || status === 'live_failed' || previous.status !== 'live_failed') {
      verification[result.action_id] = {
        status,
        checked_at: checkedAt,
        method: `flow: ${result.method} ${result.path}`,
        http_status: result.http_status,
        kind: 'write_flow',
        note: result.note || null,
      };
    }
  }

  const summary = {
    steps: results.length,
    ok: results.filter((result) => result.ok && !result.skipped).length,
    failed: results.filter((result) => !result.ok).length,
    skipped: results.filter((result) => result.skipped).length,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({
    checked_at: checkedAt,
    base_url: BASE,
    sender: senderName ? { name: senderName } : null,
    summary,
    results,
    verification,
    duration_ms: Date.now() - startedFlow,
  }, null, 2)}\n`);

  console.log(`Write flows: ${summary.ok}/${summary.steps} steps ok, ${summary.failed} failed, ${summary.skipped} skipped.`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}. Run \`npm run build\` to apply the write verification.`);
  if (summary.failed) process.exit(1);
}

await main();
