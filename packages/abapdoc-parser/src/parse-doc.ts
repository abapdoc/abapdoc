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

export function parseAbapDoc(source: string, anchorLine: number): DocBlock | undefined {
  const lines = splitSource(source);
  return parseDocBlockFromLines(lines, anchorLine, '');
}