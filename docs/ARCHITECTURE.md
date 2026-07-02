# abapdoc v0 Architecture

## Problem statement

ABAP Doc comments inside ABAP source files are the canonical, authoritative
source of developer documentation for ABAP workbench objects (classes,
interfaces, function modules, programs, DDIC tables and structures). They
travel with the code, are reviewed with it, and are rendered by the SAP GUI
help system and ADT.

There is no clean, open-source, multi-format pipeline that consumes ABAP Doc
and emits modern static-site / tooling assets (HTML, MDX, JSON). Existing
generators (e.g. indevo/abapDOC, kctdata/abapDoc) are:

- ABAP-only — written as SAP-internal reports or ADT plug-ins, not consumable
  from CI on non-SAP machines.
- Tightly coupled — extraction, parsing and rendering live in the same
  report; you cannot reuse the model outside ABAP.
- Single-format — they produce HTML only. MDX (Astro Starlight), JSON for
  downstream tooling, or arbitrary custom targets are not addressed.
- Not shaped for the ADT / AST era — they assume `READ REPORT` / SCAN
  against the workbench. They cannot consume an `abaplint` AST, an ADT
  HTTP API response, or a plain filesystem snapshot.

`abapdoc` fills this gap with a small, layered TypeScript pipeline that runs
on a developer laptop or in CI, accepts workbench objects from any
`SourceProvider`, and emits format-independent output via pluggable
renderers.

## Layering

One-way data flow, three layers:

```
   SourceProvider (file | AST | ADT)
            │
            ▼
       Extraction  ── raw ABAP object snapshots (text + structure)
            │
            ▼
         Model  ── typed, format-independent DocumentationModel
            │
            ▼
       Rendering  ── HTML | MDX | JSON  (independent renderers)
```

Each layer is a separate npm package; the model is the only artefact that
crosses layer boundaries. No upstream type appears in a downstream layer's
public API.

### Extraction

Inputs: a `SourceProvider` implementation. The default is file-based (reads
`.clas.abap`, `.intf.abap`, `.tabl.xml`, `.xml.abap` etc. from a directory
tree). Future providers can wrap an `abaplint` AST or an ADT HTTP API. The
extractor is responsible only for producing raw snapshots — text plus
location metadata — never for understanding ABAP Doc.

### Model

`packages/abapdoc-model/`. Format-independent typed `DocumentationModel`.
Every entity is a Zod schema; the runtime parser and the renderers share
the same shape. No HTML, MDX, or JSON-specific fields leak in.

### Rendering

Three independent renderers, each consuming only `@abapdoc/model`:

- `@abapdoc/renderer-html` — HTML pages for plain static hosting.
- `@abapdoc/renderer-mdx` — MDX pages for Astro Starlight (consumed by
  `@abapdoc/starlight`).
- `@abapdoc/renderer-json` — JSON dump for downstream tooling (search
  indexes, LLMs, IDE plug-ins).

Renderers register through a small registry; new formats are added by
publishing a new package that implements the renderer interface.

## Package layout

```
packages/
  abapdoc-model/            # this task — Zod schemas + inferred types
  abapdoc-parser/           # cycle 2 — ABAP Doc → DocumentationModel
  abapdoc-extractor/        # cycle 3 — file-based SourceProvider
  abapdoc-renderer-html/    # cycle 2 — model → HTML
  abapdoc-renderer-mdx/     # cycle 2 — model → MDX
  abapdoc-renderer-json/    # cycle 2 — model → JSON
  abapdoc-cli/              # cycle 3 — orchestrator
  starlight/                # existing — Astro Starlight integration
tools/
  tsdown/                   # existing — Nx tsdown plugin
e2e/
  petstore/                 # existing — extended with ABAP Doc fixtures
docs/
  ARCHITECTURE.md           # this document
```

## Model specification

All entities live under `@abapdoc/model`. Each top-level type is a Zod
schema; consumers may import the schemas or the inferred TypeScript types
via the public API.

### Top-level

```ts
DocumentationModel {
  version: '1.0.0',
  source: SourceInfo,
  objects: AbapObject[]
}
```

`version` is a Zod literal; any future migration must bump it. `source`
records how the model was built (provider kind, commit SHA, timestamps).

### `AbapObject` — discriminated union

Discriminator key: `kind`. Values: `class`, `interface`, `program`,
`function-module`, `table`, `structure`.

### `Class`

```
name: string
visibility: 'public' | 'protected' | 'private' | 'package'
superclass?: string
interfaces?: string[]
types?: TypeDecl[]
methods?: Method[]
attributes?: Attribute[]
doc?: DocBlock
sourceLocation: SourceLocation
```

### `Interface`

```
name: string
types?: TypeDecl[]
methods?: Method[]
doc?: DocBlock
sourceLocation: SourceLocation
```

### `Method`

```
name: string
parameters?: Parameter[]
returning?: Parameter          // direction: 'returning'
exceptions?: ExceptionRef[]
visibility: 'public' | 'protected' | 'private'
isInterfaceMethod?: boolean
doc?: DocBlock
sourceLocation: SourceLocation
```

### `Parameter`

```
name: string
direction: 'importing' | 'exporting' | 'changing' | 'returning'
type: string                  // raw ABAP type expression
typeRef?: TypeRef             // resolved DDIC / builtin / custom ref
doc?: DocBlock
```

### `TypeRef`

Recursive. Discriminator key: `kind`. Values: `ddic-table`,
`ddic-structure`, `data-element`, `builtin`, `custom`.

```
name: string
fields?: TypeRef[]            // only for ddic-structure / ddic-table
```

### `DocBlock`

```
summary: string
description?: string
tags: Tag[]
sourceLocation: SourceLocation
```

`summary` is the first paragraph of the ABAP Doc comment; `description`
holds any subsequent prose. Tags are kept in source order.

### `Tag` — discriminated union

Discriminator key: `kind`. Values: `parameter`, `return`, `raising`, `see`,
`custom`.

| Kind        | Fields                                |
| ----------- | ------------------------------------- |
| `parameter` | `name`, `description`                 |
| `return`    | `description`                         |
| `raising`   | `name`, `description?`                |
| `see`       | `target` (free-form: name, link, …)   |
| `custom`    | `name`, `body` — escape hatch         |

The `custom` variant captures any ABAP Doc tag the parser does not recognise
(`@since`, `@author`, `@deprecated`, vendor extensions, …) so models never
silently lose information.

### `FunctionModule`

```
name: string
parameters?: Parameter[]
exceptions?: ExceptionRef[]
doc?: DocBlock
sourceLocation: SourceLocation
```

### `Table` and `Structure`

```
name: string
fields: TypeRef[]
doc?: DocBlock
sourceLocation: SourceLocation
```

## SourceLocation

```
file: string             // workspace-relative path
startLine: number        // 1-based
endLine: number          // 1-based, inclusive
```

## Extension points

- **SourceProvider interface** — declared by `@abapdoc/extractor`; the
  default file-based implementation reads from a directory tree. Future
  AST (abaplint) or live-ADT providers implement the same interface and
  drop in without changing the parser.
- **Custom tag passthrough** — every `Tag` whose `kind` is not one of the
  known kinds (`parameter`, `return`, `raising`, `see`) is preserved as a
  `custom` tag with raw `name` and `body`. Round-trips lose nothing.
- **Renderer registry** — renderers register a `{ name, render }` pair.
  The CLI resolves renderer names against the registry; new formats ship
  as new packages without modifying `@abapdoc/model` or the CLI.
- **JSON Schema export** — `@abapdoc/model` publishes
  `documentationModelJsonSchema` (built via `zod-to-json-schema`) so
  non-TS consumers (Java, Python, Ruby tooling) can validate models
  generated elsewhere.

## E2E shape

`e2e/petstore/` is the smoke fixture for the entire pipeline:

1. The ABAP sample is extended with realistic ABAP Doc comments on
   `zcl_pet_service`, `zif_pet_service`, `zfm_pet_*` and `ztpet` / `zs_pet_*`.
2. The extractor reads `e2e/petstore/src/` and produces raw snapshots.
3. The parser converts snapshots into a `DocumentationModel`.
4. Each renderer writes output to `e2e/petstore/dist/`:
   - `html/` — flat HTML files for direct inspection.
   - `mdx/` — MDX files consumed by `@abapdoc/starlight`.
   - `model.json` — the canonical model dump.
5. The CI pipeline asserts that `dist/` matches the committed snapshot,
   so any model or renderer regression shows up as a diff.

The e2e test runs end-to-end on every PR touching `packages/abapdoc-*` or
`e2e/petstore/`.

## Out of scope for v0

- ADT live connection. Source is file-based. AST and ADT providers are
  designed for but not implemented in v0.
- Function-group level handling. Function modules are flat in the model;
  grouping under their `function-pool` is deferred.
- Incremental builds. The pipeline rebuilds the full model on every run.
  Caching and change-detection are post-v0 work.
- Cross-object link resolution beyond simple name match. Links across
  objects (`@see zcl_other`) are emitted as plain references in v0;
  rewriting them into cross-page anchors is deferred until renderers
  coordinate via the renderer registry.