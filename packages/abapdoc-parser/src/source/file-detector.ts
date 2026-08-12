/**
 * File-kind detection.
 *
 * `parseAbapSource` accepts an ABAP file and must decide what kind of
 * object it represents (class, interface, function module, program,
 * structure). The decision is made by scanning the top of the file
 * for a small set of leading keywords.
 *
 * Detection order (first match wins):
 *
 *   1. `INTERFACE` at the top of the file → interface
 *   2. `CLASS … DEFINITION` at the top of the file → class
 *   3. `FUNCTION-POOL` or `FUNCTION` at the top of the file → function-module
 *      (we parse the first `FUNCTION` block as a single function
 *       module — grouping under `FUNCTION-POOL` is out of scope)
 *   4. `REPORT` or `PROGRAM` at the top of the file → program
 *   5. `TYPES:` block at the top of the file → structure
 *   6. otherwise → structure (best-effort DDIC type declaration)
 *
 * The function also derives a `programType` for `program` files.
 */

import type { Program } from '@abapdoc/model';

export type FileKind =
  | 'class'
  | 'interface'
  | 'function-module'
  | 'program'
  | 'structure';

export interface FileKindResult {
  kind: FileKind;
  /** Program subtype when kind === 'program'; undefined otherwise. */
  programType?: Program['programType'];
}

/** Strip a trailing comment (`" comment`) and whitespace. */
export function firstMeaningfulLine(lines: readonly string[]): string {
  for (const raw of lines) {
    const normalised = raw.replace(/\s+/g, ' ').trim();
    if (normalised.length === 0) {
      continue;
    }
    const meaningful = stripComment(normalised);
    if (meaningful.length === 0) {
      continue;
    }
    return meaningful;
  }
  return '';
}

/**
 * Inspect the first ~30 non-blank lines and pick a file kind.
 */
export function detectFileKind(lines: readonly string[]): FileKindResult {
  // Look at the first ~30 non-blank, non-comment lines.
  const meaningful: string[] = [];
  for (const raw of lines) {
    const stripped = stripComment(stripLeadingWhitespace(raw));
    if (stripped.length === 0) {
      continue;
    }
    meaningful.push(stripped);
    if (meaningful.length >= 30) {
      break;
    }
  }

  // 1. INTERFACE — first meaningful line starts with `INTERFACE`.
  if (
    meaningful.length > 0 &&
    meaningful[0]!.toUpperCase().startsWith('INTERFACE ')
  ) {
    return { kind: 'interface' };
  }

  // 2. CLASS … DEFINITION — first meaningful line starts with `CLASS` AND
  //    a later meaningful line starts with `IMPLEMENTATION` (or
  //    contains `DEFINITION`).
  const upperLines = meaningful.map((l) => l.toUpperCase());
  if (upperLines[0]?.startsWith('CLASS ')) {
    const hasDefinition = upperLines.some((l) => l.includes(' DEFINITION'));
    const hasImplementation = upperLines.some((l) =>
      l.includes(' IMPLEMENTATION')
    );
    if (hasDefinition || hasImplementation) {
      return { kind: 'class' };
    }
    // A bare `CLASS … DEFINITION DEFERRED` or `CLASS … DEFINITION LOAD`
    // — still a class.
    return { kind: 'class' };
  }

  // 3. FUNCTION-POOL or FUNCTION
  if (upperLines[0]?.startsWith('FUNCTION-POOL')) {
    return { kind: 'function-module' };
  }
  if (upperLines[0]?.startsWith('FUNCTION ')) {
    return { kind: 'function-module' };
  }

  // 4. REPORT / PROGRAM
  if (upperLines[0]?.startsWith('REPORT')) {
    return { kind: 'program', programType: 'executable' };
  }
  if (upperLines[0]?.startsWith('PROGRAM')) {
    return { kind: 'program' };
  }

  // 5. CLASS-based local definitions: a class inside an include or
  //    pool. v0 still recognises them as classes.
  if (upperLines[0]?.startsWith('CLASS')) {
    return { kind: 'class' };
  }

  // 6. TYPES block → structure.
  if (
    upperLines.some((l) => l.startsWith('TYPES:') || l.startsWith('TYPES '))
  ) {
    return { kind: 'structure' };
  }

  // 7. Default → structure.
  return { kind: 'structure' };
}

function stripLeadingWhitespace(line: string): string {
  return line.replace(/^\s+/, '');
}

function findMatchingBrace(line: string, start: number): number | undefined {
  // Scan from the `start` index of an opening `{` to the matching `}`.
  // Respects `'...'`, `` `...` ``, and `|...|` literals so braces inside
  // strings / templates do not fool the scanner.
  const stack: Array<"'" | '`' | '|' | '{'> = ['{'];
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i];
    const top = stack[stack.length - 1];

    if (top === "'") {
      if (ch === "'" && line[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") {
        stack.pop();
      }
      i += 1;
      continue;
    }

    if (top === '`') {
      if (ch === '`' && line[i + 1] === '`') {
        i += 2;
        continue;
      }
      if (ch === '`') {
        stack.pop();
      }
      i += 1;
      continue;
    }

    if (top === '|') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '|') {
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === '{') {
        stack.push('{');
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (top === '{') {
      if (ch === '}') {
        stack.pop();
        if (stack.length === 0) {
          return i;
        }
        i += 1;
        continue;
      }
      if (ch === '{') {
        stack.push('{');
        i += 1;
        continue;
      }
      // Fall through so quotes / templates inside expressions are handled.
    }

    if (ch === "'") {
      stack.push("'");
      i += 1;
      continue;
    }
    if (ch === '`') {
      stack.push('`');
      i += 1;
      continue;
    }
    if (ch === '|') {
      stack.push('|');
      i += 1;
      continue;
    }
    i += 1;
  }
  return undefined;
}

function stripComment(line: string): string {
  // Strip `*` pseudo-comments (e.g. `*&---...`, `*& Report NAME`)
  // AND inline ABAP comments after `"`.
  // Respect `'...'` text field literals, `` `...` `` text string literals,
  // and `|...|` string templates (including `{...}` expressions and `\` escapes).
  const trimmed = line.trim();
  if (trimmed.startsWith('*')) {
    // Pseudo-comment; remove the whole line so it does not bias
    // the detector. The actual ABAP Doc parser (`"!` lines) still
    // sees them — only the file-kind detector ignores them.
    return '';
  }

  const stack: Array<"'" | '`' | '|' | '{'> = [];

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const top = stack[stack.length - 1];

    if (top === "'") {
      if (ch === "'" && line[i + 1] === "'") {
        i += 1; // escaped '' inside a text field literal
        continue;
      }
      if (ch === "'") {
        stack.pop();
      }
      continue;
    }

    if (top === '`') {
      if (ch === '`' && line[i + 1] === '`') {
        i += 1; // escaped `` inside a text string literal
        continue;
      }
      if (ch === '`') {
        stack.pop();
      }
      continue;
    }

    if (top === '|') {
      if (ch === '\\') {
        i += 1; // escape next char inside string template
        continue;
      }
      if (ch === '|') {
        stack.pop();
        continue;
      }
      if (ch === '{') {
        // Only treat `{` as the start of an embedded expression if a matching
        // `}` exists on the same line. Otherwise the `{` is literal and a
        // trailing `"` comment on this line could be swallowed.
        if (findMatchingBrace(line, i) !== undefined) {
          stack.push('{');
        }
        continue;
      }
      continue;
    }

    if (top === '{') {
      if (ch === '}') {
        stack.pop();
        continue;
      }
      if (ch === '{') {
        if (findMatchingBrace(line, i) !== undefined) {
          stack.push('{');
        }
        continue;
      }
      // Other characters inside `{...}` fall through so nested literals are handled.
    }

    if (ch === '"' && stack.length === 0) {
      return line.slice(0, i).trimEnd();
    }

    if (ch === "'") {
      stack.push("'");
      continue;
    }

    if (ch === '`') {
      stack.push('`');
      continue;
    }

    if (ch === '|') {
      stack.push('|');
      continue;
    }
  }

  return line;
}
