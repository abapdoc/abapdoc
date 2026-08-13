import { describe, expect, it } from 'vitest';
import {
  DocumentationModelSchema,
  validate,
  type AbapObject,
  type Class,
  type DocumentationModel,
  type FunctionModule,
  type Interface,
  type Program,
  type Structure,
  type Table,
} from '../index.js';

const LOC = {
  file: 'src/petstore/zcl_pet_service.clas.abap',
  startLine: 1,
  endLine: 42,
};

const sampleClass: Class = {
  kind: 'class',
  name: 'zcl_pet_service',
  visibility: 'public',
  superclass: undefined,
  interfaces: ['zif_pet_service'],
  methods: [
    {
      name: 'get_pet',
      parameters: [{ name: 'iv_pet_id', direction: 'importing', type: 'i' }],
      returning: { name: 'rs_pet', direction: 'returning', type: 'zs_pet' },
      exceptions: [{ name: 'cx_sy_itab_line_not_found' }],
      visibility: 'public',
      doc: {
        summary: 'Read a single pet by id.',
        description: 'Throws if no row matches.',
        tags: [
          { kind: 'parameter', name: 'iv_pet_id', description: 'primary key' },
          { kind: 'return', description: 'the pet row' },
          {
            kind: 'raising',
            name: 'cx_sy_itab_line_not_found',
            description: 'not found',
          },
          { kind: 'see', target: 'zif_pet_service~get_pet' },
          { kind: 'custom', name: 'since', body: 'v1.2.0' },
        ],
        sourceLocation: { ...LOC, startLine: 20, endLine: 28 },
      },
      sourceLocation: { ...LOC, startLine: 20, endLine: 28 },
    },
  ],
  sourceLocation: LOC,
};

const sampleInterface: Interface = {
  kind: 'interface',
  name: 'zif_pet_service',
  methods: [
    {
      name: 'get_pet',
      parameters: [{ name: 'iv_pet_id', direction: 'importing', type: 'i' }],
      returning: { name: 'rs_pet', direction: 'returning', type: 'zs_pet' },
      exceptions: [],
      visibility: 'public',
      isInterfaceMethod: true,
      sourceLocation: { ...LOC, startLine: 5, endLine: 9 },
    },
  ],
  sourceLocation: { ...LOC, startLine: 1, endLine: 9 },
};

const sampleFunctionModule: FunctionModule = {
  kind: 'function-module',
  name: 'zfm_pet_lookup',
  parameters: [
    { name: 'iv_pet_id', direction: 'importing', type: 'i' },
    { name: 'rs_pet', direction: 'exporting', type: 'zs_pet' },
  ],
  exceptions: [{ name: 'not_found' }],
  sourceLocation: { ...LOC, startLine: 1, endLine: 30 },
};

const sampleTable: Table = {
  kind: 'table',
  name: 'ztpet',
  fields: [
    { kind: 'builtin', name: 'pet_id' },
    { kind: 'builtin', name: 'pet_name' },
    {
      kind: 'ddic-structure',
      name: 'zs_admin',
      fields: [
        { kind: 'builtin', name: 'created_by' },
        { kind: 'builtin', name: 'created_at' },
      ],
    },
  ],
  sourceLocation: { ...LOC, startLine: 1, endLine: 12 },
};

const sampleStructure: Structure = {
  kind: 'structure',
  name: 'zs_pet',
  fields: [
    { kind: 'builtin', name: 'pet_id' },
    { kind: 'builtin', name: 'pet_name' },
  ],
  sourceLocation: { ...LOC, startLine: 1, endLine: 5 },
};

const sampleProgram: Program = {
  kind: 'program',
  name: 'zpet_report',
  programType: 'executable',
  sourceLocation: { ...LOC, startLine: 1, endLine: 100 },
};

describe('DocumentationModelSchema', () => {
  it('round-trips a sample containing one of every entity kind', () => {
    const sample: DocumentationModel = {
      version: '1.1.0',
      source: { provider: 'file', rootDir: 'e2e/petstore' },
      objects: [
        sampleClass,
        sampleInterface,
        sampleFunctionModule,
        sampleTable,
        sampleStructure,
        sampleProgram,
      ],
    };

    const parsed = DocumentationModelSchema.parse(sample);

    expect(parsed.version).toBe('1.1.0');
    expect(parsed.objects).toHaveLength(6);

    const kinds = parsed.objects.map((o: AbapObject) => o.kind);
    expect(kinds).toEqual([
      'class',
      'interface',
      'function-module',
      'table',
      'structure',
      'program',
    ]);
  });

  it('preserves DocBlock tags in source order including custom tags', () => {
    const parsed = DocumentationModelSchema.parse({
      version: '1.1.0',
      source: { provider: 'file', rootDir: '.' },
      objects: [sampleClass],
    });

    const tags =
      parsed.objects[0]!.kind === 'class'
        ? parsed.objects[0].methods![0]!.doc!.tags
        : [];

    expect(tags.map((t) => t.kind)).toEqual([
      'parameter',
      'return',
      'raising',
      'see',
      'custom',
    ]);
    expect(tags[4]).toEqual({ kind: 'custom', name: 'since', body: 'v1.2.0' });
  });

  it('recursively validates TypeRef fields', () => {
    const parsed = DocumentationModelSchema.parse({
      version: '1.1.0',
      source: { provider: 'file', rootDir: '.' },
      objects: [sampleTable],
    });

    const table = parsed.objects[0]!;
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      const adminField = table.fields[2]!;
      expect(adminField.kind).toBe('ddic-structure');
      if (adminField.kind === 'ddic-structure') {
        expect(adminField.fields).toHaveLength(2);
      }
    }
  });

  it('exposes a validate() helper that returns the parsed model', () => {
    const sample = {
      version: '1.0.0',
      source: { provider: 'file', rootDir: '.' },
      objects: [sampleInterface],
    };

    const parsed = validate(sample);
    expect(parsed.objects[0]!.kind).toBe('interface');
  });
});
