import type { Activity } from '@/data/activities';
import type { FeedItem } from '@/lib/feed';
import { inTicketSellerTail, sectionFeed, TICKET_SELLER_TAIL } from '../feed-section';

const zone = 'America/Denver';
// Monday 14:10 MDT.
const NOW = Date.parse('2026-08-31T20:10:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60000).toISOString();

function item(id: string, minutes: number | null, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    title: id,
    category: 'community',
    venue: 'Somewhere',
    area: 'Downtown',
    lat: 40.76,
    lng: -111.89,
    whenLabel: 'baked',
    startsInMinutes: minutes ?? 0,
    startsAtIso: minutes === null ? undefined : at(minutes),
    description: 'x',
    attendees: 0,
    rating: 'general',
    source: 'live',
    sourceName: 'Kilby Court',
    miles: 1,
    score: 0,
    sourceTrust: 3,
    ...overrides,
  } as FeedItem;
}

const ids = (feed: { items: Activity[] }) => feed.items.map((i) => i.id);

describe('sectionFeed — grouped by time (For you)', () => {
  // Score order as buildFeed would hand it over: headings interleave today.
  const scored = [
    item('saturday', 60 * 24 * 5),
    item('run', -30),
    item('tm-now', -20, { sourceName: 'Ticketmaster', sourceTrust: 1 }),
    item('chess', 200),
    item('guide', null, { source: 'seed' }),
    item('tm-late', 400, { sourceName: 'Ticketmaster', sourceTrust: 1 }),
  ];

  it('reads each heading once, in time order, with rank kept inside each group', () => {
    const feed = sectionFeed(scored, NOW, zone, { groupByTime: true });
    expect(ids(feed)).toEqual(['run', 'tm-now', 'chess', 'saturday', 'guide', 'tm-late']);
    expect(feed.labels).toEqual([
      'onto activities happening now', 'onto activities happening now', 'things to do • scroll', 'onto activities coming up', 'Places to explore', TICKET_SELLER_TAIL,
    ]);
  });

  it('keeps the ticket-seller tail below every trusted item, under its own heading', () => {
    const feed = sectionFeed(scored, NOW, zone, { groupByTime: true });
    const tailStart = feed.labels.indexOf(TICKET_SELLER_TAIL);
    expect(feed.items.slice(tailStart).every(inTicketSellerTail)).toBe(true);
    expect(feed.items.slice(0, tailStart).some(inTicketSellerTail)).toBe(false);
  });

  it('says things to do • scroll in the quiet case and still groups', () => {
    const quiet = [item('saturday', 60 * 24 * 5), item('chess', 200)];
    const feed = sectionFeed(quiet, NOW, zone, { groupByTime: true, quiet: true });
    expect(ids(feed)).toEqual(['chess', 'saturday']);
    expect(feed.labels).toEqual(['things to do • scroll', 'onto activities coming up']);
  });

  it('never lets a heading appear in two runs, over many shuffled feeds', () => {
    let seed = 11;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let run = 0; run < 300; run++) {
      const n = 1 + (next() % 12);
      const feed = Array.from({ length: n }, (_, k) => {
        const kind = next() % 5;
        const minutes = kind === 0 ? -(next() % 150) : kind === 1 ? next() % 500 : kind === 2 ? 2000 + next() % 9000 : kind === 3 ? null : 200 + next() % 600;
        return item(`i${k}`, minutes, kind === 4 ? { sourceName: 'Ticketmaster', sourceTrust: 1 } : {});
      });
      // buildFeed's own guarantee: the ticket-seller tail is already last.
      const input = [...feed.filter((i) => !inTicketSellerTail(i)), ...feed.filter(inTicketSellerTail)];
      const { labels } = sectionFeed(input, NOW, zone, { groupByTime: true });
      const runs = labels.filter((label, i) => label !== labels[i - 1]);
      expect(new Set(runs).size).toBe(runs.length);
    }
  });
});

describe('sectionFeed — sorts the viewer named', () => {
  it('keeps Nearest order exactly; only the tail heading changes', () => {
    const nearest = [
      item('saturday', 60 * 24 * 5),
      item('run', -30),
      item('chess', 200),
      item('tm-late', 400, { sourceName: 'Ticketmaster', sourceTrust: 1 }),
    ];
    const feed = sectionFeed(nearest, NOW, zone);
    expect(ids(feed)).toEqual(['saturday', 'run', 'chess', 'tm-late']);
    expect(feed.labels).toEqual(['onto activities coming up', 'onto activities happening now', 'things to do • scroll', TICKET_SELLER_TAIL]);
  });

  it('with no clock, labels nothing and moves nothing', () => {
    const input = [item('b', 60 * 24 * 5), item('a', -30)];
    const feed = sectionFeed(input, null, zone, { groupByTime: true });
    expect(ids(feed)).toEqual(['b', 'a']);
    expect(feed.labels).toEqual([null, null]);
  });

  it('a ticket-seller show inside the now-window is not in the tail', () => {
    expect(inTicketSellerTail(item('x', 180, { sourceTrust: 1 }))).toBe(false);
    expect(inTicketSellerTail(item('x', 181, { sourceTrust: 1 }))).toBe(true);
    expect(inTicketSellerTail(item('x', 900, { sourceTrust: 2 }))).toBe(false);
  });
});
