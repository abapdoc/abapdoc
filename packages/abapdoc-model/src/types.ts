/**
 * Barrel — every TypeScript type inferred from the Zod schemas.
 *
 * This is the surface renderers should import from. It has no runtime
 * cost (types are erased at build time) and does not pull Zod into
 * downstream bundles.
 */

export type {
  SourceLocation,
} from './lib/source-location.js';
export type {
  SourceInfo,
} from './lib/source-info.js';
export type {
  TypeRef,
  TypeRefKind,
} from './lib/type-ref.js';
export type {
  Tag,
  ParameterTag,
  ReturnTag,
  RaisingTag,
  SeeTag,
  CustomTag,
} from './lib/tag.js';
export type {
  DocBlock,
} from './lib/doc-block.js';
export type {
  Parameter,
  ParameterDirection,
} from './lib/parameter.js';
export type {
  ExceptionRef,
} from './lib/exception-ref.js';
export type {
  Method,
  MethodVisibility,
} from './lib/method.js';
export type {
  FunctionModule,
} from './lib/function-module.js';
export type {
  TypeDecl,
  Attribute,
  Visibility,
  Class,
} from './lib/class.js';
export type {
  Interface,
} from './lib/interface.js';
export type {
  Program,
} from './lib/program.js';
export type {
  Table,
  Structure,
} from './lib/ddic.js';
export type {
  AbapObject,
} from './lib/abap-object.js';
export type {
  DocumentationModel,
} from './lib/documentation-model.js';