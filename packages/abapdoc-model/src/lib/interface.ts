import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { MethodSchema } from './method.js';
import { SourceLocationSchema } from './source-location.js';
import { TypeDeclSchema } from './class.js';

/**
 * ABAP interface definition.
 *
 * Interface methods always have `isInterfaceMethod: true` when consumed
 * via the class that implements them; in the interface itself, the flag
 * is omitted because it is implied.
 */
export const InterfaceSchema = z.object({
  kind: z.literal('interface'),
  name: z.string().min(1),
  types: z.array(TypeDeclSchema).optional(),
  methods: z.array(MethodSchema).optional(),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Interface = z.infer<typeof InterfaceSchema>;