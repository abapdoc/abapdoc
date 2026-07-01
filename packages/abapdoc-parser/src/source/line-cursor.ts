/**
 * Line cursor — a tiny helper around `readonly string[]` that exposes
 * peek/advance and remembers the 1-based line number of each access.
 *
 * Used by the source-level parsers to walk ABAP files without manual
 * index arithmetic.
 */

export interface LineCursor {
  /** 0-based index of the next line to read. */
  readonly index: number;
  /** Number of lines in the source. */
  readonly length: number;
}

/** Create a cursor positioned at line 0. */
export function startCursor(length: number): LineCursor {
  return { index: 0, length };
}

/** Returns true when there is at least one line remaining. */
export function hasMore(c: LineCursor): boolean {
  return c.index < c.length;
}

/** Peek the next line without advancing; returns undefined at EOF. */
export function peek(lines: readonly string[], c: LineCursor): string | undefined {
  if (c.index >= c.length) {
    return undefined;
  }
  return lines[c.index];
}

/**
 * Peek the line N steps ahead of the cursor (0 = current line).
 * Returns undefined if the offset is past EOF.
 */
export function peekAt(lines: readonly string[], c: LineCursor, offset: number): string | undefined {
  const idx = c.index + offset;
  if (idx < 0 || idx >= c.length) {
    return undefined;
  }
  return lines[idx];
}

/** Read the next line and advance the cursor. */
export function next(lines: readonly string[], c: LineCursor): { line: string; cursor: LineCursor } | undefined {
  if (c.index >= c.length) {
    return undefined;
  }
  return {
    line: lines[c.index]!,
    cursor: { index: c.index + 1, length: c.length },
  };
}

/** Skip lines until the predicate returns true (or EOF). */
export function skipUntil(
  lines: readonly string[],
  c: LineCursor,
  predicate: (line: string) => boolean,
): LineCursor {
  let cur = c;
  while (cur.index < cur.length) {
    const line = lines[cur.index]!;
    if (predicate(line)) {
      return cur;
    }
    cur = { index: cur.index + 1, length: cur.length };
  }
  return cur;
}

/**
 * Compute the 1-based line number for a 0-based cursor index.
 */
export function lineNumber(c: LineCursor): number {
  return c.index + 1;
}

/**
 * Split a source string into lines, normalising CRLF to LF. The
 * resulting array is 0-indexed; callers convert to 1-based with
 * `index + 1`.
 */
export function splitSource(source: string): string[] {
  // Replace CR+LF with LF, then split. Keep trailing empty lines so
  // 1-based line numbers match the original file.
  return source.replace(/\r\n/g, '\n').split('\n');
}