# Lessons Learned

Cross-cutting patterns extracted from subagent work on the abapdoc project.
Each rule has a concrete hit (commit SHA + file:line) showing where it was
learned. Future subagents MUST read this file before starting work.

## Synthesis: subagent-instruction template

When you start a task, follow this template:

1. Read the handoff doc (`docs/handoff/<date>-subagent-NN-complete.md`).
2. Read the contract doc (`docs/agent-tasks/NN-*.md`).
3. Skim this file (`docs/lessons-learned.md`) for the rules.
4. Check the RED scaffold: `git status` should show one untracked test
   file with `it.todo` or `expect.fail` placeholders.
5. Implement. Patterns:
   - **Tree-wide value stamping** → recursive walker + `structuredClone`.
     (See Rule 1.)
   - **Schema invariants** → Zod `.refine()` with `path: ['<field>']`.
     (See Rule 7.)
   - **Two concepts in one variable** → split them. (See Rule 5.)
   - **Test passes only with the bug** → the test is wrong. (See Rule 4.)
6. Verify: `npx nx run-many -t test,build,typecheck,lint -p <packages>
   --skip-nx-cache` + the e2e smoke build.
7. Commit. Push. Open draft PR.
8. /act — reply to each thread with the commit SHA, then resolve.
9. Generate next handoff doc.

## Rules

### Rule 1 (subagent 01). Recursion > threading

**Why it matters:** Threading a parameter through every function call in a
deep tree is error-prone and easy to miss nested cases.

**Patterns:**
- Use a single recursive walker with `structuredClone(node)` to apply a
  tree-wide transformation.
- The walker only needs to know the shape of "what to stamp"; callers
  pass the value once.

**Concrete hit:** commit `57359dd`, parser `parseAbapSource` previously
threaded `filePath` through per-kind parsers and individual DocBlock
emitters; nested tags + parameter docs were missed. Replacing with a
single recursive walker in `stampFileOnDocBlocks` fixed all of them in
one place.

### Rule 2 (subagent 01). One commit per theme, not per thread

**Why it matters:** Per-thread commits make the PR hard to review and
hard to revert selectively.

**Patterns:**
- Group fixes by area: security, model, renderers, parser.
- Include the commit SHA in each per-thread reply so reviewers can find
  the change quickly.

**Concrete hit:** `1f41423` (security), `57359dd` (model + packaging),
`f5273c1` (renderers + parser), `575a9a3` (Cubic P0 catch).

### Rule 3 (subagent 01). Reply-before-resolve

**Why it matters:** Empty resolves hide what changed. Reviewers must see
which commit addressed which thread.

**Patterns:**
- Reply first with the commit SHA and a one-sentence description.
- Then resolve.
- Never resolve-only.

**Concrete hit:** every one of the 78 resolved threads on `abapdoc-1#1`
has a reply pointing to a commit SHA before the resolve.

### Rule 4 (subagent 01). Test relying on a bug masks the bug

**Why it matters:** A test that asserts a state achievable only via the
buggy behaviour will pass even after the fix breaks that state.

**Patterns:**
- If a test was written when the code was buggy, the test itself may
  encode the bug. Re-read the test carefully when the code is "fixed".
- Look for assertions that depend on internal state reachable only
  through the bug.

**Concrete hit:** commit `575a9a3`. The round-2 SECTION handler fix left
in place a catch-all regex that swallowed PRIVATE SECTION without
updating visibility. The test `expect(obj.visibility).toBe('public')`
was passing only because the buggy regex kept visibility at the default
`'public'` even when the fixture had `PRIVATE SECTION.` in it. The test
asserted a state that was only achievable via the bug.

### Rule 5 (subagent 01). Two concepts in one variable → split

**Why it matters:** When a single variable is used to track two
different things, the parser/renderer will mix them.

**Patterns:**
- Identify the two concepts explicitly. Look for "visibility",
  "scope", "level", "current", "default" — common split-points.
- Snapshot the upper-level value when the lower-level one starts
  changing.

**Concrete hit:** commit `575a9a3`. `visibility` mixed class-level
visibility (PUBLIC/PROTECTED/PRIVATE keyword line, declared once at the
top of the class body) with sub-scope visibility (SECTION headers,
which change the visibility of subsequent DATA/TYPES/METHODS but NOT
the class itself). Fix: separate `classVisibility` (snapshot at first
SECTION) from `visibility` (current sub-scope).

### Rule 6 (subagent 01). Bulk acknowledge-and-resolve when ROI is negative

**Why it matters:** After N rounds of /act, remaining threads are
mostly defer-to-X items. Per-thread phrase-matching is brittle and
burns time without adding value.

**Patterns:**
- When thread count > 20 and most are defer items, post ONE consistent
  reply listing the defer-to list + resolved-this-round list, and
  resolve all of them.
- Don't bulk-resolve threads that have substantive unaddressed content.

**Concrete hit:** round-4 /act on `abapdoc-1#1`. 30 remaining threads
were all defer-to-v0.1 items. Posted one consistent reply + resolved
all 30 in ~30 seconds. ROI on per-thread reply was negative.

### Rule 7 (subagent 01). Schema invariants via `.refine()`

**Why it matters:** "Always X" / "Never Y" / "X implies Z" are common
invariants that don't fit the basic Zod schema shape.

**Patterns:**
- Use `.refine((value) => ..., { message, path: ['<field>'] })` on
  the relevant schema.
- Include a falsification trace in the message — "endLine must be >=
  startLine (SourceLocation is an inclusive 1-based range)".

**Concrete hit:** commit `57359dd`. `SourceLocationSchema` now enforces
`endLine >= startLine`. `TypeRefSchema` now enforces that only
`ddic-table` and `ddic-structure` kinds may carry `fields`.

### Rule 8 (subagent 01). Section tracking ≠ visibility tracking

**Why it matters:** In ABAP, PUBLIC SECTION / PROTECTED SECTION /
PRIVATE SECTION look like decorative noise but they DO change the
visibility of subsequent declarations.

**Patterns:**
- Don't `continue` on a SECTION line without updating state.
- Keep section-aware parsing separate from class-level visibility
  (Rule 5).

**Concrete hit:** commit `f5273c1`. SECTION header detection updated
`visibility` for DATA/TYPES/METHODS. CodeRabbit CRITICAL: previously
attributes declared after PROTECTED SECTION inherited PUBLIC visibility.

### Rule 9 (subagent 01). Direction propagation needs explicit state

**Why it matters:** Hardcoded defaults (e.g. `direction: 'importing'`)
lose information as soon as the source has multiple sections.

**Patterns:**
- Track the current section via a local variable.
- Update it when you see a section header keyword.
- Pass it as a parameter to the per-line parser.

**Concrete hit:** commit `f5273c1`. FM parser: parameters previously
hardcoded to `'importing'`. Now tracks `currentDirection` updated by
each section header (IMPORTING/EXPORTING/CHANGING/TABLES).

### Rule 10 (subagent 01). Tokeniser scope matters

**Why it matters:** A tokeniser that splits on whitespace/comma/period
but not parens will treat `VALUE(rs_pet)` as one token, blocking any
downstream extraction that expects a `VALUE` keyword separate from a
`name`.

**Patterns:**
- Audit the tokeniser's split set against every ABAP construct it
  will feed. Common additions: `(` and `)` for VALUE-wrapper
  extraction, `=` for default-value parsing, `~` for interface-method
  aliases.
- Document the split set in a comment.

**Concrete hit:** commit `f5273c1`. `tokenizeStatement` previously
didn't split on parens. Adding `(` and `)` unblocked VALUE-wrapper
extraction in BOTH class and interface parsers with one change.