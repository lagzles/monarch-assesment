import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.brevo.com/v3';
const OUT = path.join(ROOT, 'reports', 'live', 'delivery-diagnosis.json');

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
const get = async (pathName) => {
  const response = await fetch(`${BASE}${pathName}`, { headers, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json };
};
const domainOf = (email) => (String(email || '').includes('@') ? String(email).split('@').pop() : null);

const account = await get('/account');
const senders = await get('/senders');
const domains = await get('/senders/domains');
const campaigns = await get('/emailCampaigns?limit=100');
const campaignIds = [12, 14, 15];
const campaignDetails = {};
for (const id of campaignIds) {
  const detail = await get(`/emailCampaigns/${id}`);
  if (detail.status === 200) campaignDetails[id] = detail.json;
}

const plan = account.json?.plan || [];
const credits = plan.reduce((total, item) => total + (Number(item.credits) || 0), 0);
const senderList = senders.json?.senders || [];
const activeSenders = senderList.filter((sender) => sender.active !== false);
const domainList = domains.json?.domains || [];
const authenticatedDomains = domainList.filter((domain) => domain.authenticated === true || domain.verified === true);
const senderDomains = [...new Set(senderList.map((sender) => domainOf(sender.email)).filter(Boolean))];
const freeMailDomains = ['gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com'];
const freeDomainSenders = senderDomains.filter((domain) => freeMailDomains.includes(domain.toLowerCase()));
const latest = campaignDetails[14] || Object.values(campaignDetails)[0] || null;
const stats = latest?.statistics?.globalStats || {};

const findings = [];
if (!account.json) findings.push('Account details unavailable.');
if (credits > 0) findings.push(`Plan has ${credits} send credits (${plan.map((item) => item.type).join('/')}); credits are probably not the blocker.`);
if (activeSenders.length) findings.push(`${activeSenders.length} active sender(s) found; sender activation is not the blocker.`);
if (authenticatedDomains.length === 0) findings.push('No authenticated sender domain found in the account.');
if (freeDomainSenders.length) findings.push(`Sender domain(s) ${freeDomainSenders.join(', ')} are free-mail domains; their DMARC policy cannot be authenticated by Brevo, which commonly blocks/suspends campaign sending.`);
if (latest && latest.status === 'suspended' && Number(stats.sent || 0) === 0) findings.push(`Campaign ${latest.id} is suspended with sent=0/delivered=0; the API accepted the send call but the campaign did not dispatch.`);
if (latest && latest.sender) findings.push(`Campaign sender domain is ${domainOf(latest.sender.email) || 'unknown'}.`);

const diagnosis = {
  checked_at: new Date().toISOString(),
  account: account.json ? {
    plan: plan.map((item) => ({ type: item.type, credits: item.credits, creditsType: item.creditsType })),
    enterprise: account.json.enterprise,
    relayEnabled: account.json.relay?.enabled ?? null,
    emailDomain: domainOf(account.json.email),
  } : null,
  senders: senderList.map((sender) => ({ id: sender.id, active: sender.active, emailDomain: domainOf(sender.email), ips: (sender.ips || []).length })),
  domains: domainList.map((domain) => ({ name: domain.domain_name, authenticated: domain.authenticated ?? null, verified: domain.verified ?? null })),
  campaigns: campaignIds.map((id) => campaignDetails[id] ? {
    id,
    status: campaignDetails[id].status,
    senderDomain: domainOf(campaignDetails[id].sender?.email),
    recipients: campaignDetails[id].recipients,
    sent: campaignDetails[id].statistics?.globalStats?.sent ?? 0,
    delivered: campaignDetails[id].statistics?.globalStats?.delivered ?? 0,
    scheduledAt: campaignDetails[id].scheduledAt || null,
  } : { id, status: 'unavailable' }),
  findings,
  likely_blocker: freeDomainSenders.length && authenticatedDomains.length === 0
    ? 'free-mail sender domain without an authenticated sending domain'
    : (latest?.status === 'suspended' ? 'campaign suspended by Brevo compliance/account review' : 'unknown'),
  recommendations: [
    'Use a domain you control (not gmail.com) and authenticate it in Brevo (Brevo code, DKIM, DMARC).',
    'Create the sender on that authenticated domain, then retry sendTest to a single address you control.',
    'Keep the recipient list to one contact and check the campaign statistics after sendTest.',
    'If a custom domain is not available, use transactional SMTP/email for a delivery test; do not expect gmail.com campaign sending to work.',
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(diagnosis, null, 2)}\n`);

const lines = [
  '# Delivery diagnosis',
  '',
  '## Findings',
  '',
  ...diagnosis.findings.map((finding) => `- ${finding}`),
  '',
  `**Likely blocker:** ${diagnosis.likely_blocker}`,
  '',
  '## Recommendations',
  '',
  ...diagnosis.recommendations.map((recommendation) => `- ${recommendation}`),
  '',
];
fs.writeFileSync(path.join(ROOT, 'reports', 'delivery-diagnosis.md'), `${lines.join('\n')}\n`);

console.log('Delivery diagnosis:');
for (const finding of diagnosis.findings) console.log(`- ${finding}`);
console.log(`Likely blocker: ${diagnosis.likely_blocker}`);
console.log('Wrote reports/delivery-diagnosis.md and reports/live/delivery-diagnosis.json.');
