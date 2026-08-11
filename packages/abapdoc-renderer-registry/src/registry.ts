/**
 * `@abapdoc/renderer-registry` — runtime registry of output format
 * renderers. Lets new formats be added without touching the CLI.
 *
 * ## Why a registry?
 *
 * The CLI originally had a hard-coded ternary chain dispatching on
 * `--format` to one of three renderers. That was fine for three
 * formats but does not scale — every new renderer would require an
 * edit to the CLI. The registry makes the dispatch table dynamic.
 *
 * ## Public surface
 *
 * - {@link Renderer} — the contract every renderer must satisfy.
 * - {@link registerRenderer} — add a renderer to the global table.
 * - {@link getRenderer} — look up a renderer by format string.
 * - {@link listRenderers} — enumerate all registered renderers in
 *   the order they were registered.
 * - {@link unregisterRenderer} — remove a renderer; used by tests
 *   to keep state isolated.
 *
 * ## Self-registration
 *
 * The default renderers (`html`, `mdx`, `json`) self-register at
 * module-import time. The CLI's top-level import side-effects load
 * them; no explicit wiring required.
 *
 * ## Thread safety / concurrency
 *
 * Single-threaded JavaScript; the registry uses a plain `Map`. No
 * locking. Mutation is synchronous so the table is consistent across
 * subsequent reads.
 *
 * ## Validation
 *
 * `registerRenderer` rejects (with `Error`):
 *   - empty `format` strings,
 *   - format strings outside the documented set
 *     (`html`, `mdx`, `json`, `markdown`).
 *
 * This guards against typos in renderers' self-registration code and
 * against accidentally clobbering the dispatch table with a junk
 * value.
 */

import type { DocumentationModel } from '@abapdoc/model';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single rendered file record — path is always POSIX-relative. */
export interface RenderedFile {
  readonly path: string;
  readonly content: string;
}

/** The full set of formats the registry accepts. */
export const SUPPORTED_FORMATS = ['html', 'mdx', 'json', 'markdown'] as const;

/** The string-literal type of a supported format. */
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

/** The shape of an output-format renderer. */
export interface Renderer {
  /** Stable format identifier. Must be one of {@link SUPPORTED_FORMATS}. */
  readonly format: SupportedFormat;
  /**
   * Transform a documentation model into a flat list of file
   * records. Pure: the same input always produces the same output.
   */
  render(model: DocumentationModel): { files: RenderedFile[] };
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Registered renderers keyed by format. `Map` preserves insertion
 * order, which {@link listRenderers} exposes to callers.
 */
const registry = new Map<SupportedFormat, Renderer>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a renderer for a given format.
 *
 * If a renderer for the same format was already registered, it is
 * replaced — `registerRenderer` is the same operation whether you
 * are adding a new format or overwriting an existing one. This is
 * deliberate: it lets tests reset state and lets plugins upgrade
 * a built-in renderer.
 *
 * @throws if `renderer.format` is not one of {@link SUPPORTED_FORMATS}.
 */
export function registerRenderer(renderer: Renderer): void {
  if (!renderer || typeof renderer !== 'object') {
    throw new Error('registerRenderer: renderer must be a non-null object');
  }
  const { format } = renderer;
  if (typeof format !== 'string' || format.length === 0) {
    throw new Error(
      'registerRenderer: renderer.format must be a non-empty string'
    );
  }
  if (!(SUPPORTED_FORMATS as readonly string[]).includes(format)) {
    throw new Error(
      `registerRenderer: unsupported format ${JSON.stringify(format)} ` +
        `(must be one of ${SUPPORTED_FORMATS.join(', ')})`
    );
  }
  if (typeof renderer.render !== 'function') {
    throw new Error('registerRenderer: renderer.render must be a function');
  }
  registry.set(format, renderer);
}

/**
 * Look up a renderer by format string.
 *
 * @returns the registered renderer, or `undefined` if no renderer
 *   is registered for that format.
 */
export function getRenderer(format: string): Renderer | undefined {
  return registry.get(format as SupportedFormat);
}

/**
 * Remove a renderer from the registry.
 *
 * @returns `true` if a renderer was removed, `false` if no renderer
 *   was registered for that format.
 */
export function unregisterRenderer(format: string): boolean {
  return registry.delete(format as SupportedFormat);
}

/**
 * List all currently-registered renderers, in the order they were
 * registered. The returned array is a fresh copy; mutating it does
 * not affect the registry.
 */
export function listRenderers(): readonly Renderer[] {
  return Array.from(registry.values());
}
