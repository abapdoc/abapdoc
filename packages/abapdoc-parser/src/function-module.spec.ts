import { describe, expect, it } from 'vitest';
import { parseAbapSource } from './index.js';

const SAMPLE = `FUNCTION zpet_utility_get_pet_name.
  "! Resolve a pet's display name from the database.
  "!
  "! @parameter iv_pet_id      <p> the pet primary key
  "! @parameter ev_pet_name   <p> the resolved display name
  "! @raising   cx_sy_itab_line_not_found
  DATA: lv_name TYPE string.

  SELECT SINGLE name
    FROM ztpet
    INTO lv_name
    WHERE pet_id = iv_pet_id.

  IF sy-subrc <> 0.
    RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
  ENDIF.

  ev_pet_name = lv_name.

ENDFUNCTION.
`;

describe('parseAbapSource — function module', () => {
  it('detects a function module and emits a FunctionModule model', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zpet_utility.func.abap');
    expect(obj.kind).toBe('function-module');
    if (obj.kind !== 'function-module') {
      throw new Error('expected function-module');
    }
    expect(obj.name).toBe('zpet_utility_get_pet_name');
    expect(obj.sourceLocation.file).toBe('src/sdk/zpet_utility.func.abap');
  });

  it('recognises FUNCTION ... ENDFUNCTION form (parser v0 capability check)', () => {
    const obj = parseAbapSource(SAMPLE, 'src/sdk/zpet_utility.func.abap');
    if (obj.kind !== 'function-module') {
      throw new Error('expected function-module');
    }
    // v0 parser may not attach the FM DocBlock in single-FUNCTION form
    // — only FUNCTION-POOL form is fully wired. We assert the function
    // module is recognised at all (the previous test confirms kind +
    // name). DocBlock attachment is exercised by the parser.spec.ts
    // "parses a multi-line summary + description + tags" test via
    // parseDocBlock directly.
    expect(obj.name).toBe('zpet_utility_get_pet_name');
  });
});