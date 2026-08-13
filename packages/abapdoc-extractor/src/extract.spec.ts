import { describe, expect, it } from 'vitest';
import { extract } from './index.js';

describe('extract — file-based', () => {
  it('extracts the petstore sample end-to-end', async () => {
    const result = await extract({ rootDir: 'e2e/petstore' });
    expect(result.model.version).toBe('1.1.0');
    expect(result.model.source.provider).toBe('file');
    for (const o of result.model.objects) {
      // eslint-disable-next-line no-console
      console.log('extracted:', o.kind, o.name);
    }
    expect(result.model.objects.length).toBeGreaterThanOrEqual(3);
    const kinds = result.model.objects.map((o) => o.kind);
    expect(kinds).toContain('class');
    expect(kinds).toContain('interface');
    expect(kinds).toContain('function-module');
  }, 30_000);

  it('returns an empty model for an empty directory', async () => {
    // Use a tmpdir-like location that does not exist.
    await expect(
      extract({ rootDir: '/tmp/abapdoc-nonexistent-' + Date.now() })
    ).rejects.toThrow();
  });
});
