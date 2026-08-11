import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { ExceptionRefSchema } from './exception-ref.js';
import { ParameterSchema } from './parameter.js';
import { SourceLocationSchema } from './source-location.js';

/**
 * ABAP function module (RFC-enabled function).
 *
 * v0 ignores function-group structure: function modules are flat in the
 * model. Grouping under their `function-pool` is deferred.
 *
 * The `kind` literal is the discriminator key for the surrounding
 * {@link AbapObjectSchema} discriminated union.
 */
export const FunctionModuleSchema = z.object({
  kind: z.literal('function-module'),
  name: z.string().min(1),
  parameters: z.array(ParameterSchema),
  exceptions: z.array(ExceptionRefSchema),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type FunctionModule = z.infer<typeof FunctionModuleSchema>;