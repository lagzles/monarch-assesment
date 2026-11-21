import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const catalog = readJson('catalog/catalog.json');
const ui = readJson('curated/ui-actions.json');
const manifest = readJson('catalog/manifest.json');

const actions = catalog.actions;
const api = actions.filter((action) => action.execution.kind === 'api');
const partial = actions.filter((action) => action.execution.kind === 'api_partial');
const uiOnly = actions.filter((action) => action.execution.kind === 'ui_only');

const uiByStatus = { covered: 0, partial: 0, ui_only: 0 };
for (const action of ui.actions) uiByStatus[action.api_status] += 1;

const uiTotal = ui.actions.length;
const uiCoverage = {
  total_ui_actions_catalogued: uiTotal,
  fully_executable_via_api: uiByStatus.covered,
  partially_executable_via_api: uiByStatus.partial,
  ui_only: uiByStatus.ui_only,
  full_coverage_rate: Number((uiByStatus.covered / uiTotal).toFixed(3)),
  full_or_partial_rate: Number(((uiByStatus.covered + uiByStatus.partial) / uiTotal).toFixed(3)),
};

const domains = {};
for (const action of actions) {
  const entry = (domains[action.domain] ||= {
    label: action.domain_label,
    api: 0,
    partial: 0,
    ui_only: 0,
    high_risk: 0,
    requires_confirmation: 0,
    live_verified: 0,
    total: 0,
  });
  entry.total += 1;
  if (action.execution.kind === 'api') entry.api += 1;
  else if (action.execution.kind === 'api_partial') entry.partial += 1;
  else entry.ui_only += 1;
  if (action.risk_level === 'high') entry.high_risk += 1;
  if (action.confirmation_required) entry.requires_confirmation += 1;
  if (action.verification.status === 'live_verified') entry.live_verified += 1;
}

const confidenceBuckets = { '0.90-1.00': 0, '0.80-0.89': 0, '0.70-0.79': 0, '<0.70': 0 };
for (const action of actions) {
  if (action.confidence >= 0.9) confidenceBuckets['0.90-1.00'] += 1;
  else if (action.confidence >= 0.8) confidenceBuckets['0.80-0.89'] += 1;
  else if (action.confidence >= 0.7) confidenceBuckets['0.70-0.79'] += 1;
  else confidenceBuckets['<0.70'] += 1;
}

const writeOps = api.filter((action) => action.execution.endpoint.method !== 'GET');
const reliability = {
  actions_with_input_schema: api.filter((action) => action.inputs && Object.keys(action.inputs.properties || {}).length).length,
  write_actions: writeOps.length,
  write_actions_with_input_schema: writeOps.filter((action) => action.inputs && Object.keys(action.inputs.properties || {}).length).length,
  actions_with_documented_errors: api.filter((action) => (action.errors || []).length).length,
  actions_with_examples: api.filter((action) => action.outputs?.example || action.request?.body?.example).length,
  actions_with_ui_path: actions.filter((action) => action.evidence.ui_path || (action.matched_ui_actions || []).length).length,
  actions_with_observed_ui: actions.filter((action) => (action.observed_ui || []).length).length,
  observed_internal_endpoints: manifest.counts.observed_internal_endpoints || 0,
  live_verified_actions: actions.filter((action) => action.verification.status === 'live_verified').length,
  write_verified_actions: actions.filter((action) => action.verification?.kind === 'write_flow' && action.verification.status === 'live_verified').length,
  transactional_verified_actions: actions.filter((action) => action.verification?.kind === 'transactional_flow' && action.verification.status === 'live_verified').length,
  event_verified_actions: actions.filter((action) => action.verification?.kind === 'event_flow' && action.verification.status === 'live_verified').length,
  plan_gated_actions: actions.filter((action) => action.verification?.status === 'plan_gated').length,
  live_failed_actions: actions.filter((action) => action.verification.status === 'live_failed').length,
  spec_only_actions: actions.filter((action) => action.verification.status === 'spec_only').length,
};

const gaps = Object.entries(domains)
  .map(([domain, entry]) => ({ domain, label: entry.label, ui_only: entry.ui_only, partial: entry.partial, api: entry.api }))
  .filter((entry) => entry.ui_only > 0 || entry.partial > 0)
  .sort((a, b) => (b.ui_only + b.partial) - (a.ui_only + a.partial));

const report = {
  generated_at: manifest.generated_at,
  spec: manifest.spec,
  counts: manifest.counts,
  ui_coverage: uiCoverage,
  reliability,
  confidence_distribution: confidenceBuckets,
  domains,
  gaps,
  ui_only_actions: uiOnly.map((action) => ({ id: action.id, domain: action.domain, name: action.name, ui_path: action.execution.ui_path, risk_level: action.risk_level })),
  partial_actions: partial.map((action) => ({ id: action.id, domain: action.domain, name: action.name, related_action: action.execution.related_action, ui_path: action.execution.ui_path })),
};

fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'coverage.json'), `${JSON.stringify(report, null, 2)}\n`);

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const lines = [
  '# Coverage report',
  '',
  `Generated from spec ${manifest.spec.sha256.slice(0, 12)}… on ${manifest.generated_at}.`,
  '',
  '## Headline',
  '',
  `- **${manifest.counts.total_actions}** business actions in the catalog`,
  `- **${manifest.counts.api_actions}** executable through the public API`,
  `- **${manifest.counts.ui_only_actions}** UI-only actions (no public API)`,
  `- **${manifest.counts.api_partial_actions}** actions only partially supported by the API`,
  `- UI inventory: **${uiCoverage.total_ui_actions_catalogued}** actions catalogued, ${pct(uiCoverage.full_coverage_rate)} fully executable via API, ${pct(uiCoverage.full_or_partial_rate)} full or partial`,
  '',
  '## Reliability signals',
  '',
  `- ${reliability.write_actions_with_input_schema}/${reliability.write_actions} write actions ship an input schema` + (reliability.write_actions ? '' : ' (none)'),
  `- ${reliability.actions_with_documented_errors} API actions document at least one error`,
  `- ${reliability.actions_with_examples} API actions ship a request or response example`,
  `- ${reliability.actions_with_ui_path} actions are linked to a UI path`,
  `- ${reliability.actions_with_observed_ui} public actions have an observed internal UI link; ${reliability.observed_internal_endpoints} internal endpoints captured`,
  `- Live verified: ${reliability.live_verified_actions} · write-flow verified: ${reliability.write_verified_actions} · transactional verified: ${reliability.transactional_verified_actions} · event verified: ${reliability.event_verified_actions} · plan-gated: ${reliability.plan_gated_actions} · spec-only: ${reliability.spec_only_actions} · failed: ${reliability.live_failed_actions}`,
  '',
  '## Confidence',
  '',
  `- 0.90–1.00: ${confidenceBuckets['0.90-1.00']}`,
  `- 0.80–0.89: ${confidenceBuckets['0.80-0.89']}`,
  `- 0.70–0.79: ${confidenceBuckets['0.70-0.79']}`,
  `- <0.70: ${confidenceBuckets['<0.70']}`,
  '',
  '## Gaps by domain',
  '',
  '| Domain | API | Partial | UI-only |',
  '|---|---:|---:|---:|',
  ...gaps.map((entry) => `| ${entry.label || entry.domain} | ${entry.api} | ${entry.partial} | ${entry.ui_only} |`),
  '',
  '## UI-only actions',
  '',
  ...uiOnly.map((action) => `- \`${action.id}\` — ${action.name} (${action.domain})`),
  '',
  '## Partial actions',
  '',
  ...partial.map((action) => `- \`${action.id}\` — ${action.name} → \`${action.execution.related_action}\``),
  '',
];

fs.writeFileSync(path.join(ROOT, 'reports', 'coverage.md'), lines.join('\n'));
console.log(`Wrote reports/coverage.json and reports/coverage.md (${manifest.counts.total_actions} actions, ${uiOnly.length} UI-only, ${partial.length} partial).`);
