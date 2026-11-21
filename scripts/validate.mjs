import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const catalog = readJson('catalog/catalog.json');
const manifest = readJson('catalog/manifest.json');
const index = readJson('catalog/index.json');
const agentTools = readJson('catalog/agent-tools.json');
const schema = readJson('schema/action.schema.json');
const uiInventory = readJson('curated/ui-actions.json');
let observedEndpoints = null;
let observedMapping = null;
try {
  observedEndpoints = readJson('curated/observed-endpoints.json');
  observedMapping = readJson('curated/observed-to-public.json');
} catch {
  // Browser capture is optional; the rest of the catalog must still validate.
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateAction = ajv.compile(schema);

const errors = [];
const warnings = [];
const ids = new Set();

for (const action of catalog.actions) {
  if (ids.has(action.id)) errors.push(`Duplicate action id: ${action.id}`);
  ids.add(action.id);

  if (!validateAction(action)) {
    for (const issue of validateAction.errors) {
      errors.push(`${action.id}${issue.instancePath}: ${issue.message}`);
    }
  }

  if (action.execution?.kind === 'api') {
    if (!action.execution.endpoint) errors.push(`${action.id}: api action without endpoint`);
    if (!action.auth?.api_key_header) errors.push(`${action.id}: api action without auth metadata`);
    if (!action.request) errors.push(`${action.id}: api action without request mapping`);
  }
  if (action.execution?.kind === 'ui_only') {
    if (action.execution.endpoint) errors.push(`${action.id}: ui_only action must not declare an endpoint`);
    if (!action.execution.ui_path) errors.push(`${action.id}: ui_only action without ui_path`);
  }
  if (action.execution?.kind === 'api_partial' && !action.execution.related_action) {
    errors.push(`${action.id}: api_partial action without related_action`);
  }

  for (const reference of action.related_actions || []) {
    if (!ids.has(reference) && !catalog.actions.some((candidate) => candidate.id === reference)) {
      errors.push(`${action.id}: related_actions references unknown id ${reference}`);
    }
  }
  if (action.execution?.related_action && !catalog.actions.some((candidate) => candidate.id === action.execution.related_action)) {
    errors.push(`${action.id}: execution.related_action references unknown id ${action.execution.related_action}`);
  }
}

const toolNames = new Set();
for (const tool of agentTools.tools) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) errors.push(`Invalid tool name: ${tool.name}`);
  if (toolNames.has(tool.name)) errors.push(`Duplicate tool name: ${tool.name}`);
  toolNames.add(tool.name);
  if (tool.parameters?.type !== 'object') errors.push(`Tool ${tool.name}: parameters must be an object schema`);
  if (!tool['x-brevo']?.endpoint) errors.push(`Tool ${tool.name}: missing endpoint`);
}

if (manifest.counts.total_actions !== catalog.actions.length) errors.push('Manifest total_actions does not match catalog');
if (manifest.counts.api_actions !== catalog.actions.filter((action) => action.execution.kind === 'api').length) {
  errors.push('Manifest api_actions does not match catalog');
}
if (agentTools.tool_count !== agentTools.tools.length) errors.push('agent-tools tool_count mismatch');

const jsonl = fs.readFileSync(path.join(ROOT, 'catalog', 'catalog.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
if (jsonl.length !== catalog.actions.length) errors.push(`catalog.jsonl has ${jsonl.length} lines for ${catalog.actions.length} actions`);

for (const ui of uiInventory.actions) {
  if (ui.api_status === 'covered' && ui.related_api_action && !ids.has(ui.related_api_action)) {
    errors.push(`UI inventory reference does not resolve: ${ui.related_api_action}`);
  }
}

if (observedEndpoints && observedMapping) {
  const observedIds = new Set(observedEndpoints.endpoints.map((endpoint) => endpoint.id));
  const observedUse = new Map();
  for (const action of catalog.actions) {
    for (const link of action.observed_ui || []) {
      if (!observedIds.has(link.observed_id)) errors.push(`${action.id}: observed_ui references unknown endpoint ${link.observed_id}`);
      if (!['same_capability_different_surface', 'partial', 'ui_only_confirmed'].includes(link.equivalence)) {
        errors.push(`${action.id}: invalid equivalence ${link.equivalence}`);
      }
      observedUse.set(action.id, (observedUse.get(action.id) || 0) + 1);
    }
  }
  for (const entry of observedMapping.mappings) {
    if (!ids.has(entry.catalog_action)) errors.push(`observed-to-public references unknown action ${entry.catalog_action}`);
    if (!observedIds.has(entry.observed_id)) errors.push(`observed-to-public references unknown endpoint ${entry.observed_id}`);
  }
  if (manifest.counts.actions_with_observed_ui !== observedUse.size) {
    errors.push('Manifest actions_with_observed_ui does not match catalog');
  }
}

const writeVerified = catalog.actions.filter((action) => action.verification?.kind === 'write_flow' && action.verification.status === 'live_verified').length;
if (manifest.counts.write_verified_actions !== writeVerified) {
  errors.push('Manifest write_verified_actions does not match catalog');
}
const planGated = catalog.actions.filter((action) => action.verification?.status === 'plan_gated').length;
if (manifest.counts.plan_gated_actions !== planGated) {
  errors.push('Manifest plan_gated_actions does not match catalog');
}

const documented = catalog.actions.filter((action) => action.execution.kind === 'api');
const writeOps = documented.filter((action) => action.execution.endpoint.method !== 'GET');
const writeWithoutInputs = writeOps.filter((action) => !action.inputs || !Object.keys(action.inputs.properties || {}).length);
if (writeWithoutInputs.length) {
  warnings.push(`${writeWithoutInputs.length} write actions have no documented input schema: ${writeWithoutInputs.slice(0, 8).map((action) => action.id).join(', ')}${writeWithoutInputs.length > 8 ? '…' : ''}`);
}

const lowConfidence = catalog.actions.filter((action) => action.confidence < 0.7);
if (lowConfidence.length) warnings.push(`${lowConfidence.length} actions below 0.70 confidence`);

const domainsWithoutActions = Object.keys(readJson('curated/taxonomy.json').domains).filter(
  (domain) => !catalog.actions.some((action) => action.domain === domain),
);
if (domainsWithoutActions.length) warnings.push(`Domains with no actions: ${domainsWithoutActions.join(', ')}`);

if (index.counts.total_actions !== catalog.actions.length) errors.push('index counts do not match catalog');

// Credential hygiene: generated artifacts must never contain credential-shaped strings.
const secretPattern = /xkeysib-[A-Za-z0-9_-]{8,}/i;
for (const file of ['catalog/catalog.json', 'catalog/catalog.jsonl', 'catalog/index.json', 'catalog/agent-tools.json']) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (secretPattern.test(content)) errors.push(`${file}: credential-shaped string detected`);
  if (/BREVO_API_KEY\s*=\s*\S+/.test(content)) errors.push(`${file}: API key assignment detected`);
}

console.log(`Validated ${catalog.actions.length} actions, ${agentTools.tools.length} agent tools, ${Object.keys(index.by_id).length} index entries.`);
for (const warning of warnings) console.warn(`WARN ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log('OK: catalog is structurally valid, references resolve, and no duplicate ids/tools.');
