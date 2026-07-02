# Subagent task 02 — Renderer registry abstraction

**Branch:** `task/02-renderer-registry` (off `origin/main`)
**Goal:** Replace the ternary chain in the CLI's `runBuild` with a renderer
registry. Each renderer registers itself; the CLI looks it up by format
string. This was Cubic's deferred-v0.1 finding.

## Why

The current CLI lives at `packages/abapdoc-cli/src/index.ts:39-66`:

```typescript
const result =
  fmt === 'json' ? renderJson(reparsed)
  : fmt === 'html' ? renderHtml(reparsed)
  : renderMdx(reparsed);
```

This is fine for 3 renderers but won't scale. Adding a Markdown renderer
means editing the CLI again. The registry abstraction is the standard
extensibility point.

## Public surface

```typescript
// packages/abapdoc-renderer-registry/src/index.ts
export interface Renderer {
  readonly format: 'html' | 'mdx' | 'json' | 'markdown';
  render(model: DocumentationModel): { files: RenderedFile[] };
}

export function registerRenderer(r: Renderer): void;
export function getRenderer(format: string): Renderer | undefined;
export function listRenderers(): readonly Renderer[];
export function unregisterRenderer(format: string): boolean;
```

`RenderedFile` is `{ path: string; content: string }`.

## Required tests (5+)

1. `registers a renderer and retrieves it by format`
2. `getRenderer returns undefined for unknown format`
3. `registerRenderer overwrites a previously-registered format`
4. `unregisterRenderer removes a registered format`
5. `listRenderers returns the registered renderers in registration order`
6. `registerRenderer rejects a renderer whose format is empty or invalid`
7. `CLI build --format html routes to the HTML renderer via getRenderer`
   (integration test that exercises the CLI directly)

## File scope (allowed)

- `packages/abapdoc-renderer-registry/**` (new package)
- `packages/abapdoc-cli/src/index.ts` (replace the ternary chain)
- `packages/abapdoc-renderer-{json,html,mdx}/src/index.ts` (add
  `registerXxx()` calls — or do this in the registry package; either
  is fine but document the choice)
- `packages/abapdoc-cli/src/cli.spec.ts` (the new integration test)

## Forbidden

- No new third-party deps.
- No touching `@abapdoc/parser`, `@abapdoc/extractor`, or `@abapdoc/model`.
- No removing the public exports of `renderHtml / renderMdx / renderJson`
  — backward compatibility is required for downstream consumers.
- No `setTimeout` / `setInterval` in tests.

## Settlement rules

- The CLI must still emit 4 objects when called with
  `--format all` after the refactor.
- Renderers must self-register on import (use top-level
  `registerRenderer({...})` calls in each renderer's `src/index.ts`).
- The registry package has no dependencies on `@abapdoc/cli`.

## Verification

```bash
cd /workspace/abapdoc/.worktrees/feature-v0-architecture
git fetch origin
git checkout task/02-renderer-registry

# 1. RED scaffold should fail (the implementation file does not exist):
npx vitest run packages/abapdoc-renderer-registry/src/registry.spec.ts

# 2. After implementing:
npx nx run-many -t test,build,typecheck,lint -p abapdoc-renderer-registry abapdoc-cli --skip-nx-cache

# 3. E2E smoke (must still produce 4 objects):
rm -rf /tmp/abapdoc-out
node packages/abapdoc-cli/dist/index.js build --src e2e/petstore --out /tmp/abapdoc-out --format all
```

Expected e2e output:
```
Rendered 4 object(s): 1 classes, 1 interfaces, 1 function modules, 1 tables, 0 programs.
Wrote 10 file(s) to /tmp/abapdoc-out.
```

## Hints / pitfalls

- The CI workflow is configured on `abapdoc/abapdoc` only. The fork has no
  Actions. Push the PR there first.
- The renderer registry must be ESM — use `import type` for the
  `DocumentationModel` type only.
- `node:` imports (e.g. `node:path`) are required for any built-in
  module — see `eslint.config.mjs` for the `node:` rule.
- The new package must be added to `tsconfig.base.json` path mappings
  before `npx nx` will see it.
- The CLI's current `validateFormat` is a separate string-list check
  (`FORMATS.includes(format)`). After the refactor it should call
  `listRenderers().map(r => r.format).includes(format)` instead.

## Done when

- All 7+ tests pass.
- typecheck + lint clean on the new package.
- e2e smoke produces 4 objects.
- Commit pushed to `task/02-renderer-registry`.
- Draft PR opened against `abapdoc/abapdoc#main`.
- Per-thread replies + resolves done after /act.
- Next handoff doc generated at
  `docs/handoff/2026-07-02-subagent-02-complete.md`.