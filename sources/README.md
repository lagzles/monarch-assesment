# Sources

Everything here is either the raw upstream source or a provenance note. Generated
artifacts live in `../catalog`; this folder is never hand-edited except for this file.

| File | What it is | How to refresh |
|---|---|---|
| `brevo-openapi.yml` | Official Brevo OpenAPI 3.0.1 spec, downloaded 2026-11-20 from `https://api.brevo.com/v3/swagger_definition_v3.yml`. 208 paths / 292 operations. | `npm run fetch:spec` |
| `ui-inventory-notes.md` | Notes on which Brevo help-center/product areas were inspected to build the UI action inventory. | manual |

The spec is committed on purpose: the catalog must be reproducible byte-for-byte even
if Brevo changes the live spec. `catalog/manifest.json` records the spec checksum.

**One redaction:** the upstream spec's example payload for API-key creation contained a
placeholder in the `xkeysib-…xxxxx` format. It was replaced with `YOUR_API_KEY` so the
repository contains no credential-shaped strings. This is the only edit; re-running
`npm run fetch:spec` will reintroduce it, and `scripts/build-catalog.mjs` redacts it
again in generated artifacts.
