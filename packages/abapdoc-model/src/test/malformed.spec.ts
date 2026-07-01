import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  AbapObjectSchema,
  DocumentationModelSchema,
  ParameterSchema,
  TagSchema,
  validate,
} from '../index.js';

describe('malformed inputs are rejected', () => {
  it('rejects an empty model', () => {
    expect(() => validate({})).toThrow(ZodError);
  });

  it('rejects a wrong schema version literal', () => {
    expect(() =>
      validate({
        version: '0.0.1',
        source: { provider: 'file', rootDir: '.' },
        objects: [],
      }),
    ).toThrow(ZodError);
  });

  it('rejects an AbapObject without the kind discriminator', () => {
    expect(() =>
      AbapObjectSchema.parse({
        name: 'zcl_foo',
        visibility: 'public',
        sourceLocation: { file: 'a', startLine: 1, endLine: 2 },
      }),
    ).toThrow(ZodError);
  });

  it('rejects a Class with an unknown kind value', () => {
    expect(() =>
      AbapObjectSchema.parse({
        kind: 'enum',
        name: 'zcl_foo',
        sourceLocation: { file: 'a', startLine: 1, endLine: 2 },
      }),
    ).toThrow(ZodError);
  });

  it('rejects a Parameter with an unknown direction', () => {
    expect(() =>
      ParameterSchema.parse({
        name: 'iv_foo',
        direction: 'sideways',
        type: 'i',
      }),
    ).toThrow(ZodError);
  });

  it('rejects a ParameterTag missing the required description', () => {
    expect(() =>
      TagSchema.parse({ kind: 'parameter', name: 'iv_foo' }),
    ).toThrow(ZodError);
  });

  it('rejects a RaisingTag missing the required name', () => {
    expect(() => TagSchema.parse({ kind: 'raising', description: 'oops' })).toThrow(
      ZodError,
    );
  });

  it('rejects a SeeTag missing the target', () => {
    expect(() => TagSchema.parse({ kind: 'see' })).toThrow(ZodError);
  });

  it('rejects a CustomTag missing body', () => {
    expect(() => TagSchema.parse({ kind: 'custom', name: 'since' })).toThrow(
      ZodError,
    );
  });

  it('rejects a model whose objects array is missing', () => {
    expect(() =>
      DocumentationModelSchema.parse({
        version: '1.0.0',
        source: { provider: 'file', rootDir: '.' },
      }),
    ).toThrow(ZodError);
  });

  it('rejects a sourceLocation with zero line numbers', () => {
    expect(() =>
      validate({
        version: '1.0.0',
        source: { provider: 'file', rootDir: '.' },
        objects: [
          {
            kind: 'program',
            name: 'zfoo',
            programType: 'executable',
            sourceLocation: { file: 'a.abap', startLine: 0, endLine: 0 },
          },
        ],
      }),
    ).toThrow(ZodError);
  });
});