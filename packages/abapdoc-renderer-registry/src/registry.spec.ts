import { describe, expect, it, beforeEach } from 'vitest';
import type { DocumentationModel } from '@abapdoc/model';
import {
  registerRenderer,
  getRenderer,
  listRenderers,
  unregisterRenderer,
  type Renderer,
} from './registry.js';

function sampleModel(): DocumentationModel {
  return {
    version: '1.0.0',
    source: {
      provider: 'test',
      rootDir: '/test',
      generatedAt: '2026-07-02T00:00:00.000Z',
    },
    objects: [],
  };
}

function stubRenderer(format: Renderer['format']): Renderer {
  return {
    format,
    render: () => ({
      files: [{ path: `out.${format}`, content: `# stub ${format}` }],
    }),
  };
}

describe('@abapdoc/renderer-registry', () => {
  beforeEach(() => {
    // Each test starts with a clean slate.
    for (const r of listRenderers()) {
      unregisterRenderer(r.format);
    }
  });

  it('registers a renderer and retrieves it by format', () => {
    const r = stubRenderer('html');
    registerRenderer(r);
    expect(getRenderer('html')).toBe(r);
  });

  it('getRenderer returns undefined for unknown format', () => {
    expect(getRenderer('markdown')).toBeUndefined();
  });

  it('registerRenderer overwrites a previously-registered format', () => {
    const r1 = stubRenderer('html');
    const r2 = stubRenderer('html');
    registerRenderer(r1);
    registerRenderer(r2);
    expect(getRenderer('html')).toBe(r2);
  });

  it('unregisterRenderer removes a registered format', () => {
    registerRenderer(stubRenderer('html'));
    expect(unregisterRenderer('html')).toBe(true);
    expect(getRenderer('html')).toBeUndefined();
  });

  it('listRenderers returns the registered renderers in registration order', () => {
    registerRenderer(stubRenderer('json'));
    registerRenderer(stubRenderer('mdx'));
    registerRenderer(stubRenderer('html'));
    expect(listRenderers().map((r) => r.format)).toEqual([
      'json',
      'mdx',
      'html',
    ]);
  });

  it('registerRenderer rejects a renderer whose format is empty or invalid', () => {
    expect(() =>
      registerRenderer(stubRenderer('' as Renderer['format']))
    ).toThrow();
    expect(() =>
      registerRenderer({
        format: 'foo' as Renderer['format'],
        render: () => ({ files: [] }),
      })
    ).toThrow();
  });

  it('render produces files from the registered renderer', () => {
    registerRenderer(stubRenderer('html'));
    const result = getRenderer('html')!.render(sampleModel());
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.path).toBe('out.html');
  });
});
