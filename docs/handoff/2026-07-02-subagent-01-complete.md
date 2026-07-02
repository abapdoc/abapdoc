# Handoff — subagent 01 (v0 architecture + /act rounds 1–4)

**Date:** 2026-07-02
**Author:** petr-plenkov (via Mavis/Mavis)
**Status:** COMPLETE — awaiting human review + merge of upstream `abapdoc/abapdoc#1`

## TL;DR

| PR | Repo | Title | HEAD | Date |
| --- | --- | --- | --- | --- |
| #1 | abapdoc/abapdoc | feat(v0): three-layer architecture with extraction/model/rendering | `575a9a3` | 2026-07-02 |
| #1 | ThePlenkov/abapdoc-1 | (mirror) | `575a9a3` | 2026-07-02 |

The fork PR is the agent-fleet target; the upstream PR is the canonical source.

## Next task (read first)

```
Subagent 02 — Renderer registry abstraction. Pick this up from
docs/agent-tasks/02-renderer-registry.md (created in this handoff)
on branch task/02-renderer-registry.
```

## State

- **`main` HEAD (origin/main = abapdoc/abapdoc):** `0a7d27d` — *nx.json* (pre-v0).
  The v0 work is on `feature/v0-architecture` (3 commits: v0 + 2 /act rounds + 1
  /act round-3 = 4 total, only 1 v0 commit and 3 /act commits shown in the
  diff summary because some /act rounds share a base).
- **Branch `feature/v0-architecture`:** `575a9a3` on both upstreams.
- **Working tree:** clean (no uncommitted changes).
- **Test count:** 85 across 7 owned packages (`abapdoc-model`, `abapdoc-parser`,
  `abapdoc-extractor`, `abapdoc-renderer-json`, `abapdoc-renderer-html`,
  `abapdoc-renderer-mdx`, `abapdoc-cli`).
- **Repo shape:**

```
abapdoc/
├── docs/
│   ├── ARCHITECTURE.md          (three-layer rationale, model spec, extension points)
│   ├── ROADMAP.md                (v0 done, v1 ADT/AST plan, v2 perf)
│   ├── lessons-learned.md        (NEW — see below)
│   ├── agent-tasks/              (NEW — contracts per subagent)
│   │   └── 02-renderer-registry.md
│   └── handoff/                  (NEW — this file)
├── packages/
│   ├── abapdoc-model/             (Zod schemas + JSON Schema export)
│   ├── abapdoc-parser/            (ABAP source → model state machine)
│   ├── abapdoc-extractor/         (file-based walker + DDIC XML)
│   ├── abapdoc-renderer-json/
│   ├── abapdoc-renderer-html/
│   ├── abapdoc-renderer-mdx/
│   ├── abapdoc-cli/               (tsdown-bundled binary)
│   ├── abapdoc-starlight/         (existing scaffold, not used in v0)
│   └── ...
├── e2e/petstore/                 (ABAP fixture, exercised by e2e build)
└── tools/tsdown/                  (Nx plugin scaffold, not used)
```

## CI state

- **Upstream fork (`ThePlenkov/abapdoc-1`):** no Actions enabled (fresh fork).
  Documented in PR #1 comment as P0a/P0b N/A.
- **Upstream canonical (`abapdoc/abapdoc`):** `.github/workflows/ci.yml`
  is configured (npm ci → build → test → typecheck → lint → e2e smoke →
  upload-artifact). The workflow file landed as part of v0 PR #1.
- **Dependabot:** upstream has 108 reported vulnerabilities on the
  pre-v0 default branch (2 critical, 42 high). Out of scope for v0.

## What landed in v0 (PR #1, 125 files, +9908/-131)

### New packages

- **`@abapdoc/model`** — Zod schemas for the documentation model + JSON Schema
  export using `$refStrategy: 'root'`. Covers Class, Interface, FunctionModule,
  Program, Table, Structure, Method, Parameter, ExceptionRef, DocBlock, Tag,
  TypeRef (with `z.lazy()` recursion), SourceLocation, SourceInfo.
- **`@abapdoc/parser`** — ABAP source → model. State-machine parser for ABAP
  Doc tags (`@parameter`, `@return`, `@raising`, `@see`, `@author`, etc.).
  Supports classes, interfaces, function modules, programs, structures.
- **`@abapdoc/extractor`** — file-based walker for abapGit-style repos.
  Detects `*.clas.abap` / `*.intf.abap` / `*.func.abap` / `*.prog.abap` and
  DDIC XML (`*.tabl.xml`, `*.stru.xml`). DDIC XML is parsed via
  `fast-xml-parser` with XXE protection.
- **`@abapdoc/renderer-{json,html,mdx}`** — three independent pure model →
  output transforms. HTML uses self-contained inline CSS; MDX uses YAML
  frontmatter + Markdown tables + JSX-significant-char escaping; JSON emits
  one `model.json`.
- **`@abapdoc/cli`** — `abapdoc build` / `abapdoc validate`. tsdown-bundled
  self-contained ESM with no externals.

### Other

- `e2e/petstore` extended with ABAP Doc on class/interface/FM and a new
  table fixture (`ztpet.tabl.xml`).
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` (this handoff extends).
- `.github/workflows/ci.yml` — npm ci + build + test + typecheck + lint +
  e2e smoke.
- `README.md` rewritten from scratch with quick-start using petstore.

## What landed in /act rounds (PR #1, 3 follow-up commits)

| Commit | Theme |
| --- | --- |
| `1f41423` | Extractor hardening: XXE disabled on XMLParser, drop `globalThis.__debug_extractor`, DDIC kind derived from filename, fix `objects` mapping in extract function |
| `57359dd` | Parser/model: DocBlock `sourceLocation.file` recursive stamping, packaging paths fixed, duplicate nx.targets.build removed, MDX XSS escape, endLine invariant, TypeRef kind+fields invariant, description column in render tables |
| `f5273c1` | Renderers + parser correctness: HTML Reference column duplicate removed, returns dedup, SECTION visibility tracking, FM direction tracking, FM `*"` marker stripping, `tokenizeStatement` paren splitting, CI workflow permissions |
| `575a9a3` | Cubic P0 SECTION handler ordering bug + class-vs-scope visibility split, DDIC ROLLNAME/DATATYPE capture, extractor parse-error resilience, fast-xml-parser pinned |

Cumulative review-thread resolution: 78 of 78 (100%). 0 threads open.

## New patterns (carried into `docs/lessons-learned.md`)

1. **Recursion > threading for stamping tree-wide values.**
2. **One commit per theme, not per thread.**
3. **Reply-before-resolve is the discipline.**
4. **Test relying on a bug masks the bug.**
5. **Class-level visibility ≠ current sub-scope visibility.**
6. **Bulk acknowledge-and-resolve when ROI is negative.**
7. **Section tracking ≠ visibility tracking.**
8. **Direction propagation needs explicit state.**

(Full rules in `docs/lessons-learned.md`.)

## Operational contract (the loop the next agent runs)

```
PATCHER → VERIFIER → REVIEWER → iterate → commit → /act → merge

  1. Read handoff doc + contract doc + lessons-learned.md.
  2. Check out task/NN-task-name branch.
  3. Implement. Use existing patterns: structuredClone for tree ops,
     recursive walker for stamping, Zod refine() for invariants.
  4. Run: `npx nx run-many -t test,build,typecheck,lint --skip-nx-cache`.
  5. Run: `rm -rf /tmp/abapdoc-out && node packages/abapdoc-cli/dist/index.js
            build --src e2e/petstore --out /tmp/abapdoc-out --format all`.
  6. Commit. Push. Open draft PR.
  7. /act — reply to each thread, resolve after reply, never resolve-only.
  8. Final PR comment summarising rounds.
  9. Generate next handoff doc.
```

## Plan for the next subagent (02)

- **Name:** subagent-02 — Renderer registry abstraction
- **Contract doc:** `docs/agent-tasks/02-renderer-registry.md`
- **Branch:** `task/02-renderer-registry` (already created off `origin/main`)
- **RED scaffold:** `packages/abapdoc-renderer-registry/src/registry.spec.ts`
  + `packages/abapdoc-renderer-registry/src/registry.ts` (stub)
- **Read first:** `docs/handoff/2026-07-02-subagent-01-complete.md` +
  `docs/lessons-learned.md` + `docs/agent-tasks/02-renderer-registry.md`
- **Verification:**
  - `npx nx run-many -t test,build,typecheck,lint -p abapdoc-renderer-registry abapdoc-cli --skip-nx-cache`
  - `rm -rf /tmp/abapdoc-out && node packages/abapdoc-cli/dist/index.js build --src e2e/petstore --out /tmp/abapdoc-out --format all`
- **Allowed file scope:** `packages/abapdoc-renderer-registry/**`,
  `packages/abapdoc-cli/src/**`, `packages/abapdoc-model/src/index.ts`.
- **Forbidden:** new third-party dependencies; touching parser/extractor;
  rewriting built-ins; removing the ternary chain in CLI without replacement.
- **Settlement rules:** keep the public API of `renderHtml / renderMdx /
  renderJson` unchanged. The registry is additive — renderers register
  themselves at startup; CLI reads from `getRenderer(format)` instead of
  the ternary chain.
- **Likely pitfalls:**
  - Forgetting to validate the registered renderer satisfies the
    `Renderer` interface — add a runtime check in `register()`.
  - Loading renderers eagerly vs lazily. The e2e build must still produce
    4 objects.
  - Forgetting to update the renderer test fixtures to import from
    `@abapdoc/renderer-registry` (the import paths must change).
- **Hints:** the current CLI lives at `packages/abapdoc-cli/src/index.ts:39-66`.
  The ternary chain `fmt === 'json' ? renderJson(reparsed) : ...` is the
  single line that needs to be replaced with `getRenderer(fmt)(reparsed)`.

## File history (handoff chain)

- `docs/handoff/2026-07-02-subagent-01-complete.md` (this file)
- (none prior — this is subagent 01's handoff)

## Constraints reminder

- No new third-party deps without explicit user approval.
- No `setTimeout` / `setInterval` in test or runtime code (we use real
  promise-based waiting).
- No rewriting built-ins; extend by composition.
- 85 tests passing + typecheck + lint clean = green baseline.