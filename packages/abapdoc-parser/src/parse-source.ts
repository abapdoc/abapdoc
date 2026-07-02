/**
 * Top-level entry point: `parseAbapSource(source, filePath)`.
 *
 * Splits the source, runs file-kind detection, delegates to the
 * per-kind parser, and stamps the resulting {@link AbapObject}'s
 * `sourceLocation.file` with the given `filePath`.
 *
 * After per-kind parsing, we run a single recursive pass that stamps
 * `filePath` onto every DocBlock's `sourceLocation.file` in the
 * tree. Per-kind parsers emit DocBlocks with `file: ''` because they
 * don't know the enclosing path — the walker fills those in.
 */

import type { AbapObject } from '@abapdoc/model';

import { stampFileOnDocBlocks } from './stamp-file.js';
import { detectFileKind } from './source/file-detector.js';
import { parseClass } from './source/class-parser.js';
import { parseInterface } from './source/interface-parser.js';
import { parseFunctionModule } from './source/function-module-parser.js';
import { parseProgram } from './source/program-parser.js';
import { parseStructure } from './source/structure-parser.js';
import { splitSource } from './source/line-cursor.js';

export function parseAbapSource(source: string, filePath: string): AbapObject {
  const lines = splitSource(source);
  const kindResult = detectFileKind(lines);

  let obj: AbapObject | undefined;
  switch (kindResult.kind) {
    case 'class': {
      const result = parseClass(lines);
      if (result !== undefined) {
        obj = result.cls;
      }
      break;
    }
    case 'interface': {
      const result = parseInterface(lines);
      if (result !== undefined) {
        obj = result.intf;
      }
      break;
    }
    case 'function-module': {
      const result = parseFunctionModule(lines);
      if (result !== undefined) {
        obj = result.fm;
      }
      break;
    }
    case 'program': {
      const result = parseProgram(lines);
      if (result !== undefined) {
        obj = result;
      }
      break;
    }
    case 'structure': {
      const result = parseStructure(lines);
      if (result !== undefined) {
        obj = result;
      }
      break;
    }
  }

  if (obj === undefined) {
    // Fallback: emit an empty Structure so the model is never undefined.
    obj = {
      kind: 'structure',
      name: deriveNameFromPath(filePath),
      fields: [],
      sourceLocation: { file: filePath, startLine: 1, endLine: lines.length || 1 },
    };
  }

  // Single recursive pass: stamp `filePath` onto every node's
  // sourceLocation.file, and onto every DocBlock in the tree. This
  // replaces the per-kind manual stamping that was error-prone and
  // missed nested tags / parameters.
  return stampFileOnDocBlocks(stampSourceLocations(obj, filePath), filePath);
}

function stampSourceLocations(
  obj: AbapObject,
  filePath: string,
): AbapObject {
  // We use structuredClone to keep the operation pure. The walker
  // replaces each sourceLocation object with one carrying filePath.
  const clone = structuredClone(obj);
  walk(clone, filePath);
  return clone;
}

function walk(node: unknown, file: string): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  const n = node as Record<string, unknown>;
  if (
    'sourceLocation' in n
    && n.sourceLocation !== null
    && typeof n.sourceLocation === 'object'
  ) {
    const sl = n.sourceLocation as Record<string, unknown>;
    sl.file = file;
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

function deriveNameFromPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  return base.replace(/\.(abap|xml)$/u, '');
}