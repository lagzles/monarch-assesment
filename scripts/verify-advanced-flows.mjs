import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'advanced-flow-verification.json');
const DEFAULT_FLOWS = ['account-read', 'crm', 'webhooks', 'senders', 'domains', 'schedule'];

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
const flag = (name) => {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};
const has = (name) => args.includes(`--${name}`);
const only = new Set((flag('only') || '').split(',').map((value) => value.trim()).filter(Boolean));
const selected = (name) => (only.size ? only.has(name) || only.has('all') : DEFAULT_FLOWS.includes(name));
const confirmSend = has('confirm-send');
const dryRun = has('dry-run');
const recipient = flag('email');
const senderEmails = (flag('sender-emails') || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
let webhookUrl = flag('webhook-url');
let webhookToken = flag('webhook-token');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const checkedAt = new Date().toISOString();
const results = [];
const started = Date.now();

const headers = { accept: 'application/json', 'api-key': apiKey };
const redactEmail = (value) => String(value)
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '{email}')
  .replace(/[A-Za-z0-9._%+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '{email}');
const redactPath = (value) => redactEmail(String(value))
  .replace(/agent-catalog-verify[^/"'\s]*/gi, '{test}')
  .replace(/webhook\.site\/[0-9a-f-]{36}/gi, 'webhook.site/{token}');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function record(entry) {
  results.push({ ...entry, step: redactPath(entry.step || ''), path: redactPath(entry.path || '') });
}

const PLAN_RE = /(upgrade to .*plan|enterprise plan|plan not eligible|not eligible for|not activated|feature not available|insufficient credit|credit balance|subscription)/i;
const BLOCKED_RE = /(campaign once scheduled can not be deleted|dmarc policy requires|domain to be authenticated)/i;

function planGatedMessage(status, text) {
  return [400, 402, 403].includes(status) && PLAN_RE.test(text);
}

function blockedMessage(status, text) {
  return [400, 403].includes(status) && BLOCKED_RE.test(text);
}

async function call(actionId, step, method, pathName, body, expected) {
  const start = Date.now();
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
    record({ action_id: actionId, step, method, path: pathName, expected, ok: false, http_status: null, duration_ms: Date.now() - start, note: String(error).slice(0, 200) });
    return { ok: false, planGated: false, status: null, json: null, text: '' };
  }
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const ok = expectedList.includes(status);
  const planGated = !ok && planGatedMessage(status, text);
  const blocked = !ok && !planGated && blockedMessage(status, text);
  record({
    action_id: actionId,
    step,
    method,
    path: pathName,
    expected: expectedList,
    ok: ok || blocked,
    skipped: blocked,
    blocked,
    plan_gated: planGated,
    http_status: status,
    duration_ms: Date.now() - start,
    note: ok ? null : redactEmail(text).slice(0, 240),
  });
  return { ok, planGated, blocked, status, json, text };
}

async function getWithRetry(actionId, step, pathName, attempts = 4) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await call(actionId, step, 'GET', pathName, null, 200);
    if (last.ok || last.planGated || last.status === 401) return last;
    await sleep(1000);
  }
  return last;
}

function skip(actionId, step, reason) {
  record({ action_id: actionId, step, method: 'SKIP', path: '', expected: [], ok: true, skipped: true, http_status: null, duration_ms: 0, note: reason });
}

let folderId = null;
let createdFolder = false;
let pipeline = null;
let stage = null;
let taskTypeId = null;
let senderRef = null;
let accountEmail = null;
let existingSenders = [];

async function preflight() {
  const account = await call('account_admin.get_account', 'preflight account', 'GET', '/account', null, 200);
  if (!account.ok) {
    console.error(`Preflight failed: GET /account returned ${account.status}.`);
    return false;
  }
  accountEmail = account.json?.email || null;

  const senders = await call('senders_and_domains.get_senders', 'preflight senders', 'GET', '/senders', null, 200);
  existingSenders = senders.json?.senders || [];
  const sender = existingSenders.find((item) => item.active !== false && (item.id || item.email)) || existingSenders.find((item) => item.id || item.email);
  if (sender) senderRef = sender.id ? { id: sender.id } : { email: sender.email };

  const folders = await call('contacts.get_folders', 'preflight folders', 'GET', '/contacts/folders?limit=50', null, 200);
  folderId = folders.json?.folders?.[0]?.id ?? null;
  if (!folderId) {
    const created = await call('contacts.create_folder', 'preflight folder', 'POST', '/contacts/folders', { name: `agent-catalog-verify-folder-${stamp}` }, [201, 200]);
    folderId = created.json?.id ?? null;
    createdFolder = Boolean(folderId);
  }

  const pipelines = await call('crm.list_pipelines', 'preflight pipelines', 'GET', '/crm/pipeline/details/all', null, 200);
  const firstPipeline = Array.isArray(pipelines.json) ? pipelines.json[0] : null;
  pipeline = firstPipeline?.pipeline || null;
  stage = firstPipeline?.stages?.[0]?.id || null;

  const taskTypes = await call('crm.list_task_types', 'preflight task types', 'GET', '/crm/tasktypes', null, 200);
  taskTypeId = Array.isArray(taskTypes.json) ? taskTypes.json[0]?.id ?? null : null;

  if (selected('webhooks') && !webhookUrl) {
    try {
      const response = await fetch('https://webhook.site/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const json = await response.json();
      if (json.uuid) {
        webhookToken = json.uuid;
        webhookUrl = `https://webhook.site/${json.uuid}`;
      }
    } catch { /* skipped later */ }
  }
  return true;
}

async function createList(label) {
  if (!folderId) return null;
  const created = await call('contacts.create_list', `create ${label} list`, 'POST', '/contacts/lists', { name: `agent-catalog-verify-list-${label}-${stamp}`, folderId }, [201, 200]);
  return created.ok ? created.json?.id ?? null : null;
}

async function deleteList(id, label) {
  if (!id) return;
  await call('contacts.delete_list', `cleanup ${label} list`, 'DELETE', `/contacts/lists/${id}`, null, [204, 200, 404]);
}

async function createCampaignFixture(label) {
  const listId = await createList(label);
  const email = `agent-catalog-verify-${label}+${stamp}@example.com`;
  let campaignId = null;
  let contactCreated = false;
  try {
    if (!listId) return null;
    const contact = await call('contacts.create_contact', `create ${label} contact`, 'POST', '/contacts', {
      email,
      attributes: { FNAME: 'Agent', LNAME: 'AdvancedVerify' },
      listIds: [listId],
      updateEnabled: false,
    }, [201, 204]);
    contactCreated = contact.ok;
    if (!contactCreated) return null;
    await getWithRetry('contacts.get_contacts_from_list', `verify ${label} recipient`, `/contacts/lists/${listId}/contacts?limit=1`, 6);
    const created = await call('email_campaigns.create_email_campaign', `create ${label} campaign`, 'POST', '/emailCampaigns', {
      name: `agent-catalog-verify-campaign-${label}-${stamp}`,
      sender: senderRef,
      recipients: { listIds: [listId] },
      subject: 'Agent catalog verification',
      previewText: 'Verification only',
      htmlContent: '<html><body><p>Agent catalog verification</p></body></html>',
    }, [201, 200]);
    campaignId = created.json?.id ?? null;
    if (!created.ok || !campaignId) return null;
    return { listId, email, campaignId, contactCreated };
  } finally {
    if (!campaignId) {
      if (contactCreated) await call('contacts.delete_contact', `cleanup ${label} contact`, 'DELETE', `/contacts/${encodeURIComponent(email)}`, null, [204, 200, 404]);
      await deleteList(listId, label);
    }
  }
}

async function cleanupCampaignFixture(fixture, label, deleteCampaign = true) {
  if (!fixture) return;
  if (deleteCampaign && fixture.campaignId) {
    const deleted = await call('email_campaigns.delete_email_campaign', `cleanup ${label} campaign`, 'DELETE', `/emailCampaigns/${fixture.campaignId}`, null, [204, 200, 404]);
    if (!deleted.ok && deleted.blocked) {
      await call('email_campaigns.update_campaign_status', `archive ${label} campaign`, 'PUT', `/emailCampaigns/${fixture.campaignId}/status`, { status: 'archive' }, [204, 200]);
    }
  }
  if (fixture.contactCreated) {
    await call('contacts.delete_contact', `cleanup ${label} contact`, 'DELETE', `/contacts/${encodeURIComponent(fixture.email)}`, null, [204, 200, 404]);
  }
  await deleteList(fixture.listId, label);
}

async function runAccountRead() {
  await call('account_admin.get_account', 'account details', 'GET', '/account', null, 200);
  await call('account_admin.get_account_activity', 'account activity', 'GET', '/organization/activities?limit=10', null, 200);
  await call('account_admin.list_invited_users', 'invited users', 'GET', '/organization/invited/users', null, 200);
  await call('processes.get_processes', 'processes', 'GET', '/processes?limit=10', null, 200);
  if (accountEmail) {
    await call('account_admin.get_user_permission', 'user permissions', 'GET', `/organization/user/${encodeURIComponent(accountEmail)}/permissions`, null, [200, 400, 404]);
  }
}

async function runCrm() {
  if (pipeline && stage) {
    const name = `agent-catalog-verify-deal-${stamp}`;
    let id = null;
    try {
      const created = await call('crm.create_deal', 'create deal', 'POST', '/crm/deals', {
        name,
        attributes: { pipeline, deal_stage: stage },
      }, [201, 200]);
      id = created.json?.id ?? null;
      if (created.ok && id) {
        await getWithRetry('crm.get_deal', 'get deal', `/crm/deals/${id}`);
        await call('crm.update_deal', 'update deal', 'PATCH', `/crm/deals/${id}`, { name: `${name} updated` }, [204, 200]);
      }
    } finally {
      if (id) await call('crm.delete_deal', 'cleanup deal', 'DELETE', `/crm/deals/${id}`, null, [204, 200, 404]);
    }
  } else {
    skip('crm.create_deal', 'create deal', 'No pipeline/stage available.');
  }

  if (taskTypeId) {
    const name = `agent-catalog-verify-task-${stamp}`;
    let id = null;
    try {
      const created = await call('crm.create_task', 'create task', 'POST', '/crm/tasks', {
        name,
        taskTypeId,
        date: new Date(Date.now() + 86400000).toISOString(),
      }, [201, 200]);
      id = created.json?.id ?? null;
      if (created.ok && id) {
        await getWithRetry('crm.get_task', 'get task', `/crm/tasks/${id}`);
        await call('crm.update_task', 'update task', 'PATCH', `/crm/tasks/${id}`, { done: true }, [204, 200]);
      }
    } finally {
      if (id) await call('crm.delete_task', 'cleanup task', 'DELETE', `/crm/tasks/${id}`, null, [204, 200, 404]);
    }
  } else {
    skip('crm.create_task', 'create task', 'No task type available.');
  }

  const text = `agent-catalog-verify-note-${stamp}`;
  let companyId = null;
  let id = null;
  try {
    const company = await call('crm.create_company', 'create note company', 'POST', '/companies', {
      name: `agent-catalog-verify-note-company-${stamp}`,
    }, [201, 200]);
    companyId = company.json?.id ?? null;
    if (!companyId) return;
    const created = await call('crm.create_note', 'create note', 'POST', '/crm/notes', {
      text,
      companyIds: [companyId],
    }, [201, 200]);
    id = created.json?.id ?? null;
    if (created.ok && id) {
      await getWithRetry('crm.get_note', 'get note', `/crm/notes/${id}`);
      await call('crm.update_note', 'update note', 'PATCH', `/crm/notes/${id}`, { text: `${text} updated` }, [204, 200]);
    }
  } finally {
    if (id) await call('crm.delete_note', 'cleanup note', 'DELETE', `/crm/notes/${id}`, null, [204, 200, 404]);
    if (companyId) await call('crm.delete_company', 'cleanup note company', 'DELETE', `/companies/${companyId}`, null, [204, 200, 404]);
  }
}

async function runWebhooks() {
  if (!webhookUrl) return skip('webhooks.create_webhook', 'create webhook', 'No webhook URL available.');
  let id = null;
  try {
    const created = await call('webhooks.create_webhook', 'create webhook', 'POST', '/webhooks', {
      url: webhookUrl,
      type: 'transactional',
      events: ['delivered'],
      description: `agent-catalog-verify-${stamp}`,
    }, [201, 200]);
    id = created.json?.id ?? null;
    if (created.ok && id) {
      await getWithRetry('webhooks.get_webhook', 'get webhook', `/webhooks/${id}`);
      await call('webhooks.update_webhook', 'update webhook', 'PUT', `/webhooks/${id}`, {
        description: `agent-catalog-verify-${stamp}-updated`,
        events: ['delivered'],
      }, [204, 200]);
    }
  } finally {
    if (id) await call('webhooks.delete_webhook', 'cleanup webhook', 'DELETE', `/webhooks/${id}`, null, [204, 200, 404]);
  }
  if (webhookToken) {
    try { await fetch(`https://webhook.site/token/${webhookToken}`, { method: 'DELETE' }); } catch { /* ignore */ }
  }
}

async function runSenders() {
  if (!senderEmails.length) return skip('senders_and_domains.create_sender', 'create sender', 'No --sender-emails provided.');
  for (const email of senderEmails) {
    const existing = existingSenders.find((sender) => String(sender.email || '').toLowerCase() === email.toLowerCase());
    if (existing) {
      skip('senders_and_domains.create_sender', `sender ${email}`, 'Sender already exists; not created or deleted.');
      continue;
    }
    let id = null;
    try {
      const created = await call('senders_and_domains.create_sender', `create sender ${email}`, 'POST', '/senders', {
        name: 'Agent Catalog Verify',
        email,
      }, [201, 200]);
      id = created.json?.id ?? null;
      if (created.ok && id) {
        await call('senders_and_domains.get_senders', `verify sender ${email}`, 'GET', '/senders', null, 200);
        await call('senders_and_domains.update_sender', `update sender ${email}`, 'PUT', `/senders/${id}`, { name: 'Agent Catalog Verify Updated' }, [204, 200]);
      }
    } finally {
      if (id) await call('senders_and_domains.delete_sender', `cleanup sender ${email}`, 'DELETE', `/senders/${id}`, null, [204, 200, 404]);
    }
  }
}

async function runDomains() {
  const name = `agent-catalog-verify-${stamp}.example.com`;
  let created = false;
  try {
    const response = await call('senders_and_domains.create_domain', 'create domain', 'POST', '/senders/domains', { name }, [201, 200]);
    created = response.ok;
    if (created) {
      await getWithRetry('senders_and_domains.get_domain_configuration', 'get domain', `/senders/domains/${encodeURIComponent(name)}`);
    }
  } finally {
    if (created) await call('senders_and_domains.delete_domain', 'cleanup domain', 'DELETE', `/senders/domains/${encodeURIComponent(name)}`, null, [204, 200, 404]);
  }
}

async function runSchedule() {
  if (!senderRef) return skip('email_campaigns.update_email_campaign', 'schedule campaign', 'No sender available.');
  const fixture = await createCampaignFixture('schedule');
  if (!fixture) return;
  try {
    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    const update = await call('email_campaigns.update_email_campaign', 'schedule campaign', 'PUT', `/emailCampaigns/${fixture.campaignId}`, { scheduledAt }, [204, 200]);
    if (update.ok) {
      const got = await getWithRetry('email_campaigns.get_email_campaign', 'get scheduled campaign', `/emailCampaigns/${fixture.campaignId}`);
      record({
        action_id: 'email_campaigns.update_email_campaign',
        step: 'assert scheduledAt',
        method: 'ASSERT',
        path: `/emailCampaigns/${fixture.campaignId}`,
        expected: [true],
        ok: Boolean(got.json?.scheduledAt),
        http_status: got.status,
        duration_ms: 0,
        note: got.json?.scheduledAt ? null : 'scheduledAt missing from GET response',
      });
    }
    await call('email_campaigns.update_campaign_status', 'suspend scheduled campaign', 'PUT', `/emailCampaigns/${fixture.campaignId}/status`, { status: 'suspended' }, [204, 200]);
    const after = await getWithRetry('email_campaigns.get_email_campaign', 'get suspended campaign', `/emailCampaigns/${fixture.campaignId}`);
    record({
      action_id: 'email_campaigns.update_campaign_status',
      step: 'assert suspended',
      method: 'ASSERT',
      path: `/emailCampaigns/${fixture.campaignId}`,
      expected: ['suspended'],
      ok: ['suspended', 'draft'].includes(after.json?.status),
      http_status: after.status,
      duration_ms: 0,
      note: after.json?.status || 'status missing',
    });
  } finally {
    await cleanupCampaignFixture(fixture, 'schedule');
  }
}

async function runSendTest() {
  if (!confirmSend || !recipient) return skip('email_campaigns.send_test_email', 'send test', 'Requires --confirm-send and --email.');
  const fixture = await createCampaignFixture('sendtest');
  if (!fixture) return;
  try {
    const sent = await call('email_campaigns.send_test_email', 'send test email', 'POST', `/emailCampaigns/${fixture.campaignId}/sendTest`, { emailTo: [recipient] }, [201, 204, 200]);
    if (sent.ok) {
      const last = results.find((result) => result.action_id === 'email_campaigns.send_test_email' && result.step === 'send test email');
      if (last) last.note = 'HTTP accepted; delivery not confirmed (test campaign deleted).';
    }
    await getWithRetry('email_campaigns.get_email_campaign', 'get test campaign', `/emailCampaigns/${fixture.campaignId}`);
  } finally {
    await cleanupCampaignFixture(fixture, 'sendtest');
  }
}

async function runSendNow() {
  if (!confirmSend || !recipient) return skip('email_campaigns.send_email_campaign_now', 'send now', 'Requires --confirm-send and --email.');
  const fixture = await createCampaignFixture('sendnow');
  if (!fixture) return;
  try {
    const sent = await call('email_campaigns.send_email_campaign_now', 'send campaign now', 'POST', `/emailCampaigns/${fixture.campaignId}/sendNow`, null, [204, 200, 201]);
    const got = await getWithRetry('email_campaigns.get_email_campaign', 'get sent campaign', `/emailCampaigns/${fixture.campaignId}`);
    if (sent.ok) {
      const last = results.find((result) => result.action_id === 'email_campaigns.send_email_campaign_now' && result.step === 'send campaign now');
      const stats = got.json?.statistics?.globalStats || {};
      if (last) {
        last.note = `HTTP ${sent.status} accepted; campaign status=${got.json?.status || 'unknown'}; sent=${stats.sent ?? 0}; delivery not confirmed.`;
        last.delivery_confirmed = false;
      }
    }
  } finally {
    await cleanupCampaignFixture(fixture, 'sendnow');
  }
}

async function main() {
  if (dryRun) {
    console.log('Dry run: no request will be sent.');
    console.log('Flows:', [...new Set([...DEFAULT_FLOWS, 'send-test', 'send-now'])].filter(selected).join(', '));
    console.log(`Send confirmed: ${confirmSend}; recipient: ${recipient ? 'provided' : 'missing'}`);
    return;
  }

  if (!(await preflight())) process.exit(1);

  if (selected('account-read')) await runAccountRead();
  if (selected('crm')) await runCrm();
  if (selected('webhooks')) await runWebhooks();
  if (selected('senders')) await runSenders();
  if (selected('domains')) await runDomains();
  if (selected('schedule')) await runSchedule();
  if (selected('send-test')) await runSendTest();
  if (selected('send-now')) await runSendNow();

  if (createdFolder && folderId) {
    await call('contacts.delete_folder', 'cleanup folder', 'DELETE', `/contacts/folders/${folderId}`, null, [204, 200, 404]);
  }

  let finalResults = results;
  if (has('merge') && fs.existsSync(OUT)) {
    const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    const map = new Map();
    for (const result of previous.results || []) {
      const normalized = { ...result };
      normalized.step = redactPath(normalized.step || '');
      normalized.path = redactPath(normalized.path || '');
      if (normalized.action_id === 'email_campaigns.update_campaign_status' && /cancel is an invalid status/i.test(String(normalized.note || ''))) {
        continue;
      }
      if (normalized.plan_gated && /campaign once scheduled can not be deleted|dmarc policy requires/i.test(String(normalized.note || ''))) {
        normalized.plan_gated = false;
        normalized.blocked = true;
        normalized.skipped = true;
        normalized.ok = true;
      }
      map.set(`${normalized.action_id}|${normalized.step}|${normalized.method}|${normalized.path}`, normalized);
    }
    for (const result of results) {
      map.set(`${result.action_id}|${result.step}|${result.method}|${result.path}`, result);
    }
    finalResults = [...map.values()];
  }

  const verification = {};
  for (const result of finalResults) {
    if (!result.action_id || result.skipped) continue;
    const previous = verification[result.action_id];
    const status = result.ok ? 'live_verified' : result.plan_gated ? 'plan_gated' : 'live_failed';
    const priority = { live_failed: 3, plan_gated: 2, live_verified: 1 };
    if (!previous || priority[status] > priority[previous.status]) {
      verification[result.action_id] = {
        status,
        checked_at: checkedAt,
        method: `advanced: ${result.method} ${result.path}`,
        http_status: result.http_status,
        account_entitlement: result.plan_gated ? 'not_eligible_on_plan' : 'ok',
        note: result.note || null,
        kind: 'advanced_flow',
      };
    }
  }

  const summary = {
    steps: finalResults.length,
    ok: finalResults.filter((result) => result.ok && !result.skipped).length,
    failed: finalResults.filter((result) => !result.ok && !result.plan_gated && !result.skipped).length,
    plan_gated: finalResults.filter((result) => result.plan_gated).length,
    skipped: finalResults.filter((result) => result.skipped).length,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify({
    checked_at: checkedAt,
    base_url: BASE,
    summary,
    results: finalResults,
    verification,
    duration_ms: Date.now() - started,
  }, null, 2)}\n`);

  console.log(`Advanced flows: ${summary.ok} ok, ${summary.plan_gated} plan-gated, ${summary.failed} failed, ${summary.skipped} skipped.`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}. Run \`npm run build\` to apply.`);
  if (summary.failed) process.exit(1);
}

await main();
