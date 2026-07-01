import { z } from 'zod';
import { DocBlockSchema } from './doc-block.js';
import { MethodSchema } from './method.js';
import { SourceLocationSchema } from './source-location.js';
import { TypeRefSchema } from './type-ref.js';

/**
 * Type or attribute declared inside a class or interface body.
 *
 * Light-weight shape: enough for cross-referencing in docs without
 * committing the model to a full ABAP type system.
 */
export const VisibilitySchema = z.enum(['public', 'protected', 'private', 'package']);

export type Visibility = z.infer<typeof VisibilitySchema>;

export const TypeDeclSchema = z.object({
  name: z.string().min(1),
  visibility: VisibilitySchema.optional(),
  type: z.string().min(1),
  typeRef: TypeRefSchema.optional(),
  doc: DocBlockSchema.optional(),
});

export type TypeDecl = z.infer<typeof TypeDeclSchema>;

export const AttributeSchema = z.object({
  name: z.string().min(1),
  visibility: VisibilitySchema,
  type: z.string().min(1),
  typeRef: TypeRefSchema.optional(),
  isReadOnly: z.boolean().optional(),
  isStatic: z.boolean().optional(),
  doc: DocBlockSchema.optional(),
});

export type Attribute = z.infer<typeof AttributeSchema>;

/**
 * ABAP class definition.
 *
 * `superclass` and `interfaces` are referenced by name; the parser does
 * not currently resolve them to other `AbapObject` instances (see
 * ARCHITECTURE.md → "Out of scope for v0").
 */
export const ClassSchema = z.object({
  kind: z.literal('class'),
  name: z.string().min(1),
  visibility: VisibilitySchema,
  superclass: z.string().optional(),
  interfaces: z.array(z.string()).optional(),
  types: z.array(TypeDeclSchema).optional(),
  methods: z.array(MethodSchema).optional(),
  attributes: z.array(AttributeSchema).optional(),
  doc: DocBlockSchema.optional(),
  sourceLocation: SourceLocationSchema,
});

export type Class = z.infer<typeof ClassSchema>;