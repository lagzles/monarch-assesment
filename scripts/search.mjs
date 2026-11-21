import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));

const args = process.argv.slice(2);
const flags = new Map();
const terms = [];
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    flags.set(key, value ?? true);
  } else {
    terms.push(arg.toLowerCase());
  }
}

if (!terms.length && !flags.size) {
  console.log('Usage: node scripts/search.mjs <terms...> [--domain=contacts] [--risk=high] [--execution=api|ui_only|api_partial] [--limit=10] [--json]');
  process.exit(0);
}

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'your', 'all', 'and', 'or', 'in', 'on', 'by', 'with', 'how', 'do', 'i', 'can']);
const tokenize = (text) => String(text).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1 && !STOPWORDS.has(token));

const queryTokens = terms.flatMap(tokenize);
const limit = Number(flags.get('limit') || 10);

function score(action) {
  const haystack = [
    action.name,
    action.intent,
    action.description,
    ...(action.synonyms || []),
    action.domain,
    action.action_type,
  ].join(' ').toLowerCase();
  let total = 0;
  for (const token of queryTokens) {
    if (action.name.toLowerCase().includes(token)) total += 4;
    if ((action.synonyms || []).some((synonym) => synonym.toLowerCase().includes(token))) total += 3;
    if (haystack.includes(token)) total += 1;
  }
  if (action.execution.kind === 'api') total += 0.5;
  return total;
}

const filtered = catalog.actions.filter((action) => {
  if (flags.get('domain') && action.domain !== flags.get('domain')) return false;
  if (flags.get('risk') && action.risk_level !== flags.get('risk')) return false;
  if (flags.get('execution') && action.execution.kind !== flags.get('execution')) return false;
  return true;
});

const results = filtered
  .map((action) => ({ action, score: score(action) }))
  .filter((entry) => entry.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

if (flags.get('json')) {
  console.log(JSON.stringify(results.map(({ action, score: rank }) => ({
    id: action.id,
    name: action.name,
    domain: action.domain,
    intent: action.intent,
    risk_level: action.risk_level,
    confirmation_required: action.confirmation_required,
    idempotency: action.idempotency,
    execution: action.execution,
    confidence: action.confidence,
    score: rank,
  })), null, 2));
  process.exit(0);
}

if (!results.length) {
  console.log('No actions matched. Try broader terms or drop filters.');
  process.exit(0);
}

for (const { action, score: rank } of results) {
  const endpoint = action.execution.endpoint ? `${action.execution.endpoint.method} ${action.execution.endpoint.path}` : action.execution.kind;
  console.log(`${action.id}  [${action.risk_level}${action.confirmation_required ? ', confirm' : ''}]  score=${rank.toFixed(1)}`);
  console.log(`  ${action.name} — ${action.intent}`);
  console.log(`  ${endpoint}${action.execution.related_action ? ` -> ${action.execution.related_action}` : ''}  confidence=${action.confidence}`);
  console.log('');
}
