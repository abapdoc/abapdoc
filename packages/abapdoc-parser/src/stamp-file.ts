/**
 * Helper: stamp `file` onto every DocBlock's `sourceLocation.file` in
 * a tree of AbapObjects.
 *
 * Per-kind parsers emit DocBlocks with `file: ''` (they don't know the
 * enclosing source path). After parsing the full source we walk the
 * result tree and stamp the path in one place.
 */

import type { AbapObject, DocBlock } from '@abapdoc/model';

function stampDocBlock(doc: DocBlock, file: string): DocBlock {
  return {
    ...doc,
    sourceLocation: { ...doc.sourceLocation, file },
  };
}

/**
 * Recursively stamp `file` onto every DocBlock.sourceLocation.file in
 * `obj`. Returns a new object tree; the original is not mutated.
 */
export function stampFileOnDocBlocks(obj: AbapObject, file: string): AbapObject {
  // We deliberately use a deep clone + stamp so consumers get a tree
  // with no `file: ''` placeholders.
  const clone = structuredClone(obj);
  walk(clone, file);
  return clone;
}

function walk(node: unknown, file: string): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  const n = node as Record<string, unknown>;
  if ('sourceLocation' in n && n.sourceLocation !== null && typeof n.sourceLocation === 'object') {
    const sl = n.sourceLocation as Record<string, unknown>;
    // Only stamp DocBlock-shaped sourceLocations (those have summary/tags).
    if ('summary' in n || 'tags' in n) {
      sl.file = file;
    }
  }
  for (const key of Object.keys(n)) {
    const v = n[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        walk(item, file);
      }
    } else if (typeof v === 'object' && v !== null) {
      walk(v, file);
    }
  }
}

/** Stamp `file` onto `doc` in place. Convenience wrapper. */
export function stampDocBlockFile(doc: DocBlock, file: string): DocBlock {
  return stampDocBlock(doc, file);
}