import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
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
        [
          CLI_PATH,
          'build',
          '--src',
          'e2e/petstore',
          '--out',
          outDir,
          '--format',
          'all',
        ],
        { cwd: join(__dirname, '..', '..', '..') }
      );
      expect(result.stdout).toContain('Rendered');
      // `--format all` writes each format into its own subdirectory so
      // colliding top-level filenames cannot overwrite each other.
      const indexStat = await stat(join(outDir, 'html', 'index.html'));
      expect(indexStat.isFile()).toBe(true);
      const modelStat = await stat(join(outDir, 'json', 'model.json'));
      expect(modelStat.isFile()).toBe(true);
      // model.json should parse as JSON
      const modelRaw = await readFile(
        join(outDir, 'json', 'model.json'),
        'utf8'
      );
      const model = JSON.parse(modelRaw);
      expect(model.version).toBe('1.1.0');
      expect(model.objects.length).toBeGreaterThanOrEqual(3);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects invalid --format', async () => {
    await expect(
      execFileAsync(
        'node',
        [
          CLI_PATH,
          'build',
          '--src',
          'e2e/petstore',
          '--out',
          '/tmp/nope',
          '--format',
          'docx',
        ],
        { cwd: join(__dirname, '..', '..', '..') }
      )
    ).rejects.toThrow();
  }, 30_000);

  it('rejects missing --src', async () => {
    await expect(
      execFileAsync('node', [CLI_PATH, 'build', '--out', '/tmp/nope'], {
        cwd: join(__dirname, '..', '..', '..'),
      })
    ).rejects.toThrow();
  }, 30_000);

  it('routes --format html through the registry to the HTML renderer', async () => {
    // The CLI used to have a hardcoded `fmt === 'json' ? renderJson
    // : fmt === 'html' ? renderHtml : renderMdx` ternary. This test
    // pins the new contract: a single-format --format html invocation
    // must produce ONLY HTML files, exercising the dispatch via
    // `getRenderer('html')`.
    const tmp = await mkdtemp(join(tmpdir(), 'abapdoc-cli-html-'));
    try {
      const outDir = join(tmp, 'docs');
      const result = await execFileAsync(
        'node',
        [
          CLI_PATH,
          'build',
          '--src',
          'e2e/petstore',
          '--out',
          outDir,
          '--format',
          'html',
        ],
        { cwd: join(__dirname, '..', '..', '..') }
      );
      expect(result.stdout).toMatch(/Rendered [1-9]\d* object\(s\)/);
      // HTML-specific output must be present.
      const indexStat = await stat(join(outDir, 'index.html'));
      expect(indexStat.isFile()).toBe(true);
      // JSON output must NOT be present — we only asked for html.
      await expect(stat(join(outDir, 'model.json'))).rejects.toThrow();
      // MDX output must NOT be present either.
      const listing = await readdir(outDir);
      const mdxFiles = listing.filter((f) => f.endsWith('.mdx'));
      expect(mdxFiles).toEqual([]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
