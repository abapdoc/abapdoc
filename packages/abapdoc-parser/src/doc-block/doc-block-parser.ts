/**
 * DocBlock state machine.
 *
 * A {@link DocBlock} is the parsed result of the `"!` comment lines
 * immediately preceding a declaration. The parser is a small line-by-
 * line state machine that buckets each input line into one of:
 *
 *   - `summary`        prose lines before the first tag and before the
 *                      first blank separator
 *   - `description`    prose lines that fall either between summary and
 *                      the first tag (after a blank separator) or after
 *                      the last tag
 *   - `tags[]`         one entry per `@`-prefixed line, with optional
 *                      `|` continuation lines folded into the body
 *
 * The state machine is implemented as a single pass over the comment
 * lines with four states:
 *
 *   SUMMARY         walking prose in the summary bucket
 *   DESCRIPTION     walking prose in the description bucket
 *                   (entered when we see a blank line before any tag,
 *                    or when prose appears after the last tag)
 *   IN_TAG          inside a single-line tag body
 *   IN_TAG_CONT     inside a multi-line tag body, accumulating `|`
 *                   continuation lines
 *
 * Transitions are documented inline below.
 */

import type {
  CustomTag,
  DocBlock,
  ParameterTag,
  RaisingTag,
  ReturnTag,
  SeeTag,
  SourceLocation,
  Tag,
} from '@abapdoc/model';

import { isAbapDocLine, stripDocPrefix } from '../line-utils.js';

/** A line that has been pre-classified for the state machine. */
export interface CommentLine {
  /** 1-based source line number (for SourceLocation). */
  readonly lineNumber: number;
  /** Line body after stripping `"!` and the optional leading space. */
  readonly body: string;
}

/**
 * Locate the consecutive `"!` lines that immediately precede `anchorLine`.
 *
 * Walks upward from the line just above `anchorLine`, collecting every
 * line that starts with `"!`. Stops at the first non-`"!` line or at
 * the start of the source. The collected lines are returned in source
 * order (top to bottom) so the parser can walk them in the same
 * direction.
 *
 * `anchorLine` is 1-based and points at the line of the declaration
 * (e.g. the `METHOD foo.` line). The DocBlock sits immediately above
 * — so we start at `anchorLine - 1` (0-based) which is the line
 * BEFORE the declaration.
 *
 * Returns `null` when no `"!` line is found above the anchor.
 */
export function collectDocBlockLines(
  lines: readonly string[],
  anchorLine: number,
): CommentLine[] | null {
  if (anchorLine < 1 || anchorLine > lines.length + 1) {
    return null;
  }
  // anchorLine is the 1-based line of the declaration; the DocBlock
  // sits in the lines above. We start at `anchorLine - 2` (0-based
  // index of the line just above the declaration).
  const collected: CommentLine[] = [];
  let cursor = anchorLine - 2;
  while (cursor >= 0) {
    const raw = lines[cursor] ?? '';
    if (!isAbapDocLine(raw)) {
      break;
    }
    collected.unshift({
      lineNumber: cursor + 1, // convert back to 1-based
      body: stripDocPrefix(raw),
    });
    cursor--;
  }
  if (collected.length === 0) {
    return null;
  }
  return collected;
}

/**
 * Split a multi-line tag body into lines using `|` as the line
 * terminator. Each segment is stripped of leading `|`. The first
 * segment may carry inline content after the `|` (no leading `|`);
 * continuation segments retain their inner text as-is.
 *
 * Example:
 *   splitPipeBlock('foo |bar |baz |') -> ['foo ', 'bar ', 'baz ']
 */
export function splitPipeBlock(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  // Only push trailing content if it's non-empty. An input like
  // 'foo |' would otherwise produce a trailing empty segment,
  // which deviates from the documented behaviour.
  if (current.length > 0) {
    parts.push(current);
  }
  return parts.map((p) => p.replace(/\s+$/u, ''));
}

/**
 * Parse a tag name + body pair into the appropriate {@link Tag}
 * variant.
 *
 * - `@parameter <name> <desc>` -> ParameterTag
 * - `@return <desc>`          -> ReturnTag
 * - `@raising <name>`         -> RaisingTag
 * - `@raising <name> <desc>`  -> RaisingTag (description merged)
 * - `@see <target>`           -> SeeTag (target may be a `{@link …}` form)
 * - anything else             -> CustomTag (passthrough)
 *
 * Multi-line bodies (delivered as `\n`-joined segments) are preserved
 * verbatim; the schema only requires `description` to be a string.
 */
export function parseTag(name: string, body: string): Tag {
  const normalisedName = name.toLowerCase();
  const trimmedBody = body.trim();

  switch (normalisedName) {
    case 'parameter': {
      const trimmed = trimmedBody;
      if (trimmed.length === 0) {
        // Empty parameter — fall back to custom so we don't drop it.
        return { kind: 'custom', name: 'parameter', body: '' };
      }
      // The first whitespace-separated token is the parameter name.
      const spaceIdx = trimmed.search(/\s/u);
      if (spaceIdx === -1) {
        // Only a name was given, no description. The schema requires
        // `description`; emit an empty string so the tag still parses.
        const tag: ParameterTag = { kind: 'parameter', name: trimmed, description: '' };
        return tag;
      }
      const paramName = trimmed.slice(0, spaceIdx);
      const description = trimmed.slice(spaceIdx + 1).trim();
      const tag: ParameterTag = { kind: 'parameter', name: paramName, description };
      return tag;
    }

    case 'return': {
      const tag: ReturnTag = { kind: 'return', description: trimmedBody };
      return tag;
    }

    case 'raising': {
      const trimmed = trimmedBody;
      if (trimmed.length === 0) {
        return { kind: 'custom', name: 'raising', body: '' };
      }
      const spaceIdx = trimmed.search(/\s/u);
      if (spaceIdx === -1) {
        const tag: RaisingTag = { kind: 'raising', name: trimmed };
        return tag;
      }
      const exceptionName = trimmed.slice(0, spaceIdx);
      const description = trimmed.slice(spaceIdx + 1).trim();
      const tag: RaisingTag = { kind: 'raising', name: exceptionName, description };
      return tag;
    }

    case 'see': {
      // Trim, then strip a wrapping `{@link …}` to keep the rendered
      // target clean. We never drop information: the schema field is
      // a free-form string.
      const inner = trimmedBody.replace(/^\{@link\s+/u, '').replace(/\}$/u, '');
      const tag: SeeTag = { kind: 'see', target: inner };
      return tag;
    }

    default: {
      const tag: CustomTag = { kind: 'custom', name: normalisedName, body: trimmedBody };
      return tag;
    }
  }
}

/** Sentinel used to distinguish "no description captured" from "empty description". */
const NO_DESC = Symbol('no-description');

interface DocBlockDraft {
  summary: string;
  description: string | typeof NO_DESC;
  tags: Tag[];
  startLine: number;
  endLine: number;
}

/**
 * Walk the pre-collected comment lines and emit a {@link DocBlockDraft}.
 *
 * State machine states:
 *
 *   SUMMARY          prose before any tag (and before any blank line)
 *   DESCRIPTION      prose in either the "before tags" or "after tags"
 *                    bucket; these are concatenated into a single
 *                    `description` field separated by `\n\n` when both
 *                    are present
 *   IN_TAG           consuming a single-line tag body
 *   IN_TAG_CONT      consuming continuation lines for the current tag
 *
 * Transitions (see implementation):
 *
 *   SUMMARY         --prose-->     SUMMARY
 *   SUMMARY         --blank-->     DESCRIPTION
 *   SUMMARY         --@tag-->      IN_TAG
 *   DESCRIPTION     --prose-->     DESCRIPTION
 *   DESCRIPTION     --@tag-->      IN_TAG
 *   IN_TAG          --blank-->     DESCRIPTION (close tag)
 *   IN_TAG          --prose-->     DESCRIPTION (close tag)
 *   IN_TAG          --@tag-->      IN_TAG (close prev, start new)
 *   IN_TAG          --|cont-->     IN_TAG_CONT (close tag if single-line,
 *                                       start continuation)
 *   IN_TAG_CONT     --|cont-->     IN_TAG_CONT
 *   IN_TAG_CONT     --prose-->     DESCRIPTION (close tag)
 *   IN_TAG_CONT     --@tag-->      IN_TAG
 *   DESCRIPTION     --blank-->     DESCRIPTION
 */
export function parseDocBlockLines(lines: readonly CommentLine[]): DocBlockDraft {
  const summaryLines: string[] = [];
  const descriptionLines: string[] = [];
  const tags: Tag[] = [];

  type DocBlockState = 'summary' | 'description' | 'in-tag' | 'in-tag-cont';
  let state: DocBlockState = 'summary';

  // Current tag accumulator (only meaningful in InTag / InTagCont).
  let currentName = '';
  let currentBody = '';

  const startLine = lines[0]!.lineNumber;
  let endLine = lines[lines.length - 1]!.lineNumber;

  const closeTag = (): void => {
    if (currentName === '') {
      // No tag in progress; nothing to do.
      return;
    }
    // Normalise the body. When the tag was single-line, `currentBody`
    // already holds the trimmed text. When it was multi-line, the
    // `|` markers have been stripped but we kept the segments
    // separated by `\n` — fold them into a single string.
    const normalised = currentBody.replace(/\s+$/u, '').trim();
    tags.push(parseTag(currentName, normalised));
    currentName = '';
    currentBody = '';
  };

  const startTag = (rawName: string, body: string): void => {
    state = 'in-tag';
    currentName = rawName;
    currentBody = body;
  };
  // startTag is kept for symmetry with the existing tests; the
  // inline nextState assignment in the tag-handling branch is what
  // actually runs in practice.
  void startTag;

  for (const line of lines) {
    const body = line.body;
    endLine = line.lineNumber;

    // Each iteration reads `state` (the value set by the PREVIOUS
    // iteration) and writes the new `state`. We always update via
    // the `nextState` local and assign once at the end — this
    // prevents TS from narrowing `state` across the iteration.
    let nextState: DocBlockState = state;

    // Blank comment line (`"!`) — separates summary from description
    // when in SUMMARY, otherwise keeps DESCRIPTION active.
    if (body.length === 0) {
      if (state === 'summary') {
        nextState = 'description';
      } else if (state === 'in-tag' || state === 'in-tag-cont') {
        // A blank line inside a tag (or its continuation) closes
        // the tag and returns to description.
        closeTag();
        nextState = 'description';
      }
      // Description: no-op.
      state = nextState;
      continue;
    }

    // Continuation line — starts with `|`. Only meaningful inside a
    // tag's pipe block; outside a tag we treat it as prose
    // (fallback so we don't drop content).
    if (body.startsWith('|')) {
      if (state === 'in-tag' || state === 'in-tag-cont') {
        const segment = body.slice(1).replace(/\s+$/u, '');
        currentBody = currentBody.length === 0 ? segment : currentBody + '\n' + segment;
        nextState = 'in-tag-cont';
      } else {
        // Outside a tag: treat as prose after tags.
        closeTag();
        descriptionLines.push(body);
        nextState = 'description';
      }
      state = nextState;
      continue;
    }

    // Tag line — starts with `@`.
    if (body.startsWith('@')) {
      const match = /^@(\S+)\s*([\s\S]*)$/u.exec(body);
      if (match === null) {
        // `@` without a name — treat as prose.
        if (state === 'in-tag' || state === 'in-tag-cont') {
          closeTag();
          nextState = 'description';
        }
        descriptionLines.push(body);
        state = nextState;
        continue;
      }
      const rawName = match[1] ?? '';
      const rawBody = match[2] ?? '';

      // If a tag is in progress, close it before starting the new one.
      if (state === 'in-tag' || state === 'in-tag-cont') {
        closeTag();
      }

      // Detect pipe-form: body ends with `|` or contains a `|`.
      if (rawBody.includes('|')) {
        // Pipe-form tag. Strip the trailing `|` and start continuation.
        const segments = splitPipeBlock(rawBody);
        // First segment was before the opening `|`; merge as inline.
        const inline = (segments[0] ?? '').trim();
        const rest = segments.slice(1).join('\n');
        currentName = rawName;
        currentBody = inline + (rest.length > 0 ? '\n' + rest : '');
        nextState = 'in-tag-cont';
      } else {
        // Single-line tag.
        currentName = rawName;
        currentBody = rawBody;
        nextState = 'in-tag';
        // If the body itself ends with `|` then the author used the
        // colon-suffix form without inline content; the next line will
        // begin with `|` and we will pick it up there.
        if (rawBody.trimEnd().endsWith('|')) {
          nextState = 'in-tag-cont';
        }
      }
      state = nextState;
      continue;
    }

    // Plain prose line.
    if (state === 'summary') {
      summaryLines.push(body);
    } else if (state === 'description') {
      descriptionLines.push(body);
    } else if (state === 'in-tag' || state === 'in-tag-cont') {
      // Prose after a tag means the tag ended; move to description.
      closeTag();
      descriptionLines.push(body);
      state = 'description';
    }
  }

  // Finalise the last in-progress tag.
  if (state === 'in-tag' || state === 'in-tag-cont') {
    closeTag();
  }

  const summary = summaryLines.join(' ').trim();
  const description = descriptionLines.join('\n').trim();

  return {
    summary: summary.length === 0 ? '' : summary,
    description: description.length === 0 ? NO_DESC : description,
    tags,
    startLine,
    endLine,
  };
}

/**
 * Build the final {@link DocBlock} from a draft and a file path.
 * The draft carries the line numbers from the source; the location
 * spans the entire DocBlock.
 */
export function finaliseDocBlock(draft: DocBlockDraft, filePath: string): DocBlock {
  const sourceLocation: SourceLocation = {
    file: filePath,
    startLine: draft.startLine,
    endLine: draft.endLine,
  };

  // The schema requires `summary` to be non-empty. If parsing somehow
  // produced an empty summary (e.g. only tags present), fall back to
  // the first tag body or a placeholder so the model never carries an
  // empty summary. The caller decides whether to emit a DocBlock at
  // all — if there is no summary AND no tags AND no description, the
  // caller should treat this as "no DocBlock".
  let summary = draft.summary;
  if (summary.length === 0) {
    const firstTag = draft.tags[0];
    if (firstTag !== undefined) {
      const tagSummary = describeTagForSummary(firstTag);
      summary = tagSummary;
    }
  }

  const block: DocBlock = {
    summary,
    tags: draft.tags,
    sourceLocation,
  };
  if (draft.description !== NO_DESC && (draft.description as string).length > 0) {
    block.description = draft.description as string;
  }
  return block;
}

function describeTagForSummary(tag: Tag): string {
  switch (tag.kind) {
    case 'parameter':
      return `Parameter ${tag.name}.`;
    case 'return':
      return 'Returns a value.';
    case 'raising':
      return `Raises ${tag.name}.`;
    case 'see':
      return `See ${tag.target}.`;
    case 'custom':
      return `${tag.name} ${tag.body}`.trim();
  }
}

/**
 * Entry point used by both the standalone DocBlock parser and the
 * source-level parser. Given the source split into lines and a 1-based
 * anchor line, returns the parsed DocBlock or `undefined` if there is
 * no DocBlock immediately preceding the anchor.
 */
export function parseDocBlockFromLines(
  lines: readonly string[],
  anchorLine: number,
  filePath: string,
): DocBlock | undefined {
  const commentLines = collectDocBlockLines(lines, anchorLine);
  if (commentLines === null || commentLines.length === 0) {
    return undefined;
  }
  const draft = parseDocBlockLines(commentLines);
  const block = finaliseDocBlock(draft, filePath);
  // Empty DocBlock (no summary, no tags, no description) is not useful.
  if (
    block.tags.length === 0 &&
    block.summary.length === 0 &&
    (block.description === undefined || block.description.length === 0)
  ) {
    return undefined;
  }
  return block;
}