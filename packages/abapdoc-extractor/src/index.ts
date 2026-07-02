import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, posix, relative, sep } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { AbapObject, DocBlock } from '@abapdoc/model';
import { DocumentationModelSchema, DOCUMENTATION_MODEL_VERSION, type DocumentationModel } from '@abapdoc/model';

/** Default include patterns: the file extensions we recognise as ABAP. */
const DEFAULT_INCLUDES: string[] = [
  '*.clas.abap',
  '*.intf.abap',
  '*.func.abap',
  '*.prog.abap',
  '*.tabl.xml',
  '*.stru.xml',
];

/** Read the `.abapgit.xml` `<IGNORE>` list (best-effort, tolerant). */
async function readAbapGitIgnores(rootDir: string): Promise<string[]> {
  try {
    const raw = await readFile(join(rootDir, '.abapgit.xml'), 'utf8');
    // XML hardening: disable entity expansion (CWE-611 / XXE). abapGit
    // config XML does not need DTD/entity processing.
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: false,
      processEntities: false,
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
  //
  // We escape every regex metacharacter, including `[`. `[` is technically
  // a literal inside a character class in JS, but escaping it removes a
  // common source of confusion when reading the pattern.
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

/** Recursively walk rootDir and yield files matching any include pattern. */
async function* walk(
  rootDir: string,
  includes: string[],
  ignores: string[],
): AsyncGenerator<string> {
  // BFS via manual queue; we only yield matching files (not directories).
  const queue: string[] = [rootDir];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(abs);
      } else if (entry.isFile()) {
        const name = entry.name;
        const rel = relative(rootDir, abs);
        const relPosix = rel.split(sep).join(posix.sep);
        if (matchesIncludes(name, relPosix, includes) && !isIgnored(relPosix, ignores)) {
          yield relPosix;
        }
      }
    }
  }
}

/** Source path → file kind → SourceFile. */
type FileKind = 'clas' | 'intf' | 'func' | 'prog' | 'tabl' | 'stru';

function classify(relPosix: string): FileKind | undefined {
  const m = /.*\.([a-z]+)\.(abap|xml)$/u.exec(basename(relPosix));
  if (m === null) {
    return undefined;
  }
  const kind = m[1];
  if (kind === 'clas' || kind === 'intf' || kind === 'func' || kind === 'prog' || kind === 'tabl' || kind === 'stru') {
    return kind;
  }
  return undefined;
}

/** Walk + parse all matching files into an array of AbapObject. */
async function extractObjects(
  rootDir: string,
  includes: string[],
  ignores: string[],
): Promise<{ rel: string; obj: AbapObject }[]> {
  const { parseAbapSource } = await import('@abapdoc/parser');
  const results: { rel: string; obj: AbapObject }[] = [];
  for await (const rel of walk(rootDir, includes, ignores)) {
    const abs = join(rootDir, rel);
    const text = await readFile(abs, 'utf8');
    const kind = classify(rel);
    if (kind === undefined) {
      continue;
    }
    let obj: AbapObject | undefined;
    if (kind === 'clas' || kind === 'intf' || kind === 'func' || kind === 'prog') {
      obj = parseAbapSource(text, rel);
    } else {
      // tabl / stru — DDIC XML
      obj = parseDdicXml(rel, text, kind);
    }
    if (obj !== undefined) {
      results.push({ rel, obj });
    }
  }
  return results;
}

/**
 * Parse a DDIC table/structure XML (abapGit `<asx:abap>` format).
 *
 * The shape produced by abapGit's DDIC serializer is:
 *
 * ```xml
 * <abapGit>
 *   <asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">
 *     <asx:values>
 *       <DD02V>…</DD02V>
 *       <DD03P_TABLE>
 *         <DD03P>…</DD03P> …
 *       </DD03P_TABLE>
 *     </asx:values>
 *   </asx:abap>
 * </abapGit>
 * ```
 *
 * fast-xml-parser keeps the `asx:` prefix on element names; the
 * top-level `<abapGit>` wrapper contains an `<asx:abap>` child.
 */
function parseDdicXml(
  relPosix: string,
  xml: string,
  kind: 'tabl' | 'stru',
): AbapObject | undefined {
  // Map the filename-extension kind to the AbapObject discriminator.
  const objectKind: 'table' | 'structure' = kind === 'tabl' ? 'table' : 'structure';
  // XML hardening: disable entity expansion (CWE-611 / XXE). abapGit
  // DDIC XML is generated by SAP tooling and does not need DTD/entity
  // processing.
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    processEntities: false,
  });
  const parsed = parser.parse(xml);
  // fast-xml-parser keeps the `asx:` prefix on element names; the
  // top-level `<abapGit>` wrapper contains an `<asx:abap>` child.
  const abapGit = parsed?.abapGit;
  const asxAbap = abapGit?.['asx:abap'];
  const values = asxAbap?.['asx:values'];
  if (values === undefined) {
    return undefined;
  }
  const dd02v = values.DD02V;
  const objectName = String(dd02v?.TABNAME ?? relPosix.replace(/\.[^.]+$/u, ''));
  const description = String(dd02v?.DDTEXT ?? '');
  const rowsRaw = values.DD03P_TABLE?.DD03P ?? [];
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [rowsRaw];
  const fields = rows
    .filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      kind: 'data-element' as const,
      name: String(row.FIELDNAME ?? ''),
    }));
  // Filename extension (.tabl.xml vs .stru.xml) is the source of truth
  // for the kind; DDIC category field is unreliable in practice.
  const base = {
    kind: objectKind,
    name: objectName,
    fields,
    sourceLocation: { file: relPosix, startLine: 1, endLine: 1 },
  } as AbapObject;
  if (description.length > 0) {
    (base as { doc?: DocBlock }).doc = {
      summary: description,
      description: undefined,
      tags: [],
      sourceLocation: { file: relPosix, startLine: 1, endLine: 1 },
    };
  }
  return base;
}

/** Extract a DocumentationModel from an abapGit-style root directory. */
export async function extract(opts: {
  rootDir: string;
  includes?: string[];
}): Promise<{ model: DocumentationModel; warnings: string[] }> {
  const rootDir = opts.rootDir;
  const includes = opts.includes ?? DEFAULT_INCLUDES;
  const warnings: string[] = [];
  const ignores = await readAbapGitIgnores(rootDir);
  const extracted: { rel: string; obj: AbapObject }[] = await extractObjects(rootDir, includes, ignores);
  if (extracted.length === 0) {
    warnings.push(`No matching ABAP files found under ${rootDir} (includes: ${includes.join(', ')})`);
  }
  const objects: AbapObject[] = extracted.map((e) => e.obj);
  const model = {
    version: DOCUMENTATION_MODEL_VERSION,
    source: {
      provider: 'file',
      rootDir,
      generatedAt: new Date().toISOString(),
    },
    objects,
  };
  // Validate before returning so the caller gets a clean model or a clear error.
  const validated = DocumentationModelSchema.parse(model) as DocumentationModel;
  return { model: validated, warnings };
}

/** Convenience: extract + write `model.json` next to rendered docs. */
export async function extractAndWrite(opts: {
  rootDir: string;
  outDir: string;
  includes?: string[];
}): Promise<{ model: DocumentationModel; warnings: string[] }> {
  const { model, warnings } = await extract(opts);
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(join(opts.outDir, 'model.json'), JSON.stringify(model, null, 2));
  return { model, warnings };
}