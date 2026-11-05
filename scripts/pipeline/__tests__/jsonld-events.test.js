const { jsonLdBlocks, jsonLdEvents, jsonLdInstant, jsonLdEnd, jsonLdPlace, isCancelledStatus } = require('../jsonld-events');

const script = (value) => `<script type="application/ld+json">${typeof value === 'string' ? value : JSON.stringify(value)}</script>`;

it('collects Event nodes from arrays, @graph and event subtypes, skipping malformed blocks', () => {
  const html = [
    script({ '@type': 'Organization', name: 'Venue' }),
    script('{ not json'),
    script([{ '@type': 'MusicEvent', name: 'Show' }]),
    script({ '@graph': [{ '@type': ['TheaterEvent'], name: 'Play' }, { '@type': 'WebPage' }] }),
  ].join('\n');
  expect(jsonLdBlocks(html)).toHaveLength(3);
  expect(jsonLdEvents(html).map((event) => event.name)).toEqual(['Show', 'Play']);
});

it.each([
  ['2026-10-10T19:30:00-0400', '2026-10-10T23:30:00.000Z', false],
  ['2026-10-10T19:30:00-04:00', '2026-10-10T23:30:00.000Z', false],
  ['2026-10-10T23:30:00Z', '2026-10-10T23:30:00.000Z', false],
  ['2026-10-10T19:30', '2026-10-10T23:30:00.000Z', false],
  ['2026-10-10', '2026-10-10T04:00:00.000Z', true],
])('reads %s in the feed timezone', (value, iso, allDay) => {
  const parsed = jsonLdInstant(value, 'America/New_York');
  expect(new Date(parsed.instant).toISOString()).toBe(iso);
  expect(parsed.allDay).toBe(allDay);
});

it('rejects a value that is not a date', () => {
  expect(jsonLdInstant('next Tuesday', 'America/New_York')).toBeNull();
  expect(jsonLdInstant(undefined, 'America/New_York')).toBeNull();
});

it('reads a place name, a structured or multi-line address, and an online location', () => {
  expect(jsonLdPlace({ '@type': 'Place', name: 'Story Parlor', address: '227 Haywood Road\nAsheville, NC, 28806' }))
    .toEqual({ name: 'Story Parlor', address: '227 Haywood Road, Asheville, NC, 28806' });
  expect(jsonLdPlace({ '@type': 'Place', address: { streetAddress: '1 Main St', addressLocality: 'Asheville', addressRegion: 'NC', postalCode: '28801' } }))
    .toEqual({ name: '', address: '1 Main St, Asheville, NC 28801' });
  expect(jsonLdPlace({ '@type': 'VirtualLocation', url: 'https://example.org' })).toMatchObject({ online: true });
  // Squarespace entity-encodes some place names.
  expect(jsonLdPlace({ '@type': 'Place', name: 'Shakey&#39;s', address: 'Tunnel Rd &amp; Lexington Ave' })).toEqual({ name: 'Shakey\'s', address: 'Tunnel Rd & Lexington Ave' });
  expect(isCancelledStatus('https://schema.org/EventCancelled')).toBe(true);
  expect(isCancelledStatus({ '@id': 'https://schema.org/EventScheduled' })).toBe(false);
});

// Review findings, 2026-10-09.
it('treats an out-of-range date as no date instead of throwing', () => {
  for (const bad of ['0000-00-00', '2026-00-10', '2026-12-00', '2026-02-30', '2026-10-09T24:00:00Z', '2026-12-00T10:00']) {
    expect(jsonLdInstant(bad, 'America/New_York')).toBeNull();
  }
  const html = script([
    { '@type': 'Event', name: 'Good', startDate: '2026-10-20T19:00:00-04:00' },
    { '@type': 'Event', name: 'Open-ended', startDate: '2026-10-21T19:00:00-04:00', endDate: '0000-00-00' },
  ]);
  expect(jsonLdEvents(html)).toHaveLength(2);
});

it('ends a date-only start at its timed end, and a date-only end at the midnight after it', () => {
  const tz = 'America/New_York';
  const end = (start, finish) => {
    const instant = jsonLdEnd(jsonLdInstant(start, tz), finish ? jsonLdInstant(finish, tz) : null, tz);
    return instant === undefined ? undefined : new Date(instant).toISOString();
  };
  expect(end('2026-09-01', '2026-12-31T17:00:00-05:00')).toBe('2026-12-31T22:00:00.000Z');
  expect(end('2026-10-09T10:00:00-04:00', '2026-10-11')).toBe('2026-10-12T04:00:00.000Z');
  expect(end('2026-10-09T10:00:00-04:00', '2026-10-09')).toBe('2026-10-10T04:00:00.000Z');
  expect(end('2026-11-01', '2026-11-03')).toBe('2026-11-04T05:00:00.000Z');
  expect(end('2026-11-01')).toBe('2026-11-02T05:00:00.000Z');
  expect(end('2026-10-09T19:00:00-04:00', '2026-10-09T18:00:00-04:00')).toBeUndefined();
});
