import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { SourceLocationSchema } from './source-location.js';

/**
 * Executable ABAP program (report, module pool, etc.).
 *
 * v0 captures only the program-level DocBlock — there is no per-`FORM`
 * or per-`PERFORM` documentation surface yet.
 */
export const ProgramSchema = z.object({
  kind: z.literal('program'),
  name: z.string().min(1),
  programType: z.enum(['executable', 'module-pool', 'include', 'class-pool', 'function-pool']),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Program = z.infer<typeof ProgramSchema>;