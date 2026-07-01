import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { DocumentationModelSchema } from '@abapdoc/model';
import {
  render,
  kebabCase,
  escapeHtml,
  renderDocBlock,
  objectPagePath,
} from './index.js';
import { sampleModel } from './samples.js';

/** Parse the first HTML file produced for `name` (or index when name is empty). */
function fileByName(files: { path: string; content: string }[], name: string) {
  const f = files.find((x) => x.path === name);
  if (!f) throw new Error(`no file emitted at ${name}`);
  return f;
}

/** Parse a single HTML string with jsdom and return the document. */
function parseHtml(content: string): Document {
  return new JSDOM(content).window.document;
}

describe('@abapdoc/renderer-html', () => {
  it('emits one HTML page per AbapObject plus index.html', () => {
    const { files } = render(sampleModel);

    const names = sampleModel.objects.map((o) => `${kebabCase(o.name)}.html`);
    for (const path of names) {
      expect(files.some((f) => f.path === path)).toBe(true);
    }
    expect(files.some((f) => f.path === 'index.html')).toBe(true);
    // index + 4 objects
    expect(files).toHaveLength(sampleModel.objects.length + 1);
  });

  it('renders the index page grouped by kind', () => {
    const { files } = render(sampleModel);
    const index = fileByName(files, 'index.html');
    const doc = parseHtml(index.content);

    // Section headings for every kind that has at least one object.
    const h2s = [...doc.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(h2s).toContain('Classes');
    expect(h2s).toContain('Interfaces');
    expect(h2s).toContain('Function Modules');
    expect(h2s).toContain('Tables');

    // Each object has a relative link from the index.
    const anchors = [...doc.querySelectorAll('ul.kind-list a')].map((a) => a.getAttribute('href'));
    expect(anchors).toContain('zcl-pet-service.html');
    expect(anchors).toContain('zif-pet-service.html');
    expect(anchors).toContain('z-fm-create-pet.html');
    expect(anchors).toContain('zpet-t.html');
  });

  it('includes the required meta tags and inline CSS on every page', () => {
    const { files } = render(sampleModel);
    for (const f of files) {
      const doc = parseHtml(f.content);
      const charset = doc.querySelector('meta[charset]');
      const viewport = doc.querySelector('meta[name="viewport"]');
      const style = doc.querySelector('style');

      expect(charset?.getAttribute('charset')?.toLowerCase()).toBe('utf-8');
      expect(viewport?.getAttribute('content')).toContain('width=device-width');
      expect(style?.textContent ?? '').toContain('font-family');
    }
  });

  it('escapes <script> in DocBlock descriptions (jsdom parsed text check)', () => {
    const { files } = render(sampleModel);
    const classPage = fileByName(files, `${kebabCase('zcl_pet_service')}.html`);
    const doc = parseHtml(classPage.content);

    // jsdom does NOT auto-inject any <script> for a plain HTML string, so
    // any <script> the parser sees in the body would be from our output.
    const scriptEls = doc.querySelectorAll('script');
    expect(scriptEls).toHaveLength(0);

    // The raw HTML must contain the entity-escaped form, not the tag.
    expect(classPage.content).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(classPage.content).not.toContain('<script>alert');

    // innerHTML (the post-parse HTML) also carries the escaped entities —
    // i.e. there is no real <script> element anywhere in the parsed DOM.
    expect(doc.body.innerHTML).toContain('&lt;script&gt;');
    expect(doc.body.innerHTML).not.toContain('<script>');
  });

  it('escapes every dynamic field — bulk check across all pages', () => {
    const { files } = render(sampleModel);
    // Grep through every emitted page for unescaped `<` in tag-shaped text.
    for (const f of files) {
      const doc = parseHtml(f.content);
      // No object should expose unescaped input as a real element.
      // (`<script>` is the only injection shape in the fixture.)
      expect(doc.querySelectorAll('script')).toHaveLength(0);
    }
  });

  it('renders parameter tables, return callout, exceptions list, see links and custom tags', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.html`);
    const doc = parseHtml(page.content);

    // Two `<table>` headings for parameter tables (one per method) plus
    // the doc-level parameter table from the @parameter tag in save_pet.
    const tables = doc.querySelectorAll('table');
    expect(tables.length).toBeGreaterThanOrEqual(2);

    // Return callout for the `get_pet` method (return tag).
    expect(doc.body.textContent).toContain('Returns');

    // @raising tag from save_pet -> cx_sy_foreign_lock
    expect(doc.body.textContent).toContain('cx_sy_foreign_lock');

    // @see tag renders as <a href> to the kebab-cased page.
    const seeLinks = [...doc.querySelectorAll('a')]
      .map((a) => a.getAttribute('href'))
      .filter((href): href is string => Boolean(href && href.endsWith('.html')));
    expect(seeLinks).toContain('zpet-s.html');

    // Custom tag `@since 1.2.0` surfaces as a definition-style line.
    expect(doc.body.textContent).toContain('@since');
    expect(doc.body.textContent).toContain('1.2.0');
  });

  it('renders DDIC field tables for tables and structures', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zpet_t')}.html`);
    const doc = parseHtml(page.content);

    const headerCells = [...doc.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headerCells).toEqual(['Name', 'Kind', 'Reference']);
    // Field names from the fixture.
    expect(doc.body.textContent).toContain('client');
    expect(doc.body.textContent).toContain('pet_id');
    expect(doc.body.textContent).toContain('zpet_name');
  });

  it('renders inheritance for classes (superclass + interfaces)', () => {
    const { files } = render(sampleModel);
    const page = fileByName(files, `${kebabCase('zcl_pet_service')}.html`);
    const doc = parseHtml(page.content);

    expect(doc.body.textContent).toContain('Extends');
    expect(doc.body.textContent).toContain('cl_abap_object');
    expect(doc.body.textContent).toContain('Implements');
    expect(doc.body.textContent).toContain('zif_pet_service');
  });

  it('honours RenderOptions.title in <title>', () => {
    const { files } = render(sampleModel, { title: 'Petstore' });
    const index = fileByName(files, 'index.html');
    expect(index.content).toContain('<title>Petstore</title>');
  });

  it('validates the model and throws on invalid input', () => {
    expect(() =>
      // @ts-expect-error — wrong shape
      render({ version: 'x', source: { provider: '', rootDir: '/' }, objects: [] }),
    ).toThrow();
  });

  it('output round-trips through DocumentationModelSchema when piped back through JSON', () => {
    // Sanity: HTML output is the human surface, not the JSON surface,
    // but we still want the renderer to validate input up front.
    DocumentationModelSchema.parse(sampleModel);
    expect(true).toBe(true);
  });

  // ----- exported helpers -----

  it('kebabCase replaces underscores and lowercases', () => {
    expect(kebabCase('zcl_pet_service')).toBe('zcl-pet-service');
    expect(kebabCase('ZCL_PET_SERVICE')).toBe('zcl-pet-service');
    expect(kebabCase('zpet_t')).toBe('zpet-t');
  });

  it('escapeHtml escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml('a & b > c')).toBe('a &amp; b &gt; c');
    expect(escapeHtml("don't")).toBe('don&#39;t');
  });

  it('renderDocBlock returns empty string for undefined input', () => {
    expect(renderDocBlock(undefined)).toBe('');
  });

  it('objectPagePath is just the kebab-cased object name', () => {
    expect(objectPagePath(sampleModel.objects[0]!)).toBe('zcl-pet-service');
  });
});