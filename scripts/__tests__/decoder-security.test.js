const { spawnSync } = require('node:child_process');
const decoder = require('decode-uri-component');
const queryString = require('query-string');

describe('CommonJS URL decoder compatibility', () => {
  test.each([
    ['Burlington+music', 'Burlington music'],
    ['%2B', '+'],
    ['%2525', '%25'],
    ['st%C3%A5le%', 'ståle%'],
    ['%E4%BD%A0%E5%A5%BD', '你好'],
    ['%F0%9F%98%80', '😀'],
    ['%ED%9F%BF', '\uD7FF'],
    ['%F4%8F%BF%BF', '\u{10FFFF}'],
    ['%C0%AF', '%C0%AF'],
    ['%ED%A0%80', '%ED%A0%80'],
    ['%F4%90%80%80', '%F4%90%80%80'],
    ['%F0%9F%41', '%F0%9FA'],
    ['%C2', '\uFFFD'],
    ['%FE%FF', '\uFFFD\uFFFD'],
    ['%FF%FE', '\uFFFD\uFFFD'],
    ['%G0%C3%A5%ab', '%G0å%ab'],
    ['%25C2%25', '%C2%'],
  ])('decodes %s without changing valid link semantics', (input, expected) => {
    expect(typeof decoder).toBe('function');
    expect(decoder(input)).toBe(expected);
  });

  test('preserves query-string keys, duplicates, spaces, encoded plus and one-level decoding', () => {
    expect(queryString.parse('title=Newcomers+welcome&town=Bristol&town=Vergennes&literal=%2B&name=Jos%C3%A9&once=%2525&empty=&flag')).toEqual({
      title: 'Newcomers welcome', town: ['Bristol', 'Vergennes'], literal: '+',
      name: 'José', once: '%25', empty: '', flag: null,
    });
    expect(queryString.parse('interest[]=music&interest[]=community', { arrayFormat: 'bracket' })).toEqual({ interest: ['music', 'community'] });
    expect(queryString.parse('constructor=literal&__proto__=literal')).toEqual({ constructor: 'literal', ['__proto__']: 'literal' });
    expect(Object.getPrototypeOf(queryString.parse('__proto__=literal'))).toBe(null);
  });

  test.each(['%ab', '%C3', '%ED%A0%80', '%84%D7%25%88%90'])('finishes large malformed input %s in an isolated process', (unit) => {
    const result = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const decoder = require('decode-uri-component');
      const queryString = require('query-string');
      const unit = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
      for (const repetitions of [Math.floor(7800 / unit.length), 12000]) {
        const input = unit.repeat(repetitions);
        const output = decoder(input);
        assert.equal(typeof output, 'string');
        const parsed = queryString.parse('location=' + input + '&town=Burlington');
        assert.equal(parsed.location, output);
        assert.equal(parsed.town, 'Burlington');
      }
    `], { cwd: process.cwd(), input: JSON.stringify(unit), encoding: 'utf8', timeout: 3000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('rejects non-string input without coercing caller objects', () => {
    const input = { toString: jest.fn(() => 'value') };
    expect(() => decoder(input)).toThrow(TypeError);
    expect(input.toString).not.toHaveBeenCalled();
  });

  test('keeps oversized malformed components literal while still decoding large valid Unicode', () => {
    const malformed = '%41'.repeat(3000) + '%ab';
    expect(decoder(malformed)).toBe(malformed);
    const valid = '%C3%A5'.repeat(3000);
    expect(decoder(valid)).toBe('å'.repeat(3000));
    const distinctRuns = Array.from({ length: 2000 }, (_, i) => `%ab%41_${i}`).join('_');
    expect(decoder(distinctRuns)).toBe(distinctRuns);
  });
});
