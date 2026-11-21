import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const catalog = readJson('catalog/catalog.json');
const observed = readJson('curated/observed-endpoints.json');
const mapping = readJson('curated/observed-to-public.json');

const catalogById = new Map(catalog.actions.map((action) => [action.id, action]));
const observedById = new Map(observed.endpoints.map((endpoint) => [endpoint.id, endpoint]));

const fieldNames = (schema) => (schema?.properties ? Object.keys(schema.properties).sort() : []);
const publicRequestFields = (action) => {
  const body = action.request?.body?.schema;
  if (body?.properties) return Object.keys(body.properties).sort();
  return fieldNames(action.inputs);
};

const rows = [];
const missing = [];

for (const entry of mapping.mappings) {
  const observedEndpoint = observedById.get(entry.observed_id);
  const action = catalogById.get(entry.catalog_action);
  if (!observedEndpoint || !action) {
    missing.push({ entry, observed: Boolean(observedEndpoint), action: Boolean(action) });
    continue;
  }

  const differences = [];
  const isPublicApi = action.execution.kind === 'api';
  const publicHost = isPublicApi ? new URL(action.execution.endpoint.base_url).host : null;
  if (isPublicApi) {
    if (observedEndpoint.host !== publicHost) differences.push(`host: ${observedEndpoint.host} vs ${publicHost}`);
    differences.push(`auth: ${observedEndpoint.auth} vs ${action.auth?.schemes?.join('/') || 'unknown'}`);
    if (['POST', 'PUT', 'PATCH'].includes(observedEndpoint.method) && !observedEndpoint.request_body_captured) {
      differences.push('UI request body not captured by the HAR exporter');
    }
  } else {
    differences.push('no public API equivalent; observed endpoint confirms a UI-only catalog action');
  }
  const observedFields = fieldNames(observedEndpoint.request_body);
  const publicFields = isPublicApi ? publicRequestFields(action) : [];
  if (isPublicApi && observedFields.length && publicFields.length && JSON.stringify(observedFields) !== JSON.stringify(publicFields)) {
    differences.push(`request fields: UI [${observedFields.join(', ')}] vs public [${publicFields.join(', ')}]`);
  }
  const observedResponseFields = fieldNames(observedEndpoint.response_schema);
  const publicResponseFields = isPublicApi ? fieldNames(action.outputs?.schema) : [];
  if (isPublicApi && observedResponseFields.length && publicResponseFields.length && JSON.stringify(observedResponseFields) !== JSON.stringify(publicResponseFields)) {
    differences.push(`response fields: UI [${observedResponseFields.join(', ')}] vs public [${publicResponseFields.join(', ')}]`);
  }

  rows.push({
    business_action: entry.business_action,
    ui_path: entry.ui_path,
    equivalence: entry.equivalence,
    notes: entry.notes,
    differences,
    observed: {
      id: observedEndpoint.id,
      host: observedEndpoint.host,
      method: observedEndpoint.method,
      path: observedEndpoint.path,
      statuses: observedEndpoint.response_statuses,
      auth: observedEndpoint.auth,
      stability: observedEndpoint.stability,
      request_body_captured: observedEndpoint.request_body_captured,
      request_fields: observedFields,
      response_fields: observedResponseFields,
      captured_at: observedEndpoint.evidence.captured_at,
    },
    public_api: {
      action: action.id,
      kind: action.execution.kind,
      method: isPublicApi ? action.execution.endpoint.method : null,
      path: isPublicApi ? action.execution.endpoint.path : null,
      host: publicHost,
      auth: action.auth,
      inputs: action.inputs?.required || [],
      request_fields: publicFields,
      success_status: action.outputs?.success_status ?? null,
      idempotency: action.idempotency,
      risk_level: action.risk_level,
    },
  });
}

const mappedObservedIds = new Set(rows.map((row) => row.observed.id));
const internalOnly = observed.endpoints
  .filter((endpoint) => !mappedObservedIds.has(endpoint.id))
  .map((endpoint) => ({
    id: endpoint.id,
    host: endpoint.host,
    method: endpoint.method,
    path: endpoint.path,
    statuses: endpoint.response_statuses,
    classification: endpoint.classification,
  }));

const mappedCatalogIds = new Set(rows.map((row) => row.public_api.action));
const publicOnly = catalog.actions
  .filter((action) => action.execution.kind === 'api' && !mappedCatalogIds.has(action.id))
  .map((action) => ({
    action: action.id,
    domain: action.domain,
    name: action.name,
    method: action.execution.endpoint.method,
    path: action.execution.endpoint.path,
  }));

const counts = {
  observed_endpoints: observed.endpoints.length,
  mapped_endpoints: rows.length,
  internal_only_endpoints: internalOnly.length,
  catalog_api_actions: catalog.actions.filter((action) => action.execution.kind === 'api').length,
  mapped_catalog_actions: mappedCatalogIds.size,
  mapped_public_actions: new Set(rows.filter((row) => row.public_api.kind === 'api').map((row) => row.public_api.action)).size,
  mapped_ui_only_actions: new Set(rows.filter((row) => row.public_api.kind !== 'api').map((row) => row.public_api.action)).size,
  public_only_actions: publicOnly.length,
  by_equivalence: rows.reduce((acc, row) => {
    acc[row.equivalence] = (acc[row.equivalence] || 0) + 1;
    return acc;
  }, {}),
};

const output = {
  version: '1.0.0',
  generated_at: new Date().toISOString(),
  note: 'Comparison between endpoints observed in the Brevo UI (internal services) and the public-API actions that provide the same business capability. Equivalence is not wire compatibility.',
  counts,
  rows,
  internal_only: internalOnly,
  public_only_sample: publicOnly.slice(0, 60),
  missing_mappings: missing,
};

fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'surface-comparison.json'), `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(path.join(ROOT, 'catalog', 'observed-links.json'), `${JSON.stringify({
  generated_at: output.generated_at,
  note: output.note,
  counts,
  links: rows.map((row) => ({
    business_action: row.business_action,
    observed: row.observed,
    public_api: row.public_api,
    equivalence: row.equivalence,
    differences: row.differences,
    notes: row.notes,
  })),
}, null, 2)}\n`);

const lines = [
  '# Public API vs observed UI surface',
  '',
  `Generated ${output.generated_at} from ${observed.source.total_entries} HAR entries across ${observed.source.har_files.length} capture(s).`,
  '',
  '## Headline',
  '',
  `- Observed first-party endpoints: **${counts.observed_endpoints}**`,
  `- Mapped to a public-API business action: **${counts.mapped_endpoints}**`,
  `- Internal-only endpoints (no public equivalent recorded): **${counts.internal_only_endpoints}**`,
  `- Public API actions catalogued: **${counts.catalog_api_actions}**`,
  `- Public actions with an observed UI link: **${counts.mapped_public_actions}**`,
  `- UI-only actions with an observed UI link: **${counts.mapped_ui_only_actions}**`,
  `- Public actions with no observed UI link in this capture: **${counts.public_only_actions}**`,
  '',
  '## Equivalence summary',
  '',
  '| Business action | UI surface (observed) | Public API action | Equivalence |',
  '|---|---|---|---|',
  ...rows.map((row) => `| ${row.business_action} | \`${row.observed.method} ${row.observed.host}${row.observed.path}\` | \`${row.public_api.action}\`${row.public_api.kind === 'api' ? ` (\`${row.public_api.method} ${row.public_api.path}\`)` : ' (UI-only)'} | ${row.equivalence} |`),
  '',
  '## Detail',
  '',
];

for (const row of rows) {
  lines.push(`### ${row.business_action}`);
  lines.push('');
  lines.push(`- **UI observed:** \`${row.observed.method} ${row.observed.host}${row.observed.path}\` → ${row.observed.statuses.join('/')} · auth \`${row.observed.auth}\` · body captured: ${row.observed.request_body_captured ? 'yes' : 'no'}`);
  lines.push(`- **UI path:** ${row.ui_path}`);
  if (row.public_api.kind === 'api') {
    lines.push(`- **Public API:** \`${row.public_api.action}\` → \`${row.public_api.method} ${row.public_api.path}\` on \`${row.public_api.host}\` · success ${row.public_api.success_status} · idempotency ${row.public_api.idempotency} · risk ${row.public_api.risk_level}`);
  } else {
    lines.push(`- **Catalog action:** \`${row.public_api.action}\` (UI-only; no public endpoint) · risk ${row.public_api.risk_level}`);
  }
  if (row.observed.request_fields.length) lines.push(`- **UI request fields:** ${row.observed.request_fields.join(', ')}`);
  if (row.public_api.request_fields.length) lines.push(`- **Public request fields:** ${row.public_api.request_fields.join(', ')}`);
  lines.push(`- **Equivalence:** ${row.equivalence}`);
  if (row.differences.length) lines.push(`- **Differences:** ${row.differences.join('; ')}`);
  if (row.notes) lines.push(`- **Note:** ${row.notes}`);
  lines.push('');
}

lines.push('## Internal-only endpoints');
lines.push('');
lines.push('These were observed in the UI but have no public-API equivalent recorded in this capture. They are internal, session-authenticated and unstable.');
lines.push('');
for (const endpoint of internalOnly) {
  lines.push(`- \`${endpoint.method} ${endpoint.host}${endpoint.path}\` (${endpoint.statuses.join('/')}) — ${endpoint.classification}`);
}
lines.push('');
lines.push('## Public-only actions (sample)');
lines.push('');
lines.push('Catalogued public actions that were not exercised by the captured UI flows. This is expected: the capture covered contacts, lists and companies only.');
lines.push('');
for (const action of publicOnly.slice(0, 40)) {
  lines.push(`- \`${action.action}\` — ${action.method} ${action.path}`);
}
lines.push('');

fs.writeFileSync(path.join(ROOT, 'reports', 'surface-comparison.md'), `${lines.join('\n')}\n`);

console.log(`Compared ${rows.length} mapped endpoints. Internal-only: ${internalOnly.length}. Catalog actions with observed UI link: ${counts.mapped_public_actions} public + ${counts.mapped_ui_only_actions} UI-only.`);
if (missing.length) {
  for (const item of missing) console.error(`MISSING: ${item.entry.observed_id} -> ${item.entry.catalog_action}`);
  process.exit(1);
}
console.log('Wrote reports/surface-comparison.md, reports/surface-comparison.json and catalog/observed-links.json.');
