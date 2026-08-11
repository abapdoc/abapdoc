/**
 * ABAP function module parser.
 *
 * Reads a source file containing `FUNCTION … ENDFUNCTION` and emits a
 * {@link FunctionModule}. Two flavours of the interface block are
 * recognised:
 *
 *   1. The legacy `"*"`-prefixed block, one `"*"` line per parameter:
 *
 *        FUNCTION zfm_pet_lookup.
 *        *"----------------------------------------------------------
 *        *"&Local Interface:
 *        *"  IMPORTING
 *        *"     IV_PET_ID TYPE I
 *        *"  EXPORTING
 *        *"     RS_PET TYPE ZS_PET
 *        *"  EXCEPTIONS
 *        *"     NOT_FOUND
 *        *"----------------------------------------------------------
 *          …
 *        ENDFUNCTION.
 *
 *   2. The newer `INTERFACE` block (rare in v0 fixtures): we accept
 *      `INTERFACE` keyword followed by a `IMPORTING/EXPORTING/...`
 *      section header lines.
 *
 * `FUNCTION-POOL` headers are skipped (grouping under the pool is out
 * of scope — see ARCHITECTURE.md).
 */

import type {
  ExceptionRef,
  FunctionModule,
  Parameter,
} from '@abapdoc/model';

import { keyword, stripTrailingComment, tokenizeStatement } from '../line-utils.js';
import { parseDocBlockFromLines } from '../doc-block/doc-block-parser.js';

export interface FunctionModuleParseResult {
  fm: FunctionModule;
  endIndex: number;
}

export function parseFunctionModule(lines: readonly string[]): FunctionModuleParseResult | undefined {
  // Locate `FUNCTION <name>.` header.
  let startIndex = -1;
  let name = '';
  for (let i = 0; i < lines.length; i++) {
    const upper = keyword(lines[i] ?? '');
    if (upper.startsWith('FUNCTION ') && !upper.startsWith('FUNCTION-POOL')) {
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

  // Class-level DocBlock.
  const doc = parseDocBlockFromLines(lines, startIndex + 1, '');

  // Walk the body until ENDFUNCTION; collect parameters / exceptions
  // from both the `"*"`-prefixed interface block and from inline
  // ABAP statements (rarely used).
  const parameters: Parameter[] = [];
  const exceptions: ExceptionRef[] = [];
  // Track the current section so parameter lines below IMPORTING /
  // EXPORTING / CHANGING / TABLES inherit the right direction.
  // (CodeRabbit Major + Cubic P1: was hardcoded to 'importing'.)
  let currentDirection: Parameter['direction'] | undefined;

  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('ENDFUNCTION')) {
      break;
    }

    // Detect `"*` interface lines.
    if (raw.trimStart().startsWith('*"')) {
      // Strip the leading `"*` (legacy SAP interface line marker).
      const clean = raw.replace(/^\s*\*"/u, '').trim();
      // Update current section based on a section header keyword.
      const sectionUpper = clean.trim().toUpperCase();
      if (sectionUpper === 'IMPORTING') currentDirection = 'importing';
      else if (sectionUpper === 'EXPORTING') currentDirection = 'exporting';
      else if (sectionUpper === 'CHANGING') currentDirection = 'changing';
      else if (sectionUpper === 'TABLES') currentDirection = 'changing';
      const parsed = parseInterfaceLine(clean, currentDirection);
      if (parsed !== undefined) {
        if (parsed.kind === 'parameter') {
          parameters.push(parsed.parameter);
        } else if (parsed.kind === 'exception') {
          exceptions.push(parsed.exception);
        }
      }
      continue;
    }

    // Newer `INTERFACE` block (rare).
    if (upper.startsWith('INTERFACE')) {
      const blockResult = parseInlineInterfaceBlock(lines, i + 1);
      parameters.push(...blockResult.parameters);
      exceptions.push(...blockResult.exceptions);
      i = blockResult.endIndex;
      continue;
    }
  }

  const fm: FunctionModule = {
    kind: 'function-module',
    name,
    parameters,
    exceptions,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine: i + 1 },
  };
  if (doc !== undefined) {
    fm.doc = doc;
  }
  return { fm, endIndex: i };
}

type InterfaceLineResult =
  | { kind: 'parameter'; parameter: Parameter }
  | { kind: 'exception'; exception: ExceptionRef };

/**
 * Parse one `"*"` interface line, e.g.:
 *
 *   *"  IMPORTING
 *   *"     IV_PET_ID TYPE I
 *   *"  EXPORTING
 *   *"     RS_PET TYPE ZS_PET
 *   *"  EXCEPTIONS
 *   *"     NOT_FOUND
 */
function parseInterfaceLine(
  raw: string,
  currentDirection: Parameter['direction'] | undefined,
): InterfaceLineResult | undefined {
  const trimmed = raw.replace(/^\s*\*/u, '').trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  // Section header line: `IMPORTING` / `EXPORTING` / `EXCEPTIONS` /
  // `TABLES` etc. — no value, just the keyword. The caller updates
  // its `currentDirection` based on this header.
  const upper = trimmed.toUpperCase();
  if (upper === 'IMPORTING' || upper === 'EXPORTING' || upper === 'CHANGING' ||
      upper === 'TABLES' || upper === 'EXCEPTIONS' || upper === 'LOCAL INTERFACE' ||
      upper.startsWith('LOCAL INTERFACE') || upper.startsWith('---')) {
    return undefined;
  }

  // Parameter line: `<name> TYPE <type>`.
  // Exception line: `<name>` with no TYPE.
  const tokens = tokenizeStatement(trimmed);
  if (tokens.length < 1) {
    return undefined;
  }
  const first = tokens[0] ?? '';
  const typeIdx = tokens.findIndex((t, idx) => idx > 0 && t.toUpperCase() === 'TYPE');
  if (typeIdx !== -1 && typeIdx + 1 < tokens.length) {
    // Fall back to 'importing' if no section has been seen yet (e.g.
    // a parameter declared before any section header). This matches
    // the legacy SAP behaviour where the implicit default is IMPORTING.
    const param: Parameter = {
      name: first,
      direction: currentDirection ?? 'importing',
      type: tokens.slice(typeIdx + 1).join(' '),
    };
    return { kind: 'parameter', parameter: param };
  }
  // No TYPE → exception name.
  if (tokens.length === 1) {
    return { kind: 'exception', exception: { name: first } };
  }
  return undefined;
}

interface InlineBlockResult {
  parameters: Parameter[];
  exceptions: ExceptionRef[];
  endIndex: number;
}

function parseInlineInterfaceBlock(
  lines: readonly string[],
  startIndex: number,
): InlineBlockResult {
  const parameters: Parameter[] = [];
  const exceptions: ExceptionRef[] = [];
  let i = startIndex;
  let currentDirection: Parameter['direction'] = 'importing';

  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('ENDFUNCTION')) {
      break;
    }

    if (upper === 'IMPORTING' || upper.startsWith('IMPORTING ')) {
      currentDirection = 'importing';
      continue;
    }
    if (upper === 'EXPORTING' || upper.startsWith('EXPORTING ')) {
      currentDirection = 'exporting';
      continue;
    }
    if (upper === 'CHANGING' || upper.startsWith('CHANGING ')) {
      currentDirection = 'changing';
      continue;
    }
    if (upper === 'EXCEPTIONS' || upper.startsWith('EXCEPTIONS')) {
      currentDirection = 'returning';
      continue;
    }
    if (upper === 'TABLES' || upper.startsWith('TABLES ')) {
      currentDirection = 'changing';
      continue;
    }

    const tokens = tokenizeStatement(stripped);
    if (tokens.length === 0) {
      continue;
    }

    // End of the inline block when a non-parameter statement begins.
    if (
      upper.startsWith('DATA') ||
      upper.startsWith('TYPES') ||
      upper.startsWith('CHECK') ||
      upper.startsWith('EXIT') ||
      upper.startsWith('IF') ||
      upper.startsWith('CASE') ||
      upper.startsWith('LOOP') ||
      upper.startsWith('SELECT') ||
      upper.startsWith('INSERT') ||
      upper.startsWith('UPDATE') ||
      upper.startsWith('DELETE') ||
      upper.startsWith('MODIFY') ||
      upper.startsWith('MESSAGE') ||
      upper.startsWith('RAISE') ||
      upper.startsWith('CALL') ||
      upper.startsWith('PERFORM') ||
      upper.startsWith('CLEAR') ||
      upper.startsWith('MOVE')
    ) {
      i--;
      break;
    }

    const first = tokens[0] ?? '';
    if (currentDirection === 'returning' && tokens.length === 1) {
      // EXCEPTIONS <name>.
      exceptions.push({ name: first });
      continue;
    }
    const typeIdx = tokens.findIndex((t, idx) => idx > 0 && t.toUpperCase() === 'TYPE');
    if (typeIdx !== -1 && typeIdx + 1 < tokens.length) {
      const doc = parseDocBlockFromLines(lines, i + 1, '');
      const param: Parameter = {
        name: first,
        direction: currentDirection,
        type: tokens.slice(typeIdx + 1).join(' '),
      };
      if (doc !== undefined) {
        param.doc = doc;
      }
      parameters.push(param);
      continue;
    }
  }

  return { parameters, exceptions, endIndex: i };
}