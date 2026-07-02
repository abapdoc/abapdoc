import { z } from 'zod';
import { SourceLocationSchema } from './source-location.js';

/**
 * Reference to an exception class that a method or function module can raise.
 * Only the name is required; an optional location helps renderers link back
 * to the raise site when the class is part of the same documentation set.
 */
export const ExceptionRefSchema = z.object({
  name: z.string().min(1),
  sourceLocation: SourceLocationSchema.optional(),
});

export type ExceptionRef = z.infer<typeof ExceptionRefSchema>;