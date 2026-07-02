/**
 * `@abapdoc/renderer-registry` — public entry point.
 *
 * Re-exports the public API from {@link ./registry}. Implementation
 * lives in `registry.ts` so tests can import from `./registry.js`
 * directly without circular concerns.
 */

export {
  registerRenderer,
  getRenderer,
  listRenderers,
  unregisterRenderer,
  SUPPORTED_FORMATS,
} from './registry.js';

export type { Renderer, RenderedFile, SupportedFormat } from './registry.js';
