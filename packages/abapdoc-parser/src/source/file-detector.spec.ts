import { describe, expect, it } from 'vitest';
import { firstMeaningfulLine } from './file-detector.js';

describe('firstMeaningfulLine', () => {
  it('strips a trailing ABAP comment and whitespace', () => {
    expect(
      firstMeaningfulLine(['  DATA text TYPE string. " comment', 'other'])
    ).toBe('DATA text TYPE string.');
  });

  it('preserves double quotes inside single-quoted literals', () => {
    expect(firstMeaningfulLine(['DATA text = \'A"B\'. " trailing'])).toBe(
      "DATA text = 'A\"B'."
    );
  });

  it('preserves apostrophes inside backquoted literals and still strips trailing comments', () => {
    expect(firstMeaningfulLine(['DATA text = `John\'s`. " trailing'])).toBe(
      "DATA text = `John's`."
    );
  });

  it('preserves double quotes inside string templates and still strips trailing comments', () => {
    expect(firstMeaningfulLine(['WRITE |It\'s "fine|. " trailing'])).toBe(
      'WRITE |It\'s "fine|.'
    );
    expect(firstMeaningfulLine(['WRITE |A"B|. " trailing'])).toBe(
      'WRITE |A"B|.'
    );
  });

  it('handles escapes and expressions inside string templates', () => {
    expect(firstMeaningfulLine(['WRITE |A \\| B|. " trailing'])).toBe(
      'WRITE |A \\| B|.'
    );
    expect(
      firstMeaningfulLine(['DATA text = |{ sy-datum }|. " trailing'])
    ).toBe('DATA text = |{ sy-datum }|.');
    expect(
      firstMeaningfulLine(['DATA text = |{ |nested| }|. " trailing'])
    ).toBe('DATA text = |{ |nested| }|.');
  });

  it('treats an unmatched `{` inside a string template as literal', () => {
    expect(firstMeaningfulLine(['DATA text = |A { B|. " trailing'])).toBe(
      'DATA text = |A { B|.'
    );
  });

  it('does not confuse `}` inside a string literal inside a template expression', () => {
    expect(
      firstMeaningfulLine(["DATA text = |{ 'a } b' }|. \" trailing"])
    ).toBe("DATA text = |{ 'a } b' }|.");
  });

  it('skips blank lines and *-comments', () => {
    expect(firstMeaningfulLine(['', '* comment', '  INTERFACE foo.'])).toBe(
      'INTERFACE foo.'
    );
  });
});
