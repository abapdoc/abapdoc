/**
 * ABAP interface parser.
 *
 * Reads an interface source file (`*.intf.abap`) and emits an
 * {@link Interface}. Recognised sections:
 *
 *   INTERFACE <name> [PUBLIC].
 *     TYPES: BEGIN OF … / TYPES <name> TYPE … .
 *     METHODS:
 *       <name>
 *         IMPORTING <name> TYPE …
 *         RETURNING VALUE(<name>) TYPE …
 *         RAISING <exception>,
 *       <next name> …
 *         …
 *   ENDINTERFACE.
 *
 * METHOD declarations inside the `METHODS:` block are comma-
 * separated. Each method's signature is the comma-bounded slice of
 * lines between the previous `,` (or the `METHODS:` line) and the
 * next `,`. The block ends when a line ends with `.` AND does not
 * start a new clause keyword.
 *
 * v0 treats interface methods as `isInterfaceMethod: true`.
 */

import type { Interface, Method, Parameter } from '@abapdoc/model';

import {
  keyword,
  stripTrailingComment,
  tokenizeStatement,
} from '../line-utils.js';
import { parseDocBlockFromLines } from '../doc-block/doc-block-parser.js';

export interface InterfaceParseResult {
  intf: Interface;
  endIndex: number;
}

export function parseInterface(
  lines: readonly string[]
): InterfaceParseResult | undefined {
  let startIndex = -1;
  let name = '';
  for (let i = 0; i < lines.length; i++) {
    const upper = keyword(lines[i] ?? '');
    if (upper.startsWith('INTERFACE ')) {
      const tokens = tokenizeStatement(stripTrailingComment(lines[i] ?? ''));
      if (tokens.length >= 2) {
        name = tokens[1] ?? '';
        startIndex = i;
        break;
      }
    }
  }
  if (startIndex === -1) {
    return undefined;
  }

  const doc = parseDocBlockFromLines(lines, startIndex + 1, '');

  const types: { name: string; type: string }[] = [];
  const methods: Method[] = [];

  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const stripped = stripTrailingComment(lines[i] ?? '');
    const upper = keyword(stripped);

    if (upper.startsWith('ENDINTERFACE')) {
      break;
    }

    if (upper.startsWith('TYPES')) {
      const parsed = parseInterfaceTypeLine(stripped);
      if (parsed !== undefined) {
        types.push(parsed);
      }
      continue;
    }

    if (upper.startsWith('METHODS') || upper.startsWith('CLASS-METHODS')) {
      const block = parseMethodsBlock(lines, i);
      methods.push(...block.methods);
      i = block.endIndex;
      continue;
    }
  }

  const intf: Interface = {
    kind: 'interface',
    name,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine: i + 1 },
  };
  if (types.length > 0) {
    intf.types = types.map((t) => ({ name: t.name, type: t.type }));
  }
  if (methods.length > 0) {
    intf.methods = methods;
  }
  if (doc !== undefined) {
    intf.doc = doc;
  }
  return { intf, endIndex: i };
}

function parseInterfaceTypeLine(
  line: string
): { name: string; type: string } | undefined {
  const tokens = tokenizeStatement(line);
  if (tokens.length < 2 || tokens[0]?.toUpperCase() !== 'TYPES') {
    return undefined;
  }
  const first = tokens[1] ?? '';
  if (first.toUpperCase() === 'BEGIN' && tokens[2]?.toUpperCase() === 'OF') {
    const name = tokens[3] ?? '';
    return { name, type: 'structure' };
  }
  const name = first;
  const typeIdx = tokens.findIndex(
    (t, idx) => idx > 1 && t.toUpperCase() === 'TYPE'
  );
  if (typeIdx === -1 || typeIdx + 1 >= tokens.length) {
    return { name, type: '' };
  }
  const type = tokens.slice(typeIdx + 1).join(' ');
  return { name, type };
}

/** A pending method-signature slice carried while we walk the METHODS block. */
interface Slice {
  lines: string[];
  sourceLines: number[];
}

interface MethodsBlockResult {
  methods: Method[];
  endIndex: number;
}

/**
 * Parse a `METHODS:` block. Methods are comma-separated slices of
 * the block's lines. Each slice becomes a {@link Method}. The block
 * ends at the first line that ends with `.` AND is not the start of
 * another clause (i.e. the signature ends).
 */
function parseMethodsBlock(
  lines: readonly string[],
  startIndex: number
): MethodsBlockResult {
  const methods: Method[] = [];
  let slice: Slice = { lines: [], sourceLines: [] };

  // The METHODS: header may or may not carry the first method name.
  const headerTokens = tokenizeStatement(
    stripTrailingComment(lines[startIndex] ?? '')
  );
  if (headerTokens.length >= 2 && !isClauseKeyword(headerTokens[1])) {
    slice.lines.push(lines[startIndex] ?? '');
    slice.sourceLines.push(startIndex + 1);
  }

  let i = startIndex + 1;
  let blockEnded = false;

  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('ENDINTERFACE')) {
      i--;
      break;
    }
    if (upper.startsWith('METHODS') || upper.startsWith('CLASS-METHODS')) {
      i--;
      break;
    }
    if (upper.startsWith('TYPES') || upper.startsWith('DATA')) {
      i--;
      break;
    }

    slice.lines.push(stripped);
    slice.sourceLines.push(i + 1);

    const endsWithComma = stripped.trimEnd().endsWith(',');
    const endsWithDot = stripped.trimEnd().endsWith('.');

    if (endsWithComma) {
      methods.push(sliceToMethod(lines, slice));
      slice = { lines: [], sourceLines: [] };
      continue;
    }
    if (endsWithDot) {
      methods.push(sliceToMethod(lines, slice));
      blockEnded = true;
      break;
    }
  }

  if (!blockEnded && slice.lines.length > 0) {
    methods.push(sliceToMethod(lines, slice));
  }

  return { methods, endIndex: i };
}

function sliceToMethod(parent: readonly string[], slice: Slice): Method {
  const sourceStart = slice.sourceLines[0] ?? 1;
  const sourceEnd =
    slice.sourceLines[slice.sourceLines.length - 1] ?? sourceStart;

  // Pull the method name from the first token of the slice.
  const firstLine = slice.lines[0] ?? '';
  const firstTokens = tokenizeStatement(firstLine);
  let methodName: string;
  let nameIdx = 1;
  if (
    (firstTokens[0]?.toUpperCase() === 'METHODS' ||
      firstTokens[0]?.toUpperCase() === 'CLASS-METHODS') &&
    !isClauseKeyword(firstTokens[1])
  ) {
    methodName = firstTokens[1] ?? '';
    nameIdx = 2;
  } else {
    methodName = firstTokens[0] ?? '';
    nameIdx = 1;
  }

  const parameters: Parameter[] = [];
  let returning: Parameter | undefined;
  const exceptions: Method['exceptions'] = [];

  // Flatten the method slice into a token stream, carrying the 1-based
  // source line that introduced each token. A clause keyword
  // (IMPORTING/EXPORTING/CHANGING/RETURNING/RAISING) starts a new clause,
  // so signatures that split the keyword onto one line and the value
  // onto the next are handled the same as single-line signatures.
  const tokens: { value: string; sourceLine: number }[] = [];
  for (let k = 0; k < slice.lines.length; k++) {
    const lineTokens = tokenizeStatement(slice.lines[k] ?? '');
    const start = k === 0 ? nameIdx : 0;
    for (let t = start; t < lineTokens.length; t++) {
      tokens.push({
        value: lineTokens[t] ?? '',
        sourceLine: slice.sourceLines[k] ?? sourceStart,
      });
    }
  }

  let clauseTokens: typeof tokens = [];
  let clauseSourceLine = sourceStart;

  const flushClause = (): void => {
    if (clauseTokens.length === 0) {
      return;
    }
    const clauseFirst = (clauseTokens[0]?.value ?? '').toUpperCase();

    if (clauseFirst === 'RAISING') {
      for (let m = 1; m < clauseTokens.length; m++) {
        const tok = clauseTokens[m]?.value ?? '';
        if (tok.length > 0) {
          exceptions.push({ name: tok });
        }
      }
      clauseTokens = [];
      return;
    }

    if (
      clauseFirst === 'IMPORTING' ||
      clauseFirst === 'EXPORTING' ||
      clauseFirst === 'CHANGING' ||
      clauseFirst === 'RETURNING'
    ) {
      const direction = clauseFirst.toLowerCase() as Parameter['direction'];
      const idx = 1;
      let paramName = clauseTokens[idx]?.value ?? '';
      if (
        paramName.toUpperCase() === 'VALUE' &&
        clauseTokens[idx + 1]?.value?.startsWith('(')
      ) {
        let j = idx + 1;
        while (
          j < clauseTokens.length &&
          !clauseTokens[j]?.value?.endsWith(')')
        ) {
          j++;
        }
        paramName = clauseTokens[j - 1]?.value ?? '';
      }
      const typeIdx = clauseTokens.findIndex(
        (t, i2) => i2 > idx && t.value.toUpperCase() === 'TYPE'
      );
      const type =
        typeIdx !== -1 && typeIdx + 1 < clauseTokens.length
          ? clauseTokens
              .slice(typeIdx + 1)
              .map((t) => t.value)
              .join(' ')
          : 'any';
      const parameter: Parameter = { name: paramName, direction, type };
      const doc = parseDocBlockFromLines(parent, clauseSourceLine + 1, '');
      if (doc !== undefined) {
        parameter.doc = doc;
      }
      if (direction === 'returning') {
        returning = parameter;
      } else {
        parameters.push(parameter);
      }
    }
    clauseTokens = [];
  };

  for (const token of tokens) {
    if (isClauseKeyword(token.value)) {
      flushClause();
      clauseTokens = [token];
      clauseSourceLine = token.sourceLine;
    } else {
      clauseTokens.push(token);
    }
  }
  flushClause();

  const method: Method = {
    name: methodName,
    parameters: parameters.filter((p) => p.name.length > 0),
    exceptions,
    visibility: 'public',
    isInterfaceMethod: true,
    sourceLocation: { file: '', startLine: sourceStart, endLine: sourceEnd },
  };
  if (returning !== undefined && returning.name.length > 0) {
    method.returning = returning;
  }
  return method;
}

function isClauseKeyword(token: string | undefined): boolean {
  if (token === undefined) {
    return false;
  }
  const upper = token.toUpperCase();
  return (
    upper === 'IMPORTING' ||
    upper === 'EXPORTING' ||
    upper === 'CHANGING' ||
    upper === 'RETURNING' ||
    upper === 'RAISING'
  );
}
