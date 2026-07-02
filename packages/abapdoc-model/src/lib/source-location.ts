import { z } from 'zod';

/**
 * Location of an ABAP construct inside a source file.
 *
 * `file` is workspace-relative; `startLine` and `endLine` are 1-based
 * and `endLine` is inclusive. This is the only location shape the model
 * uses — renderers should not invent their own.
 */
export const SourceLocationSchema = z
  .object({
    file: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  // Invariant: `endLine >= startLine`. The 1-based lines are inclusive,
  // so a malformed location (e.g. startLine=10, endLine=5) indicates a
  // parser bug — fail validation rather than silently accept.
  .refine((loc) => loc.endLine >= loc.startLine, {
    message: 'endLine must be >= startLine (SourceLocation is an inclusive 1-based range)',
    path: ['endLine'],
  });

export type SourceLocation = z.infer<typeof SourceLocationSchema>;