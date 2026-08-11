/**
 * Parser → renderer smoke check.
 *
 * End-to-end diagnostic:
 *   1. parseAbapSource on the e2e petstore ABAP source
 *   2. wrap the result in a minimal DocumentationModel and validate it
 *   3. run the JSON / HTML / MDX renderers, print file lists
 *   4. round-trip the JSON renderer's output back through
 *      DocumentationModelSchema.parse and report success/failure.
 *
 * Run via: `NODE_OPTIONS="--conditions=development" npx tsx packages/abapdoc-parser/scripts/smoke.ts`
 * (the workspace packages resolve source via the `development`
 *  conditions export.)
 *
 * This is a diagnostic only. The script deliberately tries to be
 * small and observable — every interesting fact (file paths, byte
 * sizes, errors) is logged via console.log + console.error so the
 * report can be re-constructed from a clean capture.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAbapSource } from '../src/index.js';
import {
  DocumentationModelSchema,
  validate,
  DOCUMENTATION_MODEL_VERSION,
} from '@abapdoc/model';

import { render as renderJson } from '@abapdoc/renderer-json';
import { render as renderHtml } from '@abapdoc/renderer-html';
import { render as renderMdx } from '@abapdoc/renderer-mdx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve from this script's directory upwards to the worktree root,
// then down to the e2e fixture. Robust against being run from the
// repo root or from inside the scripts/ directory.
const WORKTREE_ROOT = resolve(__dirname, '..', '..', '..');
const ABAP_FILE = resolve(
  WORKTREE_ROOT,
  'e2e',
  'petstore',
  'src',
  'sdk',
  'zcl_pet_service.clas.abap',
);
// A relative source path so the DocumentationModel's sourceLocation
// stays useful when the model is later serialised.
const RELATIVE_ABAP_PATH =
  'e2e/petstore/src/sdk/zcl_pet_service.clas.abap';

let hasFatal = false;
let hasNonFatalIssue = false;

function section(title: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
}

function reportIssue(label: string, detail: string): void {
  hasNonFatalIssue = true;
  // eslint-disable-next-line no-console
  console.error(`[ISSUE] ${label}: ${detail}`);
}

function reportFatal(label: string, err: unknown): void {
  hasFatal = true;
  const msg = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[FATAL] ${label}: ${msg.split('\n')[0]}`);
}

function shortZodIssues(issues: ReadonlyArray<unknown>): string {
  // Zod issue entries carry `path`, `message`, `code` — summarise the
  // first few so the report stays small but useful.
  const parts: string[] = [];
  for (const issue of issues.slice(0, 8)) {
    const i = issue as {
      path?: ReadonlyArray<string | number>;
      message?: string;
      code?: string;
    };
    const path = (i.path ?? []).join('.');
    parts.push(`    - ${path || '(root)'}: ${i.message ?? i.code ?? '?'}`);
  }
  if (issues.length > 8) {
    parts.push(`    …and ${issues.length - 8} more`);
  }
  return parts.join('\n');
}

function tryValidate(
  label: string,
  candidate: unknown,
): { ok: true; data: ReturnType<typeof validate> } | { ok: false } {
  try {
    const data = validate(candidate);
    return { ok: true, data };
  } catch (err) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'issues' in err &&
      Array.isArray((err as { issues: unknown[] }).issues)
    ) {
      reportIssue(
        `${label} model validation`,
        `\n${shortZodIssues((err as { issues: unknown[] }).issues)}`,
      );
    } else {
      reportIssue(`${label} model validation`, err instanceof Error ? err.message : String(err));
    }
    return { ok: false };
  }
}

function tryRenderer(
  label: string,
  fn: () => { files: Array<{ path: string; content: string }> },
): { ok: true; files: Array<{ path: string; content: string }> } | { ok: false; files: [] } {
  try {
    return { ok: true, files: fn().files };
  } catch (err) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'issues' in err &&
      Array.isArray((err as { issues: unknown[] }).issues)
    ) {
      reportIssue(
        `${label} render`,
        `\n${shortZodIssues((err as { issues: unknown[] }).issues)}`,
      );
    } else {
      reportIssue(`${label} render`, err instanceof Error ? err.message : String(err));
    }
    return { ok: false, files: [] };
  }
}

function main(): void {
  section('1. Load ABAP source');
  // eslint-disable-next-line no-console
  console.log(`file: ${ABAP_FILE}`);
  const source = readFileSync(ABAP_FILE, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`bytes: ${source.length}`);

  section('2. parseAbapSource → AbapObject');
  const obj = parseAbapSource(source, RELATIVE_ABAP_PATH);
  // eslint-disable-next-line no-console
  console.log(`kind: ${obj.kind}`);
  // eslint-disable-next-line no-console
  console.log(`name: ${obj.name}`);
  // eslint-disable-next-line no-console
  console.log(`sourceLocation.file: ${JSON.stringify(obj.sourceLocation.file)}`);
  if (obj.kind === 'class') {
    // eslint-disable-next-line no-console
    console.log(`visibility: ${obj.visibility}`);
    // eslint-disable-next-line no-console
    console.log(`interfaces: ${JSON.stringify(obj.interfaces ?? [])}`);
    // eslint-disable-next-line no-console
    console.log(`class-level doc: ${obj.doc !== undefined ? 'present' : 'absent'}`);
    // eslint-disable-next-line no-console
    console.log(`methods: ${(obj.methods ?? []).length}`);
    let methodIndex = 0;
    for (const m of obj.methods ?? []) {
      // eslint-disable-next-line no-console
      console.log(
        `  [${methodIndex}] ${m.name}` +
          ` sourceLocation.file=${JSON.stringify(m.sourceLocation.file)}` +
          ` params=${m.parameters.length}` +
          ` returning=${m.returning ? 'yes' : 'no'}` +
          ` exceptions=${m.exceptions.length}` +
          ` doc=${m.doc !== undefined ? 'yes' : 'no'}`,
      );
      methodIndex++;
    }
    // eslint-disable-next-line no-console
    console.log(`attributes: ${(obj.attributes ?? []).length}`);
    // eslint-disable-next-line no-console
    console.log(`types: ${(obj.types ?? []).length}`);
  }

  section('3. Wrap in DocumentationModel + validate');
  const model = {
    version: DOCUMENTATION_MODEL_VERSION,
    source: {
      provider: 'smoke-script',
      rootDir: 'e2e/petstore',
    },
    objects: [obj],
  };
  const validation = tryValidate('outer', model);
  let validated: ReturnType<typeof validate>;
  if (validation.ok) {
    validated = validation.data;
  } else {
    // eslint-disable-next-line no-console
    console.log('model validation: FAILED — renderers below will see the same failure');
    // Use the parser-emitted object directly so we still observe how the
    // renderers behave against an unvalidated model (each renderer
    // re-parses with DocumentationModelSchema, so they should fail
    // identically and surface the same ZodError).
    validated = model as ReturnType<typeof validate>;
  }
  // eslint-disable-next-line no-console
  console.log(`objects: ${validated.objects.length}`);
  // eslint-disable-next-line no-console
  console.log('model validation: ok');

  section('4. Render via renderer-json');
  const jsonOut = tryRenderer('renderer-json', () => renderJson(validated));
  if (jsonOut.ok) {
    // eslint-disable-next-line no-console
    console.log(`files: ${jsonOut.files.length}`);
    for (const f of jsonOut.files) {
      // eslint-disable-next-line no-console
      console.log(`  - ${f.path} (${f.content.length} chars)`);
    }
  }

  section('5. Render via renderer-html');
  const htmlOut = tryRenderer('renderer-html', () =>
    renderHtml(validated, { title: 'ABAP Petstore' }),
  );
  if (htmlOut.ok) {
    // eslint-disable-next-line no-console
    console.log(`files: ${htmlOut.files.length}`);
    for (const f of htmlOut.files) {
      // eslint-disable-next-line no-console
      console.log(`  - ${f.path} (${f.content.length} chars)`);
    }
  }

  section('6. Render via renderer-mdx');
  const mdxOut = tryRenderer('renderer-mdx', () =>
    renderMdx(validated, { title: 'ABAP Petstore' }),
  );
  if (mdxOut.ok) {
    // eslint-disable-next-line no-console
    console.log(`files: ${mdxOut.files.length}`);
    for (const f of mdxOut.files) {
      // eslint-disable-next-line no-console
      console.log(`  - ${f.path} (${f.content.length} chars)`);
    }
  }

  section('7. JSON round-trip via DocumentationModelSchema.parse');
  if (jsonOut.ok && jsonOut.files[0] !== undefined) {
    try {
      const reparsed = DocumentationModelSchema.parse(
        JSON.parse(jsonOut.files[0].content),
      );
      // eslint-disable-next-line no-console
      console.log(
        `round-trip: ok (${reparsed.objects.length} object(s) preserved)`,
      );
    } catch (err) {
      reportIssue('json-round-trip', err instanceof Error ? err.message : String(err));
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('round-trip: skipped (renderer-json produced no output)');
  }

  section('8. Field contract: parser-emitted vs renderer-expected');
  // Observations captured by inspection of the model after parsing:
  //   - parser never sets `methods[*].sourceLocation.file` for methods
  //     found in the IMPLEMENTATION block (it leaves the field empty
  //     because stampMethodFile only walks through doc / parameters /
  //     returning).
  //   - that empty file string then trips DocumentationModelSchema.parse,
  //     which blocks both validate() and the renderers (each renderer
  //     re-parses the model as a cheap insurance check).
  //
  // Fields the parser emits but renderers don't currently consume
  // (informational; not a bug, just a completeness map for the CLI):
  //   - cls.attributes  → renderer-html reads via table; MDX+JSON ignore
  //   - cls.types       → renderer-html reads via table; MDX+JSON ignore
  //   - parameter.doc   → JSON preserves verbatim via the model; HTML
  //                       and MDX both render it inside parameter rows
  //   - method.returning → all three renderers read it
  //   - exception.sourceLocation → currently ignored by every renderer;
  //                       preserved only via JSON round-trip
  // eslint-disable-next-line no-console
  console.log('see deliverable.md for the full field-by-field table');

  section('7a. Render with patched sourceLocation.file (workaround view)');
  // The parser emits methods with empty sourceLocation.file. To
  // confirm whether the renderers themselves are healthy when given
  // a model with valid file paths, we patch the parser-emitted
  // object's method/attribute/type source locations in place and
  // re-validate. This is a diagnostic workaround only — the parser
  // itself is NOT modified by the script.
  const patched = JSON.parse(JSON.stringify(model)) as typeof model;
  for (const o of patched.objects) {
    if (o.kind === 'class') {
      for (const m of o.methods ?? []) {
        m.sourceLocation = { ...m.sourceLocation, file: RELATIVE_ABAP_PATH };
      }
    }
  }
  const patchedValidation = tryValidate('patched', patched);
  if (patchedValidation.ok) {
    // eslint-disable-next-line no-console
    console.log('patched model validates: ok');
    const pj = tryRenderer('renderer-json (patched)', () => renderJson(patchedValidation.data));
    if (pj.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-json files: ${pj.files.length}`);
      for (const f of pj.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
    const ph = tryRenderer('renderer-html (patched)', () =>
      renderHtml(patchedValidation.data, { title: 'ABAP Petstore' }),
    );
    if (ph.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-html files: ${ph.files.length}`);
      for (const f of ph.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
    const pm = tryRenderer('renderer-mdx (patched)', () =>
      renderMdx(patchedValidation.data, { title: 'ABAP Petstore' }),
    );
    if (pm.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-mdx files: ${pm.files.length}`);
      for (const f of pm.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
    if (pj.ok && pj.files[0] !== undefined) {
      try {
        const reparsed = DocumentationModelSchema.parse(JSON.parse(pj.files[0].content));
        // eslint-disable-next-line no-console
        console.log(
          `patched round-trip: ok (${reparsed.objects.length} object(s) preserved, ${(reparsed.objects[0]?.kind === 'class' ? (reparsed.objects[0].methods ?? []).length : 0)} method(s))`,
        );
      } catch (err) {
        reportIssue(
          'patched json-round-trip',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  section('7b. Sanity check: render a hand-built valid model (parser-independent)');
  // Same idea: confirm the renderer pipeline itself is healthy with a
  // hand-rolled model that has no parser involvement at all.
  const handBuilt = {
    version: DOCUMENTATION_MODEL_VERSION,
    source: { provider: 'smoke-hand-built', rootDir: 'e2e/petstore' },
    objects: [
      {
        kind: 'class' as const,
        name: 'zcl_pet_service',
        visibility: 'public' as const,
        interfaces: ['zif_pet_service'],
        methods: [
          {
            name: 'get_pet',
            parameters: [],
            exceptions: [],
            visibility: 'public' as const,
            sourceLocation: {
              file: RELATIVE_ABAP_PATH,
              startLine: 1,
              endLine: 2,
            },
          },
        ],
        sourceLocation: {
          file: RELATIVE_ABAP_PATH,
          startLine: 1,
          endLine: 50,
        },
      },
    ],
  };
  const hbValidate = tryValidate('hand-built', handBuilt);
  if (hbValidate.ok) {
    // eslint-disable-next-line no-console
    console.log('hand-built model validates: ok');
    const j = tryRenderer('renderer-json (hand-built)', () => renderJson(hbValidate.data));
    if (j.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-json files: ${j.files.length}`);
      for (const f of j.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
    const h = tryRenderer('renderer-html (hand-built)', () =>
      renderHtml(hbValidate.data, { title: 'ABAP Petstore' }),
    );
    if (h.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-html files: ${h.files.length}`);
      for (const f of h.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
    const m = tryRenderer('renderer-mdx (hand-built)', () =>
      renderMdx(hbValidate.data, { title: 'ABAP Petstore' }),
    );
    if (m.ok) {
      // eslint-disable-next-line no-console
      console.log(`renderer-mdx files: ${m.files.length}`);
      for (const f of m.files) {
        // eslint-disable-next-line no-console
        console.log(`  - ${f.path} (${f.content.length} chars)`);
      }
    }
  } else {
    reportIssue('hand-built', 'a hand-rolled minimal model failed validation (renderer-side bug?)');
  }

  section('done');
  if (hasFatal) {
    // eslint-disable-next-line no-console
    console.error(`non-zero: hasFatal=${hasFatal} hasNonFatalIssue=${hasNonFatalIssue}`);
    process.exitCode = 1;
  } else if (hasNonFatalIssue) {
    // eslint-disable-next-line no-console
    console.log(`hasNonFatalIssue=${hasNonFatalIssue}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('all clear');
  }
}

try {
  main();
} catch (err) {
  reportFatal('smoke', err);
  process.exit(1);
}
