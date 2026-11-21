import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, '..', '..');
export const SPEC_PATH = path.join(ROOT, 'sources', 'brevo-openapi.yml');

const MAX_DEPTH = 8;
const MAX_DESCRIPTION = 280;

export function loadSpec(file = SPEC_PATH) {
  const raw = fs.readFileSync(file, 'utf8');
  return { spec: yaml.load(raw), raw, sha256: crypto.createHash('sha256').update(raw).digest('hex') };
}

export function resolveRef(doc, ref) {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, part) => (node == null ? undefined : node[part]), doc);
}

function truncate(text, size = MAX_DESCRIPTION) {
  if (typeof text !== 'string') return text;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > size ? `${clean.slice(0, size - 1)}…` : clean;
}

function mergeAllOf(schemas) {
  const merged = { type: 'object', properties: {}, required: [] };
  const descriptions = [];
  for (const schema of schemas) {
    if (schema.description) descriptions.push(schema.description);
    if (schema.type && !merged.type) merged.type = schema.type;
    if (schema.properties) Object.assign(merged.properties, schema.properties);
    if (Array.isArray(schema.required)) merged.required.push(...schema.required);
    for (const [key, value] of Object.entries(schema)) {
      if (!['properties', 'required', 'description', 'allOf'].includes(key)) merged[key] = value;
    }
  }
  merged.required = [...new Set(merged.required)];
  if (!merged.required.length) delete merged.required;
  if (descriptions.length) merged.description = descriptions.join(' ');
  return merged;
}

/**
 * Resolve local $refs and keep only the parts of a JSON schema an agent needs.
 * Recursive refs are cut with `x-recursive-ref` instead of exploding.
 */
export function deref(node, doc, seen = new Set(), depth = 0) {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => deref(item, doc, new Set(seen), depth));

  if (typeof node.$ref === 'string') {
    const ref = node.$ref;
    if (seen.has(ref)) return { type: 'object', 'x-recursive-ref': ref };
    if (depth >= MAX_DEPTH) return { type: 'object', 'x-truncated-ref': ref };
    const resolved = resolveRef(doc, ref);
    if (resolved === undefined) return { '$ref': ref, 'x-unresolved': true };
    const nextSeen = new Set(seen).add(ref);
    return deref(resolved, doc, nextSeen, depth + 1);
  }

  if (Array.isArray(node.allOf)) {
    const merged = mergeAllOf(node.allOf.map((part) => deref(part, doc, seen, depth + 1)));
    const rest = { ...node };
    delete rest.allOf;
    return deref({ ...merged, ...rest }, doc, seen, depth);
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (['xml', 'externalDocs', 'example'].includes(key)) {
      if (key === 'example') out.example = value;
      continue;
    }
    if (key === 'description') {
      out.description = truncate(value);
      continue;
    }
    if (['properties', 'items', 'additionalProperties'].includes(key)) {
      out[key] = deref(value, doc, seen, depth + 1);
      continue;
    }
    if (['allOf', 'oneOf', 'anyOf', 'not'].includes(key)) {
      out[key] = deref(value, doc, seen, depth + 1);
      continue;
    }
    if (['default', 'enum', 'format', 'type', 'required', 'nullable', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'uniqueItems', 'minItems', 'maxItems'].includes(key)) {
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  if (Array.isArray(out.enum) && out.enum.length > 60) {
    out.enum = out.enum.slice(0, 60);
    out['x-enum-truncated'] = true;
  }
  return out;
}

export function collectOperations(spec) {
  const operations = [];
  for (const [routePath, item] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = item[method];
      if (!operation) continue;
      operations.push({ routePath, method, operation, pathItem: item });
    }
  }
  return operations;
}

function paramSchema(param) {
  if (param.schema) return deref(param.schema, undefined);
  // Swagger-2 style parameters put the schema on the parameter itself.
  const { name, in: location, required, description, ...schema } = param;
  return schema;
}

export function extractInputs(operation, pathItem, doc) {
  const parameters = [...(pathItem.parameters || []), ...(operation.parameters || [])]
    .map((param) => (param.$ref ? resolveRef(doc, param.$ref) : param))
    .filter(Boolean)
    .map((param) => ({ ...param, schema: param.schema ? deref(param.schema, doc) : paramSchema(param) }));

  const properties = {};
  const required = new Set();
  const request = { path_params: [], query_params: [], header_params: [], body: null };

  for (const param of parameters) {
    if (!param.name || ['api-key', 'partner-key', 'Authorization'].includes(param.name)) continue;
    const schema = param.schema || {};
    properties[param.name] = {
      ...schema,
      'x-in': param.in,
      ...(param.description ? { description: truncate(param.description) } : {}),
    };
    if (param.required) required.add(param.name);
    if (param.in === 'path') request.path_params.push(param.name);
    else if (param.in === 'query') request.query_params.push(param.name);
    else if (param.in === 'header') request.header_params.push(param.name);
  }

  const body = operation.requestBody;
  if (body && body.content) {
    const mediaType = body.content['application/json']
      ? 'application/json'
      : Object.keys(body.content)[0];
    if (mediaType) {
      const media = body.content[mediaType];
      const schema = deref(media.schema || {}, doc);
      const example = media.example ?? firstExample(media.examples) ?? schema.example;
      request.body = {
        required: Boolean(body.required),
        media_type: mediaType,
        ...(body.description ? { description: truncate(body.description) } : {}),
        schema,
        ...(example !== undefined ? { example } : {}),
      };
      if (schema && schema.type === 'object' && schema.properties) {
        for (const [name, propSchema] of Object.entries(schema.properties)) {
          properties[name] = { ...propSchema, 'x-in': 'body' };
        }
        for (const name of schema.required || []) required.add(name);
      } else if (schema) {
        properties.body = { ...schema, 'x-in': 'body' };
        if (body.required) required.add('body');
      }
    }
  }

  const inputs = { type: 'object', properties };
  if (required.size) inputs.required = [...required];
  return { inputs, request };
}

function firstExample(examples) {
  if (!examples || typeof examples !== 'object') return undefined;
  for (const value of Object.values(examples)) {
    if (value && typeof value === 'object' && 'value' in value) return value.value;
  }
  return undefined;
}

export function extractOutputs(operation, doc) {
  const responses = operation.responses || {};
  const codes = Object.keys(responses);
  const successCode = ['200', '201', '202', '204'].find((code) => responses[code]) || codes.find((code) => code.startsWith('2'));
  const errors = [];
  for (const [code, response] of Object.entries(responses)) {
    if (!code.startsWith('4') && !code.startsWith('5')) continue;
    errors.push({ status: Number(code) || code, meaning: truncate(response.description || 'Error') });
  }
  let schema;
  let example;
  if (successCode) {
    const content = responses[successCode].content;
    if (content) {
      const mediaType = content['application/json'] ? 'application/json' : Object.keys(content)[0];
      const media = content[mediaType];
      if (media) {
        schema = deref(media.schema || {}, doc);
        example = media.example ?? firstExample(media.examples) ?? schema?.example;
      }
    }
  }
  return {
    success_status: successCode ? Number(successCode) : undefined,
    codes: codes.map((code) => Number(code)).filter((code) => !Number.isNaN(code)).sort((a, b) => a - b),
    schema,
    example,
    errors,
  };
}

const VERB_TYPES = {
  create: 'create', creates: 'create', add: 'update', update: 'update', edit: 'update',
  delete: 'delete', remove: 'delete', get: 'read', list: 'read', return: 'read', returns: 'read',
  send: 'send', import: 'import', export: 'export', upload: 'upload', download: 'read',
  authenticate: 'configure', validate: 'validate', publish: 'publish', cancel: 'cancel',
  complete: 'complete', redeem: 'redeem', revoke: 'revoke', block: 'configure', unblock: 'configure',
  activate: 'configure', begin: 'execute', request: 'execute', assign: 'update', link: 'update',
  upsert: 'update', set: 'update', check: 'read', fetch: 'read', apply: 'configure',
};

export function deriveActionType(method, summary = '', operationId = '') {
  const words = `${summary} ${operationId.replace(/([a-z])([A-Z])/g, '$1 $2')}`
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const word of words) {
    if (VERB_TYPES[word]) return VERB_TYPES[word];
  }
  if (method === 'get') return 'read';
  if (method === 'delete') return 'delete';
  if (method === 'put' || method === 'patch') return 'update';
  return 'execute';
}

const RISK_BY_TYPE = {
  read: 'low', upload: 'low', configure: 'medium', create: 'medium', update: 'medium',
  import: 'medium', export: 'medium', validate: 'low', execute: 'medium',
  send: 'high', publish: 'high', delete: 'high', cancel: 'medium', complete: 'medium',
  redeem: 'high', revoke: 'high',
};

export function deriveRisk(actionType, domain, routePath) {
  if (/loyalty|payments|coupons|account_admin/.test(domain) && actionType === 'update') return 'high';
  if (routePath.startsWith('/corporate') || routePath.startsWith('/organization/user')) return 'high';
  return RISK_BY_TYPE[actionType] || 'medium';
}

export function deriveIdempotency(method, operationId = '', summary = '') {
  const text = `${operationId} ${summary}`.toLowerCase();
  if (/\b(upsert|createorupdate|idempotent)\b/.test(text)) return 'idempotent';
  if (method === 'get' || method === 'put' || method === 'delete') return 'idempotent';
  if (method === 'post') return 'non_idempotent';
  return 'non_idempotent';
}

export function slugify(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function titleFromSlug(value) {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function uniquePush(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

export function jsonSafe(value) {
  const text = JSON.stringify(value)
    .replace(/xkeysib-[A-Za-z0-9_-]+/gi, 'YOUR_API_KEY')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)*(?:\.\.\.)?/g, 'YOUR_JWT');
  return JSON.parse(text);
}
