import { describe, expect, it } from 'vitest';
import { documentationModelJsonSchema } from './json-schema';

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
    (kindNode && (kindNode.enum ?? (kindNode.const !== undefined ? [kindNode.const] : undefined))) ?? undefined;
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
            ...findTypeRefLikeNodes(entry as JsonSchemaNode, [...path, key, String(idx)]),
          );
        }
      });
    } else if (typeof child === 'object') {
      hits.push(
        ...findTypeRefLikeNodes(child as JsonSchemaNode, [...path, key]),
      );
    }
  }

  return hits;
}

function getNodeAtPath(root: JsonSchemaNode, refPath: string): JsonSchemaNode | undefined {
  // Refs look like "#/definitions/Foo/properties/bar". Skip the leading "#".
  const segments = refPath.replace(/^#\//, '').split('/').map((s) =>
    s.replace(/~1/g, '/').replace(/~0/g, '~'),
  );
  let current: unknown = root;
  for (const seg of segments) {
    if (current && typeof current === 'object' && seg in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current as JsonSchemaNode | undefined;
}

describe('documentationModelJsonSchema', () => {
  it('hoists sub-schemas into a top-level definitions block', () => {
    const schema = documentationModelJsonSchema as unknown as JsonSchema;
    const hasDefinitions =
      schema.definitions !== undefined || schema.$defs !== undefined;
    expect(hasDefinitions).toBe(true);
    expect(schema.definitions ?? schema.$defs).toBeTypeOf('object');
  });

  it('represents TypeRef.fields as a $ref rather than an inline schema or any fallback', () => {
    const schema = documentationModelJsonSchema as unknown as JsonSchema;
    const typeRefs = findTypeRefLikeNodes(schema);

    expect(typeRefs.length).toBeGreaterThan(0);

    const serialized = JSON.stringify(schema);
    expect(serialized).not.toContain('"any"');
    // zod-to-json-schema signals the 'any' fallback via console.warn; verify
    // the schema string does not carry the degraded marker.
    expect(serialized).not.toMatch(/"additionalProperties"\s*:\s*true/);

    for (const { node } of typeRefs) {
      const fields = node.properties!.fields!;
      expect(fields.type).toBe('array');
      expect(fields.items).toBeDefined();
      const items = fields.items!;
      expect(items.$ref).toBeTypeOf('string');

      // The $ref must point back to a TypeRef-shaped definition (the recursive
      // back-edge), proving the cycle is preserved end-to-end.
      const target = getNodeAtPath(schema, items.$ref!);
      expect(target).toBeDefined();
      expect(target!.type).toBe('object');
      expect(target!.properties?.fields?.type).toBe('array');
      const targetKindEnum =
        target!.properties?.kind?.enum ?? target!.properties?.kind?.const;
      expect(Array.isArray(targetKindEnum)).toBe(true);
    }
  });

  it('emits at least one TypeRef reachable from the top-level definitions', () => {
    const schema = documentationModelJsonSchema as unknown as JsonSchema;
    const definitions = schema.definitions ?? schema.$defs ?? {};
    const definitionValues = Object.values(definitions);

    // Walk the entire definitions block and confirm at least one of the
    // hoisted definitions is the recursive TypeRef shape.
    const fromDefs: Array<{ node: JsonSchemaNode; path: string[] }> = [];
    for (const def of definitionValues) {
      fromDefs.push(...findTypeRefLikeNodes(def));
    }
    expect(fromDefs.length).toBeGreaterThan(0);

    // Every TypeRef-shaped definition found under definitions must use a
    // $ref for its recursive `fields` array.
    for (const found of fromDefs) {
      const def = found.node;
      const fields = def.properties!.fields!;
      expect(fields.type).toBe('array');
      expect(fields.items?.$ref).toBeTypeOf('string');
    }
  });
});