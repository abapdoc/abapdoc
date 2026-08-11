import { describe, expect, it } from 'vitest';
import { DocumentationModelSchema } from '@abapdoc/model';
import { parseAbapSource } from './index.js';

const CLASS_SAMPLE = `"! Service for managing pets.
CLASS zcl_pet_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_pet_service.

ENDCLASS.

CLASS zcl_pet_service IMPLEMENTATION.
ENDCLASS.
`;

describe('parseAbapSource — DocumentationModel round-trip', () => {
  it('parser output conforms to DocumentationModel schema', () => {
    const obj = parseAbapSource(CLASS_SAMPLE, 'src/sdk/zcl_pet_service.clas.abap');
    const model = {
      version: '1.0.0' as const,
      source: {
        provider: 'file',
        rootDir: 'src/sdk/zcl_pet_service.clas.abap',
        generatedAt: new Date(0).toISOString(),
      },
      objects: [obj],
    };
    // Round-trip: serialise → deserialise → schema validates.
    const json = JSON.parse(JSON.stringify(model));
    const reparsed = DocumentationModelSchema.parse(json);
    expect(reparsed.version).toBe('1.0.0');
    expect(reparsed.objects).toHaveLength(1);
    expect(reparsed.objects[0]!.kind).toBe('class');
  });

  it('sourceLocation.file is preserved across round-trip', () => {
    const obj = parseAbapSource(CLASS_SAMPLE, 'e2e/petstore/sdk/zcl_pet_service.clas.abap');
    const model = {
      version: '1.0.0' as const,
      source: {
        provider: 'file',
        rootDir: 'e2e/petstore/sdk/zcl_pet_service.clas.abap',
        generatedAt: new Date(0).toISOString(),
      },
      objects: [obj],
    };
    const json = JSON.parse(JSON.stringify(model));
    const reparsed = DocumentationModelSchema.parse(json);
    const cls = reparsed.objects[0]!;
    if (cls.kind === 'class') {
      expect(cls.sourceLocation.file).toBe('e2e/petstore/sdk/zcl_pet_service.clas.abap');
    }
  });
});