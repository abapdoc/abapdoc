import { describe, expect, it } from 'vitest';
import { parseAbapSource } from './index.js';

const SAMPLE = `"! Service for managing pets.
"!
"! Implements zif_pet_service.
CLASS zcl_pet_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_pet_service.
    ALIASES get_pet FOR zif_pet_service~get_pet.

    DATA mv_default_name TYPE string.

  PROTECTED SECTION.
  PRIVATE SECTION.

ENDCLASS.

CLASS zcl_pet_service IMPLEMENTATION.

  "! Read a single pet by id.
  "!
  "! Throws when no row matches.
  "!
  "! @parameter iv_pet_id the primary key
  "! @return            the pet row
  "! @raising cx_sy_itab_line_not_found no row matched
  METHOD zif_pet_service~get_pet.
    SELECT SINGLE *
      FROM ztpet
      INTO CORRESPONDING FIELDS OF rs_pet
      WHERE pet_id = iv_pet_id.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
    ENDIF.
  ENDMETHOD.

  "! Add a new pet.
  "!
  "! @parameter is_pet the new pet row
  "! @raising cx_sy_open_sql_db insert failed
  METHOD zif_pet_service~add_pet.
    INSERT ztpet FROM is_pet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
`;

describe('parseAbapSource — class with definition + implementation', () => {
  it('detects a class and emits a Class model', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zcl_pet_service.clas.abap');
    expect(obj.kind).toBe('class');
    if (obj.kind !== 'class') {
      throw new Error('expected class');
    }
    expect(obj.name).toBe('zcl_pet_service');
    expect(obj.visibility).toBe('public');
    expect(obj.interfaces).toEqual(['zif_pet_service']);
    expect(obj.sourceLocation.file).toBe('src/sdk/zcl_pet_service.clas.abap');
    // The class spans from the first `CLASS` line to the closing
    // `ENDCLASS.` — doc blocks above the class are part of `obj.doc`
    // but NOT part of the class's own source location.
    const lines = SAMPLE.split('\n');
    expect(obj.sourceLocation.startLine).toBe(4);
    // Inclusive endLine: the line of the LAST ENDCLASS (the IMPLEMENTATION
    // block ends the file). findLastIndex picks the closing one.
    let lastEndClass = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.trim() === 'ENDCLASS.') lastEndClass = i;
    }
    expect(obj.sourceLocation.endLine).toBe(lastEndClass + 1);
  });

  it('attaches the class-level DocBlock', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zcl_pet_service.clas.abap');
    if (obj.kind !== 'class') {
      throw new Error('expected class');
    }
    expect(obj.doc).toBeDefined();
    expect(obj.doc!.summary).toBe('Service for managing pets.');
    expect(obj.doc!.description).toBe('Implements zif_pet_service.');
  });

  it('captures the public DATA attribute', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zcl_pet_service.clas.abap');
    if (obj.kind !== 'class') {
      throw new Error('expected class');
    }
    expect(obj.attributes).toBeDefined();
    expect(obj.attributes).toHaveLength(1);
    expect(obj.attributes![0]!.name).toBe('mv_default_name');
    expect(obj.attributes![0]!.type).toBe('string');
    expect(obj.attributes![0]!.visibility).toBe('public');
  });

  it('parses both methods with their DocBlocks, parameters, and exceptions', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zcl_pet_service.clas.abap');
    if (obj.kind !== 'class') {
      throw new Error('expected class');
    }
    expect(obj.methods).toBeDefined();
    expect(obj.methods).toHaveLength(2);

    const getPet = obj.methods![0]!;
    expect(getPet.name).toBe('zif_pet_service~get_pet');
    // The method source has no IMPORTING/EXPORTING clauses — only
    // the RAISE EXCEPTION statement. Parameters are therefore empty;
    // the `@parameter` tag lives on the DocBlock (see below).
    expect(getPet.parameters).toEqual([]);
    expect(getPet.returning).toBeUndefined();
    expect(getPet.exceptions.map((e) => e.name)).toEqual([
      'cx_sy_itab_line_not_found',
    ]);
    expect(getPet.doc).toBeDefined();
    expect(getPet.doc!.summary).toBe('Read a single pet by id.');
    const tags = getPet.doc!.tags;
    expect(tags.map((t) => t.kind)).toContain('parameter');
    expect(tags.map((t) => t.kind)).toContain('return');
    expect(tags.map((t) => t.kind)).toContain('raising');
    const paramTag = tags.find((t) => t.kind === 'parameter') as { kind: 'parameter'; name: string; description: string };
    expect(paramTag.name).toBe('iv_pet_id');

    const addPet = obj.methods![1]!;
    expect(addPet.name).toBe('zif_pet_service~add_pet');
    expect(addPet.exceptions.map((e) => e.name)).toEqual(['cx_sy_open_sql_db']);
  });
});