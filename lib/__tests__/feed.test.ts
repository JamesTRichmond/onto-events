import { Activity, SLC_ANCHOR } from '@/data/activities';
import { TICKETING_NOW_WINDOW_MINUTES } from '@/data/source-trust';
import {
  buildFeed,
  DEFAULT_CONCRETENESS_GATE,
  FeedInput,
  NOW_WINDOW_MINUTES,
  RANK_INTEREST_HIT,
  upcomingPlans,
  whenLabelFor,
} from '../feed';
import { TierMode } from '../tiers';

const NOW = Date.parse('2026-08-30T18:00:00Z');
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60000).toISOString();

let nextId = 0;
// Each fixture is its own event: buildFeed shows one card per happening, so
// two fixtures sharing a title, place and start would count as one.
function activity(overrides: Partial<Activity>): Activity {
  const serial = nextId++;
  return {
    id: `a${serial}`,
    title: `Test activity ${serial}`,
    category: 'community',
    venue: 'Somewhere',
    area: 'Downtown',
    lat: SLC_ANCHOR.lat,
    lng: SLC_ANCHOR.lng,
    whenLabel: 'Baked label',
    startsInMinutes: 0,
    description: 'x',
    attendees: 10,
    rating: 'general',
    source: 'seed',
    ...overrides,
  };
}

const baseInput = (overrides: Partial<FeedInput> = {}): FeedInput => ({
  now: NOW,
  lat: SLC_ANCHOR.lat,
  lng: SLC_ANCHOR.lng,
  radiusMi: 5,
  sort: 'foryou',
  mode: 'everyone' as TierMode,
  interests: new Set(),
  ...overrides,
});

it('keeps every received copy of a Going happening out of Discover, preserving later occurrences', () => {
  const original = activity({ id:'saved', title:'A concert', startsAtIso:iso(120) });
  const copy = { ...original, id:'copy', category:'music' as const };
  const later = { ...copy, id:'later', startsAtIso:iso(120+1440) };
  const feed = buildFeed([original,copy,later], baseInput({ goingIds:new Set(['saved']), interests:new Set(['music']) }));
  expect(feed.items.map(i=>i.id)).toEqual(['later']);
  expect(buildFeed([original,copy], baseInput({ goingIds:new Set(['saved']) })).emptyReason).toBe('no-match');
});

describe('upcomingPlans (Going)', () => {
  const planInput = { now: NOW, lat: SLC_ANCHOR.lat, lng: SLC_ANCHOR.lng, mode: 'everyone' as TierMode };

  it('counts only joined events that are still ahead', () => {
    const past = activity({ id: 'past', source: 'live', startsAtIso: iso(-600) });
    const tonight = activity({ id: 'tonight', source: 'live', startsAtIso: iso(120) });
    const plans = upcomingPlans([past, tonight], new Set(['past', 'tonight']), planInput);
    expect(plans.map((p) => p.id)).toEqual(['tonight']);
  });

  it('drops joined ids that are no longer in the catalog', () => {
    const tonight = activity({ id: 'tonight', source: 'live', startsAtIso: iso(120) });
    const plans = upcomingPlans([tonight], new Set(['tonight', 'gone-from-catalog']), planInput);
    expect(plans).toHaveLength(1);
  });

  it('keeps a plan outside the feed radius', () => {
    const far = activity({ id: 'far', source: 'live', startsAtIso: iso(120), lat: SLC_ANCHOR.lat + 1 });
    const plans = upcomingPlans([far], new Set(['far']), planInput);
    expect(plans.map((p) => p.id)).toEqual(['far']);
  });

  it('never shows a mature plan outside Mature mode', () => {
    const mature = activity({ id: 'm', source: 'live', startsAtIso: iso(120), rating: 'mature' });
    expect(upcomingPlans([mature], new Set(['m']), planInput)).toHaveLength(0);
  });

  it('returns nothing when nothing is joined', () => {
    const tonight = activity({ id: 'tonight', source: 'live', startsAtIso: iso(120) });
    expect(upcomingPlans([tonight], new Set(), planInput)).toEqual([]);
  });
});

describe('freshness and expiry', () => {
  it('drops live events that started more than 3 hours ago, keeps recurring seed items', () => {
    const expired = activity({ id: 'expired', source: 'live', startsAtIso: iso(-200) });
    const running = activity({ id: 'running', source: 'live', startsAtIso: iso(-30) });
    const seed = activity({ id: 'seed', startsInMinutes: 0 });

    const { items } = buildFeed([expired, running, seed], baseInput());
    const ids = items.map((i) => i.id);

    expect(ids).not.toContain('expired');
    expect(ids).toContain('running');
    expect(ids).toContain('seed');
  });

  it('computes live startsInMinutes from the clock, not the baked zero', () => {
    const live = activity({ id: 'live', source: 'live', startsAtIso: iso(45), startsInMinutes: 0 });
    const { items } = buildFeed([live], baseInput());
    expect(items[0].startsInMinutes).toBe(45);
  });

  it('keeps an event with a known end time until it truly ends, then drops it', () => {
    const allDay = activity({ id: 'all-day', startsAtIso: iso(-360), endsAtIso: iso(60) });
    const over = activity({ id: 'over', startsAtIso: iso(-360), endsAtIso: iso(-10) });

    const { items } = buildFeed([allDay, over], baseInput());
    const ids = items.map((i) => i.id);

    expect(ids).toContain('all-day');
    expect(ids).not.toContain('over');
  });

  it('with now=null (static render) applies no expiry and bakes no clock values', () => {
    const longPast = activity({ id: 'past', source: 'live', startsAtIso: iso(-2000) });
    const { items } = buildFeed([longPast], baseInput({ now: null }));

    expect(items.map((i) => i.id)).toContain('past');
    expect(items[0].whenLabel).toBe('Baked label');
    expect(items[0].startsInMinutes).toBe(0);
  });
});

describe('whenLabelFor', () => {
  it('says Happening now for live events already underway', () => {
    expect(whenLabelFor(activity({ startsAtIso: iso(-30) }), NOW)).toBe('Happening now');
  });

  it('formats future live events in the viewer locale', () => {
    expect(whenLabelFor(activity({ startsAtIso: iso(120) }), NOW)).toMatch(/\w{3}, \w{3} \d+/);
  });

  it('keeps the baked label for seed items and during static render', () => {
    expect(whenLabelFor(activity({}), NOW)).toBe('Baked label');
    expect(whenLabelFor(activity({ startsAtIso: iso(60) }), null)).toBe('Baked label');
  });
});

describe('scoring', () => {
  it('decays soonness for events already underway (no started-long-ago max boost)', () => {
    const startingNow = activity({ id: 'now', source: 'live', startsAtIso: iso(0) });
    const underway = activity({ id: 'underway', source: 'live', startsAtIso: iso(-150) });

    const { items } = buildFeed([startingNow, underway], baseInput());
    const byId = Object.fromEntries(items.map((i) => [i.id, i.score]));

    expect(byId.now).toBeGreaterThan(byId.underway);
  });

  it('treats 90 minutes underway like 90 minutes away (symmetric decay)', () => {
    const ahead = activity({ id: 'ahead', source: 'live', startsAtIso: iso(90) });
    const behind = activity({ id: 'behind', source: 'live', startsAtIso: iso(-90) });

    const { items } = buildFeed([ahead, behind], baseInput());
    const byId = Object.fromEntries(items.map((i) => [i.id, i.score]));

    expect(byId.ahead).toBeCloseTo(byId.behind, 5);
  });

  it('learned affinities lift a category but explicit interests still dominate', () => {
    const learned = activity({ id: 'learned', category: 'music', lat: SLC_ANCHOR.lat + 0.03 });
    const picked = activity({ id: 'picked', category: 'games', lat: SLC_ANCHOR.lat + 0.03 });
    const plain = activity({ id: 'plain', category: 'sales' });

    // Learned taste outranks mere proximity when nothing is picked.
    const unpicked = buildFeed([plain, learned], baseInput({ affinities: { music: 10 } }));
    expect(unpicked.items.map((i) => i.id)).toEqual(['learned', 'plain']);

    // An explicit pick is stronger still: it filters, so learned taste in
    // another category cannot put that category back in the feed.
    const { items } = buildFeed([plain, learned, picked], baseInput({
      interests: new Set(['games']),
      affinities: { music: 10 },
    }));
    expect(items.map((i) => i.id)).toEqual(['picked']);
  });

  it('interest hits dominate nearness and soonness', () => {
    const far = activity({ id: 'far-loved', category: 'music', lat: SLC_ANCHOR.lat + 0.05 });
    const near = activity({ id: 'near-ignored', category: 'games' });

    const { items } = buildFeed([far, near], baseInput({ interests: new Set(['music']) }));

    expect(items[0].id).toBe('far-loved');
  });
});

describe('filters and sorts', () => {
  // Mature supply is fail-closed unless EXPO_PUBLIC_ENABLE_MATURE === 'true'.
  // These assertions exercise the matrix when the flag is on.
  const withMatureEnabled = (fn: () => void) => {
    const prev = process.env.EXPO_PUBLIC_ENABLE_MATURE;
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    try {
      fn();
    } finally {
      if (prev === undefined) delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
      else process.env.EXPO_PUBLIC_ENABLE_MATURE = prev;
    }
  };

  it('applies the tier visibility matrix: modes, not filters', () => {
    const gen = activity({ id: 'gen' });
    const fam = activity({ id: 'fam', rating: 'family' });
    const bar = activity({ id: 'bar', rating: 'mature' });
    const all = [gen, fam, bar];

    expect(buildFeed(all, baseInput()).items.map((i) => i.id)).toEqual(['gen']);
    expect(buildFeed(all, baseInput({ mode: 'family' })).items.map((i) => i.id)).toEqual(['fam']);
    withMatureEnabled(() => {
      expect(
        buildFeed(all, baseInput({ mode: 'mature' }))
          .items.map((i) => i.id)
          .sort()
      ).toEqual(['bar', 'gen']);
    });
  });

  it('filters by radius', () => {
    const near = activity({ id: 'near' });
    const far = activity({ id: 'far', lat: SLC_ANCHOR.lat + 0.2 });
    expect(buildFeed([near, far], baseInput()).items.map((i) => i.id)).toEqual(['near']);
  });

  it('road-trip destinations bypass the radius filter', () => {
    const wendover = activity({
      id: 'wendover',
      category: 'roadtrip',
      lat: 40.7391,
      lng: -114.0733,
    });
    const farNonRoadtrip = activity({ id: 'far', lat: SLC_ANCHOR.lat + 0.2 });

    const { items } = buildFeed([wendover, farNonRoadtrip], baseInput());
    expect(items.map((i) => i.id)).toEqual(['wendover']);
  });

  it('boosts mature events in 21+ mode so the feed changes character', () => {
    withMatureEnabled(() => {
      const bar = activity({ id: 'bar', rating: 'mature', lat: SLC_ANCHOR.lat + 0.02 });
      const concert = activity({ id: 'concert' });

      const { items } = buildFeed([bar, concert], baseInput({ mode: 'mature' }));
      expect(items[0].id).toBe('bar');
    });
  });

  it('sorts soonest by effective minutes across live and seed', () => {
    const seedLater = activity({ id: 'seed-later', startsInMinutes: 300 });
    const liveSoon = activity({ id: 'live-soon', source: 'live', startsAtIso: iso(20) });
    const seedNow = activity({ id: 'seed-now', startsInMinutes: 0 });

    const { items } = buildFeed([seedLater, liveSoon, seedNow], baseInput({ sort: 'soonest' }));

    expect(items.map((i) => i.id)).toEqual(['seed-now', 'live-soon', 'seed-later']);
  });

  it('sorts by type then distance', () => {
    const b = activity({ id: 'games-far', category: 'games', lat: SLC_ANCHOR.lat + 0.02 });
    const a = activity({ id: 'games-near', category: 'games' });
    const c = activity({ id: 'music', category: 'music' });

    const { items } = buildFeed([c, b, a], baseInput({ sort: 'type' }));

    expect(items.map((i) => i.id)).toEqual(['games-near', 'games-far', 'music']);
  });

  it('freeOnly keeps only events explicitly confirmed as free', () => {
    const free = activity({ id: 'free', admission: 'free' });
    const paid = activity({ id: 'paid', admission: 'paid' });
    const unknown = activity({ id: 'unknown' });

    const { items, emptyReason } = buildFeed([free, paid, unknown], baseInput({ freeOnly: true }));
    expect(items.map((i) => i.id)).toEqual(['free']);
    expect(emptyReason).toBe('none');
  });

  it('freeOnly reports no-match when no in-range item is confirmed free', () => {
    const paid = activity({ id: 'paid', admission: 'paid' });
    const unknown = activity({ id: 'unknown' });

    const { items, emptyReason } = buildFeed([paid, unknown], baseInput({ freeOnly: true }));
    expect(items).toHaveLength(0);
    expect(emptyReason).toBe('no-match');
  });
});

describe('search', () => {
  it('matches across title, venue, and category, case-insensitively', () => {
    const concert = activity({ id: 'concert', title: 'Concert on the plaza', venue: 'Gallivan Center', category: 'music' });
    const hike = activity({ id: 'hike', title: 'Sunset hike', venue: 'Ensign Peak', category: 'outdoors' });
    const all = [concert, hike];

    expect(buildFeed(all, baseInput({ query: 'GALLIVAN' })).items.map((i) => i.id)).toEqual(['concert']);
    expect(buildFeed(all, baseInput({ query: 'outdoors' })).items.map((i) => i.id)).toEqual(['hike']);
    expect(buildFeed(all, baseInput({ query: '  ' })).items).toHaveLength(2);
  });

  it('reports no-match when the query filters everything', () => {
    const concert = activity({ id: 'concert' });
    expect(buildFeed([concert], baseInput({ query: 'zzzz' })).emptyReason).toBe('no-match');
  });
});

describe('recurrence (Saturday-truth)', () => {
  // 2026-08-29 is a Saturday; build fixtures in local time like the rules mean.
  const local = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).getTime();
  const market = activity({
    id: 'market',
    whenLabel: 'Sat 8:00 AM – 2:00 PM',
    startsInMinutes: 540,
    recurrence: { days: [6], startHour: 8, endHour: 14, seasonEnd: '2026-10-24' },
  });

  it('overrides the frozen label and offset with the real schedule', () => {
    const saturdayMorning = local(2026, 8, 29, 10);
    const { items } = buildFeed([market], baseInput({ now: saturdayMorning }));

    // The frozen data claims "starts in 9 hours"; it is actually underway.
    expect(items[0].whenLabel).toBe('Happening now · until 2:00 PM');
    expect(items[0].startsInMinutes).toBe(-120);
  });

  it('tells the truth midweek instead of repeating the authored day', () => {
    const tuesday = local(2026, 8, 25, 12);
    const { items } = buildFeed([market], baseInput({ now: tuesday }));

    expect(items[0].whenLabel).toBe('Sat 8:00 AM – 2:00 PM');
    // Four days out, not the baked 540 minutes.
    expect(items[0].startsInMinutes).toBeGreaterThan(4000);
  });

  it('drops a series whose season has ended rather than dating it wrong', () => {
    const november = local(2026, 11, 3, 9);
    const { items, emptyReason } = buildFeed([market], baseInput({ now: november }));

    expect(items).toHaveLength(0);
    expect(emptyReason).toBe('no-data');
  });

  it('sorts a recurring item by its real next start', () => {
    const tuesday = local(2026, 8, 25, 12);
    const tonight = activity({ id: 'tonight', startsInMinutes: 120 });

    const { items } = buildFeed([market, tonight], baseInput({ now: tuesday, sort: 'soonest' }));
    expect(items.map((i) => i.id)).toEqual(['tonight', 'market']);
  });

  it('keeps the baked label and offset during static render (now=null)', () => {
    const { items } = buildFeed([market], baseInput({ now: null }));

    expect(items[0].whenLabel).toBe('Sat 8:00 AM – 2:00 PM');
    expect(items[0].startsInMinutes).toBe(540);
  });
});

describe('mode gating (pinned safety invariant)', () => {
  it('PINNED: mature content never leaks into family or everyone modes', () => {
    const mix = [
      activity({ id: 'fam', rating: 'family' }),
      activity({ id: 'gen', rating: 'general' }),
      activity({ id: 'bar', rating: 'mature' }),
    ];
    for (const mode of ['family', 'everyone'] as const) {
      const { items } = buildFeed(mix, baseInput({ mode }));
      expect(items.some((i) => i.rating === 'mature')).toBe(false);
    }
  });
});

describe('empty reasons', () => {
  it('out-of-range when everything is beyond the radius', () => {
    const far = activity({ id: 'far', lat: SLC_ANCHOR.lat + 0.5 });
    expect(buildFeed([far], baseInput()).emptyReason).toBe('out-of-range');
  });

  it('hidden-by-mode when everything in range lives in another tier', () => {
    const bar = activity({ id: 'bar', rating: 'mature' });
    expect(buildFeed([bar], baseInput()).emptyReason).toBe('hidden-by-mode');

    const fam = activity({ id: 'fam', rating: 'family' });
    expect(buildFeed([fam], baseInput()).emptyReason).toBe('hidden-by-mode');
  });

  it('no-data when there is nothing, or everything has expired', () => {
    expect(buildFeed([], baseInput()).emptyReason).toBe('no-data');

    const expired = activity({ id: 'x', source: 'live', startsAtIso: iso(-500) });
    expect(buildFeed([expired], baseInput()).emptyReason).toBe('no-data');
  });

  it('none when items exist', () => {
    expect(buildFeed([activity({})], baseInput()).emptyReason).toBe('none');
  });
});

describe('source trust (Ticketmaster now-window, decided 2026-09-05)', () => {
  const ticketed = (overrides: Partial<Activity>) =>
    activity({ source: 'live', sourceName: 'Ticketmaster', ...overrides });
  const venueOwn = (overrides: Partial<Activity>) =>
    activity({ source: 'live', sourceName: 'Kilby Court', ...overrides });
  // 0.05 mi north of the anchor: nearer than anything else in these tests.
  const NEAR = { lat: SLC_ANCHOR.lat + 0.0007, lng: SLC_ANCHOR.lng };
  const FAR = { lat: SLC_ANCHOR.lat + 0.04, lng: SLC_ANCHOR.lng };

  it('tags every item with its source trust', () => {
    const { items } = buildFeed(
      [
        ticketed({ id: 'tm', startsAtIso: iso(60) }),
        activity({ id: 'seed' }),
        venueOwn({ id: 'venue', startsAtIso: iso(60) }),
        activity({ id: 'agg', source: 'live', sourceName: 'Now Playing Utah', startsAtIso: iso(60) }),
        activity({ id: 'sg', source: 'live', sourceName: 'SeatGeek', startsAtIso: iso(60) }),
      ],
      baseInput({ sort: 'type' })
    );
    const trust = Object.fromEntries(items.map((i) => [i.id, i.sourceTrust]));
    expect(trust).toEqual({ tm: 1, seed: 3, venue: 3, agg: 2, sg: 1 });
  });

  it('treats every known corporate ticketing platform as tier 1, whatever its casing', () => {
    for (const name of ['Eventbrite', 'AXS', 'StubHub', 'Live Nation', 'DICE', 'Etix']) {
      const { items } = buildFeed(
        [activity({ id: 'x', source: 'live', sourceName: name, startsAtIso: iso(60) })],
        baseInput()
      );
      expect(items[0].sourceTrust).toBe(1);
    }
  });

  it('ticketing items inside the window do not count as trusted supply for the cap', () => {
    const inWindow = Array.from({ length: 12 }, (_, i) =>
      ticketed({ id: `now${i}`, startsAtIso: iso(10 + i) })
    );
    const later = Array.from({ length: 8 }, (_, i) =>
      ticketed({ id: `later${i}`, startsAtIso: iso(700 + i) })
    );

    const { items } = buildFeed([...inWindow, ...later], baseInput({ sort: 'soonest' }));
    expect(items).toHaveLength(20);
  });

  it('outside the now-window a ticketing item ranks below every trusted item in any sort', () => {
    const tm = ticketed({ id: 'tm', ...NEAR, startsAtIso: iso(400) });
    const venue = venueOwn({ id: 'venue', ...FAR, startsAtIso: iso(900) });
    const seed = activity({ id: 'seed', ...FAR, startsInMinutes: 800 });

    for (const sort of ['nearest', 'soonest', 'foryou', 'type'] as const) {
      const { items } = buildFeed([tm, venue, seed], baseInput({ sort }));
      expect(items[items.length - 1].id).toBe('tm');
    }
  });

  it('inside the now-window a ticketing item competes normally', () => {
    const startingSoon = ticketed({ id: 'soon', ...NEAR, startsAtIso: iso(60) });
    const underway = ticketed({ id: 'underway', ...NEAR, startsAtIso: iso(-30) });
    const venue = venueOwn({ id: 'venue', ...FAR, startsAtIso: iso(30) });

    const { items } = buildFeed([venue, startingSoon, underway], baseInput({ sort: 'nearest' }));
    expect(items.map((i) => i.id).indexOf('venue')).toBe(2);
  });

  it('caps demoted ticketing items at five once ten trusted items are in range, and not before', () => {
    const trusted = (n: number) =>
      Array.from({ length: n }, (_, i) => venueOwn({ id: `v${i}`, startsAtIso: iso(600 + i) }));
    const demoted = Array.from({ length: 8 }, (_, i) =>
      ticketed({ id: `t${i}`, startsAtIso: iso(700 + i) })
    );

    const capped = buildFeed([...trusted(10), ...demoted], baseInput({ sort: 'soonest' }));
    expect(capped.items.filter((i) => i.sourceTrust === 1)).toHaveLength(5);
    expect(capped.items.slice(0, 10).every((i) => i.sourceTrust === 3)).toBe(true);

    const thin = buildFeed([...trusted(9), ...demoted], baseInput({ sort: 'soonest' }));
    expect(thin.items.filter((i) => i.sourceTrust === 1)).toHaveLength(8);
  });

  it.each(['tomorrow', 'custom'] as const)('keeps the ticketing cap during %s browsing and relaxes it only for typed search', (preset) => {
    const trusted = Array.from({ length: 10 }, (_, i) =>
      venueOwn({ id: `v${i}`, startsAtIso: iso(1500 + i) }));
    const tickets = Array.from({ length: 8 }, (_, i) =>
      ticketed({ id: `t${i}`, title: `Arena show ${i}`, startsAtIso: iso(1600 + i) }));
    const outside = ticketed({ id: 'outside-date', title: 'Arena show later', startsAtIso: iso(3000) });
    const dateFilter: NonNullable<FeedInput['dateFilter']> = preset === 'custom'
      ? { preset, startDate: '2026-08-31', endDate: '2026-08-31' } : { preset };
    const input = baseInput({ dateFilter, timeZone: 'UTC', sort: 'soonest' });
    const events = [...trusted, ...tickets, outside];

    for (const query of ['', '   ']) {
      const browsing = buildFeed(events, { ...input, query });
      expect(browsing.items.filter(i => i.sourceTrust === 1)).toHaveLength(5);
      expect(browsing.foldedTicketed).toHaveLength(3);
      expect(browsing.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'outside-date' })]));
    }
    const searched = buildFeed(events, { ...input, query: 'Arena' });
    expect(searched.items.map(i => i.id)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);
    expect(searched.foldedTicketed).toEqual([]);
  });

  it('never drops a pinned plan, even past the cap', () => {
    const trusted = Array.from({ length: 12 }, (_, i) =>
      venueOwn({ id: `v${i}`, startsAtIso: iso(600 + i) })
    );
    const demoted = Array.from({ length: 8 }, (_, i) =>
      ticketed({ id: `t${i}`, startsAtIso: iso(700 + i) })
    );

    const { items } = buildFeed(
      [...trusted, ...demoted],
      baseInput({ sort: 'soonest', pinnedIds: new Set(['t7']) })
    );
    const shownTickets = items.filter((i) => i.sourceTrust === 1).map((i) => i.id);
    expect(shownTickets).toContain('t7');
    expect(shownTickets).toHaveLength(6);
  });

  it('a search shows every matching ticketing item, demoted in order, even past the cap', () => {
    const trusted = Array.from({ length: 12 }, (_, i) =>
      venueOwn({ id: `v${i}`, title: `Venue night ${i}`, startsAtIso: iso(600 + i) })
    );
    const demoted = Array.from({ length: 8 }, (_, i) =>
      ticketed({ id: `t${i}`, title: `Arena tour ${i}`, startsAtIso: iso(700 + i) })
    );

    const searched = buildFeed([...trusted, ...demoted], baseInput({ sort: 'soonest', query: 'arena' }));
    expect(searched.items).toHaveLength(8);
    expect(searched.items.every((i) => i.sourceTrust === 1)).toBe(true);

    const mixed = buildFeed([...trusted, ...demoted], baseInput({ sort: 'soonest', query: 'night' }));
    expect(mixed.items.map((i) => i.id)).toEqual(trusted.map((i) => i.id));
  });

  it('trust never overrides rating: a mature venue-own show still hides in Everyone', () => {
    const { items } = buildFeed(
      [
        venueOwn({ id: 'bar', rating: 'mature', startsAtIso: iso(60) }),
        ticketed({ id: 'tm', startsAtIso: iso(60) }),
      ],
      baseInput()
    );
    expect(items.map((i) => i.id)).toEqual(['tm']);
  });

  it('with an empty trusted set, ticketing items still fill the feed', () => {
    const only = Array.from({ length: 3 }, (_, i) => ticketed({ id: `t${i}`, startsAtIso: iso(500 + i) }));
    const { items, emptyReason } = buildFeed(only, baseInput({ sort: 'soonest' }));
    expect(items).toHaveLength(3);
    expect(emptyReason).toBe('none');
  });
});

describe('rank mode (research clicklist Q1, 2026-09-14)', () => {
  // ~8 mi out and three hours away, in a category the viewer picked.
  const lovedButFar = () =>
    activity({ id: 'loved-far', category: 'music', lat: SLC_ANCHOR.lat + 0.115, startsInMinutes: 180 });
  // ~0.5 mi away, starting in ten minutes, in a category they did not pick.
  const plainButHere = () =>
    activity({ id: 'plain-here', category: 'games', lat: SLC_ANCHOR.lat + 0.007, startsInMinutes: 10 });

  it('ships at the old weight, so merging this changes nothing a user sees', () => {
    const { items } = buildFeed(
      [plainButHere(), lovedButFar()],
      baseInput({ interests: new Set(['music']), radiusMi: 15 })
    );
    expect(items[0].id).toBe('loved-far');
  });

  // Superseded by the interest filter (James, 2026-09-25): an unpicked
  // category no longer competes on weight, it is not shown. The weight still
  // orders picked items, so both modes keep shipping.
  it('near-and-now cannot bring an unpicked category back', () => {
    const { items } = buildFeed(
      [lovedButFar(), plainButHere()],
      baseInput({ interests: new Set(['music']), radiusMi: 15, rankMode: 'near-and-now' })
    );
    expect(items.map((i) => i.id)).toEqual(['loved-far']);
  });

  it('pinned ranking does not bypass Discover interests', () => {
    const { items } = buildFeed(
      [lovedButFar(), plainButHere()],
      baseInput({
        interests: new Set(['music']),
        radiusMi: 15,
        rankMode: 'near-and-now',
        pinnedIds: new Set(['plain-here']),
      })
    );
    expect(items.map(i => i.id)).toEqual(['loved-far']);
  });

  // The whole point of Q1:B — an interest may break a tie between reachable
  // things, but it may not outrank nearness and soonness together.
  it('holds the near-and-now weight under nearness plus soonness combined', () => {
    expect(RANK_INTEREST_HIT['near-and-now']).toBeLessThan(40 + 30);
    expect(RANK_INTEREST_HIT['interest-first']).toBeGreaterThan(40 + 30);
  });
});

describe('concreteness gate (research clicklist step 13)', () => {
  const concrete = (id: string, over: Partial<Activity> = {}) =>
    activity({ id, venue: 'Kilby Court', startsAtIso: iso(30), ...over });
  const fiveConcrete = () =>
    [1, 2, 3, 4, 5].map((n) => concrete(`c${n}`, { lat: SLC_ANCHOR.lat + 0.001 * n }));
  // Opt in explicitly: production never passes the flag, so default stays off.
  const gatedInput = (over: Partial<FeedInput> = {}) =>
    baseInput({ concretenessGate: true, ...over });

  it('ships off by default, so merging this changes nothing a user sees', () => {
    expect(DEFAULT_CONCRETENESS_GATE).toBe(false);
    const vague = activity({ id: 'vague-time', venue: 'Kilby Court', startsInMinutes: 0 });
    const { items } = buildFeed([vague, ...fiveConcrete()], baseInput());
    // Without the flag, score order wins: vague-time is nearest/soonest.
    expect(items[0].id).toBe('vague-time');
  });

  it('keeps an event with no real start time out of the leading slots', () => {
    // Scores highest on nearness and soonness, but its time is a baked label
    // with no timestamp and no schedule behind it.
    const vague = activity({ id: 'vague-time', venue: 'Kilby Court', startsInMinutes: 0 });
    const { items } = buildFeed([vague, ...fiveConcrete()], gatedInput());

    expect(items.slice(0, 5).map((i) => i.id)).not.toContain('vague-time');
    expect(items.map((i) => i.id)).toContain('vague-time');
  });

  it('keeps an event with no venue name out of the leading slots', () => {
    const noVenue = concrete('no-venue', { venue: '   ', startsAtIso: iso(1) });
    const { items } = buildFeed([noVenue, ...fiveConcrete()], gatedInput());

    expect(items.slice(0, 5).map((i) => i.id)).not.toContain('no-venue');
  });

  it('counts a recurring series as a real schedule', () => {
    const series = activity({
      id: 'series',
      venue: 'Kilby Court',
      startsInMinutes: 0,
      recurrence: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 19, endHour: 21 },
    });
    const { items } = buildFeed([series, ...fiveConcrete()], gatedInput());

    expect(items.map((i) => i.id)).toContain('series');
  });

  it('never drops anything, and leaves an all-vague feed in its scored order', () => {
    const vague = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      activity({ id: `v${n}`, lat: SLC_ANCHOR.lat + 0.001 * n }));
    const { items } = buildFeed(vague, gatedInput());

    expect(items).toHaveLength(7);
    expect(items.map((i) => i.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']);
  });

  it('does not re-order a sort the viewer asked for by name', () => {
    const vague = activity({ id: 'vague-time', venue: 'Kilby Court', startsInMinutes: 0 });
    for (const sort of ['nearest', 'soonest', 'type'] as const) {
      const { items } = buildFeed([vague, ...fiveConcrete()], gatedInput({ sort }));
      expect(items[0].id).toBe('vague-time');
    }
  });

  it('does not re-order a search', () => {
    const vague = activity({ id: 'vague-time', venue: 'Kilby Court', startsInMinutes: 0 });
    const { items } = buildFeed(
      [vague, ...fiveConcrete()],
      gatedInput({ query: 'Test activity' })
    );
    expect(items[0].id).toBe('vague-time');
  });

  // Gate-before-trust is the contract (decided 2026-09-05): a demoted ticketing
  // item stays below every trusted item whatever the gate did above it. Cover
  // both passes together so swapping the calls cannot regress unnoticed —
  // trust-then-gate would pull this concrete ticketed item back above vague
  // trusted supply.
  it('keeps demoted ticketing below trusted items after the gate runs', () => {
    // Vague trusted: real community sources, but no timestamp/schedule. Far and
    // not soon, so a near, concrete ticketed item outscores them before trust.
    const vagueTrusted = [1, 2, 3, 4, 5, 6].map((n) =>
      activity({
        id: `vague${n}`,
        source: 'live',
        sourceName: 'Kilby Court',
        venue: 'Kilby Court',
        category: 'community',
        startsInMinutes: 600,
        lat: SLC_ANCHOR.lat + 0.05 * n,
        lng: SLC_ANCHOR.lng,
      })
    );
    // Concrete and near, outside the now-window → scores first, then
    // the gate keeps it in the lead, then source trust demotes it last.
    const concreteTicketed = activity({
      id: 'tm-concrete',
      source: 'live',
      sourceName: 'Ticketmaster',
      venue: 'Delta Center',
      category: 'music',
      startsAtIso: iso(400),
      lat: SLC_ANCHOR.lat,
      lng: SLC_ANCHOR.lng,
    });

    const { items } = buildFeed(
      [...vagueTrusted, concreteTicketed],
      gatedInput({ radiusMi: 50 })
    );

    const ids = items.map((i) => i.id);
    const ticketedAt = ids.indexOf('tm-concrete');
    expect(ticketedAt).toBe(ids.length - 1);
    for (const vague of vagueTrusted) {
      expect(ids.indexOf(vague.id)).toBeLessThan(ticketedAt);
    }
    // Every trusted item still precedes the demoted ticketed item — the
    // boundary source trust owns, not the concreteness gate.
    expect(items.slice(0, vagueTrusted.length).every((i) => i.sourceTrust >= 2)).toBe(true);
  });
});

describe('fold, never drop (research clicklist step 13)', () => {
  const ticketed = (overrides: Partial<Activity>) =>
    activity({ source: 'live', sourceName: 'Ticketmaster', ...overrides });

  it('hands back the ticketed items the cap held, instead of losing them', () => {
    // Ten trusted items switch the cap on; the cap then keeps five ticketed.
    const trusted = Array.from({ length: 10 }, (_, n) =>
      activity({ id: `t${n}`, source: 'live', sourceName: 'Kilby Court', startsAtIso: iso(60) }));
    const ticketedItems = Array.from({ length: 9 }, (_, n) =>
      ticketed({ id: `tm${n}`, startsAtIso: iso(400 + n) }));

    const { items, foldedTicketed } = buildFeed([...trusted, ...ticketedItems], baseInput({ radiusMi: 50 }));

    expect(foldedTicketed).toHaveLength(4);
    expect(items.filter((i) => i.sourceTrust === 1)).toHaveLength(5);
    // Nothing vanishes: every ticketed item is either shown or folded.
    const accounted = [...items, ...foldedTicketed].filter((i) => i.sourceTrust === 1);
    expect(accounted).toHaveLength(9);
  });

  it('folds nothing when the cap is not in force', () => {
    const { items, foldedTicketed } = buildFeed(
      [ticketed({ id: 'tm', startsAtIso: iso(400) }), activity({ id: 'seed' })],
      baseInput()
    );
    expect(foldedTicketed).toEqual([]);
    expect(items).toHaveLength(2);
  });
});

describe('now-window count (answer first, 2026-09-16)', () => {
  const live = (overrides: Partial<Activity>) => activity({ source: 'live', ...overrides });

  it('shares the ticketing now-window: one forward number for "right now"', () => {
    expect(NOW_WINDOW_MINUTES).toBe(TICKETING_NOW_WINDOW_MINUTES);
  });

  it('counts underway and imminent items; the window edge is inclusive', () => {
    const underway = live({ id: 'underway', startsAtIso: iso(-30) });
    const imminent = live({ id: 'imminent', startsAtIso: iso(NOW_WINDOW_MINUTES) });
    const later = live({ id: 'later', startsAtIso: iso(NOW_WINDOW_MINUTES + 1) });

    const { items, nowCount } = buildFeed([later, underway, imminent], baseInput());

    expect(items).toHaveLength(3);
    expect(nowCount).toBe(2);
  });

  it('calls a Monday afternoon quiet even when a picked interest fills the top slot', () => {
    // Monday 14:10 in Salt Lake City: nothing until the evening.
    const monday = Date.parse('2026-08-31T20:10:00Z');
    const at = (minutes: number) => new Date(monday + minutes * 60000).toISOString();
    const chess = live({ id: 'chess', startsAtIso: at(200), category: 'community' });
    const show = live({ id: 'show', startsAtIso: at(420), category: 'music' });
    const saturday = live({ id: 'sat', startsAtIso: at(60 * 24 * 5) });

    const { items, nowCount } = buildFeed(
      [saturday, show, chess],
      baseInput({ now: monday, interests: new Set(['music']) })
    );

    expect(items[0].id).toBe('show');
    expect(nowCount).toBe(0);
  });

  it('claims nothing during static render, and relative seeds do not fake now density', () => {
    const seed = activity({ id: 'seed', startsInMinutes: 0, whenLabel: 'Happening now' });
    const liveNow = activity({
      id: 'live-now',
      source: 'live',
      startsAtIso: iso(0),
      startsInMinutes: 0,
      whenLabel: 'Happening now',
    });
    expect(buildFeed([seed], baseInput({ now: null })).nowCount).toBe(0);
    // Stock rule 3: baked relative offsets stay in the list but do not claim "now".
    expect(buildFeed([seed], baseInput()).nowCount).toBe(0);
    expect(buildFeed([liveNow], baseInput()).nowCount).toBe(1);
    expect(buildFeed([], baseInput()).nowCount).toBe(0);
  });

  it('counts only shown items: a folded ticketed show is not "on now"', () => {
    const trusted = Array.from({ length: 10 }, (_, n) =>
      live({ id: `t${n}`, sourceName: 'Kilby Court', startsAtIso: iso(600 + n) }));
    const ticketedItems = Array.from({ length: 9 }, (_, n) =>
      live({ id: `tm${n}`, sourceName: 'Ticketmaster', startsAtIso: iso(400 + n) }));

    const { foldedTicketed, nowCount } = buildFeed(
      [...trusted, ...ticketedItems],
      baseInput({ radiusMi: 50 })
    );

    expect(foldedTicketed.length).toBeGreaterThan(0);
    expect(nowCount).toBe(0);
  });
});


describe('confirmed-free discovery', () => {
  it('includes only explicitly free events, across categories including food', () => {
    const listings = [
      activity({ id: 'food', category: 'food', admission: 'free' }),
      activity({ id: 'music', category: 'music', admission: 'free' }),
      activity({ id: 'unknown', category: 'food', description: 'Free samples may be available' }),
      activity({ id: 'paid', admission: 'paid' }),
    ];
    expect(buildFeed(listings, baseInput({ freeOnly: true })).items.map((item) => item.id).sort()).toEqual(['food', 'music']);
    expect(buildFeed(listings, baseInput()).items).toHaveLength(4);
  });
});
