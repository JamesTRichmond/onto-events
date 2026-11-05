import { SLC_ANCHOR, type Activity } from '@/data/activities';

import { collapseDuplicates, escalateDuplicateRatings } from '../duplicates';
import { buildFeed, type FeedInput } from '../feed';
import { snapshot } from '../going';

const SATURDAY = '2026-10-03T17:30:00.000Z';

function listing(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    title: 'Sensory Friendly Saturday',
    category: 'community',
    venue: 'Clark Planetarium',
    area: 'Salt Lake City, UT',
    lat: 40.7651,
    lng: -111.9032,
    whenLabel: 'Sat, Oct 3',
    startsInMinutes: 0,
    startsAtIso: SATURDAY,
    description: 'Event Location/Address: 110 South 400 West',
    attendees: 0,
    rating: 'general',
    source: 'live',
    sourceName: 'Clark Planetarium',
    sourceUrl: 'https://example.com/event',
    ...overrides,
  };
}

const planetarium = listing('ics-clark-1');
const county = listing('ics-slco-1', { sourceName: 'Salt Lake County Events' });

describe('collapseDuplicates', () => {
  it('never merges unrelated sources or sessions merely because each provider uses the same local ID', () => {
    const first = listing('first', { sourceEventId: '1', title: 'First concert' });
    const other = listing('other', { sourceEventId: '1', sourceName: 'Other provider', title: 'Unrelated workshop' });
    const nextSession = listing('next', { ...first, id: 'next', startsAtIso: '2026-10-10T17:30:00.000Z' });
    expect(collapseDuplicates([first, other, nextSession]).map((a) => a.id)).toEqual(['first', 'other', 'next']);
    const undated = { ...first, id: 'undated', startsAtIso: undefined };
    expect(collapseDuplicates([undated, { ...undated, id: 'also-undated' }])).toHaveLength(2);
  });
  it('shows one card for the same happening from two calendars, credited to the venue', () => {
    expect(collapseDuplicates([planetarium, county]).map((a) => a.id)).toEqual(['ics-clark-1']);
    expect(collapseDuplicates([county, planetarium]).map((a) => a.id)).toEqual(['ics-clark-1']);
  });

  it('never hides a saved plan, and keeps both when both are saved', () => {
    expect(collapseDuplicates([planetarium, county], new Set(['ics-slco-1'])).map((a) => a.id))
      .toEqual(['ics-slco-1']);
    expect(
      collapseDuplicates([planetarium, county], new Set(['ics-clark-1', 'ics-slco-1'])).map((a) => a.id),
    ).toEqual(['ics-clark-1', 'ics-slco-1']);
  });

  it('prefers a trusted calendar over a ticketing listing of the same show', () => {
    const ticketed = listing('tm-1', { sourceName: 'Ticketmaster', description: 'x'.repeat(400) });
    expect(collapseDuplicates([ticketed, county]).map((a) => a.id)).toEqual(['ics-slco-1']);
  });

  it('keeps listings apart when time, place or title differ', () => {
    const later = listing('ics-slco-2', { sourceName: 'Salt Lake County Events', startsAtIso: '2026-10-03T17:46:00.000Z' });
    const farther = listing('ics-slco-3', { sourceName: 'Salt Lake County Events', lat: 40.7651 + 0.003 });
    const other = listing('ics-slco-4', { sourceName: 'Salt Lake County Events', title: 'Star Party' });
    expect(collapseDuplicates([planetarium, later, farther, other]).map((a) => a.id))
      .toEqual(['ics-clark-1', 'ics-slco-2', 'ics-slco-3', 'ics-slco-4']);
  });

  it('never treats a listing with a blank venue as the venue\'s own calendar', () => {
    const blank = listing('ics-clark-6', { venue: '  ', description: 'Short.' });
    const full = listing('ics-slco-13', {
      sourceName: 'Salt Lake County Events', description: 'A fuller listing with the real venue name. '.repeat(3),
    });
    expect(collapseDuplicates([blank, full]).map((a) => a.id)).toEqual(['ics-slco-13']);
  });

  it('matches titles the way the pipeline does: case, accents and punctuation aside', () => {
    const shouted = listing('ics-slco-5', { sourceName: 'Salt Lake County Events', title: 'SENSORY-FRIENDLY SATURDAY!' });
    expect(collapseDuplicates([planetarium, shouted]).map((a) => a.id)).toEqual(['ics-clark-1']);
  });

  it('gives every copy of a happening its strictest rating, saved copies included', () => {
    const mature = listing('ics-slco-6', { sourceName: 'Salt Lake County Events', rating: 'mature' });
    expect(escalateDuplicateRatings([planetarium, mature]).map((a) => a.rating)).toEqual(['mature', 'mature']);
    // Two saved copies stay two cards, and neither shows outside 21+.
    const both = escalateDuplicateRatings([planetarium, mature]);
    expect(collapseDuplicates(both, new Set(['ics-clark-1', 'ics-slco-6'])).map((a) => a.rating))
      .toEqual(['mature', 'mature']);
    const alone = [planetarium, listing('ics-slco-7', { title: 'Star Party' })];
    expect(escalateDuplicateRatings(alone)).toBe(alone);
  });

  it('propagates strictest rating across chained strong matches, not only the first anchor', () => {
    const zero = listing('ics-chain-0', { startsAtIso: '2026-10-03T17:00:00.000Z', rating: 'general' });
    const ten = listing('ics-chain-10', {
      sourceName: 'Salt Lake County Events',
      startsAtIso: '2026-10-03T17:10:00.000Z',
      rating: 'mature',
    });
    const twenty = listing('ics-chain-20', {
      sourceName: 'Ticketmaster',
      startsAtIso: '2026-10-03T17:20:00.000Z',
      rating: 'general',
    });
    expect(escalateDuplicateRatings([zero, ten, twenty]).map((a) => a.rating))
      .toEqual(['mature', 'mature', 'mature']);
  });

  it('applies the full severity order: family, then general, then mature', () => {
    const family = listing('ics-clark-5', { rating: 'family' });
    const general = listing('ics-slco-11', { sourceName: 'Salt Lake County Events', rating: 'general' });
    expect(escalateDuplicateRatings([family, general]).map((a) => a.rating)).toEqual(['general', 'general']);
    const onlyFamily = [family, listing('ics-slco-12', { sourceName: 'Salt Lake County Events', rating: 'family' })];
    expect(escalateDuplicateRatings(onlyFamily)).toBe(onlyFamily);
  });

  it('shows a repeated catalog id once instead of dropping it', () => {
    expect(collapseDuplicates([planetarium, planetarium]).map((a) => a.id)).toEqual(['ics-clark-1']);
    expect(collapseDuplicates([planetarium, county, planetarium]).map((a) => a.id)).toEqual(['ics-clark-1']);
  });

  it('never matches titles that normalize to nothing', () => {
    const party = listing('ics-a', { title: '🎉🎉' });
    const sparkle = listing('ics-b', { sourceName: 'Salt Lake County Events', title: '✨' });
    const festival = listing('ics-c', { title: '夏祭り' });
    const concert = listing('ics-d', { sourceName: 'Salt Lake County Events', title: 'ライブ' });
    expect(collapseDuplicates([party, sparkle, festival, concert]).map((a) => a.id))
      .toEqual(['ics-a', 'ics-b', 'ics-c', 'ics-d']);
  });

  it('shows one AstroTots card per session when the same class is listed twice', () => {
    const thursday = '2026-10-01T16:30:00.000Z';
    const tuesday = '2026-10-06T16:30:00.000Z';
    const identity = '["single","http://uid.trumba.com/event/206808077"]';
    const planetarium = listing('ics-clark-astro-thu', {
      title: 'AstroTots',
      rating: 'family',
      category: 'learning',
      startsAtIso: thursday,
      sourceEventId: identity,
    });
    // The county copy of the same class, with a pin that has drifted miles away.
    const county = listing('ics-slco-astro-thu', {
      title: 'AstroTots',
      rating: 'family',
      category: 'community',
      sourceName: 'Salt Lake County Events',
      startsAtIso: thursday,
      sourceEventId: identity,
      lat: planetarium.lat + 0.05,
    });
    const tuesdaySession = listing('ics-clark-astro-tue', {
      title: 'AstroTots',
      rating: 'family',
      category: 'learning',
      startsAtIso: tuesday,
      sourceEventId: '["single","http://uid.trumba.com/event/206808071"]',
    });
    expect(collapseDuplicates([planetarium, county, tuesdaySession]).map((a) => a.id)).toEqual([
      'ics-clark-astro-thu',
      'ics-clark-astro-tue',
    ]);
  });

  it('does not merge unrelated occurrences that reuse a source event id', () => {
    const identity = 'shared-source-event-id';
    const astroTots = listing('ics-astro-1', { title: 'AstroTots', sourceEventId: identity });
    const otherTitle = listing('ics-other-title', { title: 'Star Party', sourceEventId: identity });
    const otherTime = listing('ics-other-time', {
      title: 'AstroTots',
      startsAtIso: '2026-10-03T18:30:00.000Z',
      sourceEventId: identity,
    });
    expect(collapseDuplicates([astroTots, otherTitle, otherTime]).map((a) => a.id))
      .toEqual(['ics-astro-1', 'ics-other-title', 'ics-other-time']);
  });

  it('does not collapse two sources that only share a local slug', () => {
    const slug = '["single","bike-club-ride"]';
    const east = listing('ride-east', {
      title: 'Bike club ride',
      sourceName: 'East calendar',
      sourceEventId: slug,
      lat: 40.76,
    });
    const west = listing('ride-west', {
      title: 'Bike club ride',
      sourceName: 'West calendar',
      sourceEventId: slug,
      lat: 40.9,
    });
    expect(collapseDuplicates([east, west]).map((a) => a.id)).toEqual(['ride-east', 'ride-west']);
  });

  it('collapses one public id when the start and the pin both drift a little', () => {
    const identity = '["single","http://uid.trumba.com/event/206808077"]';
    const first = listing('astro-a', { sourceEventId: identity, startsAtIso: SATURDAY });
    const drifted = listing('astro-b', {
      sourceName: 'Salt Lake County Events',
      sourceEventId: identity,
      startsAtIso: '2026-10-03T17:40:00.000Z',
      lat: first.lat + 0.05,
    });
    expect(collapseDuplicates([first, drifted]).map((a) => a.id)).toEqual(['astro-a']);
  });

  it('returns the same array when nothing collapses', () => {
    const activities = [planetarium, listing('ics-slco-7', { title: 'Star Party' })];
    expect(collapseDuplicates(activities)).toBe(activities);
  });

  it('collapses chained strong matches into one happening even if endpoints do not directly match', () => {
    const zero = listing('ics-chain-0', { startsAtIso: '2026-10-03T17:00:00.000Z' });
    const ten = listing('ics-chain-10', {
      sourceName: 'Salt Lake County Events',
      startsAtIso: '2026-10-03T17:10:00.000Z',
    });
    const twenty = listing('ics-chain-20', {
      sourceName: 'Ticketmaster',
      startsAtIso: '2026-10-03T17:20:00.000Z',
    });
    expect(collapseDuplicates([zero, ten, twenty]).map((a) => a.id)).toEqual(['ics-chain-0']);
  });
});

describe('buildFeed collapsing after its filters, before its cap', () => {
  const input = (overrides: Partial<FeedInput> = {}): FeedInput => ({
    now: Date.parse('2026-10-03T17:00:00.000Z'),
    lat: SLC_ANCHOR.lat,
    lng: SLC_ANCHOR.lng,
    radiusMi: 5,
    sort: 'foryou',
    mode: 'everyone',
    interests: new Set(),
    ...overrides,
  });
  const shown = (activities: Activity[], overrides: Partial<FeedInput> = {}) =>
    buildFeed(activities, input(overrides)).items.map((a) => a.id);

  it('suppresses a withdrawn saved listing using persisted facts without adding it to discovery', () => {
    const saved = snapshot(planetarium);
    const options = { goingIds: new Set([saved.id]), goingSnapshots: [saved] };
    expect(shown([county], options)).toEqual([]);
    expect(buildFeed([county], input(options)).emptyReason).toBe('no-match');
    expect(shown([], options)).toEqual([]);
    expect(shown([county], { ...options, goingIds: new Set() })).toEqual([county.id]);
    expect(shown([county], { ...options, query: 'sensory', interests: new Set(['community']),
      dateFilter: { preset: 'today' }, timeZone: 'UTC' })).toEqual([]);
  });

  it('does not mistake later occurrences, different venues or missing evidence for saved duplicates', () => {
    const options = { goingIds: new Set([planetarium.id]), goingSnapshots: [snapshot(planetarium)] };
    const later = listing('later', { startsAtIso: '2026-10-10T17:30:00Z' });
    const elsewhere = listing('elsewhere', { venue: 'Another planetarium' });
    expect(shown([later], options)).toEqual(['later']);
    expect(shown([elsewhere], options)).toEqual(['elsewhere']);
    for (const missing of [{ title: '' }, { venue: '' }, { venue: 'Location to be confirmed' }, { startsAtIso: undefined }]) {
      expect(shown([county], { ...options, goingSnapshots: [{ ...snapshot(planetarium), ...missing }] })).toEqual([county.id]);
    }
  });

  it.each([undefined, SATURDAY])('matches resolved recurring occurrences instead of the raw fallback %s', (startsAtIso) => {
    const recurring = listing('remaining-series', {
      startsAtIso, recurrence: { days: [6], startHour: 17, startMinute: 30, endHour: 19 },
    });
    const options: Partial<FeedInput> = {
      goingIds: new Set([planetarium.id]), goingSnapshots: [snapshot(planetarium)], timeZone: 'UTC',
      dateFilter: { preset: 'custom', startDate: '2026-10-03', endDate: '2026-10-03' },
    };
    expect(shown([recurring], { ...options, goingIds: new Set() })).toEqual([recurring.id]);
    expect(shown([recurring], options)).toEqual([]);
    const later = buildFeed([recurring], input({ ...options,
      dateFilter: { preset: 'custom', startDate: '2026-10-10', endDate: '2026-10-10' },
    }));
    expect(later.items.map(item => item.startsAtIso)).toEqual(['2026-10-10T17:30:00.000Z']);
  });

  it('uses current saved-listing facts over an older snapshot and preserves the catalog duplicate rules', () => {
    const revised = { ...planetarium, startsAtIso: '2026-10-10T17:30:00Z' };
    expect(shown([revised, county], { goingIds: new Set([planetarium.id]), goingSnapshots: [snapshot(planetarium)] })).toEqual([county.id]);
    const alias = listing('alias', { venue: 'Alternate venue spelling' });
    expect(shown([county, alias], { goingIds: new Set([planetarium.id]), goingSnapshots: [snapshot(planetarium)] })).toEqual([]);
  });

  it('keeps the copy that fits the viewer\'s interests when the venue files it elsewhere', () => {
    const learning = listing('ics-clark-3', { category: 'learning' });
    const community = listing('ics-slco-9', { sourceName: 'Salt Lake County Events', category: 'community' });
    expect(shown([learning, community])).toEqual(['ics-clark-3']);
    expect(shown([learning, community], { interests: new Set(['community']) })).toEqual(['ics-slco-9']);
  });

  it('keeps a copy that is still on when the preferred copy has ended', () => {
    const ended = listing('ics-clark-4', { endsAtIso: '2026-10-03T18:00:00.000Z' });
    const running = listing('ics-slco-10', {
      sourceName: 'Salt Lake County Events', endsAtIso: '2026-10-03T20:00:00.000Z',
    });
    expect(shown([ended, running], { now: Date.parse('2026-10-03T19:00:00.000Z') })).toEqual(['ics-slco-10']);
  });

  it('never lets a duplicate spend one of the capped ticketing slots', () => {
    const inHour = (h: number) => new Date(Date.parse('2026-10-03T17:00:00.000Z') + h * 3_600_000).toISOString();
    // Ten trusted listings turn the cap on; six later ticketed shows exceed it.
    const trusted = Array.from({ length: 10 }, (_, i) => listing(`ics-trusted-${i}`, {
      title: `Community night ${i}`, sourceName: 'Salt Lake County Events', startsAtIso: inHour(1),
    }));
    const ticketed = Array.from({ length: 6 }, (_, i) => listing(`tm-${i}`, {
      title: `Touring show ${i}`, sourceName: 'Ticketmaster', startsAtIso: inHour(24 + i),
    }));
    // The soonest ticketed show is the same happening a trusted calendar lists.
    const sameShow = listing('ics-trusted-show', {
      title: 'Touring show 0', sourceName: 'Salt Lake County Events', startsAtIso: inHour(24),
    });
    const ids = shown([...trusted, sameShow, ...ticketed]);
    expect(ids).toContain('ics-trusted-show');
    expect(ids).not.toContain('tm-0');
    expect(ids.filter((id) => id.startsWith('tm-'))).toEqual(['tm-1', 'tm-2', 'tm-3', 'tm-4', 'tm-5']);
  });

  it('counts trusted supply the same whatever the viewer saved', () => {
    const inHour = (h: number) => new Date(Date.parse('2026-10-03T17:00:00.000Z') + h * 3_600_000).toISOString();
    // Nine trusted happenings, plus a tenth that Ticketmaster also lists.
    const trusted = Array.from({ length: 9 }, (_, i) => listing(`ics-trusted-${i}`, {
      title: `Community night ${i}`, sourceName: 'Salt Lake County Events', startsAtIso: inHour(1),
    }));
    const tenth = listing('ics-trusted-9', { title: 'Shared show', sourceName: 'Salt Lake County Events', startsAtIso: inHour(2) });
    const tenthTicketed = listing('tm-shared', { title: 'Shared show', sourceName: 'Ticketmaster', startsAtIso: inHour(2) });
    const later = Array.from({ length: 6 }, (_, i) => listing(`tm-${i}`, {
      title: `Touring show ${i}`, sourceName: 'Ticketmaster', startsAtIso: inHour(24 + i),
    }));
    const catalog = [...trusted, tenth, tenthTicketed, ...later];
    const demoted = (pinned: string[]) => buildFeed(catalog, input({ pinnedIds: new Set(pinned) })).items
      .filter((a) => /^tm-\d$/.test(a.id)).length;
    // Ten trusted happenings turn the cap on, saved ticketed copy or not.
    expect(demoted([])).toBe(5);
    expect(demoted(['tm-shared'])).toBe(5);
  });
});
