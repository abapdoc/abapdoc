/**
 * ABAP class parser.
 *
 * Reads one ABAP source file and emits a {@link Class}. Handles both
 * forms present in a typical `.clas.abap` file:
 *
 *   CLASS zcl_foo DEFINITION
 *     PUBLIC
 *     FINAL
 *     CREATE PUBLIC.
 *     PUBLIC SECTION.
 *       METHODS …
 *       DATA …
 *     ENDCLASS.
 *
 *   CLASS zcl_foo IMPLEMENTATION.
 *     METHOD bar.
 *       …
 *     ENDMETHOD.
 *   ENDCLASS.
 *
 * The parser walks the file linearly. The DEFINITION block is scanned
 * for visibility/superclass/interfaces/TYPES/DATA statements; the
 * IMPLEMENTATION block is scanned for METHOD … ENDMETHOD pairs and
 * the corresponding DocBlocks.
 *
 * The parser does NOT split the file into two passes — it scans once,
 * tracking which block is currently active. This keeps the line
 * cursor straightforward.
 */

import type {
  Attribute,
  Class,
  ExceptionRef,
  Method,
  MethodVisibility,
  Parameter,
  Visibility,
} from '@abapdoc/model';

import {
  keyword,
  stripTrailingComment,
  tokenizeStatement,
} from '../line-utils.js';
import {
  parseDocBlockFromLines,
} from '../doc-block/doc-block-parser.js';

interface ParseResult {
  cls: Class;
  /** Number of lines consumed (for tests). */
  endIndex: number;
}

/**
 * Parse one or two CLASS blocks from a source file and emit a single
 * {@link Class}. The function accepts lines split via {@link splitSource}.
 *
 * If the file contains only an IMPLEMENTATION block (rare — typically
 * an INCLUDE), the name/visibility are inferred from the
 * IMPLEMENTATION header.
 */
export function parseClass(lines: readonly string[]): ParseResult | undefined {
  let defBlock: Class | undefined;
  let implEndIndex = -1;

  // First pass: locate the DEFINITION block if present.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const upper = keyword(line);
    if (upper.startsWith('CLASS ') && upper.includes(' DEFINITION')) {
      const result = parseClassDefinition(lines, i);
      if (result !== undefined) {
        defBlock = result.cls;
        i = result.endIndex;
      }
    } else if (upper.startsWith('CLASS ') && upper.includes(' IMPLEMENTATION')) {
      // We hit the implementation before/without a definition. Carry
      // on — the implementation parser can build a stub class.
      implEndIndex = i;
      break;
    }
  }

  if (defBlock === undefined) {
    // No definition block. Try to find an implementation block and
    // build a minimal class from its header.
    for (let i = 0; i < lines.length; i++) {
      const upper = keyword(lines[i] ?? '');
      if (upper.startsWith('CLASS ') && upper.includes(' IMPLEMENTATION')) {
        return parseImplementationOnly(lines, i);
      }
    }
    return undefined;
  }

  // Second pass: locate the IMPLEMENTATION block and merge in methods.
  for (let i = 0; i < lines.length; i++) {
    const upper = keyword(lines[i] ?? '');
    if (upper.startsWith('CLASS ') && upper.includes(' IMPLEMENTATION')) {
      const methods = parseImplementationMethods(lines, i, defBlock.sourceLocation.file);
      defBlock = {
        ...defBlock,
        methods: [...(defBlock.methods ?? []), ...methods],
      };
      implEndIndex = i;
      // Extend the class source location to span the implementation
      // end (find matching ENDCLASS).
      let j = i + 1;
      while (j < lines.length) {
        const u = keyword(lines[j] ?? '');
        if (u.startsWith('ENDCLASS')) {
          defBlock = {
            ...defBlock,
            sourceLocation: {
              ...defBlock.sourceLocation,
              endLine: j + 1,
            },
          };
          implEndIndex = j;
          break;
        }
        j++;
      }
      break;
    }
  }

  if (implEndIndex === -1) {
    // No implementation. Return the definition only.
    implEndIndex = (defBlock.sourceLocation.endLine ?? 1) - 1;
  }

  return { cls: defBlock, endIndex: implEndIndex };
}

/* ---------- DEFINITION ---------- */

function parseClassDefinition(
  lines: readonly string[],
  startIndex: number,
): { cls: Class; endIndex: number } | undefined {
  // Header: `CLASS <name> DEFINITION`.
  const header = tokenizeStatement(stripTrailingComment(lines[startIndex] ?? ''));
  if (header.length < 3) {
    return undefined;
  }
  const name = header[1] ?? '';
  if (name.length === 0) {
    return undefined;
  }

  let visibility: Visibility = 'public';
  let superclass: string | undefined;
  const interfaces: string[] = [];
  const attributes: Attribute[] = [];
  const typeDecls: { name: string; type: string; sourceLine: number }[] = [];
  // Look for the DocBlock immediately preceding the header.
  const doc = parseDocBlockFromLines(lines, startIndex + 1, '');

  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('ENDCLASS')) {
      break;
    }

    // Visibility modifiers appear on their own lines.
    // Skip `* SECTION.` lines — they designate sub-sections, not
    // the class visibility itself. We match the trailing `SECTION`
    // token before any terminating punctuation.
    if (/ SECTION[.\s]*$/u.test(upper)) {
      continue;
    }
    if (upper === 'PUBLIC' || upper === 'PUBLIC.' || upper.startsWith('PUBLIC ') || upper.startsWith('PUBLIC.')) {
      visibility = 'public';
      continue;
    }
    if (upper === 'PROTECTED' || upper === 'PROTECTED.' || upper.startsWith('PROTECTED ') || upper.startsWith('PROTECTED.')) {
      visibility = 'protected';
      continue;
    }
    if (upper === 'PRIVATE' || upper === 'PRIVATE.' || upper.startsWith('PRIVATE ') || upper.startsWith('PRIVATE.')) {
      visibility = 'private';
      continue;
    }
    if (upper === 'PACKAGE' || upper === 'PACKAGE.' || upper.startsWith('PACKAGE ') || upper.startsWith('PACKAGE.')) {
      visibility = 'package';
      continue;
    }

    // INHERITING FROM <superclass>.
    if (upper.startsWith('INHERITING FROM')) {
      const tokens = tokenizeStatement(stripped);
      const idx = tokens.findIndex((t) => t.toUpperCase() === 'FROM');
      if (idx >= 0 && idx + 1 < tokens.length) {
        superclass = tokens[idx + 1] ?? undefined;
      }
      continue;
    }

    // INTERFACES <list>.
    if (upper.startsWith('INTERFACES')) {
      const tokens = tokenizeStatement(stripped);
      for (let k = 1; k < tokens.length; k++) {
        const tok = tokens[k];
        if (tok !== undefined && tok.length > 0 && tok.toUpperCase() !== 'INTERFACES') {
          interfaces.push(tok);
        }
      }
      continue;
    }

    // SECTION header lines (PUBLIC SECTION. / PROTECTED SECTION. / …).
    if (upper.includes(' SECTION')) {
      continue;
    }

    // DATA <name> TYPE <type>.
    if (upper.startsWith('DATA ')) {
      const parsed = parseDataLine(stripped);
      if (parsed !== undefined) {
        const block = parseDocBlockFromLines(lines, i + 1, '');
        attributes.push({
          name: parsed.name,
          visibility,
          type: parsed.type,
          ...(block !== undefined ? { doc: block } : {}),
        });
      }
      continue;
    }

    // CLASS-DATA <name> TYPE <type>.
    if (upper.startsWith('CLASS-DATA ')) {
      const parsed = parseDataLine(stripped);
      if (parsed !== undefined) {
        const block = parseDocBlockFromLines(lines, i + 1, '');
        attributes.push({
          name: parsed.name,
          visibility,
          type: parsed.type,
          isStatic: true,
          ...(block !== undefined ? { doc: block } : {}),
        });
      }
      continue;
    }

    // TYPES: BEGIN OF … / TYPES <name> TYPE … .
    if (upper.startsWith('TYPES')) {
      const parsed = parseTypesLine(stripped);
      if (parsed !== undefined) {
        const block = parseDocBlockFromLines(lines, i + 1, '');
        typeDecls.push({
          name: parsed.name,
          type: parsed.type,
          sourceLine: i + 1,
        });
        // Attach DocBlock to the LAST typeDecl when the block ends.
        // (We push the block on the last parsed entry; for multi-line
        // BEGIN OF … END OF we extend below.)
        if (block !== undefined) {
          (typeDecls[typeDecls.length - 1] as unknown as { doc?: unknown }).doc = block;
        }
      }
      continue;
    }
  }

  const endLine = i + 1;
  const cls: Class = {
    kind: 'class',
    name,
    visibility,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine },
  };
  if (superclass !== undefined) {
    cls.superclass = superclass;
  }
  if (interfaces.length > 0) {
    cls.interfaces = interfaces;
  }
  if (typeDecls.length > 0) {
    cls.types = typeDecls.map((t) => {
      const out: { name: string; type: string; doc?: Class['doc'] } = {
        name: t.name,
        type: t.type,
      };
      const docVal = (t as unknown as { doc?: Class['doc'] }).doc;
      if (docVal !== undefined) {
        out.doc = docVal;
      }
      return out;
    });
  }
  if (attributes.length > 0) {
    cls.attributes = attributes;
  }
  if (doc !== undefined) {
    cls.doc = doc;
  }
  return { cls, endIndex: i };
}

/* ---------- IMPLEMENTATION ---------- */

function parseImplementationOnly(
  lines: readonly string[],
  startIndex: number,
): ParseResult | undefined {
  const header = tokenizeStatement(stripTrailingComment(lines[startIndex] ?? ''));
  if (header.length < 2) {
    return undefined;
  }
  const name = header[1] ?? '';

  const methods = parseImplementationMethods(lines, startIndex, '');
  let endLine = startIndex + 1;
  for (let j = startIndex; j < lines.length; j++) {
    if (keyword(lines[j] ?? '').startsWith('ENDCLASS')) {
      endLine = j + 1;
      break;
    }
  }

  const cls: Class = {
    kind: 'class',
    name,
    visibility: 'public',
    methods,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine },
  };
  return { cls, endIndex: startIndex };
}

function parseImplementationMethods(
  lines: readonly string[],
  implStartIndex: number,
  filePath: string,
): Method[] {
  const methods: Method[] = [];
  let i = implStartIndex + 1;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('ENDCLASS')) {
      break;
    }

    // METHOD <name>. — collect a method. Interface-prefixed method
    // names like `zif_pet_service~get_pet` are still recognised.
    if (upper.startsWith('METHOD ') || upper.startsWith('METHOD\t')) {
      const methodStart = i;
      const parsed = parseMethod(lines, i, filePath);
      if (parsed !== undefined) {
        methods.push(parsed.method);
      }
      i = parsed?.endIndex ?? i + 1;
      // Make sure we move past the method even if parsing failed.
      if (i === methodStart) {
        i++;
      }
      continue;
    }

    i++;
  }

  return methods;
}

function parseMethod(
  lines: readonly string[],
  startIndex: number,
  filePath: string,
): { method: Method; endIndex: number } | undefined {
  const header = tokenizeStatement(stripTrailingComment(lines[startIndex] ?? ''));
  if (header.length < 2) {
    return undefined;
  }
  const name = header[1] ?? '';

  const doc = parseDocBlockFromLines(lines, startIndex + 1, filePath);

  // Walk until ENDMETHOD.
  const parameters: Parameter[] = [];
  const exceptions: Method['exceptions'] = [];
  let visibility: MethodVisibility = 'public';
  let returning: Parameter | undefined;

  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const stripped = stripTrailingComment(lines[i] ?? '');
    const upper = keyword(stripped);

    if (upper.startsWith('ENDMETHOD')) {
      break;
    }

    if (upper === 'PUBLIC' || upper.startsWith('PUBLIC ')) {
      visibility = 'public';
      continue;
    }
    if (upper === 'PROTECTED' || upper.startsWith('PROTECTED ')) {
      visibility = 'protected';
      continue;
    }
    if (upper === 'PRIVATE' || upper.startsWith('PRIVATE ')) {
      visibility = 'private';
      continue;
    }

    const param = parseParameterLine(stripped, lines, i);
    if (param !== undefined) {
      if (param.direction === 'returning') {
        returning = param.parameter;
      } else {
        parameters.push(param.parameter);
      }
    }

    const exc = parseRaisingLine(stripped);
    if (exc !== undefined) {
      exceptions.push(...exc);
    }

    // `RAISE EXCEPTION TYPE <name>.` is the runtime form; capture it.
    const raiseExc = parseRaiseExceptionLine(stripped);
    if (raiseExc !== undefined) {
      exceptions.push(raiseExc);
    }
  }

  const method: Method = {
    name,
    parameters,
    exceptions,
    visibility,
    sourceLocation: { file: filePath, startLine: startIndex + 1, endLine: i + 1 },
  };
  if (returning !== undefined) {
    method.returning = returning;
  }
  if (doc !== undefined) {
    method.doc = doc;
  }
  return { method, endIndex: i };
}

/* ---------- statement helpers ---------- */

interface DataLineParts {
  name: string;
  type: string;
}

function parseDataLine(line: string): DataLineParts | undefined {
  // DATA <name> TYPE <type> [READ-ONLY].
  const tokens = tokenizeStatement(line);
  if (tokens.length < 4) {
    return undefined;
  }
  if (tokens[0]?.toUpperCase() !== 'DATA' && tokens[0]?.toUpperCase() !== 'CLASS-DATA') {
    return undefined;
  }
  const name = tokens[1] ?? '';
  const typeIdx = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === 'TYPE');
  if (typeIdx === -1 || typeIdx + 1 >= tokens.length) {
    return undefined;
  }
  // The type expression ends at the first ABAP statement keyword
  // (READ-ONLY, VALUE, etc.) or at end of line. v0 only captures the
  // first token after TYPE; richer expressions like `TYPE REF TO`
  // and `TYPE TABLE OF` are recorded verbatim by the tokeniser.
  const type = tokens[typeIdx + 1] ?? '';
  return { name, type };
}

interface TypesLineParts {
  name: string;
  type: string;
}

function parseTypesLine(line: string): TypesLineParts | undefined {
  // TYPES <name> TYPE <type>.   OR   TYPES: BEGIN OF ….
  const stripped = line.replace(/,$/, '').trim();
  const tokens = tokenizeStatement(stripped);
  if (tokens.length < 2) {
    return undefined;
  }
  if (tokens[0]?.toUpperCase() !== 'TYPES') {
    return undefined;
  }
  // Skip the colon if present (`TYPES:`) — the colon never produces a
  // second token in tokenizeStatement (the `:` is stripped), so by
  // here we already know tokens.length >= 2.
  const firstTok = tokens[1] ?? '';
  if (firstTok.toUpperCase() === 'BEGIN' && tokens[2]?.toUpperCase() === 'OF') {
    // BEGIN OF <name> … — capture the name; the type is multi-line and
    // we do not parse it in detail.
    const name = tokens[3] ?? '';
    if (name.length === 0) {
      return undefined;
    }
    return { name, type: 'structure' };
  }
  // TYPES <name> TYPE <type>.
  const name = firstTok;
  const typeIdx = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === 'TYPE');
  if (typeIdx === -1 || typeIdx + 1 >= tokens.length) {
    return { name, type: '' };
  }
  const type = tokens[typeIdx + 1] ?? '';
  return { name, type };
}

interface ParameterLineParts {
  parameter: Parameter;
  direction: Parameter['direction'];
}

function parseParameterLine(
  line: string,
  lines: readonly string[],
  index: number,
): ParameterLineParts | undefined {
  const tokens = tokenizeStatement(line);
  if (tokens.length < 4) {
    return undefined;
  }
  const first = tokens[0]?.toUpperCase() ?? '';
  let direction: Parameter['direction'];
  switch (first) {
    case 'IMPORTING':
      direction = 'importing';
      break;
    case 'EXPORTING':
      direction = 'exporting';
      break;
    case 'CHANGING':
      direction = 'changing';
      break;
    case 'RETURNING':
      direction = 'returning';
      break;
    default:
      return undefined;
  }

  // Skip the VALUE(...) wrapper if present — we only need the name.
  const nameIdx = 1;
  let name = tokens[nameIdx] ?? '';
  if (name.toUpperCase() === 'VALUE' && tokens[nameIdx + 1]?.startsWith('(')) {
    // Look for the closing paren.
    let j = nameIdx + 1;
    while (j < tokens.length && !tokens[j]?.endsWith(')')) {
      j++;
    }
    // Last token before closing paren is the parameter name.
    name = tokens[j - 1] ?? '';
  }

  const typeIdx = tokens.findIndex((t, idx) => idx > nameIdx && t.toUpperCase() === 'TYPE');
  let type = '';
  if (typeIdx !== -1 && typeIdx + 1 < tokens.length) {
    type = tokens[typeIdx + 1] ?? '';
  }

  const doc = parseDocBlockFromLines(lines, index + 1, '');
  const parameter: Parameter = {
    name,
    direction,
    type: type.length > 0 ? type : 'any',
  };
  if (doc !== undefined) {
    parameter.doc = doc;
  }
  return { parameter, direction };
}

function parseRaisingLine(line: string): Method['exceptions'] | undefined {
  const tokens = tokenizeStatement(line);
  if (tokens.length < 2) {
    return undefined;
  }
  if (tokens[0]?.toUpperCase() !== 'RAISING') {
    return undefined;
  }
  // RAISING <name> [, <name> …].
  const exceptions: Method['exceptions'] = [];
  for (let k = 1; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok !== undefined && tok.length > 0) {
      exceptions.push({ name: tok });
    }
  }
  return exceptions;
}

/**
 * Parse a `RAISE EXCEPTION TYPE <name>.` statement. Captures the
 * exception class name as an {@link ExceptionRef}.
 */
function parseRaiseExceptionLine(line: string): ExceptionRef | undefined {
  const tokens = tokenizeStatement(line);
  if (tokens.length < 4) {
    return undefined;
  }
  if (tokens[0]?.toUpperCase() !== 'RAISE') {
    return undefined;
  }
  if (tokens[1]?.toUpperCase() !== 'EXCEPTION') {
    return undefined;
  }
  // `RAISE EXCEPTION TYPE <name> [, …].` or `RAISE EXCEPTION <name>.`.
  const typeIdx = tokens.findIndex((t, idx) => idx > 1 && t.toUpperCase() === 'TYPE');
  if (typeIdx !== -1 && typeIdx + 1 < tokens.length) {
    return { name: tokens[typeIdx + 1] ?? '' };
  }
  // No TYPE keyword: treat the next token as the class name.
  if (tokens[2] !== undefined) {
    return { name: tokens[2] };
  }
  return undefined;
}

/* re-exported helpers for tests */
export { parseParameterLine as _parseParameterLine };
export { parseRaisingLine as _parseRaisingLine };
export { parseDataLine as _parseDataLine };
export { parseTypesLine as _parseTypesLine };