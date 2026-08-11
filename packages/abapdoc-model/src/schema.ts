/**
 * Barrel — every Zod schema exported by `@abapdoc/model`.
 *
 * Renderers and downstream tools should import the *types* from
 * `./types.js` (so they do not drag Zod into their bundles) and the
 * schemas from this barrel only when they need to parse or validate.
 */

export * from './lib/source-location.js';
export * from './lib/source-info.js';
export * from './lib/type-ref.js';
export * from './lib/tag.js';
export * from './lib/doc-block.js';
export * from './lib/parameter.js';
export * from './lib/exception-ref.js';
export * from './lib/method.js';
export * from './lib/function-module.js';
export * from './lib/class.js';
export * from './lib/interface.js';
export * from './lib/program.js';
export * from './lib/ddic.js';
export * from './lib/abap-object.js';
export * from './lib/documentation-model.js';