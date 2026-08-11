import { z } from 'zod';
import { SourceLocationSchema } from './source-location.js';
import { TagSchema } from './tag.js';

/**
 * ABAP Doc comment block attached to a class, method, parameter, etc.
 *
 * `summary` is the first paragraph (the line above the first tag, or the
 * whole comment if there are no tags). `description` is everything in
 * between summary and the first tag, if any. Tags are kept in source order.
 */
export const DocBlockSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(TagSchema),
  sourceLocation: SourceLocationSchema,
});

export type DocBlock = z.infer<typeof DocBlockSchema>;