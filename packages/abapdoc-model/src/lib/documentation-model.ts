import { z } from 'zod';
import { AbapObjectSchema } from './abap-object.js';
import { SourceInfoSchema } from './source-info.js';

/**
 * Top-level model artefact shared by parser, renderers and consumers.
 *
 * `version` is a literal — any future migration must bump it and provide
 * a converter. `source` records provenance so downstream tooling can
 * decide whether a cached model is still valid.
 */
export const DOCUMENTATION_MODEL_VERSION = '1.0.0' as const;

export const DocumentationModelSchema = z.object({
  version: z.literal(DOCUMENTATION_MODEL_VERSION),
  source: SourceInfoSchema,
  objects: z.array(AbapObjectSchema),
});

export type DocumentationModel = z.infer<typeof DocumentationModelSchema>;