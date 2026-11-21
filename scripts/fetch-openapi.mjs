import fs from 'node:fs';

const url = process.env.BREVO_OPENAPI_URL || 'https://api.brevo.com/v3/swagger_definition_v3.yml';
const target = new URL('../sources/brevo-openapi.yml', import.meta.url);

console.log(`Fetching ${url}`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`Failed: HTTP ${response.status}`);
  process.exit(1);
}
const body = await response.text();
// The upstream spec ships a placeholder API key in an example payload. Redact it so
// the repository never contains credential-shaped strings.
const sanitized = body.replace(/xkeysib-[A-Za-z0-9_-]+/gi, 'YOUR_API_KEY');
fs.writeFileSync(target, sanitized);
const { createHash } = await import('node:crypto');
console.log(`Wrote ${target.pathname.replace(/^\//, '')} (${sanitized.length} bytes, sha256 ${createHash('sha256').update(sanitized).digest('hex').slice(0, 16)}…)`);
