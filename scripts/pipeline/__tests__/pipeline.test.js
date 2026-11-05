const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tm = require('../adapters/ticketmaster');
const { categoryFor } = require('../category');
const { dedupeRecords, capTitleRuns, normalizeTitle, isDuplicate } = require('../dedupe');
const { rateEvent, loadOverrides, applyOverrides } = require('../rating');
const schema = require('../schema');
const core = require('../../refresh-core');
const tmRun = require('../run-ticketmaster');

const page = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tm-page.json'), 'utf8')
);
const events = page._embedded.events;
const byId = (id) => events.find((e) => e.id === id);
const tmEventNamed = (name) => ({ ...structuredClone(byId('jazz-game-1')), name });

describe('category mapping (genre level)', () => {
  it('gives spectator sports their own category — Jazz games are not workouts', () => {
    expect(categoryFor('Sports', 'Basketball')).toBe('sports');
    expect(categoryFor('Sport', 'Basketball')).toBe('sports');
  });

  it('routes comedy to nightlife instead of burying it in community', () => {
    expect(categoryFor('Arts & Theatre', 'Comedy')).toBe('nightlife');
  });

  it('keeps music, film, misc, and unknowns sensible', () => {
    expect(categoryFor('Music', 'Rock')).toBe('music');
    expect(categoryFor('Film', 'Documentary')).toBe('community');
    expect(categoryFor('Miscellaneous', 'Ice Shows')).toBe('community');
    expect(categoryFor(undefined, undefined)).toBe('community');
  });
});

describe('rating rules', () => {
  it('trusts the family flag when present', () => {
    expect(rateEvent({ familyFlag: true, name: 'Disney On Ice' })).toBe('family');
  });

  it('catches mature keywords the family flag never marks', () => {
    expect(rateEvent({ name: 'Legends in Concert — Casino Showroom' })).toBe('mature');
    expect(rateEvent({ name: 'Downtown Bar Crawl' })).toBe('mature');
    expect(rateEvent({ name: 'Late Show', description: 'ages 21+ only' })).toBe('mature');
    expect(rateEvent({ name: 'Burlesque Revue', venueName: 'Metro Music Hall' })).toBe('mature');
  });

  it('mature keywords outrank a stray family flag (fail safe)', () => {
    expect(rateEvent({ familyFlag: true, name: 'Casino Family Night' })).toBe('mature');
  });

  it('a hard legal-age flag is authoritative, even over the family flag', () => {
    expect(rateEvent({ legalAgeEnforced: true, name: 'Concert' })).toBe('mature');
    expect(rateEvent({ legalAgeEnforced: true, familyFlag: true, name: 'X' })).toBe('mature');
  });

  it('scans full info and pleaseNote — age lines often sit past the description cut', () => {
    expect(rateEvent({ name: 'Late Show', pleaseNote: 'Must be 21 with valid ID.' })).toBe(
      'mature'
    );
    expect(rateEvent({ name: 'Club Night', info: 'This event is 18 and over.' })).toBe('mature');
    expect(rateEvent({ name: 'Gala', pleaseNote: 'Age restricted event.' })).toBe('mature');
  });

  it('rates figure drawing with an undraped or nude model mature, and leaves a band name alone', () => {
    expect(rateEvent({ name: 'Life Drawing 2nd Tuesdays – Medium Poses, Undraped' })).toBe('mature');
    expect(rateEvent({ name: 'Figure Drawing', info: 'Live nude model; bring your own easel.' })).toBe('mature');
    expect(rateEvent({ name: 'Open Studio', info: 'Contains nudity.' })).toBe('mature');
    expect(rateEvent({ name: 'Life Drawing 1st Tuesdays – Clothed, Medium Poses', info: 'Draped or costumed model.' })).toBe('general');
    expect(rateEvent({ name: 'The Nude Party' })).toBe('general');
  });

  it('family keywords catch obvious all-ages events', () => {
    expect(rateEvent({ name: 'Kids Storytime in the Park' })).toBe('family');
  });

  it('defaults to general', () => {
    expect(rateEvent({ name: 'The Killers' })).toBe('general');
  });

  it('loadOverrides drops invalid ratings and survives a missing file', () => {
    const tmp = path.join(os.tmpdir(), `overrides-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ 'tm-a': 'mature', 'tm-b': 'nonsense' }));
    expect(loadOverrides(tmp)).toEqual({ 'tm-a': 'mature' });
    fs.unlinkSync(tmp);
    expect(loadOverrides(path.join(os.tmpdir(), 'does-not-exist.json'))).toEqual({});
  });

  it('applyOverrides rewrites ratings by id, James wins', () => {
    const records = [{ id: 'tm-x', rating: 'general' }];
    expect(applyOverrides(records, { 'tm-x': 'mature' })[0].rating).toBe('mature');
    expect(applyOverrides(records, {})[0].rating).toBe('general');
  });
});

describe('ticketmaster adapter', () => {
  it('normalizes a healthy event with sourceUrl, provenance, and genre-level category', () => {
    const rec = tm.normalize(byId('killers-1'));
    expect(rec).toMatchObject({
      id: 'tm-killers-1',
      category: 'music',
      rating: 'general',
      source: 'live',
      sourceName: 'Ticketmaster',
      sourceUrl: 'https://www.ticketmaster.com/the-killers-salt-lake-city/event/killers-1',
    });
    const { ok, errors } = schema.validateRecord(rec);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('carries Ticketmaster\'s venue-local start date as the internal localDay field', () => {
    const ev = structuredClone(byId('killers-1'));
    ev.dates.start.localDate = '2026-09-04';
    expect(tm.normalize(ev).localDay).toBe('2026-09-04');
  });

  it('omits sourceUrl when the event has none and still validates', () => {
    const rec = tm.normalize(byId('comedy-1'));
    expect(rec.sourceUrl).toBeUndefined();
    expect(schema.validateRecord(rec).ok).toBe(true);
  });

  it('rates the fixture correctly across tiers', () => {
    expect(tm.normalize(byId('disney-ice-1')).rating).toBe('family');
    expect(tm.normalize(byId('wendover-casino-1')).rating).toBe('mature');
    expect(tm.normalize(byId('killers-1')).rating).toBe('general');
  });

  it('excludes Utah Jazz/Mammoth sports listings (SeatGeek is their source)', () => {
    expect(tm.normalize(byId('jazz-game-1'))).toBeNull();
    expect(tm.normalize(tmEventNamed('Utah Mammoth Home Opener'))).toBeNull();
    // A non-sports event that merely name-drops the team is not excluded.
    const musical = tmEventNamed('Utah Jazz Festival');
    musical.classifications = [{ segment: { name: 'Music' }, genre: { name: 'Jazz' } }];
    expect(tm.normalize(musical)).not.toBeNull();
  });

  it('skips events with empty coordinates', () => {
    expect(tm.normalize(byId('broken-coords-1'))).toBeNull();
  });

  it('plans full pagination within API limits', () => {
    expect(tm.pagePlan(993)).toEqual([0, 1, 2, 3, 4]);
    expect(tm.pagePlan(150)).toEqual([0]);
    expect(tm.pagePlan(201)).toEqual([0, 1]);
    expect(tm.pagePlan(0)).toEqual([0]);
    expect(tm.pagePlan(10000)).toHaveLength(tm.MAX_PAGES);
  });

  it('builds page-parameterized request urls', () => {
    const url = tm.requestUrl({ key: 'K', lat: 40.7, lng: -111.9, radiusMiles: 25, page: 3 });
    expect(url).toContain('page=3');
    expect(url).toContain(`size=${tm.PAGE_SIZE}`);
  });

  it('paces pagination at no more than two requests per second', async () => {
    const first = structuredClone(page);
    first.page = { totalElements: 201 };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(first) })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ _embedded: { events: [] } }) });
    const sleep = jest.fn().mockResolvedValue(undefined);

    await tmRun.fetchTicketmasterRecords({ key: 'K', fetchImpl, sleep, clock: () => 0 });

    expect(sleep).toHaveBeenCalledWith(500);
  });

  it('flags a snapshot as truncated only when the paging cap left events unfetched', () => {
    // The fixture claims 993 matches but carries 8 events.
    expect(tmRun.processTicketmasterPages([page], {}).truncated).toBe(true);

    const complete = structuredClone(page);
    complete.page.totalElements = events.length;
    expect(tmRun.processTicketmasterPages([complete], {}).truncated).toBe(false);

    const pageless = structuredClone(page);
    delete pageless.page;
    expect(tmRun.processTicketmasterPages([pageless], {}).truncated).toBe(false);
  });
});

describe('schema validation', () => {
  it('rejects out-of-region coordinates (Vegas is not the service area yet)', () => {
    const rec = tm.normalize(byId('vegas-out-of-region-1'));
    const { ok, errors } = schema.validateRecord(rec);
    expect(ok).toBe(false);
    expect(errors.join(' ')).toContain('outside the service region');
  });

  it('accepts Wendover — road-trip country is in bounds', () => {
    expect(schema.validateRecord(tm.normalize(byId('wendover-casino-1'))).ok).toBe(true);
  });

  it('requires https urls and parseable live start times', () => {
    const good = tm.normalize(byId('killers-1'));
    expect(schema.validateRecord({ ...good, sourceUrl: 'http://sketchy.example' }).ok).toBe(false);
    expect(schema.validateRecord({ ...good, startsAtIso: 'whenever' }).ok).toBe(false);
  });

  it('mirrors the events_end_after_start constraint instead of tripping it', () => {
    const good = tm.normalize(byId('killers-1'));
    const before = new Date(Date.parse(good.startsAtIso) - 60000).toISOString();
    const { ok, errors } = schema.validateRecord({ ...good, endsAtIso: before });
    expect(ok).toBe(false);
    expect(errors).toContain('endsAtIso before startsAtIso');
    expect(schema.validateRecord({ ...good, endsAtIso: good.startsAtIso }).ok).toBe(true);
  });

  it('mirrors the events_title_length constraint (1..240 characters)', () => {
    const good = tm.normalize(byId('killers-1'));
    const { ok, errors } = schema.validateRecord({ ...good, title: 'x'.repeat(241) });
    expect(ok).toBe(false);
    expect(errors).toContain('title longer than 240 characters');
    expect(schema.validateRecord({ ...good, title: 'x'.repeat(240) }).ok).toBe(true);
  });

  it('mirrors the events_country_code_shape constraint (two uppercase letters)', () => {
    const good = tm.normalize(byId('killers-1'));
    for (const countryCode of ['us', 'USA', 'U', '']) {
      const { ok, errors } = schema.validateRecord({ ...good, countryCode });
      expect(ok).toBe(false);
      expect(errors).toContain(`bad countryCode: ${countryCode}`);
    }
    expect(schema.validateRecord({ ...good, countryCode: 'CA' }).ok).toBe(true);
    expect(schema.validateRecord({ ...good, countryCode: undefined }).ok).toBe(true);
  });

  it('rejects non-finite attendee counts', () => {
    const good = tm.normalize(byId('killers-1'));
    expect(schema.validateRecord({ ...good, attendees: NaN }).ok).toBe(false);
  });

  it('reports a single error for an unparseable live startsAtIso', () => {
    const good = tm.normalize(byId('killers-1'));
    const { errors } = schema.validateRecord({ ...good, startsAtIso: 'whenever' });
    expect(errors.filter((e) => e.includes('startsAtIso'))).toHaveLength(1);
  });

  it('partitionValid separates and explains rejects', () => {
    const { valid, rejects } = schema.partitionValid(
      events.map(tm.normalize).filter(Boolean)
    );
    expect(valid.map((r) => r.id)).not.toContain('tm-vegas-out-of-region-1');
    expect(rejects).toHaveLength(1);
    expect(rejects[0].id).toBe('tm-vegas-out-of-region-1');
  });
});

describe('dedupe', () => {
  it('normalizes titles aggressively', () => {
    expect(normalizeTitle('The Killers!')).toBe('killers');
    expect(normalizeTitle('  Café  Olé — LIVE  ')).toBe('cafe ole live');
  });

  it('folds the fixture relisting into the richer record and keeps the sourceUrl', () => {
    const records = events.map(tm.normalize).filter(Boolean);
    const { records: kept, dropped } = dedupeRecords(records);

    const killers = kept.filter((r) => normalizeTitle(r.title) === 'killers');
    expect(killers).toHaveLength(1);
    expect(killers[0].sourceUrl).toBeDefined();
    expect(dropped).toHaveLength(1);
    expect(dropped[0].droppedId).toBe('tm-killers-2-relisting');
  });

  it('strong-matches cross-source records within 15 minutes and 0.15 miles', () => {
    const a = tm.normalize(byId('killers-1'));
    const b = {
      ...a,
      id: 'ics-killers',
      sourceName: 'CityCalendar',
      sourceUrl: undefined,
      startsAtIso: new Date(Date.parse(a.startsAtIso) + 10 * 60000).toISOString(),
    };
    expect(isDuplicate(a, b)).toBe('strong');

    const { records: kept } = dedupeRecords([a, b]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(a.id);
  });

  it('caps a title at two cards, keeping the soonest showings', () => {
    const base = tm.normalize(byId('killers-1'));
    const run = [0, 1, 2, 3].map((day) => ({
      ...base,
      id: `tm-run-${day}`,
      startsAtIso: new Date(Date.parse(base.startsAtIso) + day * 86400000).toISOString(),
    }));

    const { records, dropped } = capTitleRuns(run);
    expect(records.map((r) => r.id)).toEqual(['tm-run-0', 'tm-run-1']);
    expect(dropped.map((d) => d.rule)).toEqual(['title-cap', 'title-cap']);
    expect(dropped[0].keptId).toBe('tm-run-0');
  });

  it('does not weak-match across different sources or different days', () => {
    const a = tm.normalize(byId('killers-1'));
    const differentDay = {
      ...a,
      id: 'tm-other-day',
      startsAtIso: '2026-09-07T02:00:00Z',
    };
    expect(isDuplicate(a, differentDay)).toBeNull();

    const crossSourceFar = {
      ...a,
      id: 'eb-1',
      sourceName: 'Eventbrite',
      lat: a.lat + 0.05,
      startsAtIso: new Date(Date.parse(a.startsAtIso) + 60 * 60000).toISOString(),
    };
    expect(isDuplicate(a, crossSourceFar)).toBeNull();
  });

  it('weak-matches an evening relisting across the UTC day boundary via the venue-local day', () => {
    // 2026-09-05T02:00Z is 2026-09-04 local (e.g. America/Denver) — same
    // calendar day at the venue even though the UTC date rolled over.
    const a = { ...tm.normalize(byId('killers-1')), localDay: '2026-09-04' };
    const relisting = {
      ...a,
      id: 'tm-relisting-utc-rollover',
      startsAtIso: '2026-09-05T06:00:00Z',
      localDay: '2026-09-04',
    };
    expect(isDuplicate(a, relisting)).toBe('weak');

    const { records } = dedupeRecords([a, relisting]);
    expect(records).toHaveLength(1);
    expect(records[0].localDay).toBeUndefined();
  });
});

describe('end to end: fixture page through the whole pipeline', () => {
  it('raw -> normalize -> validate -> overrides -> dedupe -> emit round trip', () => {
    const candidates = events.map(tm.normalize).filter(Boolean);
    const { valid } = schema.partitionValid(candidates);
    const overridden = applyOverrides(valid, { 'tm-comedy-1': 'mature' });
    const { records } = dedupeRecords(overridden);
    records.sort((a, b) => Date.parse(a.startsAtIso) - Date.parse(b.startsAtIso));

    // 8 fixture events: broken-coords and the Jazz game (SeatGeek guard)
    // skipped at normalize, Vegas rejected at validate, the relisting folded
    // at dedupe -> 4 survivors.
    expect(records).toHaveLength(4);
    expect(records.find((r) => r.id === 'tm-comedy-1').rating).toBe('mature');

    const emitted = core.buildGenerated(records, '2026-08-30T08:00:00.000Z');
    expect(core.extractRecords(emitted)).toEqual(records);
    expect(core.parseGenerated(emitted).count).toBe(4);
  });
});
