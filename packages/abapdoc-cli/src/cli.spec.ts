import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLI_PATH = join(__dirname, '..', 'dist', 'index.js');

describe('CLI — integration', () => {
  it('builds petstore sample into a temp dir', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'abapdoc-cli-'));
    try {
      const outDir = join(tmp, 'docs');
      const result = await execFileAsync(
        'node',
        [CLI_PATH, 'build', '--src', 'e2e/petstore', '--out', outDir, '--format', 'all'],
        { cwd: join(__dirname, '..', '..', '..') },
      );
      expect(result.stdout).toContain('Rendered');
      // Check files exist
      const indexStat = await stat(join(outDir, 'index.html'));
      expect(indexStat.isFile()).toBe(true);
      const modelStat = await stat(join(outDir, 'model.json'));
      expect(modelStat.isFile()).toBe(true);
      // model.json should parse as JSON
      const modelRaw = await readFile(join(outDir, 'model.json'), 'utf8');
      const model = JSON.parse(modelRaw);
      expect(model.version).toBe('1.0.0');
      expect(model.objects.length).toBeGreaterThanOrEqual(3);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects invalid --format', async () => {
    await expect(
      execFileAsync(
        'node',
        [CLI_PATH, 'build', '--src', 'e2e/petstore', '--out', '/tmp/nope', '--format', 'docx'],
        { cwd: join(__dirname, '..', '..', '..') },
      ),
    ).rejects.toThrow();
  }, 30_000);

  it('rejects missing --src', async () => {
    await expect(
      execFileAsync(
        'node',
        [CLI_PATH, 'build', '--out', '/tmp/nope'],
        { cwd: join(__dirname, '..', '..', '..') },
      ),
    ).rejects.toThrow();
  }, 30_000);
});