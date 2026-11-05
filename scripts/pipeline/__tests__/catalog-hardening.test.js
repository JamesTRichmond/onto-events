const { dedupeRecords } = require('../dedupe');
const { ratingAudit } = require('../rating-audit');
const { rateCalendarEvent } = require('../calendar-record');
const { createIcsAdapter } = require('../adapters/ics');
const { processSourceItems, readSourceFixture } = require('../run-source');
const tm = require('../adapters/ticketmaster');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const fixture = readSourceFixture(tm);
const base = fixture.records.find((r) => r.id === 'tm-killers-1');
const venue = { name: 'Fixture Hall', aliases: [], kind: 'hall', lat: base.lat, lng: base.lng, locality: 'Salt Lake City', address: 'Synthetic fixture' };
const feed = { id: 'synthetic', name: 'Synthetic calendar', kind: 'ics', sourceKind: 'community', timezone: 'America/Denver',
  url: 'https://fixture.example/calendar.ics', fixturePath: 'scripts/pipeline/fixtures/ics/contract.ics', defaultCategory: 'music', defaultRating: 'general' };

it('keeps mature and cancelled signals when richer duplicate metadata wins in either order', () => {
  // A synthetic collision proves a contract, not overlap observed in live pulls.
  const adult = { ...base, rating: 'mature', isCancelled: true, description: 'Casino' };
  const rich = { ...base, id: 'calendar-copy', sourceName: feed.name, rating: 'general', description: 'Long organizer description. '.repeat(10) };
  for (const records of [[adult, rich], [rich, adult]]) {
    const result = dedupeRecords(records);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ id: 'calendar-copy', sourceName: feed.name, rating: 'mature', isCancelled: true });
    expect(result.dropped[0].rule).toBe('strong');
  }
});

it('does not merge nearby venues outside the strong time/distance bounds or borrow an invalid end', () => {
  const copy = { ...base, id: 'other-source', sourceName: 'Other', description: 'Richer description. '.repeat(10) };
  expect(dedupeRecords([base, { ...copy, startsAtIso: '2026-09-05T02:16:00Z' }]).records).toHaveLength(2);
  expect(dedupeRecords([base, { ...copy, lat: base.lat + 0.1 }]).records).toHaveLength(2);
  const result = dedupeRecords([{ ...base, endsAtIso: '2026-09-05T02:05:00Z' }, { ...copy, startsAtIso: '2026-09-05T02:10:00Z' }]);
  expect(result.records[0].endsAtIso).toBeUndefined();
});

it('preserves distinct morning/evening calendar occurrences with a shared title and local date', () => {
  const adapter = createIcsAdapter(feed, [venue]);
  const raw = { uid: 'morning', title: 'Two showings', location: venue.name, start: '2026-11-02T17:00:00Z' };
  const result = processSourceItems(adapter, [raw, { ...raw, uid: 'evening', start: '2026-11-03T01:00:00Z' }]);
  expect(result.records).toHaveLength(2);
  expect(dedupeRecords([{ ...base, sourceName: 'Ticketmaster' }, { ...base, id: 'relisting', startsAtIso: '2026-09-05T05:00:00Z' }]).dropped[0].rule).toBe('weak');
});

it('never interprets negated all-ages text as permission to lower a bar rating', () => {
  const bar = { ...venue, kind: 'bar' };
  expect(rateCalendarEvent({ title: 'Not suitable for all ages' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages are not permitted' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'Not suitable\nfor all ages' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages welcome — no minors allowed' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages welcome', description: 'Event details. '.repeat(10) + 'No minors allowed.' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'All ages welcome. Doors open one hour before showtime. Minors prohibited.' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'Minors prohibited. ' + 'Event details. '.repeat(10) + 'All ages welcome.' }, bar, feed)).toBe('mature');
  // The brief permits conservative false positives; broad negation rules are
  // not loosened without a reviewed real-source case or James's override.
  expect(rateCalendarEvent({ title: 'No refunds. All ages welcome' }, bar, feed)).toBe('mature');
  expect(rateCalendarEvent({ title: 'Kids concert — all ages' }, bar, feed)).toBe('general');
  expect(rateCalendarEvent({ title: 'All ages casino show' }, bar, feed)).toBe('mature');
});

it('marks skipped-source audit snapshots incomplete and exits nonzero', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-audit-'));
  try {
    const file = path.join(directory, 'snapshot.json');
    fs.writeFileSync(file, JSON.stringify({ evidence: 'live', records: [base], summaries: [{ sourceName: 'Ticketmaster', status: 'skipped', reason: 'no key' }] }));
    const result = spawnSync(process.execPath, ['scripts/rating-audit.mjs', '--input', file], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ complete: false, sourcesComplete: false, skippedSources: [{ sourceName: 'Ticketmaster' }] });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('does not manufacture attendee counts for Ticketmaster records', () => {
  expect(fixture.records.every((r) => r.attendees === 0)).toBe(true);
});

it('keeps verified Wiseguys 21+ locations mature when a provider omits age metadata', () => {
  expect(fixture.records.find((r) => r.id === 'tm-comedy-1').rating).toBe('mature');
  const { rateEvent } = require('../rating');
  expect(rateEvent({ venueName: 'Wiseguys', locality: 'West Jordan', name: 'All ages comedy' })).toBe('mature');
  expect(rateEvent({ venueName: 'Fixture Hall', locality: 'Salt Lake City' })).toBe('general');
});

it('audits every general bar/club record, includes all-ages exceptions and flags uncurated venue hints', () => {
  const records = [
    { ...base, id: 'general-bar', venueKind: 'bar', title: 'All ages concert' },
    { ...base, id: 'adult-bar', venueKind: 'bar', rating: 'mature' },
    { ...base, id: 'general-club', venue: 'Fixture Club' },
    { ...base, id: 'unknown', venue: 'Fixture Tavern' },
  ];
  const report = ratingAudit(records, [{ ...venue, name: 'Fixture Club', kind: 'club' }]);
  expect(report.generalAtBarOrClub.map((r) => r.id)).toEqual(['general-bar', 'general-club']);
  expect(report.generalAtBarOrClub[0].explicitAllAges).toBe(true);
  expect(report.possibleUnmappedAdultVenues.map((r) => r.id)).toEqual(['unknown']);
  expect(report.venueMetadataComplete).toBe(false);
  expect(records[0].rating).toBe('general');
});

it('prefers current venue curation over stale or provider-supplied snapshot kinds', () => {
  const record = { ...base, venue: 'Legacy venue label', venueKind: 'hall', rating: 'general' };
  const curated = { ...venue, name: 'Reviewed venue', aliases: ['Legacy venue label'], kind: 'bar' };
  const report = ratingAudit([record], [curated]);
  expect(report.generalAtBarOrClub).toHaveLength(1);
  expect(report.generalAtBarOrClub[0]).toMatchObject({ id: record.id, venueKind: 'bar' });
  expect(record.venueKind).toBe('hall');
});

it('never treats titles that normalize to nothing as the same event', () => {
  const { isDuplicate } = require('../dedupe');
  const base = {
    sourceName: 'Salt Lake County Events', lat: 40.7651, lng: -111.9032,
    startsAtIso: '2026-10-03T17:30:00.000Z',
  };
  expect(isDuplicate({ ...base, id: 'a', title: '🎉🎉' }, { ...base, id: 'b', title: '✨' })).toBeNull();
  expect(isDuplicate({ ...base, id: 'c', title: '夏祭り' }, { ...base, id: 'd', title: 'ライブ' })).toBeNull();
  expect(isDuplicate({ ...base, id: 'e', title: 'Star Party' }, { ...base, id: 'f', title: 'STAR PARTY!' })).toBe('strong');
});

it('never caps unrelated titles that normalize to nothing as one title run', () => {
  const { capTitleRuns } = require('../dedupe');
  const records = ['🎉', '✨', '夏祭り', 'ライブ'].map((title, i) => ({ id: `r${i}`, title }));
  expect(capTitleRuns(records).records.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3']);
  const shows = ['Joseph', 'Joseph', 'JOSEPH!'].map((title, i) => ({ id: `j${i}`, title }));
  expect(capTitleRuns(shows).records.map((r) => r.id)).toEqual(['j0', 'j1']);
});

it('carries the strictest rating across sources before writing', () => {
  const { strictestRatings } = require('../dedupe');
  const base = { title: 'Late show', lat: 40.76, lng: -111.9, startsAtIso: '2026-10-03T03:00:00.000Z' };
  const raised = strictestRatings([
    { ...base, id: 'a', sourceName: 'A', rating: 'general' },
    { ...base, id: 'b', sourceName: 'B', rating: 'mature' },
    { ...base, id: 'c', sourceName: 'C', title: 'Other', rating: 'family' },
  ]);
  expect([...raised]).toEqual([['a', 'mature']]);
});

it('groups a chain of strong matches as one happening', () => {
  const { strictestRatings } = require('../dedupe');
  const at = (minute) => `2026-10-03T03:${String(minute).padStart(2, '0')}:00.000Z`;
  const base = { title: 'Late show', lat: 40.76, lng: -111.9 };
  // a~b (10 min) and b~c (10 min), a and c 20 min apart: still one happening.
  const raised = strictestRatings([
    { ...base, id: 'a', rating: 'family', startsAtIso: at(0) },
    { ...base, id: 'b', rating: 'general', startsAtIso: at(10) },
    { ...base, id: 'c', rating: 'mature', startsAtIso: at(20) },
  ]);
  expect(Object.fromEntries(raised)).toEqual({ a: 'mature', b: 'mature' });
});

describe('same-venue, same-start carry-over (James, 2026-10-08)', () => {
  const { strictestRatings } = require('../dedupe');
  const slot = { venue: 'Asheville Museum of Science', lat: 35.5948, lng: -82.5534, startsAtIso: '2026-10-29T22:00:00.000Z' };

  it('raises a retitled aggregator copy to the rating the venue gave its own listing', () => {
    const raised = strictestRatings([
      { ...slot, id: 'amos', sourceName: 'Asheville Museum of Science', title: 'AMOS After Hours: Conspiracies, Urban Legends, Local Lore', rating: 'mature' },
      { ...slot, id: 'ada', sourceName: 'Asheville Downtown Association', title: 'AMOS After Hours: Conspiracies, Urban Legends, and Local Lore', rating: 'general' },
    ]);
    expect(Object.fromEntries(raised)).toEqual({ ada: 'mature' });
  });

  it('needs two sources, the same venue and the exact same start', () => {
    const one = { ...slot, id: 'a', sourceName: 'A', title: 'Late show', rating: 'mature' };
    expect(strictestRatings([one, { ...slot, id: 'b', sourceName: 'a', title: 'Story time', rating: 'family' }]).size).toBe(0);
    expect(strictestRatings([one, { ...one, id: 'b', sourceName: 'B', title: 'Story time', rating: 'family',
      startsAtIso: '2026-10-29T22:01:00.000Z' }]).size).toBe(0);
    expect(strictestRatings([one, { ...one, id: 'b', sourceName: 'B', title: 'Story time', rating: 'family',
      venue: 'Pack Memorial Library' }]).size).toBe(0);
    expect(strictestRatings([one, { ...one, id: 'b', sourceName: undefined, title: 'Story time', rating: 'family' }]).size).toBe(0);
    expect(strictestRatings([one, { ...one, id: 'b', sourceName: 'B', title: 'Story time', rating: 'family',
      venue: '  asheville   MUSEUM of science ' }])).toEqual(new Map([['b', 'mature']]));
  });

  it('chains with the strong title rule', () => {
    // c shares a title and slot with b; b shares only the venue slot with a.
    const raised = strictestRatings([
      { ...slot, id: 'a', sourceName: 'A', title: 'After Hours', rating: 'mature' },
      { ...slot, id: 'b', sourceName: 'B', title: 'Science night', rating: 'general' },
      { ...slot, id: 'c', sourceName: 'C', title: 'Science night', rating: 'family', venue: 'Other' },
    ]);
    expect(Object.fromEntries(raised)).toEqual({ b: 'mature', c: 'mature' });
  });
});

describe("a venue's own All Ages over a bar or club default (James, 2026-10-08, option b)", () => {
  const { strictestRatings } = require('../dedupe');
  const show = { title: 'Fruition', venue: 'The Grey Eagle', lat: 35.587, lng: -82.564, startsAtIso: '2026-10-09T00:00:00.000Z' };
  const venue = { ...show, id: 'venue', sourceName: 'The Grey Eagle', sourceKind: 'community', rating: 'general', ratingBasis: 'all-ages' };
  const aggregator = { ...show, id: 'lma', sourceName: 'Live Music Asheville', sourceKind: 'aggregator', rating: 'mature', ratingBasis: 'venue-default' };

  it('lets the venue listing that states All Ages set every copy', () => {
    expect(Object.fromEntries(strictestRatings([venue, aggregator]))).toEqual({ lma: 'general' });
    // Retitled copies at the same venue and start link too.
    expect(Object.fromEntries(strictestRatings([venue, { ...aggregator, title: 'Fruition (live)' }]))).toEqual({ lma: 'general' });
  });

  it('still lets any stated age limit, override or unknown basis win', () => {
    for (const basis of ['signal', 'override', undefined]) {
      expect(Object.fromEntries(strictestRatings([venue, { ...aggregator, ratingBasis: basis }]))).toEqual({ venue: 'mature' });
    }
  });

  it('needs the All Ages claim from a source other than an aggregator', () => {
    const claim = { ...venue, id: 'laurel', sourceName: 'The Laurel', sourceKind: 'aggregator' };
    expect(Object.fromEntries(strictestRatings([claim, aggregator]))).toEqual({ laurel: 'mature' });
  });

  it('leaves a lone default alone', () => {
    expect(strictestRatings([aggregator]).size).toBe(0);
  });
});

it('keeps pre-cap copies as rating evidence', () => {
  const runner = require('../run-source');
  const adapter = {
    sourceName: 'S', idPrefix: 's-', maxCardsPerTitle: 1,
    normalize: (raw) => raw,
  };
  const row = (id, day) => ({ id, source: 'live', sourceName: 'S', title: 'Show', category: 'music',
    venue: 'V', area: 'SLC', lat: 40.76, lng: -111.9, whenLabel: 'x', startsInMinutes: 0,
    startsAtIso: `2026-10-0${day}T03:00:00.000Z`, description: 'd', attendees: 0, rating: 'general' });
  const result = runner.processSourceItems(adapter, [row('s-1', 3), row('s-2', 4)], { overrides: {} });
  expect(result.records.length).toBeLessThan(result.ratingEvidence.length);
});
