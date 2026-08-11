import { z } from 'zod';

/**
 * Tag union — every ABAP Doc tag carried by a {@link DocBlock}.
 *
 * The known variants cover the SAP-defined tags. `custom` is the escape
 * hatch: any unknown tag (e.g. `@since`, `@author`, vendor extensions) is
 * preserved verbatim so the model never silently drops information.
 */

export const ParameterTagSchema = z.object({
  kind: z.literal('parameter'),
  name: z.string().min(1),
  description: z.string(),
});

export type ParameterTag = z.infer<typeof ParameterTagSchema>;

export const ReturnTagSchema = z.object({
  kind: z.literal('return'),
  description: z.string(),
});

export type ReturnTag = z.infer<typeof ReturnTagSchema>;

export const RaisingTagSchema = z.object({
  kind: z.literal('raising'),
  name: z.string().min(1),
  description: z.string().optional(),
});

export type RaisingTag = z.infer<typeof RaisingTagSchema>;

export const SeeTagSchema = z.object({
  kind: z.literal('see'),
  target: z.string().min(1),
});

export type SeeTag = z.infer<typeof SeeTagSchema>;

export const CustomTagSchema = z.object({
  kind: z.literal('custom'),
  name: z.string().min(1),
  body: z.string(),
});

export type CustomTag = z.infer<typeof CustomTagSchema>;

export const TagSchema = z.discriminatedUnion('kind', [
  ParameterTagSchema,
  ReturnTagSchema,
  RaisingTagSchema,
  SeeTagSchema,
  CustomTagSchema,
]);

export type Tag = z.infer<typeof TagSchema>;