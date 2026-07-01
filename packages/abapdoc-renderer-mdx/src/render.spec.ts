import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import {
  render,
  kebabCase,
  escapeMarkdown,
  renderFrontmatter,
  renderDocBlock,
} from './index.js';
import { sampleModel } from './samples.js';

function fileByName(files: { path: string; content: string }[], name: string) {
  const f = files.find((x) => x.path === name);
  if (!f) throw new Error(`no file emitted at ${name}`);
  return f;
}

/** Split an MDX document into `{ frontmatter, body }`. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) throw new Error('no frontmatter found');
  return {
    frontmatter: match[1] ?? '',
    body: content.slice(match[0].length),
  };
}

describe('@abapdoc/renderer-mdx', () => {
  it('emits exactly one .mdx file per AbapObject, no index', () => {
    const { files } = render(sampleModel);

    expect(files).toHaveLength(sampleModel.objects.length);
    for (const o of sampleModel.objects) {
      expect(files.some((f) => f.path === `${kebabCase(o.name)}.mdx`)).toBe(true);
    }
    // MDX renderer intentionally emits no index — consumers build their own
    // landing via the site generator's collection of frontmatter.
    expect(files.some((f) => f.path === 'index.mdx')).toBe(false);
  });

  it('starts every file with parseable YAML frontmatter (title + kind)', () => {
    const { files } = render(sampleModel);

    for (const o of sampleModel.objects) {
      const f = fileByName(files, `${kebabCase(o.name)}.mdx`);
      const { frontmatter, body } = splitFrontmatter(f.content);

      const parsed = yaml.load(frontmatter) as Record<string, unknown>;
      expect(parsed.title).toBe(o.name);
      expect(parsed.kind).toBe(o.kind);

      // Body begins with `# <name>` heading.
      expect(body.trimStart().startsWith(`# ${o.name}`)).toBe(true);
    }
  });

  it('emits GFM pipe-syntax parameter tables (NOT JSX <table>)', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.mdx`);

    // No JSX table tags anywhere.
    expect(page.content).not.toContain('<table>');
    expect(page.content).not.toContain('</table>');

    // GFM pipe tables: header row, separator row, body row.
    expect(page.content).toContain('| Name | Direction | Type | Description |');
    expect(page.content).toContain('| --- | --- | --- | --- |');
    // One of the method's importing parameters shows up.
    expect(page.content).toContain('`is_pet`');
    expect(page.content).toContain('`iv_pet_id`');
  });

  it('renders the return callout as a Markdown blockquote', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.mdx`);
    expect(page.content).toContain('> **Returns**');
  });

  it('renders the @raising tag and exceptions list with backticked code', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.mdx`);

    // @raising inside doc tags.
    expect(page.content).toContain('**Raises** `cx_sy_foreign_lock`');
    // Exceptions list at the method level.
    expect(page.content).toContain('- `cx_sy_foreign_lock`');
    expect(page.content).toContain('- `cx_pet_validation`');
  });

  it('renders @see tags as Markdown links to other .mdx pages', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.mdx`);

    // `**See:** [zif_pet_service](./zif-pet-service.mdx)`
    expect(page.content).toContain('**See:** [zif_pet_service](./zif-pet-service.mdx)');
    expect(page.content).toContain('**See:** [zpet_s](./zpet-s.mdx)');
  });

  it('renders DDIC field tables for tables and structures', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zpet_t')}.mdx`);

    expect(page.content).toContain('| Name | Kind | Reference |');
    expect(page.content).toContain('| --- | --- | --- |');
    expect(page.content).toContain('`client`');
    expect(page.content).toContain('`pet_id`');
    expect(page.content).toContain('`zpet_name`');
  });

  it('preserves the literal <script> payload in descriptions (MDX is not HTML)', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.mdx`);

    // MDX consumers parse the document themselves; we are not in an HTML
    // context and do not escape `<` / `>`. The raw payload must survive
    // so the consumer (e.g. Starlight) can decide how to render it.
    expect(page.content).toContain('<script>alert("xss")</script>');
  });

  it('honours RenderOptions even though the v0 renderer does not use them', () => {
    expect(() => render(sampleModel, { title: 'Petstore' })).not.toThrow();
    expect(() => render(sampleModel, {})).not.toThrow();
  });

  it('throws on an invalid model', () => {
    expect(() =>
      // @ts-expect-error — wrong shape
      render({ version: 'x', source: { provider: '', rootDir: '/' }, objects: [] }),
    ).toThrow();
  });

  // ----- exported helpers -----

  it('kebabCase replaces underscores and lowercases', () => {
    expect(kebabCase('zcl_pet_service')).toBe('zcl-pet-service');
    expect(kebabCase('ZPET_T')).toBe('zpet-t');
  });

  it('escapeMarkdown escapes pipes, backticks and newlines', () => {
    expect(escapeMarkdown('a|b')).toBe('a\\|b');
    expect(escapeMarkdown('with `code` inside')).toBe('with \\`code\\` inside');
    expect(escapeMarkdown('line1\nline2')).toBe('line1<br>line2');
  });

  it('renderFrontmatter emits a YAML block with two trailing dashes', () => {
    const fm = renderFrontmatter({ title: 'foo', kind: 'class' });
    expect(fm).toBe('---\ntitle: foo\nkind: class\n---');
  });

  it('renderFrontmatter quotes values that contain YAML-special characters', () => {
    const fm = renderFrontmatter({ title: 'a: b', note: '@since' });
    // The colon-containing title is quoted; the @-prefixed value is quoted too.
    expect(fm).toContain('title: "a: b"');
    expect(fm).toContain('note: "@since"');
  });

  it('renderDocBlock returns empty string for undefined input', () => {
    expect(renderDocBlock(undefined)).toBe('');
  });

  it('renderDocBlock joins summary + description + tags with blank lines', () => {
    const out = renderDocBlock({
      summary: 's',
      description: 'd',
      tags: [{ kind: 'custom', name: 'since', body: '1.0' }],
      sourceLocation: { file: 'x', startLine: 1, endLine: 2 },
    });
    expect(out).toContain('s');
    expect(out).toContain('d');
    expect(out).toContain('**@since** 1.0');
  });
});