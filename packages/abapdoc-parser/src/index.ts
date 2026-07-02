/**
 * @abapdoc/parser — public API.
 *
 * Two entry points:
 *
 *   - `parseAbapDoc(source, anchorLine)` — extract the ABAP Doc comment
 *     block immediately preceding a declaration. Returns `undefined`
 *     when no DocBlock is present.
 *
 *   - `parseAbapSource(source, filePath)` — parse a complete ABAP
 *     source file into a single {@link AbapObject}. The kind is
 *     detected from the file content (class, interface, function
 *     module, program, structure).
 *
 * All emitted shapes satisfy the Zod schemas in `@abapdoc/model`.
 * Downstream consumers (renderers, CLI) should import the model
 * types from `@abapdoc/model` rather than redefining them here.
 */

export { parseAbapDoc } from './parse-doc.js';
export { parseAbapSource } from './parse-source.js';

// Re-export the small set of internals that are useful for testing
// or for callers that want to bypass the top-level dispatchers.
// Everything else stays package-private.
export {
  parseDocBlockFromLines,
  parseDocBlockLines,
  parseTag,
  splitPipeBlock,
  collectDocBlockLines,
} from './doc-block/doc-block-parser.js';
export {
  detectFileKind,
  firstMeaningfulLine,
  type FileKind,
  type FileKindResult,
} from './source/file-detector.js';
export {
  isAbapDocLine,
  isBlankLine,
  stripDocPrefix,
  stripTrailingComment,
  tokenizeStatement,
  keyword,
} from './line-utils.js';
export {
  parseClass,
} from './source/class-parser.js';
export {
  parseInterface,
  type InterfaceParseResult,
} from './source/interface-parser.js';
export {
  parseFunctionModule,
  type FunctionModuleParseResult,
} from './source/function-module-parser.js';
export {
  parseProgram,
} from './source/program-parser.js';
export {
  parseStructure,
  parseTable,
} from './source/structure-parser.js';