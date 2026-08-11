# Handoff — subagent 02 (renderer registry abstraction)

**Date:** 2026-07-02
**Author:** petr-plenkov (via Mavis/Mavis)
**Status:** COMPLETE — awaiting human review + /act rounds on `abapdoc/abapdoc#2`

## TL;DR

| PR  | Repo            | Title                                                       | HEAD      | Date       |
| --- | --------------- | ----------------------------------------------------------- | --------- | ---------- |
| #2  | abapdoc/abapdoc | feat(renderer-registry): self-registering renderer registry | `902f0fa` | 2026-07-02 |

The contract from `docs/agent-tasks/02-renderer-registry.md` is fully
implemented. The CLI's hardcoded ternary chain is gone; renderers
self-register on import.

## Next task (read first)

```
Subagent 03 — Markdown renderer. Pick this up from
docs/agent-tasks/03-markdown-renderer.md (created in this handoff)
on branch task/03-markdown-renderer (off feature/v0-architecture
post-merge of PR #2, OR off origin/main once PR #1 + #2 land).
```

## State

- **`main` HEAD (origin/main = abapdoc/abapdoc):** `0a7d27d` (unchanged).
- **`feature/v0-architecture`:** `575a9a3` (unchanged; PR #1).
- **Branch `task/02-renderer-registry`:** `902f0fa` (this work).
  Base: `0a7d27d` (origin/main) + `ef243f0` (scaffold) +
  `2794fa4` (merge commit of `origin/feature/v0-architecture`) +
  `902f0fa` (this work).
- **PR #2 base:** `origin/main` (0a7d27d). The merge commit of
  v0-architecture into task/02-renderer-registry brings in the v0
  code (model/parser/extractor/renderers/CLI/starlight) so the
  registry refactor can compile. PR #2 is therefore a "merge
  v0 + add registry" combined PR — 138 files changed.
- **Test count:** 93 across 9 packages (was 85 across 7). +7 in
  `registry.spec.ts`, +1 in `cli.spec.ts`. All pre-existing tests
  unchanged and still passing.
- **Repo shape:**

```
abapdoc/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── lessons-learned.md
│   ├── agent-tasks/
│   │   ├── 02-renderer-registry.md         (closed: this PR)
│   │   └── 03-markdown-renderer.md         (NEW — next subagent)
│   └── handoff/
│       ├── 2026-07-02-subagent-01-complete.md
│       └── 2026-07-02-subagent-02-complete.md  (this file)
├── packages/
│   ├── abapdoc-model/                       (unchanged)
│   ├── abapdoc-parser/                      (unchanged)
│   ├── abapdoc-extractor/                   (unchanged)
│   ├── abapdoc-renderer-json/               (+ registerXxx, deps)
│   ├── abapdoc-renderer-html/               (+ registerXxx, deps)
│   ├── abapdoc-renderer-mdx/                (+ registerXxx, deps)
│   ├── abapdoc-renderer-registry/           NEW (this work)
│   │   ├── package.json
│   │   ├── project.json
│   │   ├── src/
│   │   │   ├── registry.ts                  (impl, ~145 lines)
│   │   │   ├── index.ts                     (re-export entry)
│   │   │   └── registry.spec.ts             (7 tests)
│   │   ├── tsconfig.{json,lib,spec}.json
│   │   └── vite.config.ts
│   ├── abapdoc-cli/                         (refactored — uses registry)
│   ├── abapdoc-starlight/                   (unchanged)
│   └── ...
├── e2e/petstore/                            (unchanged)
└── tools/tsdown/                            (unchanged, no tests)
```

## What landed (commit `902f0fa`)

### New package: `@abapdoc/renderer-registry`

- `registry.ts` — `registerRenderer(r)` (validates format is in
  `SUPPORTED_FORMATS` and `r.render` is a function; throws on
  empty/invalid format), `getRenderer(format)`,
  `listRenderers()` (registration order), `unregisterRenderer(format)`
  (returns boolean), plus the `Renderer` interface
  (`{ format, render(model) }`) and `RenderedFile` interface.
- `index.ts` — public re-exports.
- `project.json` — Nx project with `@nx/js:tsc` build target
  (needed for the dependent packages' TS project references to
  resolve the registry's `dist/index.d.ts`).
- `tsconfig.{json,lib,spec}.json` — matches the existing package
  pattern (`@nx/js/typescript` plugin generates build/test/lint
  targets automatically from `tsconfig.lib.json`).
- `package.json` — `type: module`, ESM exports, `@abapdoc/model`
  workspace dep.
- 7 tests in `registry.spec.ts`:
  1. `registers a renderer and retrieves it by format`
  2. `getRenderer returns undefined for unknown format`
  3. `registerRenderer overwrites a previously-registered format`
  4. `unregisterRenderer removes a registered format`
  5. `listRenderers returns the registered renderers in registration order`
  6. `registerRenderer rejects a renderer whose format is empty or invalid`
  7. `render produces files from the registered renderer`

### Renderers — self-registration

Each of `abapdoc-renderer-{json,html,mdx}/src/index.ts` now ends
with a top-level `registerRenderer({ format, render })` call.
The named `render` export is unchanged, so backward compatibility
is preserved.

### CLI refactor (`packages/abapdoc-cli/src/index.ts`)

- Replaced the ternary chain at the original lines 39-66 with
  `getRenderer(fmt)` followed by `renderer.render(reparsed)`, throwing
  a clear error if no renderer is registered for the requested format.
- Switched from named imports of `renderJson` / `renderHtml` /
  `renderMdx` to side-effect imports of the three renderer
  modules + a named import of `getRenderer` / `listRenderers`
  from the registry.
- `validateFormat` now accepts the registered formats plus the
  synthetic `all` keyword.
- Error message on a missing renderer lists the registered
  formats, not the hardcoded list.
- New test in `cli.spec.ts`: `--format html` routes through the
  registry to the HTML renderer only — `index.html` exists,
  `model.json` does not, no `.mdx` files produced.

### Build wiring

- All three renderers + the CLI: added `@abapdoc/renderer-registry`
  to `package.json` dependencies and `tsconfig.json` /
  `tsconfig.lib.json` project references.
- Root `tsconfig.json` references the new package.

## Verification (all green)

```bash
# 1. RED check passed
npx vitest run packages/abapdoc-renderer-registry/src/registry.spec.ts
# Pre-implementation: 1 test file failed with "RED-phase:
# @abapdoc/renderer-registry not yet implemented"
# Post-implementation:  7/7 pass

# 2. Full nx run-many for the two changed projects
npx nx run-many -t test,build,typecheck,lint \
  -p abapdoc-renderer-registry abapdoc-cli --skip-nx-cache
# 8/8 targets pass

# 3. E2E smoke
rm -rf /tmp/abapdoc-out
node packages/abapdoc-cli/dist/index.js build \
  --src e2e/petstore --out /tmp/abapdoc-out --format all
# Rendered 4 object(s): 1 classes, 1 interfaces, 1 function modules,
# 1 tables, 0 programs. Wrote 10 file(s) to /tmp/abapdoc-out.
```

Full test matrix (run without `--skip-nx-cache`; per-package test count):

| Package                     | Tests                |
| --------------------------- | -------------------- |
| `abapdoc-model`             | 20                   |
| `abapdoc-parser`            | 6                    |
| `abapdoc-extractor`         | 2                    |
| `abapdoc-renderer-json`     | 15                   |
| `abapdoc-renderer-html`     | 16                   |
| `abapdoc-renderer-mdx`      | 23                   |
| `abapdoc-renderer-registry` | 7                    |
| `abapdoc-cli`               | 4                    |
| `abapdoc-starlight`         | (skipped, unrelated) |
| **Total**                   | **93** (was 85)      |

## CI state

- The fork `ThePlenkov/abapdoc-1` has no Actions enabled. P0a/P0b
  are N/A. PR #2 was opened against `abapdoc/abapdoc` which has
  `.github/workflows/ci.yml` configured.
- The pre-v0 default branch has 108 dependabot vulnerabilities
  (out of scope per the contract).
- `@abapdoc/tsdown:test` fails with "No test files found" on
  `origin/main` (pre-existing scaffold without tests — out of
  scope, was failing before this PR).

## /act status

- PR #2 was opened with 0 review threads at the time of writing.
- Bots typically review within minutes of push; /act will be
  applied to each thread with `902f0fa` SHA + resolve.

## Operational notes (carried into `docs/lessons-learned.md`)

### Rule 11 (subagent 02). Self-registration needs a buildable dep

**Why it matters:** When a downstream package's TS project
references your package, the typecheck step of the downstream
package requires your `dist/index.d.ts` to exist. If your
package has no build target, the typecheck fails with
`TS6305: Output file '...dist/index.d.ts' has not been built`.

**Patterns:**

- Add a `build` target to the registry package's `project.json`
  that emits `.d.ts` (mirror the model's `@nx/js:tsc` setup).
- Include `tsconfig.lib.json` and `tsconfig.spec.json` in the
  registry package from day one — the `@nx/js/typescript` Nx
  plugin uses them to auto-generate `build` / `test` / `lint`
  targets.
- Do NOT add a `build` target by hand that conflicts with the
  plugin's auto-generation — pick one. Plugin generation is
  preferred (no duplication, picks up tsconfig changes).

**Concrete hit:** this PR. Initial implementation of
`abapdoc-renderer-registry` had only `typecheck` / `test` /
`lint` in `project.json`. The CLI's typecheck failed with
`TS6305` because the CLI's `tsconfig.lib.json` references
`../abapdoc-renderer-registry/tsconfig.lib.json` and expects
the registry's `dist/index.d.ts` to exist. Fix: added the
`@nx/js:tsc` build target.

### Rule 12 (subagent 02). Validate at the registry boundary, not at usage

**Why it matters:** If `registerRenderer` accepts any string,
typos at the call site (e.g. `format: 'md'`) silently register
a renderer the CLI will never dispatch to. The bug surfaces as
"--format md: No renderer registered" at runtime — far from the
typo.

**Patterns:**

- Export a `SUPPORTED_FORMATS` const from the registry.
- `registerRenderer` throws if `format` is not in
  `SUPPORTED_FORMATS` (or is empty).
- Tests must include both "empty string" and "unknown string"
  rejection cases.

**Concrete hit:** this PR. The test
`registerRenderer rejects a renderer whose format is empty or invalid`
exercises both cases.

### Rule 13 (subagent 02). Self-registration side-effects must be imported

**Why it matters:** A renderer that calls `registerRenderer` at
module top level is invisible until something imports the module.
If the CLI uses `getRenderer(fmt)` but never imports
`@abapdoc/renderer-html`, the registry is empty and the build
fails with "No renderer registered for format 'html'".

**Patterns:**

- Side-effect imports (`import '@abapdoc/renderer-html'`) in
  the CLI's entry point keep the wiring explicit.
- Document the side effect in a comment near the import.
- The CLI's `package.json` still lists the renderers as
  dependencies — don't remove them just because the code now
  uses the registry.

**Concrete hit:** this PR. The CLI originally used named
imports (`import { render as renderHtml } from ...`) which
implicitly triggered the registration. After the refactor to
side-effect imports, the import statement's purpose is
non-obvious; a comment is needed.

## Plan for the next subagent (03)

- **Name:** subagent 03 — Markdown renderer
- **Contract doc:** `docs/agent-tasks/03-markdown-renderer.md` (NEW,
  created in this handoff)
- **Branch:** `task/03-markdown-renderer` (off `feature/v0-architecture`
  after PR #1 merges, or off `main` if PR #1 + #2 are both in)
- **Allowed file scope:** new `packages/abapdoc-renderer-markdown/`
  package; `packages/abapdoc-cli/src/index.ts` (add to the
  `FORMATS` / side-effect import list); `package.json` and
  `tsconfig*.json` of the CLI.
- **Forbidden:** no new third-party deps; no touching parser/extractor/model;
  no touching existing renderers; the new renderer must
  self-register via `registerRenderer({ format: 'markdown', render })`.
- **Verification:**
  - `npx nx run-many -t test,build,typecheck,lint -p
abapdoc-renderer-markdown abapdoc-cli --skip-nx-cache`
  - `rm -rf /tmp/abapdoc-out && node packages/abapdoc-cli/dist/index.js
build --src e2e/petstore --out /tmp/abapdoc-out --format all`
  - Also: `--format markdown` alone should produce only `.md` files
    (no `.html`, no `.mdx`, no `model.json`).
- **Likely pitfalls:**
  - The new package must have a `build` target (Rule 11).
  - `registerRenderer` will throw if `format` is not in
    `SUPPORTED_FORMATS`. Add `'markdown'` to the const (or wait
    for subagent-04 — see contract doc).
  - Pure Markdown (no MDX JSX-significant chars). Use GFM pipe
    tables like `@abapdoc/renderer-mdx` but skip the `escapeMdxBody`
    step.
  - Per the contract, the renderer is named "markdown" not "md" —
    matches the test fixture in `docs/agent-tasks/03-markdown-renderer.md`.

## File history (handoff chain)

- `docs/handoff/2026-07-02-subagent-01-complete.md`
- `docs/handoff/2026-07-02-subagent-02-complete.md` (this file)

## Constraints reminder

- No new third-party deps without explicit user approval.
- No `setTimeout` / `setInterval` in test or runtime code.
- No rewriting built-ins; extend by composition.
- 93 tests passing + typecheck + lint clean on the changed
  packages = green baseline.
