const core = require('../refresh-core');

const record = (overrides = {}) => ({
  id: 'tm-ABC123',
  title: 'Jazz vs Lakers',
  category: 'sports',
  venue: 'Delta Center',
  area: '301 S Temple',
  lat: 40.7683,
  lng: -111.9011,
  whenLabel: 'Fri, Sep 4, 7:00 PM',
  startsInMinutes: 0,
  startsAtIso: '2026-09-05T01:00:00Z',
  description: 'Basketball night.',
  attendees: 42,
  rating: 'general',
  source: 'live',
  ...overrides,
});

describe('parseCoord', () => {
  it('parses numeric strings and passes numbers through', () => {
    expect(core.parseCoord('40.75')).toBeCloseTo(40.75);
    expect(core.parseCoord(-111.9)).toBeCloseTo(-111.9);
  });

  it('rejects the Number() coercion sinkholes', () => {
    expect(core.parseCoord('')).toBeNaN();
    expect(core.parseCoord('   ')).toBeNaN();
    expect(core.parseCoord(null)).toBeNaN();
    expect(core.parseCoord(undefined)).toBeNaN();
    expect(core.parseCoord([])).toBeNaN();
  });

  it('rejects numeric prefixes with trailing junk', () => {
    expect(core.parseCoord('40.7abc')).toBeNaN();
    expect(core.parseCoord('40.7 meters')).toBeNaN();
  });
});

describe('whenLabelFor', () => {
  it('formats a valid ISO in the venue timezone', () => {
    expect(core.whenLabelFor('2026-09-05T01:00:00Z', 'America/Denver')).toMatch(/Sep 4/);
  });

  it('returns Date TBA for missing or unparseable dates', () => {
    expect(core.whenLabelFor(undefined, 'America/Denver')).toBe('Date TBA');
    expect(core.whenLabelFor('not-a-date', 'America/Denver')).toBe('Date TBA');
  });

  it('survives a bogus venue timezone instead of crashing the refresh', () => {
    expect(core.whenLabelFor('2026-09-05T01:00:00Z', 'Mars/OlympusMons')).toMatch(/Sep 4/);
  });
});

describe('shouldRefuseWrite', () => {
  it('refuses zero events over a healthy file', () => {
    expect(core.shouldRefuseWrite(53, 0, false)).toBe(true);
  });

  it('refuses a suspicious shrink', () => {
    expect(core.shouldRefuseWrite(53, 10, false)).toBe(true);
  });

  it('allows normal fluctuation, small prior files, and --force', () => {
    expect(core.shouldRefuseWrite(53, 40, false)).toBe(false);
    expect(core.shouldRefuseWrite(0, 5, false)).toBe(false);
    expect(core.shouldRefuseWrite(5, 2, false)).toBe(false);
    expect(core.shouldRefuseWrite(53, 0, true)).toBe(false);
  });

  it('allows an already-empty catalog to stay empty', () => {
    expect(core.shouldRefuseWrite(0, 0, false)).toBe(false);
  });

  it('waives only the ratio rule for sources that cannot prove deletion', () => {
    expect(core.shouldRefuseWrite(100, 1, false, { ratio: false })).toBe(false);
    expect(core.shouldRefuseWrite(100, 0, false, { ratio: false })).toBe(true);
  });
});

describe('generated-file round trip', () => {
  it('buildGenerated output parses back to the same records and banner', () => {
    const records = [record()];
    const source = core.buildGenerated(records, '2026-08-30T07:00:00.000Z');

    expect(source).toContain("export const GENERATED_AT = '2026-08-30T07:00:00.000Z'");
    expect(core.parseGenerated(source)).toEqual({
      generatedAt: '2026-08-30T07:00:00.000Z',
      count: 1,
    });
    expect(core.extractRecords(source)).toEqual(records);
  });

  it('parseGenerated and extractRecords handle garbage gracefully', () => {
    expect(core.parseGenerated('')).toEqual({ generatedAt: null, count: 0 });
    expect(core.extractRecords('nothing here')).toBeNull();
  });
});

describe('redactSecret', () => {
  it('strips every occurrence of the key from log text', () => {
    const body = '{"fault":"rate limit for key sekret123 exceeded; key=sekret123"}';
    const clean = core.redactSecret(body, 'sekret123');
    expect(clean).not.toContain('sekret123');
    expect(clean).toContain('[TM_KEY]');
  });

  it('uses the given label for other secrets', () => {
    const clean = core.redactSecret(
      'key=sekret123',
      'sekret123',
      '[SUPABASE_SERVICE_ROLE_KEY]',
    );
    expect(clean).toBe('key=[SUPABASE_SERVICE_ROLE_KEY]');
  });

  it('passes text through when there is no secret', () => {
    expect(core.redactSecret('plain', undefined)).toBe('plain');
  });
});

describe('formatError', () => {
  it('prefers PostgREST diagnostics over generic object stringification', () => {
    const message = core.formatError({
      message: 'new row violates check constraint "events_end_after_start"',
      details: 'Key=sekret123',
      hint: 'secret=sekret123',
    });

    expect(message).toContain('events_end_after_start');
    expect(message).toContain('sekret123');
    expect(message).not.toContain('[object Object]');
    expect(core.redactSecret(message, 'sekret123')).toContain('[TM_KEY]');
  });

  it('falls back to the message from Error instances', () => {
    const message = core.formatError(new Error('boom: sekret123'));
    expect(message).toBe('boom: sekret123');
    expect(core.redactSecret(message, 'sekret123')).toBe('boom: [TM_KEY]');
  });

  it('surfaces diagnostics for empty-message provider errors', () => {
    const message = core.formatError({
      message: '',
      status: 429,
      code: 'TM_RATE_LIMIT',
      url: 'https://app.ticketmaster.com/discovery/v2/events.json',
      body: { message: '' },
    });
    expect(message).toContain('status=429');
    expect(message).toContain('code=TM_RATE_LIMIT');
    expect(message).toContain('url=https://app.ticketmaster.com/discovery/v2/events.json');
    expect(message).toContain('body={"message":""}');
  });

  it('returns a stable fallback for empty objects', () => {
    expect(core.formatError({ message: '' })).toBe('Unknown error (empty provider response)');
  });
});
