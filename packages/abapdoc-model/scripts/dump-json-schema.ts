/**
 * Build-time helper — dumps the runtime Zod-derived JSON Schema to
 * `src/json-schema.json` (and is then copied to `dist/json-schema.json`
 * during `nx build`).
 *
 * Why this exists: non-TS consumers (v1 ADT/AST tooling, external
 * validators, IDE plug-ins) need a JSON Schema they can `fetch` or
 * `import ... assert { type: 'json' }` without running the TS build.
 * The schema is regenerated on every build so it can never drift from
 * the Zod source of truth.
 *
 * Run via `npm run prebuild` (or directly with `tsx scripts/dump-json-schema.ts`).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { documentationModelJsonSchema } from '../src/json-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const outputPath = resolve(packageRoot, 'src/json-schema.json');

mkdirSync(dirname(outputPath), { recursive: true });

writeFileSync(outputPath, `${JSON.stringify(documentationModelJsonSchema, null, 2)}\n`);

// eslint-disable-next-line no-console
console.log(`[dump-json-schema] wrote ${outputPath}`);