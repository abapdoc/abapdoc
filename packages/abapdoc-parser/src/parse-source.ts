/**
 * Top-level entry point: `parseAbapSource(source, filePath)`.
 *
 * Splits the source, runs file-kind detection, delegates to the
 * per-kind parser, and stamps the resulting {@link AbapObject}'s
 * `sourceLocation.file` with the given `filePath`.
 */

import type { AbapObject } from '@abapdoc/model';

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
        result.cls.sourceLocation = stampFile(result.cls.sourceLocation, filePath);
        if (result.cls.doc !== undefined) {
          result.cls.doc = { ...result.cls.doc, sourceLocation: stampFile(result.cls.doc.sourceLocation, filePath) };
        }
        if (result.cls.attributes !== undefined) {
          result.cls.attributes = result.cls.attributes.map((a) => stampAttrFile(a, filePath));
        }
        if (result.cls.types !== undefined) {
          result.cls.types = result.cls.types.map((t) => stampTypeFile(t, filePath));
        }
        if (result.cls.methods !== undefined) {
          result.cls.methods = result.cls.methods.map((m) => stampMethodFile(m, filePath));
        }
        obj = result.cls;
      }
      break;
    }
    case 'interface': {
      const result = parseInterface(lines);
      if (result !== undefined) {
        result.intf.sourceLocation = stampFile(result.intf.sourceLocation, filePath);
        if (result.intf.doc !== undefined) {
          result.intf.doc = { ...result.intf.doc, sourceLocation: stampFile(result.intf.doc.sourceLocation, filePath) };
        }
        if (result.intf.methods !== undefined) {
          result.intf.methods = result.intf.methods.map((m) => stampMethodFile(m, filePath));
        }
        obj = result.intf;
      }
      break;
    }
    case 'function-module': {
      const result = parseFunctionModule(lines);
      if (result !== undefined) {
        result.fm.sourceLocation = stampFile(result.fm.sourceLocation, filePath);
        if (result.fm.doc !== undefined) {
          result.fm.doc = { ...result.fm.doc, sourceLocation: stampFile(result.fm.doc.sourceLocation, filePath) };
        }
        for (const p of result.fm.parameters) {
          if (p.doc !== undefined) {
            p.doc = { ...p.doc, sourceLocation: stampFile(p.doc.sourceLocation, filePath) };
          }
        }
        obj = result.fm;
      }
      break;
    }
    case 'program': {
      const result = parseProgram(lines);
      if (result !== undefined) {
        result.sourceLocation = stampFile(result.sourceLocation, filePath);
        if (result.doc !== undefined) {
          result.doc = { ...result.doc, sourceLocation: stampFile(result.doc.sourceLocation, filePath) };
        }
        obj = result;
      }
      break;
    }
    case 'structure': {
      const result = parseStructure(lines);
      if (result !== undefined) {
        result.sourceLocation = stampFile(result.sourceLocation, filePath);
        if (result.doc !== undefined) {
          result.doc = { ...result.doc, sourceLocation: stampFile(result.doc.sourceLocation, filePath) };
        }
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

  return obj;
}

function stampFile(
  loc: { file: string; startLine: number; endLine: number },
  filePath: string,
): { file: string; startLine: number; endLine: number } {
  return { file: filePath, startLine: loc.startLine, endLine: loc.endLine };
}

function stampAttrFile<T extends { name: string; doc?: { sourceLocation: { file: string; startLine: number; endLine: number } } | undefined }>(attr: T, filePath: string): T {
  if (attr.doc !== undefined) {
    attr.doc = { ...attr.doc, sourceLocation: stampFile(attr.doc.sourceLocation, filePath) };
  }
  return attr;
}

function stampTypeFile<T extends { name: string; doc?: { sourceLocation: { file: string; startLine: number; endLine: number } } | undefined }>(t: T, filePath: string): T {
  if (t.doc !== undefined) {
    t.doc = { ...t.doc, sourceLocation: stampFile(t.doc.sourceLocation, filePath) };
  }
  return t;
}

function stampMethodFile<T extends {
  name: string;
  sourceLocation: { file: string; startLine: number; endLine: number };
  parameters: Array<{ doc?: { sourceLocation: { file: string; startLine: number; endLine: number } } | undefined }>;
  returning?: { doc?: { sourceLocation: { file: string; startLine: number; endLine: number } } | undefined };
  doc?: { sourceLocation: { file: string; startLine: number; endLine: number } };
}>(m: T, filePath: string): T {
  // Stamp the method's own sourceLocation.file (the per-kind parser
  // emits an empty string here; we set it from the caller-known path).
  m.sourceLocation = stampFile(m.sourceLocation, filePath);
  if (m.doc !== undefined) {
    m.doc = { ...m.doc, sourceLocation: stampFile(m.doc.sourceLocation, filePath) };
  }
  for (const p of m.parameters) {
    if (p.doc !== undefined) {
      p.doc = { ...p.doc, sourceLocation: stampFile(p.doc.sourceLocation, filePath) };
    }
  }
  if (m.returning !== undefined && m.returning.doc !== undefined) {
    m.returning = { ...m.returning, doc: { ...m.returning.doc, sourceLocation: stampFile(m.returning.doc.sourceLocation, filePath) } };
  }
  return m;
}

function deriveNameFromPath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  return base.replace(/\.(abap|xml)$/u, '');
}