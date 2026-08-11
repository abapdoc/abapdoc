/**
 * ABAP program / report parser.
 *
 * Reads an executable program (REPORT, PROGRAM, MODULE POOL, INCLUDE,
 * CLASS POOL, FUNCTION POOL) and emits a {@link Program}. v0 only
 * captures the program-level DocBlock — per-FORM / per-PERFORM
 * documentation is out of scope.
 */

import type {
  Program,
} from '@abapdoc/model';

import { keyword, stripTrailingComment, tokenizeStatement } from '../line-utils.js';
import { parseDocBlockFromLines } from '../doc-block/doc-block-parser.js';

export function parseProgram(lines: readonly string[]): Program | undefined {
  // Find a REPORT or PROGRAM header line.
  let startIndex = -1;
  let name = '';
  let programType: Program['programType'] = 'executable';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const stripped = stripTrailingComment(raw);
    const upper = keyword(stripped);

    if (upper.startsWith('REPORT')) {
      const tokens = tokenizeStatement(stripped);
      if (tokens.length >= 2) {
        name = tokens[1] ?? '';
        programType = 'executable';
        startIndex = i;
        break;
      }
    }
    if (upper.startsWith('PROGRAM')) {
      const tokens = tokenizeStatement(stripped);
      if (tokens.length >= 2) {
        name = tokens[1] ?? '';
        // The second token (if present) tells us the program variant.
        const variant = tokens[2]?.toUpperCase();
        if (variant === 'TYPE' && tokens[3]?.toUpperCase() === 'POOL') {
          programType = 'module-pool';
        } else if (variant === 'TYPE' && tokens[3]?.toUpperCase() === 'I') {
          programType = 'include';
        } else {
          programType = 'executable';
        }
        startIndex = i;
        break;
      }
    }
    if (upper.startsWith('INCLUDE')) {
      const tokens = tokenizeStatement(stripped);
      if (tokens.length >= 2) {
        name = tokens[1] ?? '';
        programType = 'include';
        startIndex = i;
        break;
      }
    }
  }

  if (startIndex === -1) {
    return undefined;
  }

  const doc = parseDocBlockFromLines(lines, startIndex + 1, '');
  const endLine = lines.length;

  const program: Program = {
    kind: 'program',
    name,
    programType,
    sourceLocation: { file: '', startLine: startIndex + 1, endLine },
  };
  if (doc !== undefined) {
    program.doc = doc;
  }
  return program;
}

// Re-export the Program type for callers that import from the parser.
export type { Program };