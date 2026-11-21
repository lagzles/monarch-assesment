import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, SPEC_PATH, loadSpec, collectOperations, extractInputs, extractOutputs,
  deriveActionType, deriveRisk, deriveIdempotency, slugify, titleFromSlug,
  uniquePush, jsonSafe,
} from './lib/spec.mjs';

const OUT_DIR = path.join(ROOT, 'catalog');
const ACTIONS_DIR = path.join(OUT_DIR, 'actions');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const taxonomy = readJson('curated/taxonomy.json');
const overridesFile = readJson('curated/overrides.json');
const idsFile = readJson('curated/ids.json');
const uiFile = readJson('curated/ui-actions.json');

const { spec, sha256 } = loadSpec();
const operations = collectOperations(spec);

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'your', 'all', 'and', 'or', 'in', 'on', 'by', 'with', 'via', 'is', 'as']);

function tokenize(text) {
  return [...new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !STOPWORDS.has(token)),
  )];
}

function resolveDomain(routePath, tags, taxonomy) {
  const rules = [...taxonomy.pathRules].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const rule of rules) {
    if (routePath === rule.prefix || routePath.startsWith(`${rule.prefix}/`)) return rule.domain;
  }
  for (const tag of tags || []) {
    if (taxonomy.tagToDomain[tag]) return taxonomy.tagToDomain[tag];
  }
  const first = (tags || [])[0];
  return first ? slugify(first) : 'other';
}

const overrideByOperationId = new Map();
const overrideByRoute = new Map();
for (const entry of overridesFile.actions) {
  if (entry.match.operationId) overrideByOperationId.set(entry.match.operationId, entry);
  if (entry.match.method && entry.match.path) {
    overrideByRoute.set(`${entry.match.method.toUpperCase()} ${entry.match.path}`, entry);
  }
}

function findOverride(operation, method, routePath) {
  return (
    (operation.operationId && overrideByOperationId.get(operation.operationId)) ||
    overrideByRoute.get(`${method.toUpperCase()} ${routePath}`) ||
    null
  );
}

function cleanText(value, max = 600) {
  if (!value) return undefined;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function genericName(operation, method, routePath) {
  const source = operation.operationId || operation.summary || `${method} ${routePath}`;
  return titleFromSlug(slugify(source));
}

function actionIdFor(operation, method, routePath, domain, override) {
  if (override?.id) return override.id;
  const routeKey = `${method.toUpperCase()} ${routePath}`;
  const explicit = idsFile.ids[routeKey];
  if (explicit) return explicit;
  const source = operation.operationId || operation.summary || `${method} ${routePath}`;
  const base = slugify(source)
    .split('_')
    .filter((token) => token && !STOPWORDS.has(token))
    .join('_') || slugify(`${method}_${routePath}`);
  return `${domain}.${base}`;
}

// Rate limits published at developers.brevo.com/docs/api-limits (Free/Starter general tier).
function rateLimitFor(method, routePath) {
  if (routePath === '/smtp/email' || routePath === '/smtp/blockedContacts') {
    return { tier: 'general', requests_per_hour: 3600000, requests_per_second: 1000, notes: 'Dedicated high-throughput limit.' };
  }
  if (routePath === '/smtp/emails') return { tier: 'general', requests_per_hour: 7200, requests_per_second: 2 };
  if (routePath === '/transactionalSMS/send') return { tier: 'general', requests_per_hour: 540000, requests_per_second: 150 };
  if (routePath === '/events' && method === 'post') return { tier: 'general', requests_per_hour: 36000, requests_per_second: 10 };
  if (routePath === '/orders/status' && method === 'post') return { tier: 'general', requests_per_hour: 18000, requests_per_second: 5 };
  if (routePath === '/products' && method === 'post') return { tier: 'general', requests_per_hour: 7200, requests_per_second: 2 };
  if (routePath.startsWith('/smtp/')) return { tier: 'general', requests_per_hour: 300 };
  if (routePath.startsWith('/contacts/')) return { tier: 'general', requests_per_hour: 36000, requests_per_second: 10 };
  if (routePath.startsWith('/loyalty/')) return { tier: 'general', requests_per_hour: 600 };
  return { tier: 'general', requests_per_hour: 100 };
}

const SIDE_EFFECTS = {
  read: ['Read-only'],
  create: ['Creates a new resource'],
  update: ['Modifies an existing resource'],
  delete: ['Deletes the resource', 'Irreversible'],
  send: ['Sends real messages to recipients', 'Irreversible'],
  import: ['Starts an asynchronous import process', 'Creates or updates many records'],
  export: ['Starts an asynchronous export process', 'Produces a downloadable file'],
  upload: ['Stores a file in the account'],
  configure: ['Changes account or delivery configuration'],
  publish: ['Makes a resource publicly available', 'Visible to end users'],
  cancel: ['Cancels an existing operation'],
  complete: ['Finalizes an existing operation'],
  redeem: ['Consumes a reward or voucher', 'Financial side effects'],
  revoke: ['Removes previously granted access or value'],
  validate: ['Read-only validation'],
  execute: ['Performs an operation with side effects'],
};

function reversibilityFor(actionType) {
  if (['delete', 'send'].includes(actionType)) return 'irreversible';
  if (['create', 'update', 'configure', 'publish', 'cancel', 'complete'].includes(actionType)) return 'reversible';
  if (['import', 'export'].includes(actionType)) return 'partially_reversible';
  if (['read', 'validate'].includes(actionType)) return 'not_applicable';
  return 'unknown';
}

function derivedPreconditions(method, routePath, actionType) {
  const list = ['A valid Brevo API key authorized for this resource.'];
  if (routePath.includes('{')) list.push('The resource identified by the path parameters must exist; otherwise the API returns 404.');
  if (actionType === 'send') list.push('An authenticated sender or verified sending domain.');
  return list;
}

function authForAction() {
  return {
    schemes: ['api_key', 'oauth2'],
    api_key_header: 'api-key',
    oauth2: 'Authorization: Bearer <token>',
    notes: 'API key auth is the default for server-to-server use. OAuth 2.0 (including M2M) is available for apps acting on behalf of a user.',
  };
}

const apiActions = [];
const seenIds = new Map();

function claimId(id) {
  if (!seenIds.has(id)) {
    seenIds.set(id, 1);
    return id;
  }
  const count = seenIds.get(id) + 1;
  seenIds.set(id, count);
  return `${id}_${count}`;
}

for (const { routePath, method, operation, pathItem } of operations) {
  const tags = operation.tags || [];
  const domain = resolveDomain(routePath, tags, taxonomy);
  const override = findOverride(operation, method, routePath);
  const actionType = override?.action_type || deriveActionType(method, operation.summary || '', operation.operationId || '');
  const risk = override?.risk_level || deriveRisk(actionType, domain, routePath);
  const name = override?.name || cleanText(operation.summary, 140) || genericName(operation, method, routePath);
  const summary = cleanText(operation.summary, 300) || name;
  const description = override?.description || cleanText(operation.description, 600) || summary;
  const { inputs, request } = extractInputs(operation, pathItem, spec);
  const outputs = extractOutputs(operation, spec);
  const id = claimId(actionIdFor(operation, method, routePath, domain, override));

  const synonyms = [];
  for (const value of override?.synonyms || []) uniquePush(synonyms, value);
  for (const token of tokenize(name)) uniquePush(synonyms, token);
  for (const keyword of taxonomy.domains[domain]?.keywords || []) {
    if (tokenize(name).some((token) => keyword.includes(token))) uniquePush(synonyms, keyword);
  }
  uniquePush(synonyms, domain.replace(/_/g, ' '));

  let confidence = method === 'get' ? 0.94 : (operation.requestBody ? 0.92 : 0.86);
  if (override?.confidence) confidence = override.confidence;

  const action = {
    id,
    version: '1.0.0',
    domain,
    domain_label: taxonomy.domains[domain]?.label || titleFromSlug(domain),
    name,
    intent: override?.intent || summary,
    description,
    action_type: actionType,
    entity: undefined,
    when_to_use: override?.when_to_use,
    when_not_to_use: override?.when_not_to_use,
    preconditions: override?.preconditions?.length ? override.preconditions : derivedPreconditions(method, routePath, actionType),
    inputs: inputs && Object.keys(inputs.properties || {}).length ? inputs : undefined,
    request,
    outputs: outputs.schema || outputs.example ? { success_status: outputs.success_status, schema: outputs.schema, example: outputs.example } : { success_status: outputs.success_status },
    response_codes: outputs.codes,
    errors: outputs.errors,
    side_effects: override?.side_effects || SIDE_EFFECTS[actionType] || ['Performs an operation with side effects'],
    reversibility: override?.reversibility || reversibilityFor(actionType),
    risk_level: risk,
    confirmation_required: override?.confirmation_required ?? (risk === 'high' || actionType === 'send'),
    idempotency: override?.idempotency || deriveIdempotency(method, operation.operationId || '', operation.summary || ''),
    rate_limit: rateLimitFor(method, routePath),
    auth: authForAction(),
    execution: {
      kind: 'api',
      endpoint: { method: method.toUpperCase(), path: routePath, base_url: spec.servers?.[0]?.url || 'https://api.brevo.com/v3' },
      tool_name: id.replace(/\./g, '__'),
    },
    evidence: {
      source: 'openapi',
      spec_file: 'sources/brevo-openapi.yml',
      spec_version: spec.openapi,
      operation_id: operation.operationId || null,
      tag: tags[0] || null,
      ui_area: taxonomy.domains[domain]?.ui_area || null,
      ui_path: null,
    },
    matched_ui_actions: [],
    synonyms: synonyms.slice(0, 20),
    related_actions: override?.related_actions || [],
    tags: [...new Set([domain, actionType, ...tags.map(slugify)])],
    confidence: Number(confidence.toFixed(2)),
    verification: { status: 'spec_only', checked_at: null, method: null },
  };

  apiActions.push(jsonSafe(action));
}

const apiById = new Map(apiActions.map((action) => [action.id, action]));
const uiOnly = [];
const unmatchedUiRefs = [];

for (const ui of uiFile.actions) {
  const related = ui.related_api_action ? apiById.get(ui.related_api_action) : null;
  if (ui.related_api_action && !related) unmatchedUiRefs.push(ui.related_api_action);

  if (ui.api_status === 'covered' && related) {
    related.matched_ui_actions.push({ name: ui.name, ui_path: ui.ui_path, status: 'covered' });
    if (!related.evidence.ui_path) related.evidence.ui_path = ui.ui_path;
    for (const synonym of ui.synonyms || []) uniquePush(related.synonyms, synonym);
    for (const token of tokenize(ui.name)) uniquePush(related.synonyms, token);
    related.synonyms = related.synonyms.slice(0, 25);
    related.confidence = Math.min(0.99, Number((related.confidence + 0.01).toFixed(2)));
    continue;
  }

  const executionKind = ui.api_status === 'partial' ? 'api_partial' : 'ui_only';
  const baseId = `${ui.domain}.${tokenize(ui.name).join('_')}`;
  const id = claimId(baseId);
  const risk = ui.risk_level || 'medium';
  const action = {
    id,
    version: '1.0.0',
    domain: ui.domain,
    domain_label: taxonomy.domains[ui.domain]?.label || titleFromSlug(ui.domain),
    name: ui.name,
    intent: ui.description,
    description: ui.description,
    action_type: executionKind === 'ui_only' ? 'ui_action' : 'partial_api_action',
    when_to_use: ui.when_to_use,
    when_not_to_use: ui.when_not_to_use,
    preconditions: ui.preconditions || [],
    inputs: undefined,
    request: null,
    outputs: undefined,
    response_codes: [],
    errors: [],
    side_effects: ui.side_effects || (executionKind === 'ui_only' ? ['Performed manually in the Brevo UI; no public API execution path'] : ['Partially supported by the API; some steps must be done in the UI']),
    reversibility: ui.reversibility || 'unknown',
    risk_level: risk,
    confirmation_required: risk === 'high',
    idempotency: 'unknown',
    rate_limit: null,
    auth: null,
    execution: {
      kind: executionKind,
      endpoint: null,
      related_action: related ? related.id : null,
      ui_path: ui.ui_path,
      tool_name: null,
    },
    evidence: {
      source: 'ui_inventory',
      spec_file: null,
      spec_version: null,
      operation_id: null,
      tag: null,
      ui_area: taxonomy.domains[ui.domain]?.ui_area || null,
      ui_path: ui.ui_path,
      help_center_sources: uiFile.sources,
    },
    matched_ui_actions: [],
    synonyms: ui.synonyms || [],
    related_actions: related ? [related.id] : [],
    tags: [ui.domain, executionKind, 'ui'],
    confidence: executionKind === 'ui_only' ? 0.72 : 0.8,
    verification: { status: 'unverified', checked_at: null, method: null },
  };
  uiOnly.push(jsonSafe(action));
}

const actions = [...apiActions, ...uiOnly].sort((a, b) =>
  a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id));

// Apply an optional live-verification overlay produced by scripts/verify-live.mjs.
const verificationFile = path.join(ROOT, 'reports', 'live', 'verification.json');
const flowVerificationFile = path.join(ROOT, 'reports', 'live', 'flow-verification.json');
const advancedVerificationFile = path.join(ROOT, 'reports', 'live', 'advanced-flow-verification.json');
const transactionalFile = path.join(ROOT, 'reports', 'live', 'transactional-delivery.json');
const specOnlyOverlayFile = path.join(ROOT, 'reports', 'live', 'spec-only-overlay.json');
const eventsFile = path.join(ROOT, 'reports', 'live', 'events-webhooks.json');
let verificationCheckedAt = null;
let flowCheckedAt = null;
let advancedCheckedAt = null;
let transactionalCheckedAt = null;
let sweepCheckedAt = null;
let eventsCheckedAt = null;
let observedGeneratedAt = null;
if (fs.existsSync(verificationFile)) {
  const overlay = JSON.parse(fs.readFileSync(verificationFile, 'utf8'));
  verificationCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      account_entitlement: result.account_entitlement ?? null,
      note: result.note ?? null,
      kind: 'read_check',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    } else if (result.status === 'live_failed') {
      action.confidence = Number((action.confidence - 0.1).toFixed(2));
    }
  }
}

if (fs.existsSync(flowVerificationFile)) {
  const overlay = JSON.parse(fs.readFileSync(flowVerificationFile, 'utf8'));
  flowCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      note: result.note ?? null,
      kind: 'write_flow',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    } else if (result.status === 'live_failed') {
      action.confidence = Number((action.confidence - 0.1).toFixed(2));
    }
  }
}

if (fs.existsSync(advancedVerificationFile)) {
  const overlay = JSON.parse(fs.readFileSync(advancedVerificationFile, 'utf8'));
  advancedCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    if (result.status === 'live_verified' && action.verification?.kind === 'write_flow' && action.verification.status === 'live_verified') {
      continue;
    }
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      account_entitlement: result.account_entitlement ?? null,
      note: result.note ?? null,
      kind: 'advanced_flow',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    } else if (result.status === 'live_failed') {
      action.confidence = Number((action.confidence - 0.1).toFixed(2));
    }
  }
}

if (fs.existsSync(transactionalFile)) {
  const overlay = JSON.parse(fs.readFileSync(transactionalFile, 'utf8'));
  transactionalCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      note: result.note ?? null,
      kind: 'transactional_flow',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    } else if (result.status === 'live_failed') {
      action.confidence = Number((action.confidence - 0.1).toFixed(2));
    }
  }
}

if (fs.existsSync(specOnlyOverlayFile)) {
  const overlay = JSON.parse(fs.readFileSync(specOnlyOverlayFile, 'utf8'));
  sweepCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    if (action.verification.status !== 'spec_only') continue;
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      account_entitlement: result.account_entitlement ?? null,
      note: result.note ?? null,
      kind: 'read_check',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    }
  }
}

if (fs.existsSync(eventsFile)) {
  const overlay = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
  eventsCheckedAt = overlay.checked_at || null;
  for (const action of actions) {
    if (action.verification.status !== 'spec_only') continue;
    const result = overlay.verification?.[action.id];
    if (!result) continue;
    action.verification = {
      status: result.status,
      checked_at: result.checked_at,
      method: result.method,
      http_status: result.http_status ?? null,
      note: result.note ?? null,
      kind: 'event_flow',
    };
    if (result.status === 'live_verified') {
      action.confidence = Math.min(0.99, Number((action.confidence + 0.03).toFixed(2)));
    }
  }
}

// Attach observed UI evidence (browser capture -> internal endpoint) to public actions.
const observedFile = path.join(ROOT, 'curated', 'observed-endpoints.json');
const observedMappingFile = path.join(ROOT, 'curated', 'observed-to-public.json');
let observedEndpointCount = 0;
if (fs.existsSync(observedFile) && fs.existsSync(observedMappingFile)) {
  const observed = JSON.parse(fs.readFileSync(observedFile, 'utf8'));
  const mapping = JSON.parse(fs.readFileSync(observedMappingFile, 'utf8'));
  observedEndpointCount = observed.endpoints?.length || 0;
  observedGeneratedAt = observed.generated_at || observed.source?.captured_at || null;
  const byId = new Map(observed.endpoints.map((endpoint) => [endpoint.id, endpoint]));
  for (const entry of mapping.mappings) {
    const action = actions.find((candidate) => candidate.id === entry.catalog_action);
    const endpoint = byId.get(entry.observed_id);
    if (!action || !endpoint) continue;
    action.observed_ui = action.observed_ui || [];
    action.observed_ui.push({
      observed_id: endpoint.id,
      ui_path: entry.ui_path,
      host: endpoint.host,
      method: endpoint.method,
      path: endpoint.path,
      equivalence: entry.equivalence,
      request_body_captured: endpoint.request_body_captured,
      captured_at: endpoint.evidence.captured_at,
      note: entry.notes,
    });
    action.ui_evidence = {
      status: 'observed_internal',
      captured_at: endpoint.evidence.captured_at,
      har_file: endpoint.evidence.har_file,
    };
  }
}

const counts = {
  total_actions: actions.length,
  api_actions: apiActions.length,
  ui_only_actions: uiOnly.filter((action) => action.execution.kind === 'ui_only').length,
  api_partial_actions: uiOnly.filter((action) => action.execution.kind === 'api_partial').length,
  domains: [...new Set(actions.map((action) => action.domain))].length,
  high_risk_actions: actions.filter((action) => action.risk_level === 'high').length,
  actions_requiring_confirmation: actions.filter((action) => action.confirmation_required).length,
  actions_with_observed_ui: actions.filter((action) => (action.observed_ui || []).length).length,
  observed_internal_endpoints: observedEndpointCount,
  write_verified_actions: actions.filter((action) => action.verification?.kind === 'write_flow' && action.verification.status === 'live_verified').length,
  transactional_verified_actions: actions.filter((action) => action.verification?.kind === 'transactional_flow' && action.verification.status === 'live_verified').length,
  event_verified_actions: actions.filter((action) => action.verification?.kind === 'event_flow' && action.verification.status === 'live_verified').length,
  plan_gated_actions: actions.filter((action) => action.verification?.status === 'plan_gated').length,
};

const specStat = fs.statSync(SPEC_PATH);
const generatedAt = [verificationCheckedAt, flowCheckedAt, advancedCheckedAt, transactionalCheckedAt, sweepCheckedAt, eventsCheckedAt, observedGeneratedAt, new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000 || specStat.mtimeMs).toISOString()]
  .filter(Boolean)
  .sort()
  .pop();

const manifest = {
  generated_at: generatedAt,
  generator: 'scripts/build-catalog.mjs',
  catalog_version: '1.0.0',
  spec: {
    file: 'sources/brevo-openapi.yml',
    sha256,
    openapi: spec.openapi,
    paths: Object.keys(spec.paths || {}).length,
    operations: operations.length,
  },
  taxonomy_version: taxonomy.version,
  overrides_version: overridesFile.version,
  ids_version: idsFile.version,
  ui_inventory_version: uiFile.version,
  counts,
  unmatched_ui_references: [...new Set(unmatchedUiRefs)],
};

const catalog = {
  schema_version: '1.0.0',
  generated_at: generatedAt,
  about: {
    name: 'Brevo business action catalog',
    purpose: 'Agent-consumable inventory of business actions a user can perform in Brevo, with API execution details where the public API supports them.',
    target_system: 'Brevo (brevo.com)',
    catalog_for: 'AI agents (not humans)',
    base_url: 'https://api.brevo.com/v3',
    provenance: 'Derived from the official OpenAPI 3.0.1 spec plus the public help center / product surface. Every action carries evidence and confidence.',
    credentials_policy: 'No credentials are stored in this catalog. Authentication is described, never embedded.',
  },
  counts,
  domains: Object.fromEntries(
    Object.entries(taxonomy.domains)
      .map(([key, value]) => [key, { label: value.label, description: value.description, ui_area: value.ui_area, action_count: actions.filter((action) => action.domain === key).length }])
      .filter(([, value]) => value.action_count > 0),
  ),
  actions,
};

fs.mkdirSync(ACTIONS_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'catalog.jsonl'), `${actions.map((action) => JSON.stringify(action)).join('\n')}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const byDomain = {};
for (const action of actions) (byDomain[action.domain] ||= []).push(action);
for (const [domain, list] of Object.entries(byDomain)) {
  fs.writeFileSync(path.join(ACTIONS_DIR, `${domain}.json`), `${JSON.stringify(list, null, 2)}\n`);
}

const byToken = {};
for (const action of actions) {
  const tokens = new Set([...tokenize(action.name), ...tokenize(action.intent || ''), ...(action.synonyms || []).flatMap(tokenize)]);
  for (const token of tokens) (byToken[token] ||= []).push(action.id);
}
const index = {
  generated_at: generatedAt,
  counts,
  domains: Object.fromEntries(Object.entries(byDomain).map(([domain, list]) => [domain, { label: taxonomy.domains[domain]?.label, action_count: list.length, actions: list.map((action) => action.id) }])),
  by_id: Object.fromEntries(actions.map((action) => [action.id, {
    domain: action.domain,
    name: action.name,
    action_type: action.action_type,
    risk_level: action.risk_level,
    execution: action.execution.kind,
    confidence: action.confidence,
  }])),
  lexical_index: Object.fromEntries(Object.entries(byToken).sort(([a], [b]) => a.localeCompare(b))),
};
fs.writeFileSync(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

const tools = actions
  .filter((action) => action.execution.kind === 'api')
  .map((action) => ({
    name: action.execution.tool_name,
    description: [
      action.intent,
      action.when_to_use ? `Use when: ${action.when_to_use}` : null,
      action.when_not_to_use ? `Do not use when: ${action.when_not_to_use}` : null,
      `Risk: ${action.risk_level}.${action.confirmation_required ? ' Requires user confirmation before executing.' : ''}`,
    ].filter(Boolean).join(' '),
    strict: false,
    parameters: action.inputs || { type: 'object', properties: {} },
    'x-brevo': {
      action_id: action.id,
      endpoint: action.execution.endpoint,
      auth: action.auth,
      idempotency: action.idempotency,
      risk_level: action.risk_level,
      confirmation_required: action.confirmation_required,
      confidence: action.confidence,
      errors: action.errors,
    },
  }));
fs.writeFileSync(path.join(OUT_DIR, 'agent-tools.json'), `${JSON.stringify({ generated_at: generatedAt, tool_count: tools.length, tools }, null, 2)}\n`);

console.log(`Generated ${actions.length} actions (${counts.api_actions} API, ${counts.ui_only_actions} UI-only, ${counts.api_partial_actions} partial).`);
console.log(`Domains: ${counts.domains}. High risk: ${counts.high_risk_actions}. Agent tools: ${tools.length}.`);
if (unmatchedUiRefs.length) {
  console.warn(`WARNING: unmatched UI references: ${[...new Set(unmatchedUiRefs)].join(', ')}`);
}
