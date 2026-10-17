import { describe, expect, it } from 'vitest';
import { cell, toCsv } from '../../src/export/csv.js';

describe('CSV cells', () => {
  it.each([
    ['plain', 'plain'],
    ['a, b', '"a, b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    [' padded', '" padded"'],
    [42, '42'],
    [null, ''],
  ])('%j → %s', (input, expected) => {
    expect(cell(input)).toBe(expected);
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(cell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(cell('+1 call')).toBe("'+1 call");
    expect(cell('@cmd')).toBe("'@cmd");
  });

  it('uses CRLF rows', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\r\n1,2\r\n');
  });
});
