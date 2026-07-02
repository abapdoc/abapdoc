/**
 * Line-cursor helpers shared by all per-kind ABAP source parsers.
 *
 * The parsers walk the source one 1-based line at a time, often
 * looking at the immediately preceding or following line. These
 * helpers keep that machinery in one place.
 */

import type { DocBlock } from '@abapdoc/model';

/**
 * Split a source string into lines, normalising CRLF to LF. The
 * resulting array is 0-indexed; callers convert to 1-based with
 * `index + 1`.
 *
 * Note: trailing newlines produce an empty trailing element in the
 * returned array (because `String.prototype.split` keeps the empty
 * string after the final separator). This is intentional — callers
 * rely on 1-based line numbers matching the source file.
 */
export function splitSource(source: string): string[] {
  // Replace CRLF with LF, then split on LF.
  const normalised = source.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n');
  // Guarantee at least one element so an empty input still yields [''],
  // matching the 1-based indexing convention used elsewhere.
  if (parts.length === 0) {
    return [''];
  }
  return parts;
}

/**
 * Strip a trailing ABAP line comment (`"…"` after code). Returns the
 * input unchanged when no comment is present.
 *
 * Heuristic: if the trimmed line contains an even number of
 * double-quote characters, there is no comment; if odd, the last
 * unescaped `"…"` is a comment and we strip everything from that
 * point onward.
 */
export function stripTrailingComment(line: string): string {
  const trimmed = line.trimEnd();
  // Cheap pre-check: if the line does NOT contain a `"` at all, it
  // can't have an ABAP comment.
  if (!trimmed.includes('"')) {
    return line;
  }
  // Walk the string and count quote characters. ABAP comments start
  // after the LAST whole-quote. We do NOT parse strings here — that
  // would require full tokenisation — but the heuristic works for
  // ABAP Doc lines and most class/interface bodies.
  let lastCommentStart = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '"') {
      // Toggle: even count opens a comment, odd count closes it.
      // The last unmatched `"` is the comment start.
      if ((countQuotes(trimmed, i) % 2) === 1) {
        lastCommentStart = i;
      }
    }
  }
  if (lastCommentStart < 0) {
    return line;
  }
  return line.slice(0, lastCommentStart).trimEnd();
}

function countQuotes(s: string, upTo: number): number {
  let n = 0;
  for (let i = 0; i <= upTo; i++) {
    if (s[i] === '"') {
      n++;
    }
  }
  return n;
}

/**
 * Determine if `line` is an ABAP Doc line (`"!` prefix). The
 * `!` is mandatory — `"` alone is a regular line comment.
 */
export function isAbapDocLine(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('"!') || trimmed.startsWith('"! ');
}

/** Strip the leading `"!` (and one optional space) from an ABAP Doc line. */
export function stripDocPrefix(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('"!')) {
    return trimmed.slice(2);
  }
  if (trimmed.startsWith('"! ')) {
    return trimmed.slice(3);
  }
  return trimmed;
}

/** Convenience: parse an ABAP Doc comment from a single line. */
export function parseDocFromLine(line: string): DocBlock | undefined {
  if (!isAbapDocLine(line)) {
    return undefined;
  }
  return {
    summary: stripDocPrefix(line),
    tags: [],
    sourceLocation: { file: '', startLine: 1, endLine: 1 },
  };
}