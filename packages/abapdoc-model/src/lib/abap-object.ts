import { z } from 'zod';
import { ClassSchema } from './class.js';
import { InterfaceSchema } from './interface.js';
import { FunctionModuleSchema } from './function-module.js';
import { ProgramSchema } from './program.js';
import { StructureSchema, TableSchema } from './ddic.js';

/**
 * Discriminated union of every ABAP object kind the model can carry.
 *
 * Discriminator key: `kind`. New object kinds are added by extending the
 * union here; downstream consumers must exhaustively switch on `kind`,
 * which the TypeScript compiler will enforce.
 */
export const AbapObjectSchema = z.discriminatedUnion('kind', [
  ClassSchema,
  InterfaceSchema,
  FunctionModuleSchema,
  ProgramSchema,
  TableSchema,
  StructureSchema,
]);

export type AbapObject = z.infer<typeof AbapObjectSchema>;