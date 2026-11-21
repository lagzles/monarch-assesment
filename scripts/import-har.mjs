import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flags = new Map();
for (const arg of args) {
  if (!arg.startsWith('--')) continue;
  const [key, value] = arg.slice(2).split('=');
  flags.set(key, value ?? true);
}

const harPath = path.resolve(ROOT, flags.get('har') || '.capture/brevo-pilot.har');
const outPath = path.resolve(ROOT, flags.get('out') || 'curated/observed-endpoints.json');
const reportPath = path.resolve(ROOT, flags.get('report') || 'reports/capture-diff.md');

const STATIC = /\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ico|webp|map|ts|mp4)(\?|$)/i;
const NOISE_HOSTS = new Set([
  'dt.brevo.com',
  'fsrelay.brevo.com',
  'notifications-banner-api.brevo.com',
  'marketing-notification.brevo.com',
]);
const NOISE_PATHS = [/^\/cdn-cgi\//, /^\/rec\//, /^\/$/];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizePath(pathname) {
  return pathname
    .replace(/\/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?=\/|$)/g, '/{email}')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/\/\d+(?=\/|$)/g, '/{id}')
    .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/{id}');
}

function isEmail(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

function isDateTime(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

function redactKey(key) {
  if (/@/.test(key)) return '{email}';
  if (/^[0-9a-f]{24}$/i.test(key) || /^[0-9a-f]{32,}$/i.test(key)) return '{id}';
  return key;
}

function inferSchema(value, depth = 0) {
  if (depth > 5) return {};
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length ? inferSchema(value[0], depth + 1) : {} };
  }
  switch (typeof value) {
    case 'string':
      if (isEmail(value)) return { type: 'string', format: 'email' };
      if (isDateTime(value)) return { type: 'string', format: 'date-time' };
      return { type: 'string' };
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const properties = {};
      for (const [key, nested] of Object.entries(value).slice(0, 60)) {
        properties[redactKey(key)] = inferSchema(nested, depth + 1);
      }
      return { type: 'object', properties };
    }
    default:
      return {};
  }
}

function parseJson(text) {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function extractBody(entry) {
  const text = entry.request?.postData?.text;
  if (!text) return { media_type: null, schema: null, is_json: false };
  const mediaType = entry.request.postData.mimeType || 'unknown';
  const parsed = parseJson(text);
  if (!parsed) return { media_type: mediaType, schema: null, is_json: false };
  return { media_type: mediaType, schema: inferSchema(parsed), is_json: true };
}

function responseSchema(entry) {
  const mime = entry.response?.content?.mimeType || '';
  const text = entry.response?.content?.text;
  if (!mime.includes('json') || !text) return null;
  const parsed = parseJson(text);
  return parsed === undefined ? null : inferSchema(parsed);
}

function classification(host) {
  if (host === 'api.brevo.com') return 'public_api';
  if (host === 'app.brevo.com') return 'app_backend';
  return 'internal_api';
}

function queryNames(url) {
  const names = [];
  for (const key of url.searchParams.keys()) names.push(key);
  return [...new Set(names)];
}

function riskFor(method) {
  return method === 'GET' || method === 'HEAD' ? 'low' : 'high';
}

if (!fs.existsSync(harPath)) {
  console.error(`HAR not found: ${harPath}`);
  process.exit(1);
}

const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const entries = har.log.entries;
const capturedAt = har.log.pages?.[0]?.startedDateTime || fs.statSync(harPath).mtime.toISOString();

const groups = new Map();
for (const entry of entries) {
  let url;
  try { url = new URL(entry.request.url); } catch { continue; }
  if (!/(^|\.)brevo\.com$/i.test(url.host)) continue;
  if (STATIC.test(entry.request.url)) continue;
  if (NOISE_HOSTS.has(url.host)) continue;
  if (NOISE_PATHS.some((pattern) => pattern.test(url.pathname))) continue;
  if (entry.request.method === 'OPTIONS' || entry.request.method === 'HEAD') continue;

  const method = entry.request.method;
  const normalizedPath = normalizePath(url.pathname);
  const key = `${url.host}|${method}|${normalizedPath}`;
  const existing = groups.get(key) || {
    host: url.host,
    method,
    path: normalizedPath,
    query_names: queryNames(url),
    statuses: new Set(),
    request_body: null,
    response_schema: null,
    count: 0,
  };
  existing.count += 1;
  existing.statuses.add(entry.response?.status);
  if (!existing.request_body) existing.request_body = extractBody(entry);
  if (!existing.response_schema) existing.response_schema = responseSchema(entry);
  groups.set(key, existing);
}

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const catalogEndpoints = new Map();
for (const action of catalog.actions) {
  if (action.execution.kind !== 'api') continue;
  const endpoint = action.execution.endpoint;
  if (!/api\.brevo\.com/i.test(endpoint.base_url)) continue;
  const normalized = normalizePath(endpoint.path);
  catalogEndpoints.set(`${endpoint.method} ${normalized}`, action.id);
}

const endpoints = [];
const matched = [];
const unmatched = [];
for (const group of groups.values()) {
  const id = `observed.${slug(group.host.replace(/\.brevo\.com$/i, ''))}.${slug(group.method)}_${slug(group.path)}`;
  const kind = classification(group.host);
  const expectsBody = ['POST', 'PUT', 'PATCH'].includes(group.method);
  const bodyCaptured = Boolean(group.request_body?.is_json);
  // Only public-API observations can match a catalog action. Internal services are a
  // different surface even when a path looks similar.
  const matchPath = group.path.replace(/^\/v3(?=\/)/, '');
  const catalogMatch = kind === 'public_api' ? catalogEndpoints.get(`${group.method} ${matchPath}`) || null : null;
  const endpoint = {
    id,
    classification: kind,
    host: group.host,
    method: group.method,
    path: group.path,
    query_params: group.query_names,
    request_body: group.request_body?.is_json ? group.request_body.schema : null,
    request_body_captured: bodyCaptured,
    request_body_note: bodyCaptured
      ? null
      : (expectsBody ? 'The HAR exporter did not capture a request body for this call (empty bodySize).' : 'No request body expected for this method.'),
    response_statuses: [...group.statuses].sort(),
    response_schema: group.response_schema,
    observed_count: group.count,
    stability: kind === 'public_api' ? 'public' : 'internal',
    auth: kind === 'public_api' ? 'api_key' : 'session_cookie',
    risk_level: riskFor(group.method),
    catalog_action: catalogMatch || null,
    evidence: {
      source: 'network_capture',
      har_file: path.relative(ROOT, harPath).replace(/\\/g, '/'),
      captured_at: capturedAt,
      redacted: true,
    },
  };
  endpoints.push(endpoint);
  if (catalogMatch) matched.push({ observed: id, action: catalogMatch, method: group.method, path: group.path });
  else unmatched.push({ observed: id, classification: kind, method: group.method, path: group.path });
}

let mergedEndpoints = endpoints;
let harFiles = [path.relative(ROOT, harPath).replace(/\\/g, '/')];
let totalEntries = entries.length;
const merge = flags.get('merge') === true || flags.get('merge') === 'true';
if (merge && fs.existsSync(outPath)) {
  const previous = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  totalEntries += previous.source?.total_entries || 0;
  const map = new Map((previous.endpoints || []).map((endpoint) => [endpoint.id, endpoint]));
  for (const endpoint of endpoints) {
    const old = map.get(endpoint.id);
    if (!old) {
      map.set(endpoint.id, endpoint);
      continue;
    }
    map.set(endpoint.id, {
      ...old,
      ...endpoint,
      request_body: endpoint.request_body || old.request_body,
      request_body_captured: Boolean(endpoint.request_body_captured || old.request_body_captured),
      response_schema: endpoint.response_schema || old.response_schema,
      response_statuses: [...new Set([...(old.response_statuses || []), ...(endpoint.response_statuses || [])])].sort((a, b) => a - b),
      observed_count: (old.observed_count || 0) + (endpoint.observed_count || 1),
      catalog_action: endpoint.catalog_action || old.catalog_action,
      evidence: {
        ...old.evidence,
        ...endpoint.evidence,
        har_files: [...new Set([
          ...(old.evidence?.har_files || (old.evidence?.har_file ? [old.evidence.har_file] : [])),
          endpoint.evidence.har_file,
        ])],
      },
    });
  }
  mergedEndpoints = [...map.values()];
  harFiles = [...new Set([
    ...(previous.source?.har_files || (previous.source?.har_file ? [previous.source.har_file] : [])),
    ...harFiles,
  ])];
}
mergedEndpoints.sort((a, b) => a.classification.localeCompare(b.classification) || a.host.localeCompare(b.host) || a.path.localeCompare(b.path));

const matchedMerged = mergedEndpoints.filter((endpoint) => endpoint.catalog_action);
const unmatchedMerged = mergedEndpoints.filter((endpoint) => !endpoint.catalog_action);

const output = {
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  note: 'Redacted, normalized endpoints observed in a real browser session. Raw HAR is never committed. Internal endpoints are not part of the public API and are unstable.',
  source: {
    har_files: harFiles,
    captured_at: capturedAt,
    total_entries: totalEntries,
    first_party_endpoints: mergedEndpoints.length,
  },
  counts: {
    total: mergedEndpoints.length,
    public_api: mergedEndpoints.filter((endpoint) => endpoint.classification === 'public_api').length,
    internal_api: mergedEndpoints.filter((endpoint) => endpoint.classification === 'internal_api').length,
    app_backend: mergedEndpoints.filter((endpoint) => endpoint.classification === 'app_backend').length,
    matched_catalog_actions: matchedMerged.length,
    unmatched: unmatchedMerged.length,
  },
  endpoints: mergedEndpoints,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

const lines = [
  '# Browser capture diff',
  '',
  `Sources: ${harFiles.map((file) => `\`${file}\``).join(', ')} (${entries.length} HAR entries in the latest capture, captured ${capturedAt}).`,
  '',
  '## Summary',
  '',
  `- First-party endpoints observed: **${output.counts.total}**`,
  `- Public API (\`api.brevo.com\`): ${output.counts.public_api}`,
  `- Internal APIs: ${output.counts.internal_api}`,
  `- App backend: ${output.counts.app_backend}`,
  `- Matched to catalog actions: ${output.counts.matched_catalog_actions}`,
  `- Unmatched: ${output.counts.unmatched}`,
  '',
  '## Matched to existing catalog actions',
  '',
  ...(matchedMerged.length
    ? matchedMerged.map((item) => `- \`${item.catalog_action}\` ← ${item.method} \`${item.host}${item.path}\``)
    : ['- None (the capture covered mostly internal microservices).']),
  '',
  '## Internal endpoints (not public API)',
  '',
  ...unmatchedMerged
    .filter((item) => item.classification !== 'public_api')
    .map((item) => `- ${item.method} \`${item.path}\` (${item.classification})`),
  '',
];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`);

console.log(`Imported ${entries.length} HAR entries -> ${output.counts.total} first-party endpoints (${merge ? 'merged' : 'replaced'}).`);
console.log(`Public API: ${output.counts.public_api} · internal: ${output.counts.internal_api} · app backend: ${output.counts.app_backend}`);
console.log(`Matched catalog actions: ${output.counts.matched_catalog_actions} · unmatched: ${output.counts.unmatched}`);
console.log(`Wrote ${path.relative(ROOT, outPath)} and ${path.relative(ROOT, reportPath)}.`);
