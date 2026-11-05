const fs = require('node:fs');
const path = require('node:path');
const { createRssAdapter, parseFeed, eventDate, rssEventDate } = require('../adapters/rss');
const { processSourceItems, readSourceFixture } = require('../run-source');
const { parseXml, content } = require('../feed-xml');

const now = Date.parse('2026-10-30T00:00:00Z');
const feed = {
  id: 'rss-contract', name: 'Fixture RSS', kind: 'rss', sourceKind: 'community',
  timezone: 'America/Denver', url: 'https://fixture.example/feed.xml',
  defaultCategory: 'music', defaultRating: 'general', eventDateField: 'dc:date',
  fixturePath: 'scripts/pipeline/fixtures/rss/events.xml',
};
const venues = ['hall', 'bar'].map((kind) => ({ name: `Fixture ${kind[0].toUpperCase()}${kind.slice(1)}`,
  kind, aliases: [], lat: 40.7608, lng: -111.891, locality: 'Salt Lake City', address: 'Fixture location' }));
const xml = fs.readFileSync(path.join(__dirname, '../../..', feed.fixturePath), 'utf8');
const atom = fs.readFileSync(path.join(__dirname, '../fixtures/rss/atom.xml'), 'utf8');
const parse = (body = xml, config = feed) => parseFeed(body, config, now);

it('reads explicit RSS event starts, optional ends and source-approved dc:date, never pubDate or prose', () => {
  const snapshot = parse();
  expect(snapshot.items).toHaveLength(8);
  expect(snapshot.items[0]).toMatchObject({ uid: 'concert', start: '2026-11-02T02:00:00.000Z', end: '2026-11-02T04:00:00.000Z' });
  expect(snapshot.items.find((i) => i.uid === 'article')).toBeUndefined();
  expect(snapshot.diagnostics).toEqual({ 'missing unambiguous event date': 1 });
  expect(parse(xml, { ...feed, eventDateField: undefined }).items.some((i) => i.uid === 'dc-date')).toBe(false);
});

it('normalizes categories, stable ids, HTTPS provenance, cancellation and all four required ratings', () => {
  const result = readSourceFixture(createRssAdapter(feed, venues), undefined, { now });
  const record = (id) => result.records.find((r) => r.sourceEventId === JSON.stringify(['single', id]));
  expect(['bar', 'casino', 'kids', 'concert'].map((id) => record(id).rating)).toEqual(['mature', 'mature', 'family', 'general']);
  expect(record('concert')).toMatchObject({ category: 'music', attendees: 0, sourceUrl: 'https://fixture.example/concert', description: 'One night only. Live music & guests.' });
  expect(record('cancelled').isCancelled).toBe(true);
  expect(result.skipped).toEqual({ 'unmapped venue': 1 });
  const changed = createRssAdapter({ ...feed, defaultCategory: 'arts' }, venues).normalize({ ...parse().items[0], start: '2026-11-03T02:00:00Z' }, {});
  expect(changed.id).toBe(record('concert').id);
  expect(changed.category).toBe('arts');
});

it('preserves raw RSS description boundaries for venue parsing without aborting on later unknown entities', () => {
  const body = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<rss version="2.0" xmlns:ev="http://purl.org/rss/1.0/modules/event/"><channel>'
    + '<item><guid>meetup</guid><title>Morning meetup</title>'
    + '<ev:startdate>2026-11-01T19:00:00-07:00</ev:startdate>'
    + '<link>https://fixture.example/meetup</link>'
    + '<description><![CDATA[Meet at Fixture Hall<br>Bring water &bogus;]]></description>'
    + '</item></channel></rss>';
  const config = { ...feed, venueHint: 'Fixture Bar' };
  const snapshot = parseFeed(body, config, now);
  expect(snapshot.items[0]).toMatchObject({
    description: 'Meet at Fixture Hall Bring water &bogus;',
    rawDescription: 'Meet at Fixture Hall<br>Bring water &bogus;',
  });
  const result = processSourceItems(createRssAdapter(config, venues), snapshot, { now, overrides: {} });
  expect(result.records.map((record) => record.venue)).toEqual(['Fixture Hall']);
  expect(result.skipped).toEqual({});
});

it('reads Atom by namespace URI, selects the alternate link and preserves mixed XHTML text order', () => {
  const snapshot = parse(atom);
  expect(snapshot.items).toHaveLength(1);
  expect(snapshot.items[0]).toMatchObject({ uid: 'urn:fixture:atom-concert', title: 'Strings & brass ♫', url: 'https://fixture.example/atom-concert', description: 'One show only.' });
  expect(parse(atom.replaceAll('event:', 'e:').replace('xmlns:event=', 'xmlns:e='))).toEqual(snapshot);
  expect(snapshot.diagnostics['missing unambiguous event date']).toBe(1);
});

it('skips a news-only feed without treating publication timestamps as event dates', () => {
  const snapshot = parse('<rss><channel><item><title>News</title><pubDate>2026-11-01T19:00:00Z</pubDate></item></channel></rss>');
  expect(snapshot).toMatchObject({ items: [], retireMissing: false, skipReason: 'no structured event dates; feed not eligible' });
});

it('uses Joomla RSS pubDate only when the feed explicitly approves that event-date field', () => {
  const body = '<rss><channel><item><guid>treeutah-workday</guid><title>EcoGarden Wednesday</title>'
    + '<pubDate>Wed 09 Sep 2026 18:00 -0600</pubDate></item></channel></rss>';
  const clock = Date.parse('2026-09-01T00:00:00Z');
  const approved = parseFeed(body, { ...feed, eventDateField: 'pubDate' }, clock);
  expect(approved.items).toHaveLength(1);
  expect(approved.items[0]).toMatchObject({
    uid: 'treeutah-workday',
    start: '2026-09-10T00:00:00.000Z',
  });
  expect(parseFeed(body, { ...feed, eventDateField: undefined }, clock)).toMatchObject({
    items: [],
    skipReason: 'no structured event dates; feed not eligible',
  });
});

it('requires an offset-bearing RFC 822 pubDate with a real calendar date', () => {
  expect(rssEventDate('Wed, 09 Sep 2026 18:00:30 -0600')).toBe('2026-09-10T00:00:30.000Z');
  for (const value of [
    'Wed 09 Sep 2026 18:00',
    '2026-09-09T18:00:00-06:00',
    'Wed 31 Feb 2026 18:00 -0600',
    'Wed 09 Sep 2026 24:00 -0600',
    'Wed 09 Sep 2026 18:00 +2460',
    'Wed 09 Sep 2026 18:60 -0600',
    'next Wednesday at six',
  ]) expect(rssEventDate(value)).toBeNull();
});

it('requires a single offset-bearing ISO title date and rejects ambiguous or impossible dates', () => {
  for (const date of ['2026-11-01', 'November 1 at 7', '2026-11-01T19:00:00', '2026-02-30T12:00:00Z', 'prefix 2026-11-01T19:00:00Z', '2026-11-01T99:00:00Z']) {
    expect(eventDate(date)).toBeNull();
  }
  expect(eventDate('2026-11-01T19:00-07:00')).toBe('2026-11-02T02:00:00.000Z');
  const ambiguous = xml.replace('Open concert 2026-11-05T19:00:00-07:00', 'Open concert 2026-11-05T19:00:00-07:00 or 2026-11-06T19:00:00-07:00');
  expect(parse(ambiguous).items.some((i) => i.uid === 'title-date')).toBe(false);
});

it('rejects an invalid end and filters ended or distant events inside a deterministic sixty-day window', () => {
  expect(parse(xml.replace('2026-11-01T21:00:00-07:00', '2026-10-01T21:00:00-07:00')).diagnostics['invalid event end']).toBe(1);
  expect(parse(xml.replaceAll('2026-11-', '2027-11-')).items).toEqual([]);
  const ongoing = xml.replace('2026-11-01T19:00:00-07:00', '2026-10-29T12:00:00-07:00');
  expect(parse(ongoing).items.some((i) => i.uid === 'concert')).toBe(true);
});

it('fails closed on malformed XML, external entities, excessive nesting and namespace spoofing', () => {
  for (const body of ['<rss><channel></rss>', '<rss/> trailing', '<rss>&unknown;</rss>', '<rss title="a" title="b"/>', '<rss><x:item/></rss>', '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss>&x;</rss>', '<rss>'.repeat(51) + '</rss>'.repeat(51)]) {
    expect(() => parseXml(body)).toThrow();
  }
  expect(() => parse(xml.replace('http://purl.org/rss/1.0/modules/event/', 'https://untrusted.example/'))).not.toThrow();
  expect(parse(xml.replace('http://purl.org/rss/1.0/modules/event/', 'https://untrusted.example/')).items).toHaveLength(2);
  expect(content(parseXml('<p>a<b>b</b>c</p>'))).toBe('abc');
});

it('uses injected fetching and always disables retirement for rolling feeds', async () => {
  const adapter = createRssAdapter(feed, venues);
  const fetchImpl = jest.fn(async () => ({ ok: true, text: async () => xml }));
  expect(await adapter.fetch({ fetchImpl, now })).toMatchObject({ retireMissing: false, truncated: true });
  expect(fetchImpl).toHaveBeenCalledWith(feed.url, { minIntervalMs: undefined, timeoutMs: undefined });
  await expect(adapter.fetch({ fetchImpl: async () => ({ ok: false, status: 503 }), now })).rejects.toThrow('503');
});

it('decodes HTML entities before rating RSS and Atom, including numeric and spacing entities', () => {
  for (const restriction of ['21 &amp; over', '21 &#38; over', '21&nbsp;&amp;&nbsp;over', '21&#43;', '21 &amp over']) {
    const body = xml.replace('One night only. <b>Live music</b> & guests.', restriction);
    const adapter = createRssAdapter(feed, venues);
    expect(adapter.normalize(parse(body).items[0], {}).rating).toBe('mature');
    const atomBody = atom.replace('<summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">One <b>show</b> only.</div></summary>', `<summary type="html"><![CDATA[${restriction}]]></summary>`);
    expect(adapter.normalize(parse(atomBody).items[0], {}).rating).toBe('mature');
  }
  expect(parse(xml.replace('Live music', '&unsupported;')).items[0].description).toBe('One night only. &unsupported; & guests.');
});

it('includes Atom inline content with or without a summary and refuses external/unsupported content', () => {
  const insert = (content) => atom.replace('</entry>', `${content}</entry>`);
  const adapter = createRssAdapter(feed, venues);
  const withContent = insert('<content type="html">Admission: 21 &amp;amp; over</content>');
  expect(adapter.normalize(parse(withContent).items[0], {}).rating).toBe('mature');
  const withoutSummary = withContent.replace(/<summary[\s\S]*?<\/summary>/, '');
  expect(adapter.normalize(parse(withoutSummary).items[0], {}).rating).toBe('mature');
  const xhtml = insert('<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">21 <b>and</b> over</div></content>');
  expect(adapter.normalize(parse(xhtml).items[0], {}).rating).toBe('mature');
  expect(() => parse(insert('<content src="https://fixture.example/body"/>'))).toThrow('Unsupported Atom content');
  expect(() => parse(insert('<content type="application/octet-stream">bytes</content>'))).toThrow('Unsupported Atom content');
});

it('resolves relative Atom links through feed, entry and link xml:base values', () => {
  let body = atom.replace('<feed ', '<feed xml:base="https://fixture.example/events/" ')
    .replace('<entry>', '<entry xml:base="november/">')
    .replace('rel="alternate" href="https://fixture.example/atom-concert"', 'rel="alternate" xml:base="../" href="concert"');
  expect(parse(body).items[0].url).toBe('https://fixture.example/events/concert');
  body = atom.replace('href="https://fixture.example/atom-concert"', 'href="concert"');
  expect(parse(body).items[0].url).toBe('https://fixture.example/concert');
});

it('preserves ordinary HTML ampersands while decoding supported semicolonless references once', () => {
  const body = xml.replace('One night only. <b>Live music</b> & guests.', 'B&Bs host rock&roll. 21 &AMP over. &amp;amp');
  const item = parse(body).items[0];
  expect(item.description).toBe('B&Bs host rock&roll. 21 & over. &amp');
  expect(createRssAdapter(feed, venues).normalize(item, {}).rating).toBe('mature');
});

it('includes text MIME content and recognizes parameterized HTML before rating', () => {
  for (const [type, value] of [['text/markdown', '**Admission:** 21 and over'], ['text/html; charset=utf-8', '21 &amp;amp; over'], ['TEXT/PLAIN; charset=UTF-8', '21 and over']]) {
    const body = atom.replace('</entry>', `<content type="${type}">${value}</content></entry>`);
    expect(createRssAdapter(feed, venues).normalize(parse(body).items[0], {}).rating).toBe('mature');
  }
});
