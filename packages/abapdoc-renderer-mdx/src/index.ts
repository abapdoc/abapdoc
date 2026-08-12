/**
 * `@abapdoc/renderer-mdx` — emit a Markdown+frontmatter documentation set
 * from a {@link DocumentationModel}.
 *
 * Pure transformation: returns `{ path, content }` file records; the CLI
 * is responsible for writing them to disk.
 *
 * Output file layout (no `index.mdx` — landing pages are the consumer's
 * concern; many site generators build their own landing from the frontmatter):
 *   <kebab-name>.mdx         — one file per top-level AbapObject.
 *
 * Design constraints:
 *   - No external dependencies beyond `@abapdoc/model` and `zod`.
 *   - No custom MDX components or shortcodes — vanilla GFM Markdown +
 *     YAML frontmatter. Compatible with Astro Starlight, Docusaurus
 *     and MkDocs out of the box.
 *   - Tables are emitted as GFM pipe-syntax tables (`| col | col |`),
 *     never as JSX `<table>`.
 *   - Per the architecture decision, no shared `renderer-common` package.
 *     `kebabCase` is duplicated here.
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
  /** Title for the doc set. Currently unused for MDX (each file carries its own frontmatter title). */
  title?: string;
  /** Reserved for future cross-page links. Not used at v0. */
  basePath?: string;
}

/** Render result — a flat list of `{ path, content }` file records. */
export interface RenderResult {
  files: Array<{ path: string; content: string }>;
}

/**
 * Render a {@link DocumentationModel} to one MDX file per AbapObject.
 *
 * @param model - the model to render. Validated with
 *   {@link DocumentationModelSchema} first.
 * @param _options - reserved for future use.
 * @throws if `model` does not satisfy {@link DocumentationModelSchema}.
 */
export function render(
  model: DocumentationModel,
  _options: RenderOptions = {}
): RenderResult {
  // Cheap insurance at the model boundary.
  DocumentationModelSchema.parse(model);

  return {
    files: model.objects.map((obj) => ({
      path: `${kebabCase(obj.name)}.mdx`,
      content: renderObject(obj),
    })),
  };
}

// ---------------------------------------------------------------------------
// Registry self-registration
// ---------------------------------------------------------------------------

// Register this renderer with the format registry on module import.
// The CLI looks renderers up via `getRenderer('mdx')` instead of
// importing `render` directly, so this side-effect is what makes
// the renderer discoverable.
registerRenderer({ format: 'mdx', render });

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

// ---------------------------------------------------------------------------
// Markdown escaping
// ---------------------------------------------------------------------------

/**
 * Escape characters that have special meaning in GFM Markdown.
 *
 * We MUST escape at least the pipe `|` inside table cells, and we should
 * escape inline-backticks/code-fence delimiters when they appear in
 * descriptions. Other characters (`<`, `>`, `&`, `[`, `]`, etc.) are
 * tolerated by most Markdown renderers as literal text outside of HTML
 * blocks — we don't escape them aggressively so the output stays readable.
 *
 * The test suite asserts that a `<script>` payload survives literally in
 * the description (MDX consumers render it via JSX/markdown; we are not
 * in an HTML context here).
 */
export function escapeMarkdown(value: string): string {
  return (
    value
      // Escape backslashes first so the escapes below are not misread.
      .replace(/\\/g, '\\\\')
      // Pipes inside table cells must be escaped or they break the row.
      .replace(/\|/g, '\\|')
      // Newlines inside table cells must be replaced with `<br>` for GFM.
      .replace(/\r?\n/g, '<br>')
      // Inline backticks would prematurely close a <code> span — escape them.
      .replace(/`/g, '\\`')
  );
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/** Render a YAML frontmatter block. Values are minimal-scalar. */
export function renderFrontmatter(fields: Record<string, string>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function yamlScalar(value: string): string {
  // Quote if the value contains a YAML-special character or leading
  // sigil (e.g. starts with `@`, `&`, `*`, `[`, `{`, `!`, `|`, `>`, or
  // contains `:` followed by a space, `#`, or end-of-line).
  const needsQuoting =
    /[:#]/.test(value) ||
    /^[-&*!|>%@`]/.test(value) ||
    /^\s|\s$/.test(value) ||
    value === '' ||
    /^(true|false|null|yes|no|on|off)$/i.test(value);
  if (!needsQuoting) return value;
  // Use double-quoted scalar; escape backslashes and double quotes.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Per-kind body renderers
// ---------------------------------------------------------------------------

function renderObject(obj: AbapObject): string {
  const frontmatter = renderFrontmatter({
    title: obj.name,
    kind: obj.kind,
  });

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

  return `${frontmatter}\n\n# ${obj.name}\n\n${body}\n`;
}

function renderClassBody(cls: Class): string {
  const parts: string[] = [];

  parts.push(renderDocBlock(cls.doc));

  // Inheritance block — Markdown links to other `.mdx` files.
  const bits: string[] = [];
  if (cls.superclass) {
    bits.push(
      `Extends [${cls.superclass}](./${kebabCase(cls.superclass)}.mdx)`
    );
  }
  if (cls.interfaces && cls.interfaces.length > 0) {
    const links = cls.interfaces
      .map((i) => `[${i}](./${kebabCase(i)}.mdx)`)
      .join(', ');
    bits.push(`Implements ${links}`);
  }
  if (bits.length > 0) parts.push(bits.join('  \n'));

  if ((cls.types ?? []).length > 0) {
    parts.push(`## Types\n`);
    parts.push(renderTypeTable(cls.types ?? []));
  }

  if ((cls.attributes ?? []).length > 0) {
    parts.push(`## Attributes\n`);
    parts.push(renderAttributeTable(cls.attributes ?? []));
  }

  const methods = cls.methods ?? [];
  if (methods.length > 0) {
    parts.push(`## Methods\n`);
    parts.push(methods.map(renderMethod).join('\n\n---\n\n'));
  }

  return parts.join('\n\n');
}

function renderInterfaceBody(iface: Interface): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(iface.doc));
  const methods = iface.methods ?? [];
  if (methods.length > 0) {
    parts.push(`## Methods\n`);
    parts.push(methods.map(renderMethod).join('\n\n---\n\n'));
  }
  return parts.join('\n\n');
}

function renderFunctionModuleBody(fm: FunctionModule): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(fm.doc));
  if (fm.parameters.length > 0)
    parts.push(renderParametersTable(fm.parameters));
  if (fm.exceptions.length > 0) parts.push(renderExceptionsList(fm.exceptions));
  return parts.join('\n\n');
}

function renderProgramBody(p: Program): string {
  return renderDocBlock(p.doc);
}

function renderTableBody(t: Table): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(t.doc));
  parts.push(renderFieldsTable(t.fields));
  return parts.join('\n\n');
}

function renderStructureBody(s: Structure): string {
  const parts: string[] = [];
  parts.push(renderDocBlock(s.doc));
  parts.push(renderFieldsTable(s.fields));
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Method + parameter + tag rendering
// ---------------------------------------------------------------------------

function renderMethod(method: Method): string {
  const parts: string[] = [];
  parts.push(`### ${method.name} _(${method.visibility})_`);

  // If the method has a `returning` parameter, the structured doc
  // shows its type via the Returns blockquote below. Render the method's
  // DocBlock WITHOUT @return tags to avoid producing two duplicate
  // Returns sections (CodeRabbit Major). If the structured return doc is
  // absent, fall back to the @return tag description so the prose is not
  // silently dropped.
  const returnTag = method.doc?.tags.find((t) => t.kind === 'return');
  const returnDescription: string | undefined =
    method.returning?.doc !== undefined
      ? renderDocBlockInline(method.returning.doc)
      : returnTag?.description;

  if (method.doc !== undefined) {
    const tagsForBody =
      method.returning !== undefined
        ? method.doc.tags.filter((t) => t.kind !== 'return')
        : method.doc.tags;
    parts.push(renderDocBlockWithTags(method.doc, tagsForBody));
  }
  if (method.parameters.length > 0)
    parts.push(renderParametersTable(method.parameters));
  if (method.returning) {
    parts.push(
      `> **Returns** \`${escapeMarkdown(method.returning.type)}\`${
        returnDescription !== undefined
          ? ` — ${escapeMdxMarkdown(returnDescription)}`
          : ''
      }`
    );
  }
  if (method.exceptions.length > 0)
    parts.push(renderExceptionsList(method.exceptions));

  return parts.join('\n\n');
}

/** Render a DocBlock using an explicit tag list (used to filter redundant @return). */
function renderDocBlockWithTags(doc: DocBlock, tags: readonly Tag[]): string {
  const parts: string[] = [];
  parts.push(escapeMdxBody(doc.summary));
  if (doc.description) {
    parts.push(escapeMdxBody(doc.description));
  }
  for (const tag of tags) {
    parts.push(renderTag(tag));
  }
  return parts.join('\n\n');
}

function renderParametersTable(params: readonly Parameter[]): string {
  const headers = `| Name | Direction | Type | Description |`;
  const sep = `| --- | --- | --- | --- |`;
  const rows = params
    .map(
      (p) =>
        `| \`${escapeMarkdown(p.name)}\` | ${p.direction} | \`${escapeMarkdown(
          p.type
        )}\` | ${p.doc ? escapeMarkdown(renderDocBlockInline(p.doc)) : ''} |`
    )
    .join('\n');
  return `#### Parameters\n\n${headers}\n${sep}\n${rows}`;
}

function renderExceptionsList(exs: readonly { name: string }[]): string {
  const items = exs.map((e) => `- \`${escapeMarkdown(e.name)}\``).join('\n');
  return `#### Exceptions\n\n${items}`;
}

interface DocBlockLike {
  readonly summary: string;
}

function renderTypeTable(
  types: readonly {
    name: string;
    visibility?: string;
    type: string;
    doc?: DocBlockLike;
  }[]
): string {
  const headers = `| Name | Visibility | Type | Description |`;
  const sep = `| --- | --- | --- | --- |`;
  const rows = types
    .map(
      (t) =>
        `| \`${escapeMarkdown(t.name)}\` | ${
          t.visibility ?? ''
        } | \`${escapeMarkdown(t.type)}\` | ${escapeMarkdown(
          t.doc?.summary ?? ''
        )} |`
    )
    .join('\n');
  return `${headers}\n${sep}\n${rows}`;
}

function renderAttributeTable(
  attrs: readonly {
    name: string;
    visibility: string;
    type: string;
    doc?: DocBlockLike;
  }[]
): string {
  const headers = `| Name | Visibility | Type | Description |`;
  const sep = `| --- | --- | --- | --- |`;
  const rows = attrs
    .map(
      (a) =>
        `| \`${escapeMarkdown(a.name)}\` | ${a.visibility} | \`${escapeMarkdown(
          a.type
        )}\` | ${escapeMarkdown(a.doc?.summary ?? '')} |`
    )
    .join('\n');
  return `${headers}\n${sep}\n${rows}`;
}

function renderFieldsTable(fields: readonly TypeRef[]): string {
  const headers = `| Name | Kind | Reference |`;
  const sep = `| --- | --- | --- |`;
  const rows = fields
    .map(
      (f) =>
        `| \`${escapeMarkdown(f.name)}\` | ${f.kind} | \`${escapeMarkdown(
          f.name
        )}\` |`
    )
    .join('\n');
  return `${headers}\n${sep}\n${rows}`;
}

// ---------------------------------------------------------------------------
// DocBlock rendering
// ---------------------------------------------------------------------------

/**
 * Render a {@link DocBlock} as a sequence of Markdown blocks.
 *
 * Description becomes a plain paragraph; tag sections follow.
 */
/**
 * Escape body text so MDX doesn't interpret it as JSX / expressions.
 *
 * MDX renders any `{...}` as a JSX expression and any `<Tag>` as a
 * component reference. ABAP Doc source text is plain prose, so we
 * escape these characters to keep the output as raw text.
 */
export function escapeMdxBody(value: string): string {
  return value
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Compose MDX-body escaping with Markdown escaping for inline prose.
 *
 * Escapes JSX/HTML-significant characters first so MDX doesn't interpret
 * `{...}` or `<Tag>` as executable markup, then applies Markdown escaping
 * (pipes, backticks, newlines) so the text remains safe inside blockquotes
 * and table cells.
 */
function escapeMdxMarkdown(value: string): string {
  return escapeMarkdown(escapeMdxBody(value));
}

export function renderDocBlock(doc: DocBlock | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];
  parts.push(escapeMdxBody(doc.summary));
  if (doc.description) {
    parts.push(escapeMdxBody(doc.description));
  }
  for (const tag of doc.tags) {
    parts.push(renderTag(tag));
  }
  return parts.join('\n\n');
}

/** Render only the summary+description of a DocBlock, as inline text. */
export function renderDocBlockInline(doc: DocBlock): string {
  return doc.description ? `${doc.summary} — ${doc.description}` : doc.summary;
}

function renderTag(tag: Tag): string {
  switch (tag.kind) {
    case 'parameter': {
      return `#### Parameters\n\n| Name | Description |\n| --- | --- |\n| \`${escapeMarkdown(
        tag.name
      )}\` | ${escapeMarkdown(tag.description)} |`;
    }
    case 'return':
      return `> **Returns** ${escapeMdxMarkdown(tag.description)}`;
    case 'raising': {
      const desc = tag.description
        ? ` — ${escapeMarkdown(tag.description)}`
        : '';
      return `**Raises** \`${escapeMarkdown(tag.name)}\`${desc}`;
    }
    case 'see': {
      const target = kebabCase(tag.target);
      return `**See:** [${tag.target}](./${target}.mdx)`;
    }
    case 'custom':
      return `**@${escapeMarkdown(tag.name)}** ${escapeMarkdown(tag.body)}`;
    default: {
      const _exhaustive: never = tag;
      void _exhaustive;
      return '';
    }
  }
}
