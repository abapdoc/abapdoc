import { describe, expect, it } from 'vitest';
import { DocumentationModelSchema } from '@abapdoc/model';
import { render, MODEL_JSON_PATH } from './index.js';
import { sampleModel } from './samples.js';

describe('@abapdoc/renderer-json', () => {
  it('emits exactly one file at model.json', () => {
    const result = render(sampleModel);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(MODEL_JSON_PATH);
    expect(result.files[0]?.path).toBe('model.json');
  });

  it('produces pretty-printed JSON with two-space indentation', () => {
    const { files } = render(sampleModel);
    const content = files[0]?.content ?? '';

    expect(content.startsWith('{\n  "version"')).toBe(true);
    // 2-space indent is visible at the second key level too.
    expect(content).toContain('\n    "provider"');
  });

  it('round-trips through DocumentationModelSchema', () => {
    const { files } = render(sampleModel);
    const parsed = JSON.parse(files[0]?.content ?? '{}');

    // Must not throw — the round-trip is a deep-equal of the inferred shape.
    const revalidated = DocumentationModelSchema.parse(parsed);

    expect(revalidated.version).toBe(sampleModel.version);
    expect(revalidated.objects).toHaveLength(sampleModel.objects.length);
    expect(revalidated.source.provider).toBe(sampleModel.source.provider);
  });

  it('rejects an invalid model', () => {
    expect(() =>
      // missing `version` literal — schema must reject
      render({
        // @ts-expect-error — intentionally wrong shape
        version: 'not-a-version',
        source: { provider: 'x', rootDir: '/' },
        objects: [],
      }),
    ).toThrow();
  });

  it('preserves the literal <script> payload inside descriptions (no escaping needed)', () => {
    const { files } = render(sampleModel);
    const content = files[0]?.content ?? '';

    // JSON has no escaping responsibility for HTML; the raw `<script>`
    // string must survive so the HTML renderer can escape it on its own.
    // (JSON itself still escapes inner quotes — that's correct.)
    expect(content).toContain('<script>alert(\\"xss\\")</script>');
  });

  it('accepts an empty RenderOptions object', () => {
    expect(() => render(sampleModel, {})).not.toThrow();
    expect(() => render(sampleModel, { title: 'whatever' })).not.toThrow();
  });
});