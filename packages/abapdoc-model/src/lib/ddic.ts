import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { SourceLocationSchema } from './source-location.js';
import { TypeRefSchema } from './type-ref.js';

/**
 * ABAP DDIC table or structure.
 *
 * `fields` carries the declared columns / components as resolved
 * `TypeRef`s. Both kinds include the `kind` literal so they can be used
 * as options in the {@link AbapObjectSchema} discriminated union.
 */
export const TableSchema = z.object({
  kind: z.literal('table'),
  name: z.string().min(1),
  fields: z.array(TypeRefSchema),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Table = z.infer<typeof TableSchema>;

export const StructureSchema = z.object({
  kind: z.literal('structure'),
  name: z.string().min(1),
  fields: z.array(TypeRefSchema),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Structure = z.infer<typeof StructureSchema>;