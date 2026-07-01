import { describe, expect, it } from 'vitest';
import { parseAbapDoc } from './index.js';

describe('parseAbapDoc — DocBlock state machine', () => {
  it('returns undefined for empty source', () => {
    expect(parseAbapDoc('', 1)).toBeUndefined();
  });

  it('returns undefined when no `"!` line precedes the anchor', () => {
    const source = [
      'CLASS lcl_foo DEFINITION.',
      'ENDCLASS.',
    ].join('\n');
    // Anchor on the CLASS line; no DocBlock above.
    expect(parseAbapDoc(source, 1)).toBeUndefined();
  });

  it('returns undefined when a blank line separates the doc from the anchor', () => {
    const source = [
      '"! Summary line.',
      '',
      'METHOD do_something.',
    ].join('\n');
    expect(parseAbapDoc(source, 3)).toBeUndefined();
  });

  it('parses a simple summary with no tags', () => {
    const source = [
      '"! Look up a pet by id.',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 2);
    expect(block).toBeDefined();
    expect(block!.summary).toBe('Look up a pet by id.');
    expect(block!.description).toBeUndefined();
    expect(block!.tags).toEqual([]);
    expect(block!.sourceLocation.file).toBe('');
    expect(block!.sourceLocation.startLine).toBe(1);
    expect(block!.sourceLocation.endLine).toBe(1);
  });

  it('parses a multi-line summary + description + tags', () => {
    const source = [
      '"! Read a single pet.',
      '"!',
      '"! Throws when the row is missing.',
      '"! @parameter iv_pet_id the primary key',
      '"! @return the pet row',
      '"! @raising cx_not_found not found',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 7);
    expect(block).toBeDefined();
    expect(block!.summary).toBe('Read a single pet.');
    // The blank line moved us into description; "Throws when the
    // row is missing." is the description.
    expect(block!.description).toBe('Throws when the row is missing.');
    expect(block!.tags.map((t) => t.kind)).toEqual(['parameter', 'return', 'raising']);
    const param = block!.tags[0] as { kind: 'parameter'; name: string; description: string };
    expect(param.name).toBe('iv_pet_id');
    expect(param.description).toBe('the primary key');
    const raising = block!.tags[2] as { kind: 'raising'; name: string };
    expect(raising.name).toBe('cx_not_found');
  });

  it('parses @parameter with colon-suffix continuation', () => {
    // The ABAP Doc pipe form: the opening line ends with `|` and
    // each continuation line begins with `|` at column 0.
    const source = [
      '"! @parameter iv_pet_id |',
      '"! |   the pet id to look up.',
      '"! |   must be a positive integer.',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 4);
    expect(block).toBeDefined();
    expect(block!.tags).toHaveLength(1);
    const param = block!.tags[0] as { kind: 'parameter'; name: string; description: string };
    expect(param.kind).toBe('parameter');
    expect(param.name).toBe('iv_pet_id');
    expect(param.description).toContain('the pet id to look up');
    expect(param.description).toContain('must be a positive integer');
  });

  it('parses @return and @raising with descriptions', () => {
    const source = [
      '"! @return the resolved pet row',
      '"! @raising cx_no_match no row matched',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 3);
    expect(block).toBeDefined();
    const ret = block!.tags[0] as { kind: 'return'; description: string };
    expect(ret.kind).toBe('return');
    expect(ret.description).toBe('the resolved pet row');
    const raising = block!.tags[1] as { kind: 'raising'; name: string; description?: string };
    expect(raising.kind).toBe('raising');
    expect(raising.name).toBe('cx_no_match');
    expect(raising.description).toBe('no row matched');
  });

  it('parses @see with `{@link …}` form', () => {
    const source = [
      '"! @see {@link zcl_pet_service~get_pet}',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 2);
    expect(block).toBeDefined();
    const see = block!.tags[0] as { kind: 'see'; target: string };
    expect(see.kind).toBe('see');
    expect(see.target).toBe('zcl_pet_service~get_pet');
  });

  it('preserves unknown tags as CustomTag', () => {
    const source = [
      '"! @since v1.2.0',
      '"! @author developer',
      'METHOD get_pet.',
    ].join('\n');
    const block = parseAbapDoc(source, 3);
    expect(block).toBeDefined();
    expect(block!.tags).toHaveLength(2);
    expect(block!.tags[0]).toEqual({ kind: 'custom', name: 'since', body: 'v1.2.0' });
    expect(block!.tags[1]).toEqual({ kind: 'custom', name: 'author', body: 'developer' });
  });

  it('handles prose between tags', () => {
    const source = [
      '"! Summary.',
      '"! @parameter iv_x the input',
      '"! trailing prose line',
      'METHOD do_x.',
    ].join('\n');
    const block = parseAbapDoc(source, 4);
    expect(block).toBeDefined();
    expect(block!.summary).toBe('Summary.');
    expect(block!.description).toBe('trailing prose line');
    expect(block!.tags).toHaveLength(1);
    const param = block!.tags[0] as { kind: 'parameter'; name: string; description: string };
    expect(param.name).toBe('iv_x');
    expect(param.description).toBe('the input');
  });

  it('does not parse `"!` inside string literals', () => {
    // `'"! hello'` is a string literal whose content starts with `"!`
    // and `hello`. The line itself is a DATA assignment, not a
    // DocBlock prefix — the parser must not pick it up.
    const source = [
      `DATA(lv) = '"! hello'.`,
      'METHOD do_x.',
    ].join('\n');
    const block = parseAbapDoc(source, 2);
    expect(block).toBeUndefined();
  });
});