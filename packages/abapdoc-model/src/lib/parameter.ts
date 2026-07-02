import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { TypeRefSchema } from './type-ref.js';

/**
 * ABAP method or function-module parameter.
 *
 * `direction` is the SAP keyword: `importing`, `exporting`, `changing`,
 * `returning`. A method's return value is just a `Parameter` whose
 * `direction` is `'returning'`.
 *
 * `type` is the raw ABAP type expression exactly as written; `typeRef`
 * is the resolved reference, when the parser can produce one.
 */
export const ParameterDirectionSchema = z.enum([
  'importing',
  'exporting',
  'changing',
  'returning',
]);

export type ParameterDirection = z.infer<typeof ParameterDirectionSchema>;

export const ParameterSchema = z.object({
  name: z.string().min(1),
  direction: ParameterDirectionSchema,
  type: z.string().min(1),
  typeRef: TypeRefSchema.optional(),
  doc: DocBlockSchema.optional(),
});

export type Parameter = z.infer<typeof ParameterSchema>;