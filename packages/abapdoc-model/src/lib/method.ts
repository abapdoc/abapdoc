import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { ExceptionRefSchema } from './exception-ref.js';
import { ParameterSchema } from './parameter.js';
import { SourceLocationSchema } from './source-location.js';

/**
 * Method declared on a class or interface.
 *
 * `isInterfaceMethod` is `true` when the method comes from an interface
 * definition (no implementation in this class). Returning values are
 * modelled as a `Parameter` with `direction: 'returning'`.
 */
export const MethodVisibilitySchema = z.enum(['public', 'protected', 'private']);

export type MethodVisibility = z.infer<typeof MethodVisibilitySchema>;

export const MethodSchema = z.object({
  name: z.string().min(1),
  parameters: z.array(ParameterSchema),
  returning: ParameterSchema.optional(),
  exceptions: z.array(ExceptionRefSchema),
  visibility: MethodVisibilitySchema,
  isInterfaceMethod: z.boolean().optional(),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Method = z.infer<typeof MethodSchema>;