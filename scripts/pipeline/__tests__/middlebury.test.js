const fs = require('node:fs');
const { createMiddleburyAdapter, parseListing, parseDetail, listingUrl } = require('../adapters/middlebury');
const { readSourceFixture, fetchSourceRecords } = require('../run-source');
const { syncSources } = require('../sync-sources');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const now = Date.parse('2026-10-08T15:12:42.253Z');
const feed = feeds.find((f) => f.id === 'middlebury-public-arts');
const adapter = createMiddleburyAdapter(feed, venues);
const fixture = JSON.parse(fs.readFileSync(adapter.fixturePath, 'utf8'));
const listing = () => structuredClone(fixture);
const run = (body) => readSourceFixture({ ...adapter, fixturePath: adapter.fixturePath,
  parseFixture: (_, context) => adapter.parseFixture(JSON.stringify(body), context) }, undefined, { now });
const first = parseListing(fixture.pages[feed.url], feed.url).entries[0];
const firstPath = new URL(first.url).pathname;
const frontPath = firstPath.replace('/events/event/', '/events/index.php/event/');
const frontUrl = new URL(frontPath, feed.url).href;
const mutateCalendar = (html, change) => html.replace(/base64,([A-Za-z0-9+/=]+)/, (_, value) =>
  `base64,${Buffer.from(change(Buffer.from(value, 'base64').toString('utf8'))).toString('base64')}`);

it('accepts the same-origin front-controller event route now published by Middlebury', () => {
  const html = fixture.pages[feed.url].replaceAll(firstPath, frontPath);
  expect(html).toContain(frontPath);
  expect(parseListing(html, feed.url).entries[0]).toEqual({ ...first, url: frontUrl });
});

it('keeps occurrence ownership and full ingestion intact across both published route forms', async () => {
  const body = listing();
  body.pages[feed.url] = body.pages[feed.url].replaceAll(firstPath, frontPath);
  body.details[frontUrl] = body.details[first.url];
  delete body.details[first.url];
  const original = run(fixture);
  const result = run(body);
  expect(result.records).toHaveLength(22);
  expect(result.records[0]).toEqual({ ...original.records[0], sourceUrl: frontUrl });
  const requests = [];
  const fetched = await fetchSourceRecords(adapter, {
    now, overrides: {}, politeFetch: async (url) => {
      requests.push(url);
      const html = body.pages[url] ?? body.details[url];
      if (!html) throw new Error('Unexpected Middlebury request');
      return { ok: true, text: async () => html };
    },
  });
  expect(fetched.records).toEqual(result.records);
  expect(requests).toContain(frontUrl);
});

it.each([
  '/events/other.php/event/show', '/events/index.php/event/show/extra',
  '/events/index.php/event/show?destination=https://elsewhere.invalid',
  '/events/index.php/event/show#private', '/events/index.php/event/show%2fprivate',
  '/events/index.php/event/../private',
  'https://elsewhere.invalid/events/index.php/event/show',
  'https://www.middlebury.edu.elsewhere.invalid/events/index.php/event/show',
  'https://fixture:synthetic@www.middlebury.edu/events/index.php/event/show',
  'http://www.middlebury.edu/events/index.php/event/show',
])('still rejects unsafe front-controller variations: %s', (target) => {
  const html = fixture.pages[feed.url].replaceAll(firstPath, target);
  expect(() => parseListing(html, feed.url)).toThrow('Unsafe Middlebury event link');
});

it('retains real public occurrences with room-specific venues, prices, sponsor categories and Eastern DST', () => {
  const result = run(fixture);
  expect(result).toMatchObject({ validCount: 22, rejectedCount: 0, truncated: true,
    horizon: '2026-12-07T15:12:42.253Z', skipped: { 'unmapped venue': 15, 'missing location': 2 } });
  expect(result.records.every((r) => r.locality === 'Middlebury' && r.region === 'VT'
    && r.timezone === 'America/New_York' && r.rating === 'general' && !/[<>]/.test(r.description))).toBe(true);
  expect(result.records.filter((r) => r.title === 'Almost, Maine by John Cariani')).toHaveLength(4);
  expect(new Set(result.records.map((r) => r.id)).size).toBe(22);
  expect(result.records.find((r) => r.title.startsWith('Dashon Burton'))).toMatchObject({
    startsAtIso: '2026-10-23T23:30:00.000Z', venue: 'Mahaney Arts Center, Olin C. Robison Concert Hall' });
  expect(result.records.find((r) => r.title === 'Katarina String Quartet')).toMatchObject({ startsAtIso: '2026-11-07T00:30:00.000Z' });
  expect(result.records.find((r) => r.title.startsWith('Evensong'))).toMatchObject({ category: 'music', venue: 'Middlebury Chapel' });
  expect(result.records.find((r) => r.title.startsWith('Dashon Burton')).description).toContain('$30');
  expect(result.records.find((r) => r.title === 'Katarina String Quartet').eventFacts.admission).toMatchObject({
    value: 'free', excerpt: 'Free', checkedOn: '2026-10-08' });
  expect(result.records.find((r) => r.title.startsWith('Dashon Burton')).eventFacts.admission.value).toBe('paid');
  expect(result.records.find((r) => r.title.startsWith('Evensong')).eventFacts).toBeUndefined();
});

it('requires each article access label; filters, price, prose and closed-campus access cannot stand in for it', () => {
  const body = listing();
  body.pages[feed.url] = body.pages[feed.url].replace('Open to the Public', 'Closed to the Public');
  delete body.details[first.url];
  expect(run(body).records).toHaveLength(21);
  expect(run(body).diagnostics).toEqual({ 'not explicitly open to the public': 1 });
  for (const label of ['Not Open to the Public', 'Closed to the Public. Open to the Public', '']) {
    const html = fixture.pages[feed.url].replace('Open to the Public', label);
    expect(parseListing(html, feed.url).entries[0].isPublic).toBe(false);
  }
  const privateBody = listing();
  privateBody.details[first.url] = mutateCalendar(privateBody.details[first.url], (ics) => ics.replace('BEGIN:VEVENT', 'BEGIN:VEVENT\r\nCLASS:PRIVATE'));
  expect(run(privateBody).records).toHaveLength(21);
  expect(run(privateBody).diagnostics).toEqual({ 'private event calendar': 1 });
});

it('keeps stable node ownership across calendar UIDs, cancellations and material time edits', () => {
  const original = run(fixture).records[0];
  const body = listing();
  body.details[first.url] = mutateCalendar(body.details[first.url], (ics) => ics.replace(/UID:[^\r\n]+/, 'UID:changed-export').replace('BEGIN:VEVENT', 'BEGIN:VEVENT\r\nSTATUS:CANCELLED'));
  expect(run(body).records[0]).toMatchObject({ id: original.id, isCancelled: true });
  const moved = listing();
  moved.pages[feed.url] = moved.pages[feed.url].replace('2026-10-08T16:30:00-04:00', '2026-10-08T16:45:00-04:00');
  moved.details[first.url] = mutateCalendar(moved.details[first.url], (ics) => ics.replace('20261008T163000', '20261008T164500'));
  expect(run(moved).records[0]).toMatchObject({ id: original.id, startsAtIso: '2026-10-08T20:45:00.000Z' });
  const hiddenSignal = mutateCalendar(fixture.details[first.url], (ics) => ics.replace('DESCRIPTION:', 'DESCRIPTION:21 and over only. '));
  const event = parseDetail(hiddenSignal, first, feed, now);
  expect(adapter.normalize(event, { now, skip: jest.fn() }).rating).toBe('mature');
});

it('fails closed on incomplete pages, changed ordering, mismatched calendars and unsafe pagination', () => {
  for (const change of [
    (body) => { delete body.pages[Object.keys(body.pages)[1]]; },
    (body) => { delete body.details[first.url]; },
    (body) => { body.pages[feed.url] = body.pages[feed.url].replace('&amp;page=1', '&amp;page=2'); },
    (body) => { body.pages[feed.url] = body.pages[feed.url].replace(/<a\b([^>]*?)rel="next"([^>]*?)>/, '<a rel="next"$1$2>'); },
    (body) => { body.pages[feed.url] = body.pages[feed.url].replace('&amp;categories%5B52%5D=52&amp;page=1', '&amp;page=1'); },
    (body) => { body.pages[feed.url] = body.pages[feed.url].replace('2026-10-08T16:30:00-04:00', '2026-10-09T16:30:00-04:00'); },
    (body) => { body.details[first.url] = mutateCalendar(body.details[first.url], (ics) => ics.replace('LOCATION:Mahaney Arts Center 125', 'LOCATION:Private home')); },
    (body) => { body.pages[feed.url] = '<p>Open to the Public</p>'; },
    (body) => { body.pages[feed.url] += '<article aria-labelledby="midd-event-123-header">broken'; },
  ]) {
    const body = listing(); change(body); expect(() => run(body)).toThrow();
  }
  for (const url of ['https://evil.example/events/?access%5B28%5D=28&categories%5B52%5D=52',
    feed.url + '&access%5B28%5D=136', feed.url + '&page=1&redirect=/user/login']) {
    expect(() => listingUrl(url, feed.url)).toThrow();
  }
});

it('uses the real live request contract with published pacing and prevents writes/retirement after a detail failure', async () => {
  const fetchImpl = jest.fn(async (url) => ({ ok: true, text: async () => fixture.pages[url] ?? fixture.details[url] }));
  const result = await fetchSourceRecords(adapter, { now, overrides: {}, politeFetch: fetchImpl });
  expect(result.records).toEqual(run(fixture).records);
  expect(fetchImpl).toHaveBeenCalledTimes(24);
  for (const [, options] of fetchImpl.mock.calls) expect(options).toMatchObject({ minIntervalMs: 1000, timeoutMs: 20000 });
  const from = jest.fn(), rpc = jest.fn();
  const failed = await syncSources({ sources: [{ ...adapter, fetch: async (context) => adapter.fetch({ ...context,
    fetchImpl: async (url) => ({ ok: url !== first.url, status: 503, text: async () => fixture.pages[url] ?? fixture.details[url] }) }) }],
  now, clientFactory: () => ({ from, rpc }), log: jest.fn(), logError: jest.fn() });
  expect(failed.totals.failedSources).toBe(1);
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
