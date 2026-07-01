/**
 * @abapdoc/extractor — file-based ABAP source extractor.
 *
 * Walks an abapGit-style repository on disk, picks up `.clas.abap`,
 * `.intf.abap`, `.func.abap`, `.tabl.abap`, `.struc.abap`, `.tabl.xml`,
 * `.struc.xml` files, runs each through the parser, and assembles a
 * single {@link DocumentationModel}.
 *
 * The extractor itself is deliberately small — it delegates parsing
 * to `@abapdoc/parser` and rendering to `@abapdoc/renderer-*`. The
 * `extract()` entry point is the only thing downstream tooling (the
 * CLI, CI integrations, future ADT connectors) needs to import.
 *
 * Out of scope for v0 (see ARCHITECTURE.md → "Out of scope"):
 *   - ADT / AST-based extraction (file-only for now)
 *   - Incremental extraction (always a full rebuild)
 *   - Cross-object link resolution beyond simple name match
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep, posix, dirname } from 'node:path';

import { XMLParser } from 'fast-xml-parser';
import type { AbapObject, DocumentationModel } from '@abapdoc/model';

import { parseAbapSource } from '@abapdoc/parser';

export interface ExtractOptions {
  /** abapGit-style repo root. */
  rootDir: string;
  /** Override the default include globs. */
  include?: string[];
  /** Additional excludes beyond `.abapgit.xml`. */
  exclude?: string[];
}

export interface SourceInfo {
  provider: 'file' | 'adt' | 'ast';
  rootDir: string;
  commit?: string;
  generatedAt: string;
}

export interface ExtractResult {
  model: DocumentationModel;
  source: SourceInfo;
}

/** Default include patterns: the file extensions we recognise as ABAP. */
const DEFAULT_INCLUDES = [
  '*.clas.abap',
  '*.intf.abap',
  '*.fugr.*.abap',
  '*.func.abap',
  '*.prog.abap',
  '*.report.abap',
  '*.tabl.abap',
  '*.struc.abap',
  '*.tabl.xml',
  '*.struc.xml',
];

/** Read the `.abapgit.xml` `<IGNORE>` list (best-effort, tolerant). */
async function readAbapGitIgnores(rootDir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(rootDir, '.abapgit.xml'), 'utf8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
    });
    const parsed = parser.parse(raw);
    const items: unknown = parsed?.['asx:abap']?.['asx:values']?.DATA?.IGNORE?.item;
    if (Array.isArray(items)) {
      return items.map((x) => String(x));
    }
    if (typeof items === 'string') {
      return [items];
    }
    return [];
  } catch {
    return [];
  }
}

/** Match a relative POSIX path against an abapGit ignore pattern. */
function isIgnored(relPosix: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const pat = raw.replace(/^\//u, '');
    if (matchGlob(pat, relPosix)) {
      return true;
    }
  }
  return false;
}

/** Tiny glob matcher: `*` matches a single path segment, `**` any depth. */
function matchGlob(pattern: string, value: string): boolean {
  if (pattern === value) {
    return true;
  }
  // Convert glob to a simple regex. `**` matches any depth including `/`;
  // `*` matches anything within a single segment (no `/`).
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/gu, '\\$&')
        .replace(/\*\*/gu, '::DOUBLESTAR::')
        .replace(/\*/gu, '[^/]*')
        .replace(/::DOUBLESTAR::/gu, '.*') +
      '$',
  );
  return re.test(value);
}

/** True when any include pattern matches the basename OR the rel path. */
function matchesIncludes(name: string, relPosix: string, includes: string[]): boolean {
  return includes.some((pat) => {
    // Bare-name pattern like `*.clas.abap` matches against basename only.
    if (!pat.includes('/')) {
      return matchGlob(pat, name);
    }
    // Path pattern matches against the full relative path.
    return matchGlob(pat, relPosix);
  });
}

// TEMP DEBUG
(globalThis as { __debug_extractor?: unknown }).__debug_extractor = { matchesIncludes, matchGlob, DEFAULT_INCLUDES };

/** Recursively walk rootDir and yield files matching any include pattern. */
async function* walk(
  rootDir: string,
  includes: string[],
  excludes: string[],
): AsyncGenerator<string> {
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const abs = join(rootDir, rel);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const childRel = rel === '' ? e.name : rel + sep + e.name;
      const childRelPosix = childRel.split(sep).join(posix.sep);
      // eslint-disable-next-line no-console
      
      if (e.isDirectory()) {
        if (!isIgnored(childRelPosix + '/', excludes)) {
          stack.push(childRel);
        }
        continue;
      }
      if (isIgnored(childRelPosix, excludes)) {
        continue;
      }
      const matches = matchesIncludes(e.name, childRelPosix, includes);
      // eslint-disable-next-line no-console
      // debug logging removed
      if (matches) {
        yield join(abs, e.name);
      }
    }
  }
}

/** Decide which file kind a given absolute path represents. */
function classify(path: string, hasAbapContent: boolean): 'abap' | 'xml' {
  if (path.endsWith('.xml')) return 'xml';
  if (path.endsWith('.abap') && hasAbapContent) return 'abap';
  // Default: try as ABAP source; the parser will fall back to a stub Structure.
  return 'abap';
}

/** Extract a `DocumentationModel` from a repo on disk. */
export async function extract(options: ExtractOptions): Promise<ExtractResult> {
  const { rootDir } = options;
  const includes = options.include ?? DEFAULT_INCLUDES;
  const excludes = [
    ...(await readAbapGitIgnores(rootDir)),
    ...(options.exclude ?? []),
  ];
  // The root itself must exist; stat throws if not.
  await stat(rootDir);

  const objects: AbapObject[] = [];
  // eslint-disable-next-line no-console
  

  for await (const absPath of walk(rootDir, includes, excludes)) {
    // eslint-disable-next-line no-console
    
    const relPosix = relative(rootDir, absPath).split(sep).join(posix.sep);
    // Skip directories that the walker might surface (defensive — the
    // walker filters dirs but symlinks or weird fs states can fool it).
    let isDir = false;
    try {
      const s = await stat(absPath);
      isDir = s.isDirectory();
    } catch {
      continue;
    }
    if (isDir) continue;
    try {
      const raw = await readFile(absPath, 'utf8');
      const kind = classify(absPath, raw.trim().length > 0);
      if (kind === 'xml') {
        // DDIC XML — convert to a Structure/Table via parser's fallback path.
        // The parser currently handles ABAP source only; for v0 we treat
        // DDIC XML as a synthetic Structure whose fields reflect the
        // <DD03P> rows. We construct it directly to keep the model schema.
        const obj = parseDdicXml(relPosix, raw);
        if (obj !== undefined) objects.push(obj);
      } else {
        const obj = parseAbapSource(raw, relPosix);
        objects.push(obj);
      }
    } catch (err) {
      // Per-file failures should not abort the whole extraction.
      // Surface a minimal placeholder so downstream renderers still see the file.
      const msg = err instanceof Error ? err.message : String(err);
      objects.push({
        kind: 'structure',
        name: relPosix.split('/').pop() ?? relPosix,
        fields: [],
        sourceLocation: { file: relPosix, startLine: 1, endLine: 1 },
      });
      // eslint-disable-next-line no-console
      console.warn(`abapdoc: failed to parse ${relPosix}: ${msg}`);
    }
  }

  const source: SourceInfo = {
    provider: 'file',
    rootDir,
    generatedAt: new Date().toISOString(),
  };
  const model: DocumentationModel = {
    version: '1.0.0',
    source,
    objects,
  };
  return { model, source };
}

/**
 * Parse a DDIC XML table/structure (`*.tabl.xml` / `*.struc.xml`)
 * into a Structure AbapObject. Field types come from `<DD03P>` rows;
 * ROLLNAME references are kept as `data-element` TypeRefs (no
 * further resolution — the renderer can hyperlink them later).
 */
function parseDdicXml(relPosix: string, xml: string): AbapObject | undefined {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
  });
  const parsed = parser.parse(xml);
  // fast-xml-parser keeps the `asx:` prefix on element names; the
  // top-level <abapGit> wrapper contains an <asx:abap> child.
  const abapGit = parsed?.abapGit;
  const asxAbap = abapGit?.['asx:abap'];
  const values = asxAbap?.['asx:values'];
  if (values === undefined) {
    return undefined;
  }
  const dd02v = values.DD02V;
  const tableName = String(dd02v?.TABNAME ?? relPosix.replace(/\.[^.]+$/u, ''));
  const description = String(dd02v?.DDTEXT ?? '');
  const rows = values.DD03P_TABLE?.DD03P ?? [];
  const fields = (Array.isArray(rows) ? rows : [rows]).map((row: Record<string, unknown>) => ({
    kind: 'data-element' as const,
    name: String(row.FIELDNAME ?? ''),
  }));
  const obj: AbapObject = {
    kind: 'table',
    name: tableName,
    fields,
    sourceLocation: { file: relPosix, startLine: 1, endLine: 1 },
  };
  if (description.length > 0) {
    obj.doc = {
      summary: description,
      description: undefined,
      tags: [],
      sourceLocation: { file: relPosix, startLine: 1, endLine: 1 },
    };
  }
  return obj;
}

// Re-export useful types so consumers only need this single entry point.
export type { AbapObject, DocumentationModel };

// Note: dirname import retained for callers that might use it via re-export.
void dirname;