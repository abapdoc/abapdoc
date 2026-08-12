/**
 * `@abapdoc/renderer-html` — emit a self-contained HTML documentation
 * site from a {@link DocumentationModel}.
 *
 * Pure transformation: returns `{ path, content }` file records; the CLI
 * is responsible for writing them to disk.
 *
 * Output file layout:
 *   index.html                — landing page grouped by kind.
 *   <kebab-name>.html         — one page per top-level AbapObject.
 *
 * Design constraints:
 *   - No external dependencies beyond `@abapdoc/model` and `zod`.
 *   - No templating engine; small helpers (`escapeHtml`, `kebabCase`,
 *     `renderDocBlock`) are intentionally inlined in this file. Per
 *     architecture decision: duplicated across the three renderers
 *     (YAGNI on a shared `renderer-common` package).
 *   - All dynamic content goes through `escapeHtml`. The spec asserts
 *     that a `<script>` payload in a DocBlock description does NOT
 *     end up as a real `<script>` tag in the rendered page.
 *   - CSS is embedded inline (<80 lines). Self-contained, no external
 *     asset URLs.
 */

import type {
  AbapObject,
  Class,
  DocumentationModel,
  DocBlock,
  FunctionModule,
  Interface,
  Method,
  Parameter,
  Program,
  Structure,
  Table,
  Tag,
  TypeRef,
} from '@abapdoc/model';
import { DocumentationModelSchema } from '@abapdoc/model';
import { registerRenderer } from '@abapdoc/renderer-registry';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options accepted by {@link render}. */
export interface RenderOptions {
  /** Title shown in the `<title>` tag of `index.html`. Defaults to "ABAP Documentation". */
  title?: string;
  /** Reserved for future cross-page links. Not used at v0. */
  basePath?: string;
}

/** Render result — a flat list of `{ path, content }` file records. */
export interface RenderResult {
  files: Array<{ path: string; content: string }>;
}

/**
 * Render a {@link DocumentationModel} to HTML pages.
 *
 * @param model - the model to render. Validated with
 *   {@link DocumentationModelSchema} first.
 * @param options - see {@link RenderOptions}.
 * @throws if `model` does not satisfy {@link DocumentationModelSchema}.
 */
export function render(
  model: DocumentationModel,
  options: RenderOptions = {}
): RenderResult {
  // Cheap insurance at the model boundary.
  DocumentationModelSchema.parse(model);

  const title = options.title ?? 'ABAP Documentation';
  const files: RenderResult['files'] = [];

  // Per-object pages.
  for (const obj of model.objects) {
    files.push({
      path: `${objectPagePath(obj)}.html`,
      content: renderObjectPage(obj, title),
    });
  }

  // Landing page.
  files.push({
    path: 'index.html',
    content: renderIndexPage(model.objects, title),
  });

  return { files };
}

// ---------------------------------------------------------------------------
// Registry self-registration
// ---------------------------------------------------------------------------

// Register this renderer with the format registry on module import.
// The CLI looks renderers up via `getRenderer('html')` instead of
// importing `render` directly, so this side-effect is what makes
// the renderer discoverable.
registerRenderer({ format: 'html', render });
registerRenderer({ format: 'site', render: renderSite });

// ---------------------------------------------------------------------------
// File-path helpers
// ---------------------------------------------------------------------------

/**
 * Kebab-case the ABAP object name.
 *
 * ABAP convention is `zcl_pet_service`; we map underscores to dashes and
 * lowercase for stable file-system paths and URL fragments.
 */
export function kebabCase(name: string): string {
  return name.replace(/_/g, '-').toLowerCase();
}

/** Path (no extension) of the HTML page for a given AbapObject. */
export function objectPagePath(obj: AbapObject): string {
  return kebabCase(obj.name);
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/**
 * Escape every character that has a special meaning in HTML text or
 * attribute values. Use this for EVERY dynamic string interpolated into
 * the page, no exceptions.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Inline CSS
// ---------------------------------------------------------------------------

const CSS = `
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
       max-width: 920px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.55;
       color: #1f2328; background: #fff; }
h1, h2, h3 { line-height: 1.25; margin-top: 1.6em; }
h1 { font-size: 1.9rem; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
h2 { font-size: 1.4rem; border-bottom: 1px solid #d0d7de; padding-bottom: .2em; }
h3 { font-size: 1.1rem; }
.badge { display: inline-block; font-size: .75rem; padding: .15em .55em; border-radius: 1em;
         background: #ddf4ff; color: #0969da; vertical-align: middle; margin-left: .5em; }
.badge--class       { background: #ddf4ff; color: #0969da; }
.badge--interface   { background: #fff8c5; color: #9a6700; }
.badge--fm          { background: #dafbe1; color: #1a7f37; }
.badge--program     { background: #fbefff; color: #8250df; }
.badge--table       { background: #ffebe9; color: #cf222e; }
.badge--structure   { background: #ffebe9; color: #cf222e; }
table { border-collapse: collapse; width: 100%; margin: .5em 0 1.25em; }
th, td { border: 1px solid #d0d7de; padding: .45em .8em; text-align: left; vertical-align: top; }
th { background: #f6f8fa; font-weight: 600; }
dl { margin: .5em 0 1em; }
dt { font-weight: 600; margin-top: .4em; }
dd { margin-left: 1.5em; }
.lead { font-size: 1.05rem; color: #57606a; margin: 0 0 1.25em; }
ul.kind-list { list-style: none; padding-left: 0; }
ul.kind-list li { padding: .35em 0; border-bottom: 1px solid #eaeef2; }
ul.kind-list li:last-child { border-bottom: none; }
.return-callout { background: #fff8c5; border-left: 4px solid #d4a72c;
                  padding: .6em 1em; margin: .75em 0; border-radius: 0 .35em .35em 0; }
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
       background: #f6f8fa; padding: .1em .35em; border-radius: .25em; font-size: .92em; }
a { color: #0969da; text-decoration: none; }
a:hover { text-decoration: underline; }
`;

// ---------------------------------------------------------------------------
// Page-level builders
// ---------------------------------------------------------------------------

function htmlShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

function renderIndexPage(
  objects: readonly AbapObject[],
  title: string
): string {
  const groups = groupByKind(objects);
  const sections = (Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>)
    .filter((kind) => groups[kind].length > 0)
    .map((kind) => renderIndexSection(kind, groups[kind]))
    .join('\n');

  const body = `
<h1>${escapeHtml(title)}</h1>
<p class="lead">${objects.length} documented object${
    objects.length === 1 ? '' : 's'
  }.</p>
${sections}
`.trim();

  return htmlShell(title, body);
}

function renderIndexSection(
  kind: keyof typeof KIND_LABELS,
  objs: readonly AbapObject[]
): string {
  const items = objs
    .map(
      (o) =>
        `<li><a href="${escapeHtml(objectPagePath(o))}.html"><code>${escapeHtml(
          o.name
        )}</code></a></li>`
    )
    .join('\n');
  return `
<h2>${escapeHtml(KIND_LABELS[kind])}</h2>
<ul class="kind-list">
${items}
</ul>
`.trim();
}

function renderObjectPage(obj: AbapObject, siteTitle: string): string {
  const kindLabel = KIND_LABELS[obj.kind];
  const badgeClass = BADGE_CSS_KIND[obj.kind];
  const heading = `
<h1><code>${escapeHtml(
    obj.name
  )}</code><span class="badge badge--${badgeClass}">${escapeHtml(
    kindLabel
  )}</span></h1>
<a href="index.html">\u2190 ${escapeHtml(siteTitle)}</a>
`.trim();

  const body =
    obj.kind === 'class'
      ? renderClassBody(obj)
      : obj.kind === 'interface'
      ? renderInterfaceBody(obj)
      : obj.kind === 'function-module'
      ? renderFunctionModuleBody(obj)
      : obj.kind === 'program'
      ? renderProgramBody(obj)
      : obj.kind === 'table'
      ? renderTableBody(obj)
      : renderStructureBody(obj);

  return htmlShell(`${obj.name} \u00b7 ${siteTitle}`, `${heading}\n${body}`);
}

// ---------------------------------------------------------------------------
// Per-kind bodies
// ---------------------------------------------------------------------------

function renderClassBody(cls: Class): string {
  const parts: string[] = [];

  parts.push(renderDocBlock(cls.doc));
  parts.push(renderInheritance(cls));

  const methods = cls.methods ?? [];
  if (methods.length > 0) {
    parts.push(`<h2>Methods</h2>`);
    parts.push(...methods.map(renderMethodSection));
  }

  if ((cls.types ?? []).length > 0) {
    parts.push(`<h2>Types</h2>`);
    parts.push(
      `<table><thead><tr><th>Name</th><th>Visibility</th><th>Type</th><th>Description</th></tr></thead><tbody>` +
        (cls.types ?? [])
          .map(
            (t) =>
              `<tr><td><code>${escapeHtml(t.name)}</code></td>` +
              `<td>${escapeHtml(t.visibility ?? '')}</td>` +
              `<td><code>${escapeHtml(t.type)}</code></td>` +
              `<td>${
                t.doc !== undefined ? escapeHtml(t.doc.summary) : ''
              }</td></tr>`
          )
          .join('') +
        `</tbody></table>`
    );
  }

  if ((cls.attributes ?? []).length > 0) {
    parts.push(`<h2>Attributes</h2>`);
    parts.push(
      `<table><thead><tr><th>Name</th><th>Visibility</th><th>Type</th><th>Description</th></tr></thead><tbody>` +
        (cls.attributes ?? [])
          .map(
            (a) =>
              `<tr><td><code>${escapeHtml(a.name)}</code></td>` +
              `<td>${escapeHtml(a.visibility)}</td>` +
              `<td><code>${escapeHtml(a.type)}</code></td>` +
              `<td>${
                a.doc !== undefined ? escapeHtml(a.doc.summary) : ''
              }</td></tr>`
          )
          .join('') +
        `</tbody></table>`
    );
  }

  return parts.join('\n');
}

function renderInterfaceBody(iface: Interface): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(iface.doc));
  const methods = iface.methods ?? [];
  if (methods.length > 0) {
    parts.push(`<h2>Methods</h2>`);
    parts.push(...methods.map(renderMethodSection));
  }
  return parts.join('\n');
}

function renderFunctionModuleBody(fm: FunctionModule): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(fm.doc));
  parts.push(
    `<section id="parameters">${renderParametersTable(fm.parameters)}</section>`
  );
  if (fm.exceptions.length > 0)
    parts.push(
      `<section id="exceptions">${renderExceptionsList(
        fm.exceptions
      )}</section>`
    );
  return parts.join('\n');
}

function renderProgramBody(p: Program): string {
  return renderDocBlock(p.doc);
}

function renderTableBody(t: Table): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(t.doc));
  parts.push(`<section id="fields">${renderFieldsTable(t.fields)}</section>`);
  return parts.join('\n');
}

function renderStructureBody(s: Structure): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(s.doc));
  parts.push(`<section id="fields">${renderFieldsTable(s.fields)}</section>`);
  return parts.join('\n');
}

function renderInheritance(cls: Class): string {
  const bits: string[] = [];
  if (cls.superclass) {
    bits.push(
      `<p>Extends <a href="${escapeHtml(
        kebabCase(cls.superclass)
      )}.html"><code>${escapeHtml(cls.superclass)}</code></a></p>`
    );
  }
  if (cls.interfaces && cls.interfaces.length > 0) {
    const links = cls.interfaces
      .map(
        (i) =>
          `<a href="${escapeHtml(kebabCase(i))}.html"><code>${escapeHtml(
            i
          )}</code></a>`
      )
      .join(', ');
    bits.push(`<p>Implements ${links}</p>`);
  }
  return bits.join('\n');
}

// ---------------------------------------------------------------------------
// Method + parameter + tag rendering
// ---------------------------------------------------------------------------

function safeId(value: string, fallback: string): string {
  let out = '';
  for (const c of value.toLowerCase()) {
    if (c === '_' || c === '~') {
      out += '-';
    } else if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-') {
      out += c;
    }
  }
  let start = 0;
  while (start < out.length && out[start] === '-') start++;
  let end = out.length;
  while (end > start && out[end - 1] === '-') end--;
  return out.slice(start, end) || fallback;
}

function methodHeadingId(name: string): string {
  return safeId(name, 'method');
}

function renderMethodSection(method: Method): string {
  const badge = `<span class="badge">${escapeHtml(method.visibility)}</span>`;
  const headingId = escapeHtml(methodHeadingId(method.name));
  const heading = `<h3 id="${headingId}"><code>${escapeHtml(
    method.name
  )}</code> ${badge}</h3>`;

  const parts: string[] = [heading];
  // If the method has a `returning` parameter, the structured doc
  // already shows it via the Returns callout below. Strip @return
  // tags from the body to avoid a duplicate Returns section.
  if (method.doc !== undefined && method.returning !== undefined) {
    parts.push(renderDocBlockFiltered(method.doc, (t) => t.kind !== 'return'));
  } else {
    parts.push(renderDocBlock(method.doc));
  }

  if (method.parameters.length > 0)
    parts.push(renderParametersTable(method.parameters));
  if (method.returning) {
    parts.push(
      `<div class="return-callout"><strong>Returns</strong> <code>${escapeHtml(
        method.returning.type
      )}</code>${
        method.returning.doc
          ? ` \u2014 ${escapeHtml(renderDocBlockText(method.returning.doc))}`
          : ''
      }</div>`
    );
  }
  if (method.exceptions.length > 0)
    parts.push(renderExceptionsList(method.exceptions));

  return parts.join('\n');
}

function renderParametersTable(params: readonly Parameter[]): string {
  const rows = params
    .map(
      (p) =>
        `<tr><td><code>${escapeHtml(p.name)}</code></td>` +
        `<td>${escapeHtml(p.direction)}</td>` +
        `<td><code>${escapeHtml(p.type)}</code></td>` +
        `<td>${p.doc ? escapeHtml(renderDocBlockText(p.doc)) : ''}</td></tr>`
    )
    .join('');
  return `
<h4>Parameters</h4>
<table>
<thead><tr><th>Name</th><th>Direction</th><th>Type</th><th>Description</th></tr></thead>
<tbody>${rows}</tbody>
</table>
`.trim();
}

function renderExceptionsList(exs: readonly { name: string }[]): string {
  const items = exs
    .map((e) => `<li><code>${escapeHtml(e.name)}</code></li>`)
    .join('');
  return `<h4>Exceptions</h4><ul>${items}</ul>`;
}

function renderFieldsTable(fields: readonly TypeRef[]): string {
  const rows = fields
    .map(
      // Fields table: shows each field's name and its kind
      // (data-element / ddic-table / ddic-structure / builtin / custom).
      // We intentionally do NOT show a separate "Reference" column —
      // the field's name IS the reference target; showing it twice
      // was a copy/paste bug.
      (f) =>
        `<tr><td><code>${escapeHtml(f.name)}</code></td>` +
        `<td>${escapeHtml(f.kind)}</td></tr>`
    )
    .join('');
  return `
<table>
<thead><tr><th>Name</th><th>Kind</th></tr></thead>
<tbody>${rows}</tbody>
</table>
`.trim();
}

// ---------------------------------------------------------------------------
// DocBlock rendering
// ---------------------------------------------------------------------------

/**
 * Render a {@link DocBlock} as a sequence of HTML blocks:
 *   - `<p class="lead">summary</p>` (summary line),
 *   - `<p>description</p>` (optional description),
 *   - one or more tag sections.
 *
 * Recursive in spirit: nested DocBlocks (e.g. a parameter DocBlock) are
 * rendered through {@link renderDocBlockText}, which yields just inline text.
 */
/** Render a DocBlock, optionally filtering tags out via `tagFilter`. */
function renderDocBlockFiltered(
  doc: DocBlock | undefined,
  tagFilter: (t: Tag) => boolean
): string {
  if (doc === undefined) return '';
  const parts: string[] = [];
  parts.push(`<p class="lead">${escapeHtml(doc.summary)}</p>`);
  if (doc.description) {
    parts.push(`<p>${escapeHtml(doc.description)}</p>`);
  }
  for (const tag of doc.tags) {
    if (!tagFilter(tag)) continue;
    parts.push(renderTag(tag));
  }
  return parts.join('\n');
}

export function renderDocBlock(doc: DocBlock | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];
  parts.push(`<p class="lead">${escapeHtml(doc.summary)}</p>`);
  if (doc.description) {
    parts.push(`<p>${escapeHtml(doc.description)}</p>`);
  }
  for (const tag of doc.tags) {
    parts.push(renderTag(tag));
  }
  return parts.join('\n');
}

/**
 * Render a {@link DocBlock} as plain inline text (used inside table cells
 * and callouts). Strips tag sections — only `summary` and `description`
 * are surfaced.
 */
export function renderDocBlockText(doc: DocBlock): string {
  const head = doc.description
    ? `${doc.summary} \u2014 ${doc.description}`
    : doc.summary;
  return head;
}

function renderTag(tag: Tag): string {
  switch (tag.kind) {
    case 'parameter': {
      // Render parameter tags as part of the parameter table; emit a
      // heading + table anyway so method-level @parameter tags are visible.
      return `<h4>Parameters</h4>
<table>
<thead><tr><th>Name</th><th>Description</th></tr></thead>
<tbody>
<tr><td><code>${escapeHtml(tag.name)}</code></td><td>${escapeHtml(
        tag.description
      )}</td></tr>
</tbody>
</table>`;
    }
    case 'return':
      return `<div class="return-callout"><strong>Returns</strong> ${escapeHtml(
        tag.description
      )}</div>`;
    case 'raising': {
      const desc = tag.description
        ? ` \u2014 ${escapeHtml(tag.description)}`
        : '';
      return `<p><strong>Raises</strong> <code>${escapeHtml(
        tag.name
      )}</code>${desc}</p>`;
    }
    case 'see': {
      const target = kebabCase(tag.target);
      return `<p><strong>See:</strong> <a href="${escapeHtml(
        target
      )}.html"><code>${escapeHtml(tag.target)}</code></a></p>`;
    }
    case 'custom':
      return `<p><strong>@${escapeHtml(tag.name)}</strong> ${escapeHtml(
        tag.body
      )}</p>`;
    default: {
      // Exhaustiveness guard — if a new tag kind is added we want a
      // typecheck failure, not a silent skip.
      const _exhaustive: never = tag;
      void _exhaustive;
      return '';
    }
  }
}

// ---------------------------------------------------------------------------
// Grouping for the index
// ---------------------------------------------------------------------------

const KIND_LABELS = {
  class: 'Classes',
  interface: 'Interfaces',
  'function-module': 'Function Modules',
  program: 'Programs',
  table: 'Tables',
  structure: 'Structures',
} as const;

const BADGE_CSS_KIND: Record<AbapObject['kind'], string> = {
  class: 'class',
  interface: 'interface',
  'function-module': 'fm',
  program: 'program',
  table: 'table',
  structure: 'structure',
};

function groupByKind(
  objects: readonly AbapObject[]
): Record<keyof typeof KIND_LABELS, AbapObject[]> {
  const out: Record<keyof typeof KIND_LABELS, AbapObject[]> = {
    class: [],
    interface: [],
    'function-module': [],
    program: [],
    table: [],
    structure: [],
  };
  for (const o of objects) out[o.kind].push(o);
  return out;
}

// ---------------------------------------------------------------------------
// Site renderer — docs-site output for GitHub Pages
// ---------------------------------------------------------------------------

const SITE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f6f8fa;
  --text: #1f2328;
  --muted: #57606a;
  --border: #d0d7de;
  --accent: #0969da;
  --accent-weak: #ddf4ff;
  --header-height: 3.5rem;
  --sidebar-width: 16rem;
  --outline-width: 14rem;
  --radius: 0.5rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --text: #c9d1d9;
    --muted: #8b949e;
    --border: #30363d;
    --accent: #58a6ff;
    --accent-weak: #13213a;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}
button { font: inherit; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.site-header {
  position: fixed; inset: 0 0 auto 0;
  height: var(--header-height);
  display: flex; align-items: center; gap: 1rem;
  padding: 0 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 100;
}
.site-header__brand { font-weight: 700; font-size: 1.15rem; display: flex; align-items: center; gap: .5rem; }
.site-header__brand a { color: var(--text); }
.site-header__nav { display: flex; gap: .75rem; margin-left: auto; }
.site-header__nav a { color: var(--muted); font-size: .95rem; padding: .25rem .5rem; border-radius: var(--radius); }
.site-header__nav a[aria-current="page"], .site-header__nav a:hover { color: var(--text); background: var(--bg); }
.site-search { width: 12rem; padding: .35rem .6rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text); }
.layout { display: grid; grid-template-columns: var(--sidebar-width) 1fr; padding-top: var(--header-height); min-height: 100vh; }
.layout.has-outline { grid-template-columns: var(--sidebar-width) 1fr var(--outline-width); }
.sidebar {
  position: fixed; top: var(--header-height); bottom: 0; left: 0; width: var(--sidebar-width);
  overflow-y: auto; padding: 1rem; border-right: 1px solid var(--border); background: var(--bg);
}
.sidebar h3 { font-size: .8rem; text-transform: uppercase; color: var(--muted); margin: 1rem 0 .5rem; }
.sidebar ul { list-style: none; padding: 0; margin: 0; }
.sidebar li { margin: .1rem 0; }
.sidebar a { display: block; padding: .3rem .5rem; border-radius: var(--radius); color: var(--text); font-size: .92rem; }
.sidebar a:hover, .sidebar a[aria-current="page"] { background: var(--accent-weak); color: var(--accent); }
.sidebar details { margin: .2rem 0; }
.sidebar summary { cursor: pointer; padding: .3rem .5rem; border-radius: var(--radius); font-size: .92rem; }
.sidebar summary:hover { background: var(--surface); }
.sidebar .toggle-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem; }
.sidebar .toggle-row label { font-size: .85rem; color: var(--muted); }
.hidden { display: none; }
.sidebar-toggle { display: none; background: none; border: 1px solid var(--border); border-radius: var(--radius); padding: .4rem; margin-right: .5rem; cursor: pointer; }
main { grid-column: 2; padding: 2rem 3rem; max-width: 52rem; }
main h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: .3rem; }
main h2 { font-size: 1.4rem; border-bottom: 1px solid var(--border); padding-bottom: .2rem; margin-top: 2rem; }
main h3 { font-size: 1.1rem; margin-top: 1.6rem; }
.outline {
  position: fixed; top: var(--header-height); right: 0; bottom: 0; width: var(--outline-width);
  overflow-y: auto; padding: 1rem; border-left: 1px solid var(--border); font-size: .88rem;
}
.outline ul { list-style: none; padding-left: 0; margin: 0; }
.outline li { margin: .25rem 0; }
.outline a { color: var(--muted); display: block; padding: .15rem 0; }
.outline a[aria-current="true"], .outline a:hover { color: var(--accent); }
.kind-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); gap: 1rem; margin-top: 1rem; }
.kind-card { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; background: var(--surface); }
.kind-card h3 { margin: 0 0 .5rem; font-size: 1rem; }
.kind-card a { display: block; padding: .2rem 0; }
.badge { display: inline-block; font-size: .75rem; padding: .15em .55em; border-radius: 1em; vertical-align: middle; margin-left: .5em; }
.badge--class { background: var(--accent-weak); color: var(--accent); }
.badge--interface { background: #fff8c5; color: #9a6700; }
.badge--fm { background: #dafbe1; color: #1a7f37; }
.badge--program { background: #fbefff; color: #8250df; }
.badge--table { background: #ffebe9; color: #cf222e; }
.badge--structure { background: #ffebe9; color: #cf222e; }
table { border-collapse: collapse; width: 100%; margin: .5em 0 1.25em; }
th, td { border: 1px solid var(--border); padding: .45em .8em; text-align: left; vertical-align: top; }
th { background: var(--surface); font-weight: 600; }
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; background: var(--surface); padding: .1em .35em; border-radius: .25em; font-size: .92em; }
.return-callout { background: #fff8c5; border-left: 4px solid #d4a72c; padding: .6em 1em; margin: .75em 0; border-radius: 0 var(--radius) var(--radius) 0; }
@media (prefers-color-scheme: dark) { .return-callout { background: #2c2308; border-left-color: #b08800; } }
.lead { font-size: 1.05rem; color: var(--muted); margin: 0 0 1.25em; }
.hero { padding: 2rem 0 1rem; }
.hero h1 { border: none; font-size: 2.4rem; margin-bottom: .5rem; }
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.feature { border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
.feature h3 { margin-top: 0; }
@media (max-width: 900px) {
  .layout, .layout.has-outline { grid-template-columns: 1fr; }
  .sidebar { transform: translateX(-100%); transition: transform .2s; z-index: 90; }
  .sidebar.open { transform: translateX(0); }
  .outline { display: none; }
  .sidebar-toggle { display: block; }
  main { padding: 1.25rem; }
}
`;

const SITE_JS = `
(() => {
  const menuToggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuToggle && sidebar) menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

  const search = document.getElementById('sidebar-search');
  if (search) {
    search.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.sidebar [data-search]').forEach(el => {
        const show = (el.dataset.search || '').toLowerCase().includes(term);
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });
      document.querySelectorAll('.sidebar details').forEach(d => {
        const any = d.querySelector('[data-search]:not(.hidden)');
        d.open = !!any;
      });
    });
  }

  const viewToggle = document.getElementById('view-toggle');
  const refNested = document.querySelector('.ref-nested');
  const refFlat = document.querySelector('.ref-flat');
  if (viewToggle && refNested && refFlat) {
    viewToggle.addEventListener('change', (e) => {
      refNested.style.display = e.target.checked ? 'none' : 'block';
      refFlat.style.display = e.target.checked ? 'block' : 'none';
    });
  }

  const outline = document.querySelector('.outline');
  if (outline) {
    const headings = [...document.querySelectorAll('main [id]')].filter(h => /^h[2-3]$/i.test(h.tagName));
    if (headings.length > 0) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            outline.querySelectorAll('a').forEach(a => a.removeAttribute('aria-current'));
            const link = outline.querySelector('a[href="#' + entry.target.id + '"]');
            if (link) link.setAttribute('aria-current', 'true');
          }
        });
      }, { rootMargin: '-20% 0px -60% 0px' });
      headings.forEach(h => obs.observe(h));
    }
  }
})();
`;

function objectPackage(obj: AbapObject): string {
  const file = obj.sourceLocation?.file ?? '';
  const parts = file.replace(/\\/g, '/').split('/');
  parts.pop();
  if (parts[0] === 'src') parts.shift();
  return parts.join('/');
}

interface PackageNode {
  name: string;
  path: string;
  objects: AbapObject[];
  children: Record<string, PackageNode>;
}

function buildPackageTree(objects: readonly AbapObject[]): PackageNode {
  const root: PackageNode = {
    name: 'root',
    path: '',
    objects: [],
    children: {},
  };
  for (const obj of objects) {
    const segments = objectPackage(obj).split('/').filter(Boolean);
    let node = root;
    for (const segment of segments) {
      if (!node.children[segment]) {
        node.children[segment] = {
          name: segment,
          path: node.path ? `${node.path}/${segment}` : segment,
          objects: [],
          children: {},
        };
      }
      node = node.children[segment];
    }
    node.objects.push(obj);
  }
  return root;
}

function siteShell(
  title: string,
  body: string,
  opts: {
    current?: string;
    pageTitle?: string;
    outline?: string;
    navTree?: string;
    rootPrefix?: string;
  } = {}
): string {
  const rootPrefix = opts.rootPrefix ?? '';
  const pageTitle =
    opts.pageTitle ??
    (opts.current && opts.current !== 'home'
      ? `${opts.current} · ${title}`
      : title);
  const hasOutline = opts.outline ? ' has-outline' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<style>${SITE_CSS}</style>
</head>
<body>
<header class="site-header">
<button class="sidebar-toggle" aria-label="Toggle sidebar">≡</button>
<div class="site-header__brand"><a href="${rootPrefix}index.html">${escapeHtml(
    title
  )}</a></div>
<nav class="site-header__nav" aria-label="Top">
<a href="${rootPrefix}index.html" ${
    opts.current === 'home' ? 'aria-current="page"' : ''
  }>Home</a>
<a href="${rootPrefix}getting-started.html" ${
    opts.current === 'getting-started' ? 'aria-current="page"' : ''
  }>Getting Started</a>
<a href="${rootPrefix}architecture.html" ${
    opts.current === 'architecture' ? 'aria-current="page"' : ''
  }>Architecture</a>
<a href="${rootPrefix}examples.html" ${
    opts.current === 'examples' ? 'aria-current="page"' : ''
  }>Examples</a>
<a href="${rootPrefix}reference.html" ${
    opts.current === 'reference' ? 'aria-current="page"' : ''
  }>Reference</a>
</nav>
</header>
<div class="layout${hasOutline}">
<aside class="sidebar">
<input class="site-search" id="sidebar-search" type="search" placeholder="Search pages…" aria-label="Search pages">
${opts.navTree ?? ''}
</aside>
<main>${body}</main>
${
  opts.outline
    ? `<aside class="outline"><nav aria-label="On this page"><ul>${opts.outline}</ul></nav></aside>`
    : ''
}
</div>
<script>${SITE_JS}</script>
</body>
</html>`;
}

function renderNavTree({
  currentPage,
  currentObject,
  tree,
  rootPrefix = '',
  objectPrefix = '',
}: {
  currentPage?: string;
  currentObject?: string;
  tree: PackageNode;
  rootPrefix?: string;
  objectPrefix?: string;
}): string {
  const top = `<ul class="top-nav"><li><a href="${rootPrefix}index.html" ${
    currentPage === 'home' ? 'aria-current="page"' : ''
  }>Home</a></li><li><a href="${rootPrefix}getting-started.html" ${
    currentPage === 'getting-started' ? 'aria-current="page"' : ''
  }>Getting Started</a></li><li><a href="${rootPrefix}architecture.html" ${
    currentPage === 'architecture' ? 'aria-current="page"' : ''
  }>Architecture</a></li><li><a href="${rootPrefix}examples.html" ${
    currentPage === 'examples' ? 'aria-current="page"' : ''
  }>Examples</a></li><li><a href="${rootPrefix}reference.html" ${
    currentPage === 'reference' ? 'aria-current="page"' : ''
  }>Reference</a></li></ul><h3>Objects</h3>`;
  return (
    top + renderNestedPackageTree(tree, objectPrefix, currentObject ?? '', 0)
  );
}

function renderObjectLink(
  o: AbapObject,
  base: string,
  current: string
): string {
  const path = `${base}${objectPagePath(o)}.html`;
  const active = current === path ? 'aria-current="page"' : '';
  const summary = o.doc?.summary ?? '';
  return `<li data-search="${escapeHtml(
    `${o.name} ${summary}`
  )}"><a href="${escapeHtml(path)}" ${active}><code>${escapeHtml(
    o.name
  )}</code><span class="badge badge--${BADGE_CSS_KIND[o.kind]}">${escapeHtml(
    KIND_LABELS[o.kind]
  )}</span></a></li>`;
}

function renderNestedPackageTree(
  node: PackageNode,
  base: string,
  current: string,
  depth = 0
): string {
  const objLinks = node.objects
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((o) => renderObjectLink(o, base, current))
    .join('');

  const childItems = Object.values(node.children)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) => renderNestedPackageTree(child, base, current, depth + 1))
    .join('');

  if (depth === 0) {
    return `<ul class="nested-list">${objLinks}${childItems}</ul>`;
  }

  const all = objLinks + childItems;
  return `<li><details open><summary>${escapeHtml(
    node.name
  )}</summary><ul>${all}</ul></details></li>`;
}

function renderFlatPackageTree(node: PackageNode, base: string): string {
  const rows = collectObjects(node)
    .sort((a, b) => a.obj.name.localeCompare(b.obj.name))
    .map(({ obj, pkg }) => {
      const path = `${base}${objectPagePath(obj)}.html`;
      const summary = obj.doc?.summary ?? '';
      return `<li data-search="${escapeHtml(
        `${obj.name} ${summary}`
      )}"><a href="${escapeHtml(path)}"><code>${escapeHtml(
        obj.name
      )}</code><span class="badge badge--${
        BADGE_CSS_KIND[obj.kind]
      }">${escapeHtml(
        KIND_LABELS[obj.kind]
      )}</span><small style="color:var(--muted);display:block">${escapeHtml(
        pkg || 'root'
      )}</small></a></li>`;
    })
    .join('');
  return `<ul class="flat-list">${rows}</ul>`;
}

function collectObjects(
  node: PackageNode,
  pkg = ''
): { obj: AbapObject; pkg: string }[] {
  const out: { obj: AbapObject; pkg: string }[] = [];
  for (const obj of node.objects) out.push({ obj, pkg });
  for (const child of Object.values(node.children)) {
    out.push(
      ...collectObjects(child, pkg ? `${pkg}/${child.name}` : child.name)
    );
  }
  return out;
}

function headingId(text: string): string {
  return safeId(text, 'section');
}

function addBodyHeadingIds(html: string): string {
  return html.replace(/<h2>([^<]+)<\/h2>/g, (match, text) => {
    const id = headingId(text.trim());
    return `<h2 id="${escapeHtml(id)}">${text}</h2>`;
  });
}

function renderSiteObjectBody(obj: AbapObject): string {
  const body =
    obj.kind === 'class'
      ? renderClassBody(obj)
      : obj.kind === 'interface'
      ? renderInterfaceBody(obj)
      : obj.kind === 'function-module'
      ? renderFunctionModuleBody(obj)
      : obj.kind === 'program'
      ? renderProgramBody(obj)
      : obj.kind === 'table'
      ? renderTableBody(obj)
      : renderStructureBody(obj);
  return addBodyHeadingIds(body);
}

function buildObjectOutline(obj: AbapObject): string {
  const items: string[] = [];
  if (obj.kind === 'class') {
    if (obj.types?.length) items.push('<li><a href="#types">Types</a></li>');
    if (obj.attributes?.length)
      items.push('<li><a href="#attributes">Attributes</a></li>');
    if (obj.methods?.length)
      items.push('<li><a href="#methods">Methods</a></li>');
  } else if (obj.kind === 'interface') {
    if (obj.methods?.length)
      items.push('<li><a href="#methods">Methods</a></li>');
  } else if (obj.kind === 'function-module') {
    items.push('<li><a href="#parameters">Parameters</a></li>');
    if (obj.exceptions.length)
      items.push('<li><a href="#exceptions">Exceptions</a></li>');
  } else if (obj.kind === 'table' || obj.kind === 'structure') {
    items.push('<li><a href="#fields">Fields</a></li>');
  }
  return items.join('');
}

function renderHomePage(
  title: string,
  navTree: string,
  rootPrefix = ''
): string {
  const body = `
<div class="hero">
<h1>${escapeHtml(title)}</h1>
<p class="lead">ABAP Docs as never before — a modern, extensible documentation pipeline for ABAP repository objects.</p>
</div>
<p>abapdoc extracts <strong>ABAP Doc</strong> comments from abapGit-style repositories and renders them as HTML, MDX (ready for Astro Starlight, Docusaurus, MkDocs) and JSON.</p>
<h2>Why abapdoc?</h2>
<div class="feature-grid">
<div class="feature"><h3>Pluggable extraction</h3><p>Start with the file-based extractor; swap in an ADT/AST extractor later without changing renderers.</p></div>
<div class="feature"><h3>Model-first</h3><p>A Zod-defined, format-independent documentation model shared by every output.</p></div>
<div class="feature"><h3>Multiple renderers</h3><p>HTML, MDX and JSON outputs are pure transformations of the same model.</p></div>
</div>
<h2>Quick start</h2>
<pre><code>npm install
npm run build
npm run abapdoc -- build --src e2e/petstore --out dist/docs --format html</code></pre>
<p>Then open <code>dist/docs/index.html</code>.</p>
<h2>Learn more</h2>
<ul>
<li><a href="${rootPrefix}getting-started.html">Getting Started</a></li>
<li><a href="${rootPrefix}architecture.html">Architecture</a></li>
<li><a href="${rootPrefix}examples.html">Examples</a></li>
<li><a href="${rootPrefix}reference.html">SDK Reference</a></li>
</ul>
`;
  return siteShell(title, body, { current: 'home', navTree, rootPrefix });
}

function renderGettingStartedPage(
  title: string,
  navTree: string,
  rootPrefix = ''
): string {
  const body = `
<h1>Getting Started</h1>
<p class="lead">Generate ABAP documentation from an abapGit-style repository in a few commands.</p>
<h2>Install</h2>
<pre><code>npm install
npm run build</code></pre>
<h2>Generate HTML docs</h2>
<pre><code>npm run abapdoc -- build --src e2e/petstore --out dist/docs --format html</code></pre>
<h2>Generate MDX for a documentation framework</h2>
<pre><code>npm run abapdoc -- build --src e2e/petstore --out docs-mdx --format mdx</code></pre>
<h2>Validate a repository</h2>
<pre><code>npm run abapdoc -- validate --src e2e/petstore</code></pre>
<h2>Next steps</h2>
<p>Read the <a href="${rootPrefix}architecture.html">architecture overview</a> or browse the <a href="${rootPrefix}reference.html">SDK reference</a>.</p>
`;
  return siteShell(title, body, {
    current: 'getting-started',
    navTree,
    rootPrefix,
  });
}

function renderArchitecturePage(
  title: string,
  navTree: string,
  rootPrefix = ''
): string {
  const body = `
<h1>Architecture</h1>
<p class="lead">abapdoc is split into three independent layers: extraction, model and rendering.</p>
<h2>Extraction layer</h2>
<p>The extractor walks an abapGit-style repo, reads DDIC XML and ABAP source, and delegates source parsing to <code>@abapdoc/parser</code>. The current file-based extractor is intentionally small; AST/ADT extractors slot in later.</p>
<h2>Model layer</h2>
<p>The model is defined once with Zod and exported as JSON Schema. It is the only contract between extraction and rendering, so new output formats need no I/O or extraction logic.</p>
<h2>Rendering layer</h2>
<p>Each renderer (<code>renderer-html</code>, <code>renderer-mdx</code>, <code>renderer-json</code>) consumes only the model and returns a flat list of file records. They share no state and can be tested in isolation.</p>
<h2>Extending abapdoc</h2>
<ul>
<li>Add custom tags in the parser and model.</li>
<li>Implement a new extractor by producing the same model.</li>
<li>Implement a new renderer by consuming the model.</li>
</ul>
<p>See the <a href="https://github.com/abapdoc/abapdoc">GitHub repository</a> for the full design document and source code.</p>
`;
  return siteShell(title, body, {
    current: 'architecture',
    navTree,
    rootPrefix,
  });
}

function renderExamplesPage(
  title: string,
  navTree: string,
  rootPrefix = ''
): string {
  const body = `
<h1>Examples</h1>
<p class="lead">The <code>e2e/petstore</code> sample is a tiny abapGit repository that demonstrates the generated documentation output.</p>
<h2>Petstore sample</h2>
<p>It contains a service interface, a database table, a service class and a utility function module. Run the following command to generate the docs locally:</p>
<pre><code>npm run abapdoc -- build --src e2e/petstore --out dist/petstore --format html</code></pre>
<p><a href="${rootPrefix}reference.html">Browse the generated SDK reference</a> to see the object pages, package grouping, search and right-hand outline in action.</p>
`;
  return siteShell(title, body, { current: 'examples', navTree, rootPrefix });
}

function renderReferenceIndexPage(
  model: DocumentationModel,
  title: string,
  navTree: string,
  rootPrefix = '',
  objectPrefix = 'objects/'
): string {
  const tree = buildPackageTree(model.objects);
  const kindGroups = groupByKind(model.objects);
  const kindCards = (
    Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>
  )
    .filter((k) => kindGroups[k].length > 0)
    .map((k) => {
      const links = kindGroups[k]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(
          (o) =>
            `<a href="${escapeHtml(
              `${objectPrefix}${objectPagePath(o)}.html`
            )}"><code>${escapeHtml(o.name)}</code></a>`
        )
        .join('');
      return `<div class="kind-card"><h3>${escapeHtml(
        KIND_LABELS[k]
      )}</h3>${links}</div>`;
    })
    .join('');
  const body = `
<h1>SDK Reference</h1>
<p class="lead">${model.objects.length} documented object${
    model.objects.length === 1 ? '' : 's'
  }.</p>
<div class="toggle-row">
<label for="view-toggle">Flat list</label>
<input type="checkbox" id="view-toggle" aria-label="Toggle flat list">
</div>
<div class="ref-nested">
${renderNestedPackageTree(tree, objectPrefix, '')}
</div>
<div class="ref-flat" style="display:none">
${renderFlatPackageTree(tree, objectPrefix)}
</div>
<h2>By kind</h2>
<div class="kind-grid">${kindCards}</div>
`;
  return siteShell(title, body, {
    current: 'reference',
    navTree,
    rootPrefix,
  });
}

function renderSiteObjectPage(
  obj: AbapObject,
  title: string,
  navTree: string,
  rootPrefix = '../'
): string {
  const kindLabel = KIND_LABELS[obj.kind];
  const badgeClass = BADGE_CSS_KIND[obj.kind];
  const heading = `<h1><code>${escapeHtml(
    obj.name
  )}</code><span class="badge badge--${badgeClass}">${escapeHtml(
    kindLabel
  )}</span></h1>`;
  const body = `${heading}\n${renderSiteObjectBody(obj)}`;
  const outline = buildObjectOutline(obj);
  return siteShell(title, body, {
    current: 'reference',
    pageTitle: obj.name,
    outline,
    navTree,
    rootPrefix,
  });
}

export function renderSite(
  model: DocumentationModel,
  options: RenderOptions = {}
): RenderResult {
  DocumentationModelSchema.parse(model);
  const title = options.title ?? 'abapdoc';
  const tree = buildPackageTree(model.objects);
  const OBJECT_PREFIX = 'objects/';
  const navFor = (opts: {
    currentPage: string;
    currentObject?: string;
    rootPrefix: string;
    objectPrefix: string;
  }) =>
    renderNavTree({
      currentPage: opts.currentPage,
      currentObject: opts.currentObject,
      tree,
      rootPrefix: opts.rootPrefix,
      objectPrefix: opts.objectPrefix,
    });
  const files: RenderResult['files'] = [];

  files.push({
    path: 'index.html',
    content: renderHomePage(
      title,
      navFor({
        currentPage: 'home',
        rootPrefix: '',
        objectPrefix: OBJECT_PREFIX,
      })
    ),
  });
  files.push({
    path: 'getting-started.html',
    content: renderGettingStartedPage(
      title,
      navFor({
        currentPage: 'getting-started',
        rootPrefix: '',
        objectPrefix: OBJECT_PREFIX,
      })
    ),
  });
  files.push({
    path: 'architecture.html',
    content: renderArchitecturePage(
      title,
      navFor({
        currentPage: 'architecture',
        rootPrefix: '',
        objectPrefix: OBJECT_PREFIX,
      })
    ),
  });
  files.push({
    path: 'examples.html',
    content: renderExamplesPage(
      title,
      navFor({
        currentPage: 'examples',
        rootPrefix: '',
        objectPrefix: OBJECT_PREFIX,
      })
    ),
  });
  files.push({
    path: 'reference.html',
    content: renderReferenceIndexPage(
      model,
      title,
      navFor({
        currentPage: 'reference',
        rootPrefix: '',
        objectPrefix: OBJECT_PREFIX,
      })
    ),
  });

  for (const obj of model.objects) {
    const objectPath = `${objectPagePath(obj)}.html`;
    files.push({
      path: `${OBJECT_PREFIX}${objectPath}`,
      content: renderSiteObjectPage(
        obj,
        title,
        navFor({
          currentPage: 'reference',
          currentObject: objectPath,
          rootPrefix: '../',
          objectPrefix: '',
        })
      ),
    });
  }

  return { files };
}
