/**
 * `@abapdoc/renderer-json` — emit a single pretty-printed `model.json`
 * artefact from a {@link DocumentationModel}.
 *
 * Pure transformation: takes a validated model, returns a list of file
 * records `{ path, content }`. The CLI is responsible for actually
 * writing them. No HTML/Markdown escaping is needed because the output
 * is JSON.
 *
 * Output file layout:
 *   model.json     — `JSON.stringify(model, null, 2)` of the input.
 *
 * The round-trip property (`DocumentationModelSchema.parse(JSON.parse(content))`)
 * is enforced both at runtime and in the spec.
 */

import type { DocumentationModel } from '@abapdoc/model';
import { DocumentationModelSchema } from '@abapdoc/model';
import { registerRenderer } from '@abapdoc/renderer-registry';

/** Output filename for the JSON dump. */
export const MODEL_JSON_PATH = 'model.json' as const;

/** Options accepted by {@link render}. The JSON renderer currently ignores them. */
export interface RenderOptions {
  title?: string;
  basePath?: string;
}

/** Render result — a flat list of `{ path, content }` file records. */
export interface RenderResult {
  files: Array<{ path: string; content: string }>;
}

/**
 * Render a {@link DocumentationModel} to a single `model.json` file.
 *
 * @param model - the model to render. Validated with
 *   {@link DocumentationModelSchema} before stringification.
 * @param _options - reserved for future use; ignored at v0.
 * @throws if `model` does not satisfy {@link DocumentationModelSchema}.
 */
export function render(
  model: DocumentationModel,
  _options?: RenderOptions,
): RenderResult {
  // Cheap insurance — the CLI may pass a model straight off disk.
  DocumentationModelSchema.parse(model);

  return {
    files: [
      {
        path: MODEL_JSON_PATH,
        content: JSON.stringify(model, null, 2),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Registry self-registration
// ---------------------------------------------------------------------------

// Register this renderer with the format registry on module import.
// The CLI looks renderers up via `getRenderer('json')` instead of
// importing `render` directly, so this side-effect is what makes
// the renderer discoverable.
registerRenderer({ format: 'json', render });