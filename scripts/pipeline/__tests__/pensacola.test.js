const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { SOURCES } = require('../sources');
const { readSourceFixture, processSourceItems } = require('../run-source');
const { serviceRegionForLocation } = require('../service-regions');
const { validateRegistries } = require('../registry-validation');

const NOW = Date.parse('2026-10-17T20:00:00Z');
const local = feeds.filter(feed => feed.serviceRegion === 'pensacola');
const uwf = () => SOURCES.find(s => s.sourceName === 'University of West Florida Events');

const vevent = (uid, start, location, summary, description = 'Free and open to the public.') => [
  'BEGIN:VEVENT', 'DTSTAMP:20261018T025600Z', `UID:tag:localist.com\\,2008:EventInstance_${uid}`,
  `DTSTART:${start}`, `DESCRIPTION:${description}`, 'GEO:30.549;-87.217', `LOCATION:${location}`,
  `SUMMARY:${summary}`, `URL;VALUE=URI:https://events.uwf.edu/event/${uid}`, 'END:VEVENT',
].join('\r\n');
const calendar = events => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:icalendar-ruby', ...events, 'END:VCALENDAR'].join('\r\n');
const run = text => processSourceItems(uwf(), uwf().parseFixture(text, { now: NOW }), { overrides: {}, now: NOW });

it('pins the verified Pensacola feeds and their region', () => {
  expect(local.length).toBeGreaterThanOrEqual(60);
  expect(local.map(feed => [feed.id, feed.kind])).toEqual(
    expect.arrayContaining([['uwf-central-events', 'ics'], ['palafox-market-pensacola', 'schedule']])
  );
  expect(local.every(feed => feed.timezone === 'America/Chicago' && feed.excludeOnlineOnly === true)).toBe(true);
  expect(validateRegistries(feeds, venues)).toEqual([]);
});

it('maps every fixture event to a registered Pensacola venue on Central time', () => {
  for (const feed of local) {
    const source = SOURCES.find(s => s.sourceName === feed.name);
    expect(source).toBeDefined();
    const result = readSourceFixture(source, undefined, { now: NOW });
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.rejects).toEqual([]);
    expect(result.unmapped).toEqual({});
    for (const record of result.records) {
      expect(record.timezone).toBe('America/Chicago');
      expect(serviceRegionForLocation(record)?.id).toBe('pensacola');
    }
  }
});

it('skips the UWF fixture listings at Emerald Coast, online, and athletics', () => {
  const ids = readSourceFixture(uwf(), undefined, { now: NOW }).records.map(r => r.sourceEventId);
  for (const uid of ['53348419447738', '54171533957239', '53556144139989']) {
    expect(ids.some(id => id.includes(uid))).toBe(false);
  }
  expect(ids.some(id => id.includes('53798934354103'))).toBe(true);
});

it('restricts Emerald Coast and Tech Campus Library listings by name and maps the Pace Library to UWF', () => {
  const result = run(calendar([
    vevent('900001', '20261022T230000Z', 'Building 32 - John C. Pace Library\\, Room 116', 'Pace Library Open House'),
    vevent('900002', '20261022T230000Z', 'Building 32 - John C. Pace Library', 'Library Research Workshop'),
    vevent('900003', '20261022T230000Z', 'Building 8', 'Study Night', 'Join your friends at UWF Tech Campus Library.'),
    vevent('900004', '20261022T230000Z', 'Building 8', 'History Talk', 'A talk at UWF Emerald Coast in Fort Walton Beach.'),
  ]));
  expect(result.records.map(r => [r.title, r.venue])).toEqual([
    ['Pace Library Open House', 'University of West Florida'],
    ['Library Research Workshop', 'University of West Florida'],
  ]);
  expect(result.unmapped).toEqual({});
});

it('keeps every venue inside the Pensacola box tagged FL and resolving to pensacola', () => {
  const box = venues.filter(v => v.lat >= 30.26 && v.lat <= 31.01 && v.lng >= -87.63 && v.lng <= -86.78);
  expect(box.map(v => v.name)).toEqual(expect.arrayContaining(['University of West Florida', 'Historic Pensacola', 'Palafox Market']));
  for (const venue of box) {
    expect(venue.region).toBe('FL');
    expect(serviceRegionForLocation({ ...venue, countryCode: venue.countryCode ?? 'US' })?.id).toBe('pensacola');
  }
});

test('palafox schedule hours convert from America/Chicago across the Nov 1 DST change', () => {
  const source = SOURCES.find(s => s.sourceName === 'Palafox Market');
  const { records } = readSourceFixture(source, undefined, { now: NOW });
  const starts = records.map(r => r.startsAtIso);
  expect(starts).toContain('2026-10-24T14:00:00.000Z'); // 09:00 CDT
  expect(starts).toContain('2026-11-07T15:00:00.000Z'); // 09:00 CST
  for (const r of records) expect(new Date(r.endsAtIso) - new Date(r.startsAtIso)).toBe(5 * 3600 * 1000);
});
