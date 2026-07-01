import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface JsonSchemaNode {
  $ref?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  additionalProperties?: boolean | JsonSchemaNode;
  required?: string[];
  definitions?: Record<string, JsonSchemaNode>;
  $defs?: Record<string, JsonSchemaNode>;
}

type JsonSchema = JsonSchemaNode & Record<string, unknown>;

/**
 * The emitted JSON Schema is copied into both `src/json-schema.json`
 * (the build artefact the dump script writes) and `dist/json-schema.json`
 * (the package the consumer actually downloads). Tests prefer the dist
 * copy because it is the public-facing surface; if the package has not
 * been built yet (e.g. the test was started from a clean checkout) fall
 * back to the source-of-truth copy next to the TS source.
 */
function readEmittedJsonSchema(): JsonSchema {
  const candidates = [
    resolve(__dirname, '../dist/json-schema.json'),
    resolve(__dirname, '../src/json-schema.json'),
  ];
  const found = candidates.find((p) => existsSync(p));
  expect(
    found,
    `expected one of:\n  ${candidates.join('\n  ')}\nto exist (run \`nx run abapdoc-model:build\` first)`,
  ).toBeTruthy();
  const raw = readFileSync(found!, 'utf8');
  return JSON.parse(raw) as JsonSchema;
}

/**
 * Walk a JSON Schema tree and yield every node that *looks like* a
 * TypeRef definition: an object schema with `properties.fields` and a
 * `properties.kind` whose value is an enum containing at least one of
 * the documented TypeRefKind literals. We can't rely on a path like
 * `definitions.TypeRef` because `$refStrategy: 'root'` inlines nested
 * schemas — TypeRef is reachable as a sub-property of a parent
 * definition rather than being hoisted to the top level.
 */
function findTypeRefLikeNodes(
  root: JsonSchemaNode,
  path: string[] = [],
): Array<{ node: JsonSchemaNode; path: string[] }> {
  const hits: Array<{ node: JsonSchemaNode; path: string[] }> = [];

  const kindNode = root.properties?.kind;
  const kindEnum =
    (kindNode &&
      (kindNode.enum ??
        (kindNode.const !== undefined ? [kindNode.const] : undefined))) ??
    undefined;
  const kindLooksLikeTypeRef =
    Array.isArray(kindEnum) &&
    kindEnum.some(
      (v) =>
        v === 'ddic-table' ||
        v === 'ddic-structure' ||
        v === 'data-element' ||
        v === 'builtin' ||
        v === 'custom',
    );

  if (
    root.type === 'object' &&
    root.properties?.fields !== undefined &&
    kindLooksLikeTypeRef
  ) {
    hits.push({ node: root, path });
  }

  for (const [key, child] of Object.entries(root)) {
    if (!child || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      child.forEach((entry, idx) => {
        if (entry && typeof entry === 'object') {
          hits.push(
            ...findTypeRefLikeNodes(entry as JsonSchemaNode, [
              ...path,
              key,
              String(idx),
            ]),
          );
        }
      });
    } else if (typeof child === 'object') {
      hits.push(...findTypeRefLikeNodes(child as JsonSchemaNode, [...path, key]));
    }
  }

  return hits;
}

describe('emitted json-schema.json (distributable artefact)', () => {
  it('is a parseable JSON document with a top-level definitions block', () => {
    const schema = readEmittedJsonSchema();

    expect(typeof schema).toBe('object');
    expect(schema).not.toBeNull();

    const hasDefinitions =
      schema.definitions !== undefined || schema.$defs !== undefined;
    expect(hasDefinitions).toBe(true);
    expect(schema.definitions ?? schema.$defs).toBeTypeOf('object');
  });

  it('contains at least one TypeRef-shaped definition whose `fields` is a $ref', () => {
    const schema = readEmittedJsonSchema();

    const typeRefs = findTypeRefLikeNodes(schema);
    expect(typeRefs.length).toBeGreaterThan(0);

    for (const { node } of typeRefs) {
      const fields = node.properties!.fields!;
      expect(fields.type).toBe('array');
      expect(fields.items).toBeDefined();
      const items = fields.items!;
      expect(items.$ref).toBeTypeOf('string');
      expect(items.$ref).toMatch(/^#\/definitions\//);
    }
  });
});