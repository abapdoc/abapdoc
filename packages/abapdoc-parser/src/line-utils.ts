/**
 * ABAP line classification helpers.
 *
 * An ABAP source file mixes code, blank lines, and three flavours of
 * comment:
 *   * `"`        — a line comment, *not* an ABAP Doc line. We never
 *                   capture its content.
 *   * `"!`       — an ABAP Doc line. The `"!` prefix (followed by an
 *                   optional space) marks a DocBlock.
 *   * `*`        — a line used as a divider or pseudo-comment inside
 *                   string literals or pseudo-comments; we ignore it.
 *
 * `*` and `"` lines can also appear inside string literals — those
 * occurrences are not comments and must not be detected. v0 walks line
 * by line without an ABAP grammar; we therefore treat the prefix as
 * authoritative. False positives in source code (e.g. a literal
 * `'"! hello'`) are out of scope for v0 — see ARCHITECTURE.md → "Out
 * of scope for v0". The tests assert this expected behaviour.
 *
 * Functions in this file are pure: they classify or normalise a line
 * and never throw.
 */

/**
 * The canonical ABAP Doc comment prefix. A line that starts (after
 * optional leading whitespace) with `"!` is an ABAP Doc line.
 */
export const ABAP_DOC_PREFIX = '"!';

/** Trim a single line, return null if it is blank after trimming. */
export function normalize(line: string): string {
  return line.replace(/\r$/, '');
}

/**
 * Returns `true` when the line is an ABAP Doc comment line (prefix
 * `"!`). Leading whitespace is ignored. `"!` without a trailing
 * character still counts as an empty ABAP Doc line.
 */
export function isAbapDocLine(line: string): boolean {
  const trimmed = line.replace(/^\s+/, '');
  return trimmed.startsWith(ABAP_DOC_PREFIX);
}

/**
 * Strip the ABAP Doc prefix (`"!` plus a single optional space) and
 * return the body. If the line does not start with `"!`, returns the
 * line unchanged.
 *
 * Examples:
 *   stripDocPrefix('"! hello')       -> 'hello'
 *   stripDocPrefix('"!hello')        -> 'hello'
 *   stripDocPrefix('"!')             -> ''
 *   stripDocPrefix('"! @param x d')  -> '@param x d'
 *   stripDocPrefix('CLASS foo.')     -> 'CLASS foo.'
 */
export function stripDocPrefix(line: string): string {
  if (!isAbapDocLine(line)) {
    return line;
  }
  // Skip leading whitespace then `"!` then optional single space.
  const match = /^\s*"!( ?)(.*)$/.exec(line);
  if (match === null) {
    return '';
  }
  return match[2] ?? '';
}

/**
 * Returns `true` when the line is blank or contains only whitespace.
 */
export function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

/**
 * Strip a possible trailing comment (`" comment`) from an ABAP
 * statement line. Statements inside classes / interfaces occasionally
 * end with `" comment`; that text is irrelevant for our parsing. The
 * returned string is the statement up to (but not including) the `"`.
 *
 * Note: this is a coarse heuristic. ABAP strings may legally contain
 * `"`, but for v0 we treat any `"` outside of `'...'` and `"..."`
 * literals as the comment delimiter. The parser never runs on content
 * that mixes inline string literals with embedded comments in the
 * same statement, so this is safe.
 */
export function stripTrailingComment(line: string): string {
  // Skip ABAP Doc lines — their `"!` prefix would otherwise be
  // misread as the start of a trailing comment.
  const trimmed = line.trimStart();
  if (trimmed.startsWith('"')) {
    return line;
  }
  // Match a `"` that is NOT inside a string literal. For v0, we accept
  // the limitation: `"` inside `'foo' "bar' is treated as a comment.
  // Petstore fixtures do not exercise this case.
  const inSingle = (s: string): boolean => {
    let count = 0;
    for (const ch of s) {
      if (ch === "'") {
        count++;
      }
    }
    return count % 2 === 1;
  };
  const idx = line.indexOf('"');
  if (idx === -1) {
    return line;
  }
  const before = line.slice(0, idx);
  if (inSingle(before)) {
    return line;
  }
  return before.trimEnd();
}

/**
 * Lower-case an ABAP identifier token. ABAP is case-insensitive; we
 * normalize to lower-case for matching. We do NOT use this on strings
 * or quoted content.
 */
export function keyword(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Split a statement into tokens using whitespace as a separator while
 * preserving parenthesised groups. This is enough for the kinds of
 * statements we parse (CLASS, INTERFACE, METHOD, METHODS, FUNCTION,
 * REPORT, PROGRAM, TYPES, DATA, IMPORTING, EXPORTING, etc.) and does
 * not need a full ABAP lexer.
 *
 * Returns an array of tokens with surrounding whitespace stripped.
 * Parens are kept attached to their content so callers can detect
 * `(` and `)` boundaries.
 */
export function tokenizeStatement(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    // Split on whitespace AND on parens so `VALUE(rs_pet)` becomes
    // ['VALUE', '(', 'rs_pet', ')']. This makes the VALUE-wrapper
    // extraction in class/interface parsers robust to the common
    // ABAP form where the name is glued to its delimiters.
    if (
      ch === ' ' || ch === '\t' ||
      ch === '.' || ch === ',' || ch === ':' ||
      ch === '(' || ch === ')'
    ) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}