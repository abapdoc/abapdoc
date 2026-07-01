# Roadmap

## v0 — greenfield (DONE)

- [x] Zod-based typed documentation model with JSON Schema export
- [x] ABAP Doc parser (state machine, all standard tags)
- [x] Three renderers: HTML, MDX, JSON
- [x] File-based extractor (`*.clas.abap`, `*.intf.abap`, `*.func.abap`, DDIC XML)
- [x] CLI (`abapdoc build` / `abapdoc validate`)
- [x] Petstore e2e fixture with ABAP Doc
- [x] Architecture document

## v1 — ADT/AST era (next)

- [ ] **ADT extractor**: implement `@abapdoc/extractor-adt` backed by
      `@abapify/adt-cli`. Same `SourceProvider` interface as the
      file-based one; CLI gains `--provider adt --endpoint ...` flags.
- [ ] **AST extractor**: implement `@abapdoc/extractor-ast` using
      `@abapify/abap-ast` to consume already-parsed ABAP trees and
      re-emit them into the documentation model.
- [ ] **Cross-object link resolution**: `@see ZIF_PET_SERVICE` →
      resolve to the rendered MDX/HTML file; type references
      (`TYPE ty_pet`) → resolve to the table/structure page.
- [ ] **Renderer options**: theme, syntax highlighting, base path,
      title per render.
- [ ] **Custom tag registry**: user-defined tags (e.g. `@since`,
      `@author`) flow through to the model and renderers.
- [ ] **Markdown renderer** (no frontmatter, no JSX) for plain
      GitHub-flavored Markdown output.

## v2 — performance + UX

- [ ] **Incremental builds**: hash-based change detection; only re-parse
      changed files.
- [ ] **Watch mode**: `abapdoc dev --src <dir>` with hot reload of the
      docs site.
- [ ] **Starlight loader**: complete `@abapdoc/starlight` Astro
      integration so docs sites consume the model directly without an
      intermediate MDX render step.
- [ ] **Cross-package consistency**: stronger schema tests for
      renderer output diffs against golden files.

## Out of scope

- ADT live debugging hooks (separate tool)
- Code generation from docs (separate tool)
- ABAP source modification (parser is read-only)