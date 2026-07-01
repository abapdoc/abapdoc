import { z } from 'zod';

/**
 * Location of an ABAP construct inside a source file.
 *
 * `file` is workspace-relative; `startLine` and `endLine` are 1-based
 * and `endLine` is inclusive. This is the only location shape the model
 * uses — renderers should not invent their own.
 */
export const SourceLocationSchema = z.object({
  file: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export type SourceLocation = z.infer<typeof SourceLocationSchema>;