const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const audit = require('../../../docs/sources/2026-10-18-austin-leads.json');
const provenance = require('../fixtures/austin/provenance.json');
const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { syncSources } = require('../sync-sources');
const { serviceRegionForLocation } = require('../service-regions');
const { validateRegistries } = require('../registry-validation');
const { localSnapshot } = require('../local-snapshot');
const { missingEvidence, createScheduleAdapter } = require('../adapters/schedule');
const { HORIZON_DAYS, createIcsAdapter } = require('../adapters/ics');
const { buildLocalGenerated, parseGenerated } = require('../../refresh-core');

const NOW = Date.parse('2026-10-18T12:00:00Z');
const auditLeadIds = new Set(audit.leads.map((lead) => lead.id));
const localFeeds = feeds.filter((feed) => auditLeadIds.has(feed.id));
const names = new Set(localFeeds.map((feed) => feed.name));
const sources = SOURCES.filter((source) => names.has(source.sourceName));
const adapter = (feed) => sources.find((source) => source.sourceName === feed.name);
const markets = localFeeds.filter((feed) => feed.schedule);
const candidateAdapter = (feed) => createScheduleAdapter(feed, venues);

it('keeps all 60 candidates accounted for without claiming fabricated fixtures verify sources', () => {
  expect(sources).toHaveLength(60);
  expect(validateRegistries(feeds, venues)).toEqual([]);
  expect(audit.leads.map((lead) => lead.id).sort()).toEqual(localFeeds.map((feed) => feed.id).sort());
  expect(audit.activeSourceIds).toEqual(localFeeds.filter((feed) => !feed.pausedReason).map((feed) => feed.id));
  expect(audit.summary).toMatchObject({
    registeredCount: 60, quarantinedCount: 60, activeCount: 0, liveVerifiedCount: 0,
    indexedScheduleCandidates: 2, offlineEventCount: 17,
  });
  expect(audit.leads.filter((lead) => lead.originalKind === 'ics')).toHaveLength(21);
  expect(audit.leads.filter((lead) => lead.originalKind === 'schedule')).toHaveLength(39);
  for (const feed of localFeeds) {
    expect(feed.pausedReason).toMatch(/ENOTFOUND/);
    expect(feed.notes).not.toMatch(/^VERIFIED/);
  }
  expect(markets).toHaveLength(2);
  for (const feed of markets) {
    expect(validateRegistries([{ ...feed, schedule: { evidence: [], events: [] } }], venues))
      .toContain(`Invalid feed: ${feed.id}`);
  }
  for (const feed of localFeeds.filter((feed) => !feed.schedule)) {
    const text = fs.readFileSync(adapter(feed).fixturePath, 'utf8');
    expect(text).toContain('NOT A PUBLISHER CAPTURE');
    expect(text).not.toMatch(/BEGIN:VEVENT|Public Program|Community Program/);
    expect(readSourceFixture(adapter(feed), undefined, { now: NOW }).records).toEqual([]);
    const parser = feed.kind === 'ics' ? createIcsAdapter(feed, venues) : candidateAdapter(feed);
    expect(() => parser.parseFixture(text, { now: NOW })).toThrow();
    if (feed.kind === 'schedule') {
      const unpaused = { ...feed };
      delete unpaused.pausedReason;
      expect(validateRegistries([unpaused], venues)).toContain(`Invalid feed: ${feed.id}`);
    }
  }
});

it.each([false, true])('skips every quarantined source without network, writes or retirement (fixture=%s)', async (fixture) => {
  const fetchImpl = jest.fn();
  const clientFactory = jest.fn();
  const result = await syncSources({
    sources, now: NOW, fixture, fetchImpl, clientFactory, log: jest.fn(), logError: jest.fn(),
  });
  expect(result.records).toEqual([]);
  expect(result.summaries).toHaveLength(60);
  expect(result.summaries.every((row) => row.status === 'skipped' && row.reason.startsWith('paused:'))).toBe(true);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(clientFactory).not.toHaveBeenCalled();
});

it('records indexed-excerpt provenance without passing it off as a publisher HTTP capture', () => {
  expect(provenance).toMatchObject({ liveCapture: false, liveActivationAllowed: false, directFetchResult: 'ENOTFOUND' });
  expect(provenance.offlineExpansionBasis).toContain('standing schedules');
  expect(provenance.fixtures).toHaveLength(2);
  for (const fixture of provenance.fixtures) {
    const feed = markets.find((feed) => feed.id === fixture.feedId);
    expect(fixture.publisherUrl).toBe(feed.url);
    expect(fixture.path).toBe(feed.fixturePath);
    const text = fs.readFileSync(adapter(feed).fixturePath, 'utf8');
    expect(createHash('sha256').update(text).digest('hex')).toBe(fixture.sha256);
    expect(text.trim()).toBe(fixture.excerpt ?? fixture.excerpts.join('\n'));
    expect(missingEvidence(text, feed.schedule.evidence)).toEqual([]);
  }
});

it.each([
  ['texas-farmers-market-mueller', 'Sun', '10', '14', 9,
    '2026-10-25T15:00:00.000Z', '2026-11-01T16:00:00.000Z', '2026-12-13T16:00:00.000Z'],
  ['sfc-farmers-market-downtown', 'Sat', '09', '13', 8,
    '2026-10-31T14:00:00.000Z', '2026-11-07T15:00:00.000Z', '2026-12-12T15:00:00.000Z'],
])('expands only the indexed %s candidate hours across Central DST', (id, weekday, hour, endHour, count, before, after, last) => {
  const feed = markets.find((feed) => feed.id === id);
  const result = readSourceFixture(candidateAdapter(feed), undefined, { now: NOW });
  expect(result.rejects).toEqual([]);
  expect(result.unmapped).toEqual({});
  expect(result.records).toHaveLength(count);
  expect(result.horizon).toBe(new Date(NOW + HORIZON_DAYS * 86_400_000).toISOString());
  expect(result.records.map((row) => row.startsAtIso)).toEqual(expect.arrayContaining([before, after]));
  expect(result.records.at(-1).startsAtIso).toBe(last);
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  for (const row of result.records) {
    const start = Object.fromEntries(clock.formatToParts(new Date(row.startsAtIso)).map(({ type, value }) => [type, value]));
    const end = Object.fromEntries(clock.formatToParts(new Date(row.endsAtIso)).map(({ type, value }) => [type, value]));
    expect(start).toMatchObject({ weekday, hour, minute: '00' });
    expect(end).toMatchObject({ weekday, hour: endHour, minute: '00' });
    expect(Date.parse(row.endsAtIso) - Date.parse(row.startsAtIso)).toBe(4 * 3_600_000);
    expect(row.rating).toBe('family');
    expect(row.timezone).toBe('America/Chicago');
    expect(serviceRegionForLocation(row)?.id).toBe('austin');
    expect(row.title).not.toMatch(/Community Program|Public Program/);
  }
});

it.each([
  ['texas-farmers-market-mueller', 'Every Sunday from 10am-2pm, rain or shine!'],
  ['sfc-farmers-market-downtown', 'Hours: Saturdays, 9 AM – 1 PM'],
  ['sfc-farmers-market-downtown', 'Both markets are open Saturdays from 9 AM – 1 PM year-round, rain or shine, except during severe weather.'],
])('requires actual weekday and hours for %s even when publisher identity remains', (id, phrase) => {
  const feed = markets.find((feed) => feed.id === id);
  const source = candidateAdapter(feed);
  const text = fs.readFileSync(source.fixturePath, 'utf8');
  const identity = `${feed.name}\nAustin\n`;
  for (const altered of [
    text.replace(phrase, ''),
    text.replace(phrase, 'Schedule unavailable'),
    text.replace(phrase, phrase.replace(/Sunday|Saturdays/, 'Fridays')),
    text.replace(phrase, phrase.replace(/10am|9 AM/, '3 PM')),
  ]) {
    expect(() => source.parseFixture(identity + altered, { now: NOW })).toThrow('Published schedule');
  }
});

it('ships the complete attributed standing-schedule horizon without enabling live sync', async () => {
  const result = await syncSources({ sources, now: NOW, dryRun: true, log: jest.fn(), logError: jest.fn() });
  expect(result.records).toEqual([]);
  const records = localSnapshot(markets.flatMap((feed) =>
    readSourceFixture(candidateAdapter(feed), undefined, { now: NOW }).records), NOW);
  const file = fs.readFileSync(path.join(__dirname, '../../../data/austin-events.ts'), 'utf8');
  const metadata = parseGenerated(file);
  expect(metadata.count).toBe(17);
  expect(audit.offlineSnapshot).toMatchObject({
    eventCount: records.length, firstEventStartsAt: records[0].startsAtIso,
    lastEventEndsAt: records.at(-1).endsAtIso,
    requestedHorizonDays: HORIZON_DAYS, horizonFulfilled: true,
    horizonEndsAtExclusive: new Date(NOW + HORIZON_DAYS * 86_400_000).toISOString(),
  });
  expect(Number.isFinite(Date.parse(metadata.generatedAt))).toBe(true);
  expect(file).toBe(`${audit.offlineSnapshot.provenanceNotice}\n${buildLocalGenerated(records, metadata.generatedAt, 'austin')}`);
});

it('cleans parser candidate records without changing their full test horizon', () => {
  const records = markets.flatMap((feed) => readSourceFixture(candidateAdapter(feed), undefined, { now: NOW }).records);
  const result = localSnapshot(records, NOW);
  expect(result).toHaveLength(17);
  expect(result[0].startsAtIso).toBe('2026-10-18T15:00:00.000Z');
  expect(result.at(-1).startsAtIso).toBe('2026-12-13T16:00:00.000Z');
  for (const record of result) {
    expect(record).not.toHaveProperty('ratingBasis');
    expect(record).not.toHaveProperty('sourceKind');
    expect(record).not.toHaveProperty('venueKind');
  }
  expect(buildLocalGenerated(result, new Date(NOW).toISOString(), 'austin')).toContain('npm run events:refresh:local -- --region austin');
});

describe('Austin Hill Country Expansion Promoted Anchor Feeds', () => {
  const EVAL_NOW = Date.parse('2026-10-31T12:00:00Z');
  const promotedIds = [
    'round-rock-public-library',
    'san-marcos-parks-rec',
    'georgetown-palace-theatre',
    'jester-king-brewery',
    'lockhart-chamber-events',
  ];
  const promotedFeeds = feeds.filter((feed) => promotedIds.includes(feed.id));

  it('registers all 5 promoted anchor feeds in data/feeds.json with valid Austin service region', () => {
    expect(promotedFeeds).toHaveLength(5);
    for (const feed of promotedFeeds) {
      expect(feed.serviceRegion).toBe('austin');
      expect(feed.timezone).toBe('America/Chicago');
      expect(feed.sourceKind).toBe('community');
      expect(feed.kind).toBe('ics');
      expect(feed.pausedReason).toBeUndefined();
    }
  });

  it('parses every promoted fixture with valid records, 0 rejects, and 0 unmapped venues', () => {
    for (const feed of promotedFeeds) {
      const source = SOURCES.find((s) => s.sourceName === feed.name);
      expect(source).toBeDefined();
      const result = readSourceFixture(source, source.fixturePath, { now: EVAL_NOW });
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      expect(result.unmapped).toEqual({});
      for (const record of result.records) {
        expect(record.timezone).toBe('America/Chicago');
        expect(record.region).toBe('TX');
        expect(serviceRegionForLocation(record)?.id).toBe('austin');
      }
    }
  });
});
