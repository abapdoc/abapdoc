#!/usr/bin/env node
/**
 * @abapdoc/cli — end-user entry point.
 *
 * Subcommands:
 *   abapdoc build   --src <dir> --out <dir> [--format html|mdx|json|all]
 *   abapdoc validate --src <dir>
 *   abapdoc --version
 *
 * The CLI is intentionally tiny: it orchestrates the extractor and the
 * three renderers and writes their outputs to disk. All the interesting
 * work lives in the underlying packages.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep, posix } from 'node:path';

import { Command } from 'commander';
import type { DocumentationModel } from '@abapdoc/model';
import { DocumentationModelSchema } from '@abapdoc/model';

import { extract } from '@abapdoc/extractor';
import { render as renderJson } from '@abapdoc/renderer-json';
import { render as renderHtml } from '@abapdoc/renderer-html';
import { render as renderMdx } from '@abapdoc/renderer-mdx';

type Format = 'html' | 'mdx' | 'json' | 'all';

const FORMATS: readonly Format[] = ['html', 'mdx', 'json', 'all'];

function validateFormat(format: string): format is Format {
  return (FORMATS as readonly string[]).includes(format);
}

async function runBuild(
  src: string,
  outDir: string,
  format: Format
): Promise<number> {
  // Refuse output directories that overlap the source tree so the
  // cleanup step cannot delete the very files we are about to extract.
  const sourceRoot = resolve(src);
  const outputRoot = resolve(outDir);
  if (
    outputRoot === sourceRoot ||
    outputRoot.startsWith(sourceRoot + sep) ||
    sourceRoot.startsWith(outputRoot + sep)
  ) {
    throw new Error('Output directory must not overlap source directory');
  }

  const { model } = await extract({ rootDir: sourceRoot });
  // Validate the model end-to-end before rendering. Surface a clear
  // error if the upstream extractor emits something the schema rejects.
  const reparsed = DocumentationModelSchema.parse(
    JSON.parse(JSON.stringify(model))
  );
  const formats =
    format === 'all' ? (['html', 'mdx', 'json'] as const) : ([format] as const);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Resolve outDir to an absolute, canonicalised base once. Every
  // output path is then validated to live under this base — prevents
  // path traversal if a renderer's path field contains '..' segments
  // (Amazon Q CWE-22 review).
  const baseOut = resolve(outDir);
  let totalFiles = 0;
  for (const fmt of formats) {
    const result =
      fmt === 'json'
        ? renderJson(reparsed)
        : fmt === 'html'
        ? renderHtml(reparsed)
        : renderMdx(reparsed);
    for (const f of result.files) {
      // Reject '..' segments and absolute paths up-front.
      const segments = f.path.split(posix.sep);
      if (
        segments.some((seg) => seg === '..' || seg === '' || isAbsolute(seg))
      ) {
        throw new Error(
          `Unsafe renderer path (path traversal?): ${JSON.stringify(f.path)}`
        );
      }
      const outPath = join(baseOut, ...segments);
      // Defence-in-depth: confirm the resolved path is inside baseOut.
      const resolved = resolve(outPath);
      if (!resolved.startsWith(baseOut + sep) && resolved !== baseOut) {
        throw new Error(
          `Resolved output path escapes base directory: ${resolved} not under ${baseOut}`
        );
      }
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, f.content, 'utf8');
      totalFiles++;
    }
  }

  const counts = countObjects(reparsed);
  const summary = `Rendered ${reparsed.objects.length} object(s): ${counts.classes} classes, ${counts.interfaces} interfaces, ${counts.fms} function modules, ${counts.tables} tables, ${counts.programs} programs. Wrote ${totalFiles} file(s) to ${outDir}.`;
  console.log(summary);
  return 0;
}

function countObjects(model: DocumentationModel): {
  classes: number;
  interfaces: number;
  fms: number;
  tables: number;
  programs: number;
  structures: number;
} {
  const counts = {
    classes: 0,
    interfaces: 0,
    fms: 0,
    tables: 0,
    programs: 0,
    structures: 0,
  };
  for (const obj of model.objects) {
    switch (obj.kind) {
      case 'class':
        counts.classes++;
        break;
      case 'interface':
        counts.interfaces++;
        break;
      case 'function-module':
        counts.fms++;
        break;
      case 'table':
        counts.tables++;
        break;
      case 'program':
        counts.programs++;
        break;
      case 'structure':
        counts.structures++;
        break;
    }
  }
  return counts;
}

async function runValidate(src: string): Promise<number> {
  try {
    const { model } = await extract({ rootDir: resolve(src) });
    DocumentationModelSchema.parse(model);
    console.log(`OK: extracted ${model.objects.length} object(s) from ${src}`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Validation failed: ${msg}`);
    return 1;
  }
}

function main(argv: readonly string[]): Promise<number> {
  const program = new Command();
  program
    .name('abapdoc')
    .description('Generate ABAP Doc documentation in HTML / MDX / JSON.')
    .version('0.0.0');

  program
    .command('build')
    .description('Extract and render documentation from an abapGit repo.')
    .requiredOption('--src <dir>', 'abapGit-style repo root')
    .requiredOption('--out <dir>', 'output directory for rendered files')
    .option(
      '--format <fmt>',
      `output format (one of ${FORMATS.join(', ')})`,
      'all'
    )
    .action(async (opts: { src: string; out: string; format: string }) => {
      if (!validateFormat(opts.format)) {
        console.error(
          `Invalid --format: ${opts.format}. Must be one of ${FORMATS.join(
            ', '
          )}.`
        );
        process.exit(1);
      }
      try {
        const code = await runBuild(opts.src, opts.out, opts.format);
        process.exit(code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Build failed: ${msg}`);
        process.exit(1);
      }
    });

  program
    .command('validate')
    .description(
      'Extract and validate against the documentation model schema. No output written.'
    )
    .requiredOption('--src <dir>', 'abapGit-style repo root')
    .action(async (opts: { src: string }) => {
      try {
        const code = await runValidate(opts.src);
        process.exit(code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Validate failed: ${msg}`);
        process.exit(1);
      }
    });

  return program
    .parseAsync(argv as string[])
    .then(() => 0)
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      return 1;
    });
}

void main(process.argv)
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });

// Force-keep the `sep` import — used implicitly via the path library above
// for any future per-OS normalisation we may add.
void sep;
