# abapdoc

> ABAP Docs as never before — a modern, extensible documentation pipeline for
> ABAP repository objects. Extracts ABAP Doc comments from abapGit-style
> repos and renders them as HTML, MDX (Astro Starlight / Docusaurus / MkDocs
> ready), and JSON.

## Why

ABAP Doc is the source of truth for developer-level documentation in
ABAP, but existing generators are tightly coupled ABAP-only HTML
producers. `abapdoc` is a clean, layered replacement:

- **Extraction** layer is small and pluggable — the file-based
  extractor is the v0 default; AST/ADT-based extractors slot in
  later without touching anything else.
- **Model** is format-independent, defined once with Zod and exported
  as JSON Schema so non-TypeScript tooling can consume it.
- **Rendering** has three independent implementations (HTML / MDX /
  JSON) that consume only the model — no I/O, no extraction logic.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Packages

| Package                          | Role                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `@abapdoc/model`                 | Zod schemas + inferred types for the documentation model. JSON Schema export for non-TS consumers. |
| `@abapdoc/parser`                | ABAP source → model. State-machine parser for ABAP Doc tags (`@parameter`, `@return`, `@raising`, …). |
| `@abapdoc/extractor`             | File-based walker for abapGit-style repos (DDIC XML + ABAP source). |
| `@abapdoc/renderer-json`         | Model → single `model.json`.                                           |
| `@abapdoc/renderer-html`         | Model → one `.html` per object + `index.html`. Self-contained inline CSS. |
| `@abapdoc/renderer-mdx`          | Model → one `.mdx` per object with YAML frontmatter. Markdown tables, no JSX. |
| `@abapdoc/cli`                   | `abapdoc build` / `abapdoc validate` commands.                        |
| `@abapdoc/starlight`             | (existing scaffold) Astro Starlight integration for the docs site.   |

## Quick start

```sh
npm install
npm run build
npm run abapdoc build --src e2e/petstore --out dist/docs
```

Open `dist/docs/index.html` to browse the generated docs.

## Commands

| Command                                  | What it does                                                |
| ---------------------------------------- | ----------------------------------------------------------- |
| `npm run build`                          | Build all packages via Nx.                                 |
| `npm run test`                           | Run vitest across all packages.                             |
| `npm run typecheck`                      | Type-check all packages via `tsc --noEmit`.                 |
| `npm run lint`                           | ESLint across the repo.                                     |
| `npm run abapdoc build --src <dir> --out <dir> [--format html|mdx|json|all]` | Extract and render documentation for the given abapGit repo. |
| `npm run abapdoc validate --src <dir>`   | Extract and validate against the model schema (no output). |

## Development

- Build everything: `npm run build`
- Run the full test suite: `npm test`
- Type-check: `npm run typecheck`
- Render the petstore sample to `dist/petstore-docs`:
  `npm run abapdoc build --src e2e/petstore --out dist/petstore-docs`

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layering
rationale, model specification, and extension points (custom tags,
additional renderers, ADT/AST extractors).

## Contributing

The v0 deliverable is intentionally small. Most useful contributions:

1. **Parser improvements** — interface `METHODS:` block comma-splitting,
   more accurate parameter name extraction, `TYPES: BEGIN OF …` field
   structure.
2. **Additional renderers** — e.g. `@abapdoc/renderer-markdown` (plain
   Markdown, no frontmatter), `@abapdoc/renderer-astro`.
3. **ADT/AST extractor** — implement `@abapdoc/extractor-adt` that
   reads from a live SAP system via `@abapify/adt-cli`.

Open a PR; CI runs `npm run build`, `npm test`, `npm run typecheck`,
and `npm run abapdoc build --src e2e/petstore --out dist/petstore-docs`.

## License

MIT — see [LICENSE](LICENSE).