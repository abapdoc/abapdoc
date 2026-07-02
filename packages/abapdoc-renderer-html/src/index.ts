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
  options: RenderOptions = {},
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

function renderIndexPage(objects: readonly AbapObject[], title: string): string {
  const groups = groupByKind(objects);
  const sections = (Object.keys(KIND_LABELS) as Array<keyof typeof KIND_LABELS>)
    .filter((kind) => groups[kind].length > 0)
    .map((kind) => renderIndexSection(kind, groups[kind]))
    .join('\n');

  const body = `
<h1>${escapeHtml(title)}</h1>
<p class="lead">${objects.length} documented object${objects.length === 1 ? '' : 's'}.</p>
${sections}
`.trim();

  return htmlShell(title, body);
}

function renderIndexSection(
  kind: keyof typeof KIND_LABELS,
  objs: readonly AbapObject[],
): string {
  const items = objs
    .map(
      (o) =>
        `<li><a href="${escapeHtml(objectPagePath(o))}.html"><code>${escapeHtml(o.name)}</code></a></li>`,
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
  const heading = `
<h1><code>${escapeHtml(obj.name)}</code><span class="badge badge--${cssKind(obj)}">${escapeHtml(KIND_LABELS[cssKind(obj)])}</span></h1>
<a href="index.html">\u2190 ${escapeHtml(siteTitle)}</a>
`.trim();

  const body = obj.kind === 'class'
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
              `<td>${t.doc !== undefined ? escapeHtml(t.doc.summary) : ''}</td></tr>`,
          )
          .join('') +
        `</tbody></table>`,
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
              `<td>${a.doc !== undefined ? escapeHtml(a.doc.summary) : ''}</td></tr>`,
          )
          .join('') +
        `</tbody></table>`,
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
  parts.push(renderParametersTable(fm.parameters));
  if (fm.exceptions.length > 0) parts.push(renderExceptionsList(fm.exceptions));
  return parts.join('\n');
}

function renderProgramBody(p: Program): string {
  return renderDocBlock(p.doc);
}

function renderTableBody(t: Table): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(t.doc));
  parts.push(renderFieldsTable(t.fields));
  return parts.join('\n');
}

function renderStructureBody(s: Structure): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(s.doc));
  parts.push(renderFieldsTable(s.fields));
  return parts.join('\n');
}

function renderInheritance(cls: Class): string {
  const bits: string[] = [];
  if (cls.superclass) {
    bits.push(
      `<p>Extends <a href="${escapeHtml(kebabCase(cls.superclass))}.html"><code>${escapeHtml(cls.superclass)}</code></a></p>`,
    );
  }
  if (cls.interfaces && cls.interfaces.length > 0) {
    const links = cls.interfaces
      .map(
        (i) =>
          `<a href="${escapeHtml(kebabCase(i))}.html"><code>${escapeHtml(i)}</code></a>`,
      )
      .join(', ');
    bits.push(`<p>Implements ${links}</p>`);
  }
  return bits.join('\n');
}

// ---------------------------------------------------------------------------
// Method + parameter + tag rendering
// ---------------------------------------------------------------------------

function renderMethodSection(method: Method): string {
  const badge = `<span class="badge">${escapeHtml(method.visibility)}</span>`;
  const heading = `<h3><code>${escapeHtml(method.name)}</code> ${badge}</h3>`;

  const parts: string[] = [heading];
  parts.push(renderDocBlock(method.doc));

  if (method.parameters.length > 0) parts.push(renderParametersTable(method.parameters));
  if (method.returning) {
    parts.push(
      `<div class="return-callout"><strong>Returns</strong> <code>${escapeHtml(method.returning.type)}</code>${
        method.returning.doc ? ` \u2014 ${escapeHtml(renderDocBlockText(method.returning.doc))}` : ''
      }</div>`,
    );
  }
  if (method.exceptions.length > 0) parts.push(renderExceptionsList(method.exceptions));

  return parts.join('\n');
}

function renderParametersTable(params: readonly Parameter[]): string {
  const rows = params
    .map(
      (p) =>
        `<tr><td><code>${escapeHtml(p.name)}</code></td>` +
        `<td>${escapeHtml(p.direction)}</td>` +
        `<td><code>${escapeHtml(p.type)}</code></td>` +
        `<td>${p.doc ? escapeHtml(renderDocBlockText(p.doc)) : ''}</td></tr>`,
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
  const items = exs.map((e) => `<li><code>${escapeHtml(e.name)}</code></li>`).join('');
  return `<h4>Exceptions</h4><ul>${items}</ul>`;
}

function renderFieldsTable(fields: readonly TypeRef[]): string {
  const rows = fields
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.name)}</code></td>` +
        `<td>${escapeHtml(f.kind)}</td>` +
        `<td><code>${escapeHtml(f.name)}</code></td></tr>`,
    )
    .join('');
  return `
<table>
<thead><tr><th>Name</th><th>Kind</th><th>Reference</th></tr></thead>
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
  const head = doc.description ? `${doc.summary} \u2014 ${doc.description}` : doc.summary;
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
<tr><td><code>${escapeHtml(tag.name)}</code></td><td>${escapeHtml(tag.description)}</td></tr>
</tbody>
</table>`;
    }
    case 'return':
      return `<div class="return-callout"><strong>Returns</strong> ${escapeHtml(tag.description)}</div>`;
    case 'raising': {
      const desc = tag.description ? ` \u2014 ${escapeHtml(tag.description)}` : '';
      return `<p><strong>Raises</strong> <code>${escapeHtml(tag.name)}</code>${desc}</p>`;
    }
    case 'see': {
      const target = kebabCase(tag.target);
      return `<p><strong>See:</strong> <a href="${escapeHtml(target)}.html"><code>${escapeHtml(tag.target)}</code></a></p>`;
    }
    case 'custom':
      return `<p><strong>@${escapeHtml(tag.name)}</strong> ${escapeHtml(tag.body)}</p>`;
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

function cssKind(obj: AbapObject): keyof typeof KIND_LABELS {
  return obj.kind;
}

function groupByKind(objects: readonly AbapObject[]): Record<keyof typeof KIND_LABELS, AbapObject[]> {
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