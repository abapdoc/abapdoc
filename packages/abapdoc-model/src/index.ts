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

import {
  DocumentationModelSchema,
  DOCUMENTATION_MODEL_VERSION,
} from './lib/documentation-model.js';
import type { DocumentationModel } from './lib/documentation-model.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate `input` as a {@link DocumentationModel}.
 *
 * Throws `ZodError` on failure; returns the parsed value (with defaults
 * applied) on success. Use this at every parser → renderer boundary so
 * downstream code can rely on the schema being enforced once.
 *
 * Older model versions are upgraded before validation; the returned object
 * always carries the current `DOCUMENTATION_MODEL_VERSION`.
 */
export function validate(input: unknown): DocumentationModel {
  if (isObject(input) && input.version === '1.0.0') {
    input = { ...input, version: DOCUMENTATION_MODEL_VERSION };
  }
  return DocumentationModelSchema.parse(input);
}
