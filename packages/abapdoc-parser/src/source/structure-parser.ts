/**
 * ABAP structure / DDIC parser.
 *
 * Reads a `.tabl.abap` or `.struc.abap` source file and emits a
 * {@link Structure} or {@link Table} depending on the leading TYPES
 * block. v0 captures the type name and the raw type expression only;
 * per-field `TypeRef`s are emitted with `kind: 'custom'` so downstream
 * renderers still get a structured shape.
 *
 * DDIC XML files (`.tabl.xml`) are out of scope here — see
 * `@abapdoc/extractor` (Cycle 3).
 */

import type {
  Structure,
  Table,
  TypeRef,
} from '@abapdoc/model';

import { keyword, stripTrailingComment, tokenizeStatement } from '../line-utils.js';
import { parseDocBlockFromLines } from '../doc-block/doc-block-parser.js';

export function parseStructure(lines: readonly string[]): Structure | undefined {
  const result = parseTypeBlock(lines, 'structure');
  return result?.kind === 'structure' ? result : undefined;
}

export function parseTable(lines: readonly string[]): Table | undefined {
  const result = parseTypeBlock(lines, 'table');
  return result?.kind === 'table' ? result : undefined;
}

function parseTypeBlock(
  lines: readonly string[],
  kind: 'structure' | 'table',
): Structure | Table | undefined {
  // Find a `TYPES: BEGIN OF <name>` block.
  let startIndex = -1;
  let name = '';
  for (let i = 0; i < lines.length; i++) {
    const upper = keyword(lines[i] ?? '');
    if (upper.startsWith('TYPES:') || upper.startsWith('TYPES ')) {
      const tokens = tokenizeStatement(stripTrailingComment(lines[i] ?? ''));
      // TYPES: BEGIN OF <name>  OR  TYPES <name> TYPE …
      if (
        tokens.length >= 4 &&
        tokens[1]?.toUpperCase() === 'BEGIN' &&
        tokens[2]?.toUpperCase() === 'OF'
      ) {
        name = tokens[3] ?? '';
        startIndex = i;
        break;
      }
    }
  }
  if (startIndex === -1) {
    return undefined;
  }

  const doc = parseDocBlockFromLines(lines, startIndex + 1, '');

  // Walk to `END OF <name>.` collecting field lines.
  const fields: TypeRef[] = [];
  let i = startIndex + 1;
  let endLine = startIndex + 1;
  for (; i < lines.length; i++) {
    const stripped = stripTrailingComment(lines[i] ?? '');
    const upper = keyword(stripped);
    if (upper.startsWith('END OF')) {
      endLine = i + 1;
      break;
    }
    const field = parseFieldLine(stripped);
    if (field !== undefined) {
      fields.push(field);
    }
  }

  if (kind === 'table') {
    const t: Table = {
      kind: 'table',
      name,
      fields,
      sourceLocation: { file: '', startLine: startIndex + 1, endLine },
    };
    if (doc !== undefined) {
      t.doc = doc;
    }
    return t;
  }
  const s: Structure = {
    kind: 'structure',
    name,
    fields,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine },
  };
  if (doc !== undefined) {
    s.doc = doc;
  }
  return s;
}

function parseFieldLine(line: string): TypeRef | undefined {
  const tokens = tokenizeStatement(line);
  if (tokens.length < 4) {
    return undefined;
  }
  if (tokens[0]?.toUpperCase() !== 'DATA') {
    // Bare `<name> TYPE <type>` is also valid inside a TYPES block
    // (mixed `DATA` and field shorthand).
    if (tokens[0]?.toUpperCase() === 'INCLUDE') {
      // INCLUDE TYPE <name> — capture the referenced type as custom.
      const typeIdx = tokens.findIndex((t, idx) => idx > 0 && t.toUpperCase() === 'TYPE');
      if (typeIdx !== -1 && typeIdx + 1 < tokens.length) {
        return { kind: 'custom', name: tokens.slice(typeIdx + 1).join(' ') };
      }
      return undefined;
    }
  }
  const nameIdx = tokens[0]?.toUpperCase() === 'DATA' ? 1 : 0;
  const name = tokens[nameIdx];
  if (name === undefined || name.length === 0) {
    return undefined;
  }
  const typeIdx = tokens.findIndex((t, idx) => idx > nameIdx && t.toUpperCase() === 'TYPE');
  if (typeIdx === -1 || typeIdx + 1 >= tokens.length) {
    return undefined;
  }
  const rawType = tokens.slice(typeIdx + 1).join(' ');
  return { kind: 'custom', name: rawType };
}