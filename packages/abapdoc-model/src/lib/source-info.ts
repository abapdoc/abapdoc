import { z } from 'zod';

/**
 * Provenance for a {@link DocumentationModel}: how the model was built.
 *
 * `provider` identifies the {@link SourceProvider} implementation
 * (file-based, AST, ADT, ...); `commit` and `generatedAt` are optional
 * but recommended so downstream tooling can invalidate caches.
 */
export const SourceInfoSchema = z.object({
  provider: z.string().min(1),
  rootDir: z.string().min(1),
  commit: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
});

export type SourceInfo = z.infer<typeof SourceInfoSchema>;