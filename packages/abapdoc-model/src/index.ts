/**
 * @abapdoc/model — public API.
 *
 * Re-exports every Zod schema, every inferred type, the canonical JSON
 * Schema, and the {@link validate} helper. This is the only entry point
 * downstream packages (parser, renderers, CLI) should import from.
 */

export * from './schema.js';
export * from './types.js';
export { documentationModelJsonSchema } from './json-schema.js';

import { DocumentationModelSchema } from './lib/documentation-model.js';
import type { DocumentationModel } from './lib/documentation-model.js';

/**
 * Validate `input` as a {@link DocumentationModel}.
 *
 * Throws `ZodError` on failure; returns the parsed value (with defaults
 * applied) on success. Use this at every parser → renderer boundary so
 * downstream code can rely on the schema being enforced once.
 */
export function validate(input: unknown): DocumentationModel {
  return DocumentationModelSchema.parse(input);
}