const fs = require('node:fs');
const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const { validateRegistries } = require('../registry-validation');
const { serviceRegionForLocation } = require('../service-regions');
const { missingEvidence } = require('../adapters/schedule');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

// Fixed evaluation clock matching source-trust.test.js.
const now = Date.parse('2026-09-05T00:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  if (!adapter) throw new Error(`Source not found: ${sourceName}`);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

describe('Tallahassee & Capital Region 54-Source Registry & Fixture Contract', () => {
  const tallahasseeFeeds = feeds.filter((feed) => feed.serviceRegion === 'tallahassee');

  it('registers 54 validated Tallahassee feeds in the tallahassee service region on Eastern time', () => {
    expect(tallahasseeFeeds).toHaveLength(54);
    expect(validateRegistries(feeds, venues)).toEqual([]);
    for (const feed of tallahasseeFeeds) {
      expect(feed.timezone).toBe('America/New_York');
      expect(feed.serviceRegion).toBe('tallahassee');
      expect(feed.url).toMatch(/^https:\/\//);
    }
  });

  it('parses every single one of the 54 Tallahassee fixtures with >0 valid records and 0 rejects', () => {
    for (const feed of tallahasseeFeeds) {
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.rejects).toEqual([]);
      if (feed.sourceKind === 'community') {
        expect(result.unmapped).toEqual({});
      }
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record.timezone).toBe('America/New_York');
        expect(record.region).toBe('FL');
        expect(serviceRegionForLocation(record)?.id).toBe('tallahassee');
        expect(record.sourceName).toBe(feed.name);
        expect(record.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('Leon County Public Library System (12 Live LibCal Feeds)', () => {
  it('maps main library and systemwide programs to LeRoy Collins Leon County Main Library', () => {
    const result = fixtureFor('LeRoy Collins Leon County Public Library');
    expect(result.records.length).toBe(4);
    expect(result.rejects).toEqual([]);
    const titles = result.records.map((r) => r.title);
    expect(titles).toContain('Preschool Story Hour & Crafts');
    expect(titles).toContain('Leon County STEM Saturday');
  });

  it('maps all 6 regional branch library feeds to their Leon County civic coordinates', () => {
    const branches = [
      ['Bruce J. Host Northeast Branch Library', 'Tallahassee', 30.5284, -84.2371],
      ['Dr. B.L. Perry, Jr. Branch Library', 'Tallahassee', 30.4093, -84.2818],
      ['Eastside Branch Library', 'Tallahassee', 30.4674, -84.1843],
      ['Lake Jackson Branch Library', 'Tallahassee', 30.4939, -84.3168],
      ['Woodville Branch Library', 'Woodville', 30.3129, -84.2522],
      ['Jane G. Sauls Fort Braden Branch Library', 'Fort Braden', 30.4367, -84.5369],
    ];
    for (const [name, locality, lat, lng] of branches) {
      const result = fixtureFor(name);
      expect(result.records.length).toBe(3);
      for (const record of result.records) {
        expect(record).toMatchObject({ venue: name, locality, region: 'FL', lat, lng });
      }
    }
  });

  it('maps the 4 specialized LibCal calendars (Main Campus, Exhibits, Food & Outreach, Self-Directed)', () => {
    const specialCalendars = [
      'LeRoy Collins Leon County Main Library',
      'Leon County Public Library Exhibits',
      'Leon County Public Library Community Food & Outreach',
      'Leon County Public Library Self-Directed Activities',
    ];
    for (const name of specialCalendars) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.unmapped).toEqual({});
      for (const record of result.records) {
        expect(record.venue).toMatch(/Library$/);
      }
    }
  });

  it('excludes resident-only Extended Services deliveries instead of misplacing them at the Main Library', () => {
    // Every Extended Services entry is a delivery to a senior residence for
    // its residents (for example Kenwood Place, 410 Junco Court). The entries
    // carry no LOCATION, so normalization would silently fall back to the
    // Main Library venue hint. The feed stays out of the active registry
    // until a residence's public access is verified with publisher evidence.
    expect(feeds.some((feed) => feed.id === 'lcpl-outreach')).toBe(false);
    expect(() => fixtureFor('Leon County Public Library Extended Services')).toThrow('Source not found');
    const fixture = fs.readFileSync('scripts/pipeline/fixtures/ics/lcpl-outreach.ics', 'utf8');
    expect(fixture).toContain('Kenwood Place');
    expect(fixture).toContain('410 Junco Court');
    expect(fixture).not.toContain('LOCATION:');
  });
});

describe('Florida State University Cultural, Performing Arts & Campus Feeds (21 Live Localist Feeds)', () => {
  it('maps FSU Arts & Entertainment, College of Music, MoFA, Free Public, and School of Dance', () => {
    expect(fixtureFor('FSU Arts & Entertainment').records.map((r) => r.venue)).toEqual(
      expect.arrayContaining(['Ruby Diamond Concert Hall', 'FSU Museum of Fine Arts', 'Askew Student Life Center']),
    );
    expect(fixtureFor('FSU College of Music').records.map((r) => r.venue)).toEqual(
      expect.arrayContaining(['Dohnányi Recital Hall', 'Ruby Diamond Concert Hall', 'Opperman Music Hall', 'Longmire Recital Hall']),
    );
    expect(fixtureFor('FSU Museum of Fine Arts').records.every((r) => r.venue === 'FSU Museum of Fine Arts')).toBe(true);
    expect(fixtureFor('FSU Free to the Public Events').records.length).toBeGreaterThan(0);
    expect(fixtureFor('FSU School of Dance').records.every((r) => r.venue === 'Nancy Smith Fichter Dance Theatre')).toBe(true);
  });

  it('maps all 16 additional FSU department and venue feeds cleanly to Leon County campus venues', () => {
    const fsuSources = [
      ['FSU College of Fine Arts', ['FSU Museum of Fine Arts', 'Fine Arts Building at FSU']],
      ['FSU Askew Student Life Center', ['Askew Student Life Center']],
      ['FSU Club Downunder & Union Productions', ['FSU Student Union']],
      ['FSU University Libraries', ['Robert Manning Strozier Library']],
      ['FSU Center for Global Engagement', ['The Globe Auditorium']],
      ['FSU Humanities Center', ['Dodd Hall Auditorium at FSU', 'Robert Manning Strozier Library']],
      ['FSU Campus Recreation at Leach Center', ['Bobby E. Leach Student Recreation Center']],
      ['FSU Center for Leadership & Service', ['Dunlap Student Success Center']],
      ['FSU Department of Art', ['Fine Arts Building at FSU']],
      ['FSU Jim Moran College of Entrepreneurship', ['Askew Student Life Center', 'Jim Moran Building at FSU']],
      ['FSU College of Social Sciences & Public Policy', ['Bellamy Building at FSU', 'The Globe Auditorium']],
      ['FSU Opperman Music Hall', ['Opperman Music Hall']],
      ['FSU Longmire Recital Hall', ['Longmire Recital Hall']],
      ['FSU Dohnányi Recital Hall', ['Dohnányi Recital Hall']],
      ['FSU Lindsay Recital Hall', ['Lindsay Recital Hall']],
      ['FSU Dirac Science Library', ['Paul A.M. Dirac Science Library']],
    ];
    for (const [name, expectedVenues] of fsuSources) {
      const result = fixtureFor(name);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.unmapped).toEqual({});
      expect([...new Set(result.records.map((r) => r.venue))].sort()).toEqual([...expectedVenues].sort());
    }
  });

  it('maps each Jim Moran College event to its own venue instead of the Askew campus-room fallback', () => {
    const result = fixtureFor('FSU Jim Moran College of Entrepreneurship');
    expect(result.records.map((r) => ({ title: r.title, venue: r.venue }))).toEqual([
      { title: 'Show Her the Money Film Screening & Fireside Chat', venue: 'Askew Student Life Center' },
      { title: 'October Mentor Night 🍕', venue: 'Jim Moran Building at FSU' },
    ]);
  });
});

describe('Tallahassee Symphony Orchestra & 14 Standing-Schedule Cultural/Civic Sources', () => {
  it('maps Tallahassee Symphony Orchestra concerts across Ruby Diamond and Cascades Park', () => {
    const result = fixtureFor('Tallahassee Symphony Orchestra');
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records.map((r) => r.venue)).toContain('Ruby Diamond Concert Hall');
  });

  it('verifies verbatim publisher schedule evidence and venue mapping across all 14 schedule sources', () => {
    const scheduleFeeds = feeds.filter((f) => f.serviceRegion === 'tallahassee' && f.kind === 'schedule');
    expect(scheduleFeeds).toHaveLength(14);

    for (const feed of scheduleFeeds) {
      const adapter = SOURCES.find((s) => s.sourceName === feed.name);
      const text = fs.readFileSync(adapter.fixturePath, 'utf8');
      expect(missingEvidence(text, feed.schedule.evidence)).toEqual([]);
      const result = fixtureFor(feed.name);
      expect(result.records.length).toBeGreaterThan(0);
      for (const record of result.records) {
        expect(record.venue).toBe(feed.venueHint);
      }
    }
  });

  // Theatre Tallahassee's season page gives run ranges but no performance
  // dates or curtain times, and Young Actors Theatre lists "Fall Show
  // November 1-16" under its 2025-2026 season with no curtain time. Neither
  // page supports a generated occurrence, so both stay out of the registry.
  it('does not register theatre schedules whose pages publish no performance dates or curtain times', () => {
    for (const id of ['theatre-tallahassee', 'young-actors-theatre']) {
      expect(feeds.find((feed) => feed.id === id)).toBeUndefined();
    }
    for (const name of ['Theatre Tallahassee', 'Young Actors Theatre']) {
      expect(SOURCES.find((source) => source.sourceName === name)).toBeUndefined();
    }
  });
});
