import { z } from 'zod';

/**
 * Resolved type reference for parameters, attributes and DDIC fields.
 *
 * Recursive: structures and tables carry their `fields`. `custom` is the
 * escape hatch for ABAP types the parser cannot resolve to a known kind
 * (deep nested structures, generic TYPE references, vendor extensions).
 */
export const TypeRefKindSchema = z.enum([
  'ddic-table',
  'ddic-structure',
  'data-element',
  'builtin',
  'custom',
]);

export type TypeRefKind = z.infer<typeof TypeRefKindSchema>;

export const TypeRefSchema: z.ZodType<TypeRef> = z.lazy(() =>
  z.object({
    kind: TypeRefKindSchema,
    name: z.string().min(1),
    fields: z.array(TypeRefSchema).optional(),
  }),
);

export interface TypeRef {
  kind: TypeRefKind;
  name: string;
  fields?: TypeRef[];
}