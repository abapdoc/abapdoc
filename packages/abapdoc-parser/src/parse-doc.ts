/**
 * Entry point: `parseAbapDoc(source, anchorLine)`.
 *
 * Splits the source into lines, locates the `"!` lines immediately
 * above `anchorLine`, and parses them into a {@link DocBlock}.
 * Returns `undefined` when no DocBlock precedes the anchor.
 */

import type { DocBlock } from '@abapdoc/model';

import { parseDocBlockFromLines } from './doc-block/doc-block-parser.js';
import { splitSource } from './source/line-cursor.js';

/**
 * Parse an ABAP Doc block immediately above `anchorLine`.
 *
 * @param source - Full ABAP source text.
 * @param anchorLine - 1-based line number of the entity the DocBlock describes.
 * @param file - Source file path (POSIX-style, relative). Stamped onto the
 *   returned DocBlock's `sourceLocation.file` so downstream tools can
 *   back-reference the original file.
 */
export function parseAbapDoc(source: string, anchorLine: number, file: string): DocBlock | undefined {
  const lines = splitSource(source);
  return parseDocBlockFromLines(lines, anchorLine, file);
}