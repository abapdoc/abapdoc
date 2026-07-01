import { zodToJsonSchema } from 'zod-to-json-schema';
import { DocumentationModelSchema } from './lib/documentation-model.js';

/**
 * JSON Schema for the top-level {@link DocumentationModel}.
 *
 * Exposed for non-TypeScript consumers (Java / Python / Ruby tooling,
 * external validators, IDE plug-ins). Regenerated from the Zod source
 * on every build so the schema can never drift from the runtime model.
 *
 * `$refStrategy: 'root'` keeps recursive types honest: the
 * {@link TypeRefSchema} cycle (via `z.lazy`) is hoisted into the
 * top-level `definitions` block and the recursive `fields` array is
 * represented as a `$ref: '#/definitions/TypeRef'` instead of being
 * degraded to `any`. This lets downstream validators and code
 * generators walk the full model without losing information.
 */
export const documentationModelJsonSchema = zodToJsonSchema(
  DocumentationModelSchema,
  {
    name: 'DocumentationModel',
    $refStrategy: 'root',
  },
);