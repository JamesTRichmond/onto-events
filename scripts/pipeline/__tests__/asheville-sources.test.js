const { SOURCES } = require('../sources');
const { readSourceFixture } = require('../run-source');
const { validateRecord } = require('../schema');
const feeds = require('../../../data/feeds.json');

// Real captures from 2026-10-08, trimmed. The clock sits just before them so
// every kept event is inside the sixty-day horizon.
const now = Date.parse('2026-10-08T00:00:00Z');
const fixtureFor = (sourceName) => {
  const adapter = SOURCES.find((source) => source.sourceName === sourceName);
  return readSourceFixture(adapter, adapter.fixturePath, { now });
};

it('registers every Asheville feed in the asheville service region on venue-local time', () => {
  const asheville = feeds.filter((feed) => feed.serviceRegion === 'asheville');
  expect(asheville.length).toBeGreaterThan(0);
  for (const feed of asheville) expect(feed.timezone).toBe('America/New_York');
});

describe('Asheville Art Museum', () => {
  const result = fixtureFor('Asheville Art Museum');

  it('maps museum events to the museum with its own published point', () => {
    expect(result.records).toHaveLength(6);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Asheville Art Museum', locality: 'Asheville', region: 'NC',
        timezone: 'America/New_York', lat: 35.5946714, lng: -82.5512827, rating: 'general' });
    }
  });

  // James, 2026-10-08 (reevaluated): "NC" names only the museum's own state,
  // and the listing says "Join us at the Museum".
  it('reads an event whose only location is "NC" as the museum', () => {
    expect(result.skipped).toEqual({});
    expect(result.records.find((record) => record.title.startsWith('The Art of Yoga'))).toMatchObject({ venue: 'Asheville Art Museum' });
  });
});

describe('Asheville Museum of Science', () => {
  const result = fixtureFor('Asheville Museum of Science');

  it('maps every event to the museum at its published downtown point', () => {
    expect(result.records).toHaveLength(3);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Asheville Museum of Science', region: 'NC', lat: 35.5947901, lng: -82.5533963 });
    }
  });

  it('rates the 21+ After Hours night mature from its own text and keeps family programs family', () => {
    const rating = (title) => result.records.find((record) => record.title.startsWith(title)).rating;
    expect(rating('AMOS After Hours')).toBe('mature');
    expect(rating('Dinner Under Dinos')).toBe('family');
  });
});

describe('Thomas Wolfe Memorial', () => {
  const result = fixtureFor('Thomas Wolfe Memorial');

  it('maps in-horizon programs to the memorial and drops the December open house past the horizon', () => {
    expect(result.records.map((record) => record.title)).toEqual([
      "Film Screening - You Can't Go Home Again from CBS (1979)",
      'From Death to Mourning: Spiritual Journeys of the Wolfe Family',
    ]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Thomas Wolfe Memorial', region: 'NC', lat: 35.5975664, lng: -82.5512582 });
    }
  });
});

describe('Warren Wilson College', () => {
  const result = fixtureFor('Warren Wilson College');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps campus events to buildings at the points the college publishes, in Swannanoa', () => {
    expect(result.records.filter((record) => record.venue !== 'Warren Wilson College')).toHaveLength(8);
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    expect(byTitle('Belegarth')).toMatchObject({ venue: 'Cowpie Lawn (Warren Wilson College)', locality: 'Swannanoa',
      lat: 35.611409, lng: -82.441422 });
    expect(byTitle('Swing Asheville')).toMatchObject({ venue: 'Morris Pavilion (Warren Wilson College)', locality: 'Swannanoa' });
  });

  it('maps the Old Farmers Ball to Bryson Gym through the listing text, typo included', () => {
    const balls = result.records.filter((record) => record.title.startsWith('Old Farmers Ball'));
    expect(balls).toHaveLength(2);
    for (const ball of balls) {
      expect(ball).toMatchObject({ venue: 'Bryson Gym (Warren Wilson College)', lat: 35.612776, lng: -82.440872, rating: 'general' });
    }
  });

  it('keeps the off-campus brewery session mature', () => {
    expect(byTitle("Ginger's Revenge")).toMatchObject({ venue: "Ginger's Revenge", locality: 'Asheville', rating: 'mature' });
  });

  // James, 2026-10-08 (reevaluated): a visitor finds Sage Cafe or a home game
  // on campus by asking or reading the campus map.
  it('pins rooms without published points and home games at the campus', () => {
    expect(result.skipped).toEqual({});
    expect(result.records).toHaveLength(10);
    expect(byTitle('Family Dinner')).toMatchObject({ venue: 'Warren Wilson College', locality: 'Swannanoa', lat: 35.611409, lng: -82.441422 });
    expect(byTitle("Women's Volleyball")).toMatchObject({ venue: 'Warren Wilson College' });
  });
});

describe('Live Music Asheville', () => {
  const result = fixtureFor('Live Music Asheville');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('registers as an aggregator on the Events Calendar REST listing', () => {
    expect(feeds.find((feed) => feed.name === 'Live Music Asheville')).toMatchObject({ kind: 'tribe', sourceKind: 'aggregator' });
    expect(result.records.every((record) => record.sourceKind === 'aggregator')).toBe(true);
  });

  it('maps listings to registry venues and ignores the plugin’s own map points', () => {
    expect(result.records).toHaveLength(11);
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    // Buncombe County's civic address point for 2948 US 70 Hwy, not LMA's map point.
    expect(byTitle('Bluegrass Open Jam')).toMatchObject({ venue: 'Pisgah Brewing Company', locality: 'Black Mountain',
      lat: 35.606802, lng: -82.356794 });
    expect(byTitle('Sit A Spell')).toMatchObject({ venue: "Ginger's Revenge", lat: 35.614381, lng: -82.574821 });
    expect(byTitle('Third Thursday')).toMatchObject({ venue: 'Asheville Art Museum', lat: 35.5946714, lng: -82.5512827 });
    // LMA's point for Off the Wagon is in Ohio. The bar publishes 22 N. Market
    // Street itself, and the record takes the county's civic point for it.
    expect(byTitle('Dueling Piano Show')).toMatchObject({ venue: 'Off the Wagon', lat: 35.596547, lng: -82.550963,
      rating: 'mature', ratingBasis: 'signal' });
    // Mills River is in Henderson County; the Grove Park Inn's own site refuses requests.
    expect(result.unmapped).toEqual({ 'Mills River Brewing Co.': 1, 'The Omni Grove Park Inn': 1 });
    expect(result.skipped).toEqual({ 'unmapped venue': 2, 'missing location': 1 });
  });

  it('keeps bar listings mature unless the listing says all ages', () => {
    expect(byTitle('Thursday Night Funk')).toMatchObject({ venue: "Barley's Downtown", rating: 'mature' });
    expect(byTitle('The Thursday Bluegrass Jam')).toMatchObject({ venue: 'Jack of the Wood', rating: 'mature' });
    expect(byTitle('Fruition')).toMatchObject({ venue: 'The Grey Eagle', rating: 'mature' });
    expect(byTitle('Taste')).toMatchObject({ venue: 'French Broad River Brewery', rating: 'general' });
    expect(byTitle('Bluegrass Open Jam').rating).toBe('general');
    expect(byTitle('The Friday Drum Circle')).toMatchObject({ venue: 'Pritchard Park', rating: 'general' });
  });

  it('skips the featured-listing teaser and keeps the real all-day festival as one local day', () => {
    expect(result.diagnostics).toEqual({ 'featured-listing teaser': 1 });
    expect(byTitle('Flocktoberfest')).toMatchObject({ startsAtIso: '2026-10-09T04:00:00.000Z', endsAtIso: '2026-10-10T04:00:00.000Z' });
  });
});

describe('Buncombe County Public Libraries', () => {
  const branches = [
    ['Pack Memorial Library', 'Pack Memorial Library', 4, 35.596674, -82.55492],
    ['West Asheville Library', 'West Asheville Library', 2, 35.580767, -82.601366],
    ['Oakley/South Asheville Library', 'Oakley/South Asheville Library', 2, 35.564217, -82.513529],
    ['Skyland/South Buncombe Library', 'Skyland/South Buncombe Library', 2, 35.488069, -82.537075],
    ['North Asheville Library', 'North Asheville Library', 1, 35.632574, -82.55552],
    ['Black Mountain Library', 'Black Mountain Library', 1, 35.616162, -82.322801],
    ['East Asheville Library', 'Noir Collective AVL', 1, 35.593875, -82.550037],
  ];

  it.each(branches)('maps %s to its civic address point', (source, venue, count, lat, lng) => {
    const result = fixtureFor(source);
    expect(result.records).toHaveLength(count);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue, lat, lng, region: 'NC', category: 'learning' });
      expect(record.description).not.toMatch(/(?:^|<br>)\s*(?:Location|Phone|Email|Age Group|Library|Link):/);
    }
  });

  it('rates story times family and keeps a cancelled story time as a cancelled card', () => {
    expect(fixtureFor('Oakley/South Asheville Library').records.every((record) => record.rating === 'family')).toBe(true);
    const west = fixtureFor('West Asheville Library').records;
    expect(west.every((record) => record.isCancelled && record.rating === 'family')).toBe(true);
  });
});

describe('The Laurel of Asheville', () => {
  const result = fixtureFor('The Laurel of Asheville');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps both Grey Eagle spellings and the brewery nicknames to the registered venues', () => {
    expect(result.records).toHaveLength(12);
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    expect(byTitle('Fruition')).toMatchObject({ venue: 'The Grey Eagle', sourceKind: 'aggregator' });
    expect(byTitle('Boot Scootin')).toMatchObject({ venue: 'The Grey Eagle' });
    expect(byTitle('Comedy at The Funk')).toMatchObject({ venue: 'Wicked Weed Funkatorium', rating: 'mature' });
    expect(byTitle('Secret Saturday')).toMatchObject({ venue: 'River Arts District Brewing', rating: 'mature' });
    expect(byTitle('Under the Stars')).toMatchObject({ venue: 'Highland Brewing Company', rating: 'mature' });
  });

  it('places new venues on county civic address points and leaves out-of-county venues unmapped', () => {
    expect(byTitle('Asheville Symphony Masterworks')).toMatchObject({ venue: 'First Baptist Church of Asheville',
      lat: 35.599023, lng: -82.547808, rating: 'general' });
    expect(byTitle('AfroRhythm')).toMatchObject({ venue: 'White Horse Black Mountain', locality: 'Black Mountain' });
    expect(result.unmapped).toEqual({ 'Lucy Clark Gallery & Studio': 1 });
    expect(result.skipped).toEqual({ 'unmapped venue': 1, 'missing location': 1 });
  });

  it('keeps a multi-week run as one all-day span', () => {
    expect(byTitle('“Misery”')).toMatchObject({ venue: 'NC Stage Company',
      startsAtIso: '2026-10-14T04:00:00.000Z', endsAtIso: '2026-11-03T05:00:00.000Z' });
  });
});

describe('Asheville Downtown Association', () => {
  const { strictestRatings } = require('../dedupe');
  const result = fixtureFor('Asheville Downtown Association');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps upcoming reposts to county civic points and the museum', () => {
    expect(result.records).toHaveLength(3);
    expect(result.skipped).toEqual({ 'missing location': 2 });
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    // Squarespace's event pins exist only in the ?format=ical export its
    // robots.txt disallows, so the county civic point applies.
    expect(byTitle('Downtown Diamond Dash')).toMatchObject({ venue: 'HomeTrust Park', lat: 35.587119, lng: -82.550075 });
    expect(byTitle('Ginkgo Marketplace')).toMatchObject({ venue: 'Wall Street Courtyard', sourceKind: 'aggregator' });
  });

  it('takes the museum’s 21+ rating for its retitled After Hours copy', () => {
    const copy = byTitle('AMOS After Hours');
    expect(copy).toMatchObject({ venue: 'Asheville Museum of Science', rating: 'general' });
    const museum = fixtureFor('Asheville Museum of Science').records;
    const raised = strictestRatings([...museum, ...result.records]);
    expect(raised.get(copy.id)).toBe('mature');
    expect([...raised.keys()]).toEqual([copy.id]);
  });
});

describe('The Orange Peel', () => {
  const result = fixtureFor('The Orange Peel');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps its own room, Pulp and Hellbender to county civic points and drops the February show past the window', () => {
    expect(result.records).toHaveLength(6);
    expect(result.skipped).toEqual({});
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    expect(byTitle('The Brook')).toMatchObject({ venue: 'The Orange Peel', lat: 35.591422, lng: -82.551129,
      startsAtIso: '2026-10-09T00:00:00.000Z' });
    expect(byTitle('Scoochie Boochie')).toMatchObject({ venue: 'Pulp' });
    expect(byTitle('Knocked Loose')).toMatchObject({ venue: 'Hellbender' });
  });

  it('rates from the venue’s own age line, typo included, and marks the cancelled benefit', () => {
    expect(byTitle('The Brook')).toMatchObject({ rating: 'mature' });
    expect(byTitle('Chelsea Wolfe')).toMatchObject({ rating: 'mature' }); // "Agse 18+"
    expect(byTitle('Scoochie Boochie')).toMatchObject({ rating: 'mature' }); // Ages 21+
    expect(byTitle('Knocked Loose')).toMatchObject({ rating: 'general' }); // All Ages
    expect(byTitle('Avery Anna')).toMatchObject({ rating: 'general' }); // All Ages, under 12 needs approval
    expect(byTitle('*CANCELLED*')).toMatchObject({ isCancelled: true });
  });
});

describe('The Grey Eagle', () => {
  const result = fixtureFor('The Grey Eagle');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps the music hall, patio and special-event rooms to the one registered venue', () => {
    expect(result.records).toHaveLength(5);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'The Grey Eagle', sourceKind: 'community' });
    }
  });

  it('shows All Ages shows to everyone and keeps 18-and-up and burlesque shows mature', () => {
    expect(byTitle('Fruition')).toMatchObject({ rating: 'general', startsAtIso: '2026-10-09T00:00:00.000Z' });
    expect(byTitle('Patio Show')).toMatchObject({ rating: 'general' });
    expect(byTitle('Burlesque Brunch')).toMatchObject({ rating: 'mature' });
    expect(byTitle('David Nihill')).toMatchObject({ rating: 'mature' });
  });
});

describe('Asheville Music Hall', () => {
  const result = fixtureFor('Asheville Music Hall');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('dates shows from the page text, weekday included, and maps both floors', () => {
    expect(result.records).toHaveLength(5);
    expect(result.skipped).toEqual({});
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    expect(byTitle('Theo Katzman')).toMatchObject({ venue: 'Asheville Music Hall', startsAtIso: '2026-10-09T00:00:00.000Z' });
    expect(byTitle('JK & The Contraband')).toMatchObject({ venue: 'The One Stop' });
    expect(byTitle('Holiday Craft Bazaar')).toMatchObject({ venue: 'Asheville Music Hall' });
  });

  it('keeps 21-and-up, 18-and-up and unlabeled club shows mature and the all-ages bazaar general', () => {
    expect(byTitle('Theo Katzman').rating).toBe('mature');
    expect(byTitle('HIGH JUNE').rating).toBe('mature');
    expect(byTitle('Tyler Ballgame').rating).toBe('mature');
    expect(byTitle('Holiday Craft Bazaar').rating).toBe('general');
  });
});

describe('Pisgah Brewing Company', () => {
  const result = fixtureFor('Pisgah Brewing Company');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps both stage names to the brewery through this feed’s venue aliases, at its Black Mountain civic point', () => {
    expect(result.records).toHaveLength(6);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Pisgah Brewing Company', locality: 'Black Mountain', lat: 35.606802, lng: -82.356794 });
    }
    expect(byTitle('Flocktoberfest')).toMatchObject({ startsAtIso: '2026-10-09T22:30:00.000Z' });
  });

  it('shows the brewery’s own All Ages shows to everyone and keeps the rest on the bar default', () => {
    expect(byTitle('Flocktoberfest')).toMatchObject({ rating: 'general', ratingBasis: 'all-ages' });
    expect(byTitle('Sunday Jam')).toMatchObject({ rating: 'general', ratingBasis: 'all-ages' });
    expect(byTitle('The Infamous Stringdusters')).toMatchObject({ rating: 'mature', ratingBasis: 'venue-default' });
  });
});

describe('Highland Brewing Company', () => {
  const result = fixtureFor('Highland Brewing Company');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps taproom, meadow, event center, volleyball courts, the disc golf course and an unplaced release to the brewery', () => {
    expect(result.records).toHaveLength(13);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Highland Brewing Company', lat: 35.571844, lng: -82.49902 });
    }
    expect(byTitle('Cirque Du Disque')).toBeDefined();
    expect(byTitle('Cold Mountain 30th')).toBeDefined();
  });

  it('includes evening volleyball and league nights as sports (James, 2026-10-08)', () => {
    expect(byTitle('VB Pick-up')).toMatchObject({ category: 'sports', startsAtIso: '2026-10-09T16:00:00.000Z', endsAtIso: '2026-10-10T02:00:00.000Z' });
    expect(byTitle('VB HBC League')).toMatchObject({ category: 'sports' });
    expect(byTitle('Cornhole League')).toMatchObject({ category: 'sports' });
    expect(byTitle('Displace')).toMatchObject({ category: 'music' });
    expect(byTitle('Love for Locals')).toMatchObject({ category: 'community' });
  });

  it('keeps brewery listings on the bar default when none says all ages', () => {
    for (const record of result.records) expect(record).toMatchObject({ rating: 'mature', ratingBasis: 'venue-default' });
  });
});

describe('River Arts District', () => {
  const result = fixtureFor('River Arts District');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('registers as an aggregator and maps studios, including Fairview, to county civic points', () => {
    expect(result.records).toHaveLength(7);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.sourceKind).toBe('aggregator');
    }
    expect(byTitle('Hot Shop')).toMatchObject({ venue: 'North Carolina Glass Center', lat: 35.586023, lng: -82.565937 });
    expect(byTitle('Marvelous Monday')).toMatchObject({ venue: '310 ART at Re Imagine Studio', locality: 'Fairview' });
  });

  it('keeps an exhibit already running and leaves Mars Hill and a listing with no venue unmapped', () => {
    expect(byTitle('Drift, In and Out')).toMatchObject({ venue: 'Table Asheville', startsAtIso: '2026-08-12T20:00:00.000Z' });
    expect(result.skipped).toEqual({ 'missing location': 1, 'unmapped venue': 1 });
    expect(result.unmapped).toEqual({ 'Mars Landing Gallery & Art Center': 1 });
  });

  it('rates the undraped life-drawing session mature and the clothed one general', () => {
    expect(byTitle('Life Drawing 2nd Tuesdays')).toMatchObject({ rating: 'mature', ratingBasis: 'signal' });
    expect(byTitle('Life Drawing 1st Tuesdays')).toMatchObject({ rating: 'general' });
  });
});

describe('Asheville Yards', () => {
  const result = fixtureFor('Asheville Yards');

  it('keeps the running mini golf pop-up and the ice rink that ends after the window', () => {
    expect(result.records.map((record) => [record.title, record.startsAtIso])).toEqual([
      ['Mini Golf Pop Up', '2026-10-01T04:00:00.000Z'],
      ['Jamie Ager Rally featuring Members of the Steep Canyon Rangers!', '2026-10-13T22:00:00.000Z'],
      ['Holiday Ice Rink', '2026-11-20T05:00:00.000Z'],
    ]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Asheville Yards', lat: 35.592071, lng: -82.555379, rating: 'general' });
    }
  });
});

describe('Story Parlor', () => {
  const result = fixtureFor('Story Parlor');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('maps every spelling of the parlor’s address and leaves the Mars Hill show unmapped', () => {
    expect(result.records).toHaveLength(5);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.venue).toBe('Story Parlor');
      // The county civic point (Squarespace's pin is only in the disallowed ICS).
      expect(record.lat).toBeCloseTo(35.579196, 3);
      expect(record.lng).toBeCloseTo(-82.574715, 3);
    }
    expect(result.unmapped).toEqual({ 'Mars Landing Arts Center': 1 });
  });

  it('rates the 18+ mindreading show mature from the listing’s own text', () => {
    expect(byTitle('Asheville Mindreading Show').rating).toBe('mature');
    expect(byTitle('An Evening of Classical Guitar').rating).toBe('general');
  });
});

describe('Jack of the Wood', () => {
  const result = fixtureFor('Jack of the Wood');

  it('places location-less sessions at the pub, on the bar default, and skips the Thanksgiving closure', () => {
    expect(result.records).toHaveLength(5);
    expect(result.skipped).toEqual({ 'closure notice': 1 });
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Jack of the Wood', lat: 35.594359, lng: -82.555767, rating: 'mature' });
    }
  });
});

describe('The North Carolina Arboretum', () => {
  const result = fixtureFor('The North Carolina Arboretum');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('places on-site listings, its named buildings and a running exhibit at the Arboretum’s civic point', () => {
    expect(result.records).toHaveLength(8);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'The North Carolina Arboretum', lat: 35.501732, lng: -82.598905 });
    }
    expect(byTitle('Wolves')).toMatchObject({ startsAtIso: '2026-09-26T04:00:00.000Z' });
    expect(byTitle('Seeing Light')).toBeDefined();
  });

  // The trip goes where its title says, never to the campus. Lake Junaluska
  // is in Haywood County, outside the Asheville service region, and is not
  // registered: it stays on the unmapped worklist (James, 2026-10-08).
  it('keeps the Lake Junaluska birding trip off the campus and keeps the field class that meets at the Arboretum', () => {
    expect(result.skipped).toEqual({ 'unmapped venue': 1 });
    expect(result.unmapped).toEqual({ 'Lake Junaluska': 1 });
    expect(byTitle('Birding at Lake Junaluska')).toBeUndefined();
    expect(byTitle('River Systems Field Class')).toBeDefined();
  });

  it('rates the 21-and-older tasting mature from its own text', () => {
    expect(byTitle('The Botanical Series')).toMatchObject({ rating: 'mature', ratingBasis: 'signal' });
    expect(byTitle('Guided Trail Walk').rating).toBe('general');
  });
});

describe('Well Played Board Game Café', () => {
  const result = fixtureFor('Well Played Board Game Café');

  it('places game nights at the café’s civic point as games, family D&D as family', () => {
    expect(result.records).toHaveLength(6);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Well Played Board Game Café', category: 'games', lat: 35.588752, lng: -82.554402 });
    }
    expect(result.records.find((record) => record.title.startsWith('Family Friendly Dungeons')).rating).toBe('family');
  });
});

describe('French Broad River Brewery', () => {
  const result = fixtureFor('French Broad River Brewery');
  const byTitle = (title) => result.records.find((record) => record.title.startsWith(title));

  it('places location-less shows at the brewery and drops the 2018 show', () => {
    expect(result.records).toHaveLength(5);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record.venue).toBe('French Broad River Brewery');
    }
  });

  it('shows the brewery’s All Ages shows to everyone and keeps the rest on the bar default', () => {
    expect(byTitle('AVL Blues Women')).toMatchObject({ rating: 'general', ratingBasis: 'all-ages' });
    expect(byTitle('Jerry')).toMatchObject({ rating: 'mature', ratingBasis: 'venue-default' });
  });
});

describe('DSSOLVR', () => {
  const result = fixtureFor('DSSOLVR');

  it('maps both Asheville rooms to the brewery and leaves every Durham listing unmapped', () => {
    expect(result.records.map((record) => record.venue)).toEqual(['DSSOLVR', 'DSSOLVR', 'DSSOLVR']);
    for (const record of result.records) expect(validateRecord(record).ok).toBe(true);
    expect(result.skipped).toEqual({ 'unmapped venue': 2, 'missing location': 1 });
    expect(result.unmapped).toEqual({ 'DSSOLVR Durham': 2 });
  });
});

describe('Little Jumbo', () => {
  const result = fixtureFor('Little Jumbo');

  it('maps the bar’s own location string to its civic point and keeps the bar default', () => {
    expect(result.records).toHaveLength(4);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Little Jumbo', rating: 'mature' });
    }
  });
});

describe('Holy Trinity Greek Orthodox Church', () => {
  const result = fixtureFor('Holy Trinity Greek Orthodox Church');
  const titles = new Set(result.records.map((record) => record.title));

  it('expands weekly services at the church, with or without a LOCATION', () => {
    expect(result.skipped).toEqual({});
    expect([...titles].sort()).toEqual(['Bible Study', 'Byzantine Chant Practice', 'Divine Liturgy', 'Liturgy', 'Paraklesis to the Virgin Mary']);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Holy Trinity Greek Orthodox Church', category: 'community', lat: 35.604834, lng: -82.563148 });
    }
  });
});

describe('Asheville JCC', () => {
  const result = fixtureFor('Asheville JCC');
  const titles = result.records.map((record) => record.title);

  // James, 2026-10-08 (reevaluated): a JCC program with no location is at the
  // JCC, where a local would go.
  it('places its own programs at the JCC’s civic point without the plugin’s page chrome', () => {
    expect(titles).toEqual(['Morning Meditation', 'Brunch B’Yachad', 'Mountain Music', 'The Jew in the Folk Muse', 'Antisemitism Today with Rachel Fish']);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Asheville JCC', locality: 'Asheville', rating: 'general' });
      expect(record.description).not.toMatch(/^@|Add to calendar/);
    }
  });

  it('skips the Zoom Shabbat, the sponsored film festival and closures instead of placing them at the JCC', () => {
    expect(result.skipped).toEqual({ 'online event': 1, 'missing location': 2, 'closure notice': 2 });
  });
});

// James, 2026-10-08: register the venues behind Live Music Asheville's and the
// Laurel's unmapped listings from each venue's own published address, with
// Buncombe County's civic point for that address.
describe('venues registered from their own published addresses', () => {
  const venues = require('../../../data/venues.json');
  const { resolveVenue } = require('../calendar-record');
  const { serviceRegionForLocation } = require('../service-regions');
  const lma = feeds.find((feed) => feed.id === 'live-music-asheville');
  const venueFor = (location) => resolveVenue({ location, title: 'Show' }, lma, venues).venue;

  it.each([
    ['Off the Wagon', 'Off the Wagon', 'Asheville'],
    ['The Bush Farmhouse Black Mountain', 'The Bush Farmhouse', 'Black Mountain'],
    ['5 Walnut Wine Bar', '5 Walnut Wine Bar', 'Asheville'],
    ['Battery Park Book Exchange & Champagne Bar', 'Battery Park Book Exchange & Champagne Bar', 'Asheville'],
    ['Zillicoah Beer Company', 'Zillicoah Beer Company', 'Woodfin'],
    ['The Joint Next Door Fairview', null, null],
    ['Banks Ave', 'Banks Ave Bar', 'Asheville'],
    ['Wortham Center for the Performing Arts', 'Diana Wortham Theatre', 'Asheville'],
    ['Warren Wilson College Swannanoa', 'Warren Wilson College', 'Swannanoa'],
    ['Doc Brown’s BBQ Candler', "Doc Brown's BBQ", 'Candler'],
  ])('maps %s', (label, name, locality) => {
    const venue = venueFor(label);
    if (!name) { expect(venue).toBeNull(); return; }
    expect(venue).toMatchObject({ name, locality, region: 'NC' });
    expect(serviceRegionForLocation({ ...venue, countryCode: 'US' })?.id).toBe('asheville');
  });

  it('marks the venues that state a 21-and-over door as such', () => {
    for (const name of ['Off the Wagon', 'Liondog Lounge']) {
      expect(venues.find((venue) => venue.name === name)).toMatchObject({ allAges: false, legalAgeEnforced: true });
    }
  });
});

describe("Gamers' Haunt", () => {
  const all = ["Gamers' Haunt MTG Events", "Gamers' Haunt Other TCG Events", "Gamers' Haunt War Gaming"].map(fixtureFor);
  const [mtg, tcg, war] = all;

  it('expands the weekly game nights at the store’s civic point, filed under games', () => {
    for (const result of all) {
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.skipped).toEqual({});
      for (const record of result.records) {
        expect(validateRecord(record).ok).toBe(true);
        expect(record).toMatchObject({ venue: "Gamers' Haunt", category: 'games', rating: 'general', lat: 35.593836, lng: -82.559025 });
      }
    }
    expect(mtg.records.filter((record) => record.title === 'FNM: Commander').length).toBeGreaterThan(5);
    expect(new Set(tcg.records.map((record) => record.title))).toContain('Star Wars Unlimited');
    expect(war.records.map((record) => record.title)).toContain('Mini Mondays');
  });

  // The store moved to 167 Patton Ave in July 2026; two qualifiers still name
  // the old Merrimon Ave address. A player goes to the store.
  it('maps the qualifiers still listed at the old address to the store, for this feed only', () => {
    expect(mtg.records.filter((record) => /Qualifier/.test(record.title)).map((record) => record.venue))
      .toEqual(["Gamers' Haunt", "Gamers' Haunt"]);
  });
});

// James, 2026-10-08: tailgate markets and the Haunted Trail publish a standing
// schedule but no feed; each run re-reads the page's own words.
describe('published standing schedules', () => {
  it('lists the West Asheville Tailgate Market every Tuesday at its civic point', () => {
    const result = fixtureFor('West Asheville Tailgate Market');
    expect(result.skipped).toEqual({});
    expect(result.records).toHaveLength(8);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      // A market for everyone: rated general, so it shows in the default feed.
      expect(record).toMatchObject({ venue: 'West Asheville Tailgate Market', category: 'food', rating: 'general', lat: 35.577189, lng: -82.592345 });
      expect(new Date(record.startsAtIso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' }))
        .toBe('Tuesday 3:30 PM');
    }
  });

  it('lists the Haunted Trail’s ten published October nights at the Adventure Center', () => {
    const result = fixtureFor('The Haunted Trail at the Adventure Center');
    expect(result.records.map((record) => new Date(record.startsAtIso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))).toEqual([
      '2026-10-09', '2026-10-10', '2026-10-16', '2026-10-17', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-29', '2026-10-30',
    ]);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'The Adventure Center of Asheville', category: 'outdoors', rating: 'general', lat: 35.593313, lng: -82.582794 });
    }
  });
});

// Phase B: schema.org Event data on DICE, SimpleTix and Ticket Tailor pages.
describe('schema.org event pages', () => {
  it('reads Eulogy’s 30 DICE shows at the bar, mature by default, and caps the horizon at the last listed show', () => {
    const result = fixtureFor('Eulogy');
    expect(result.records).toHaveLength(30);
    expect(result.diagnostics).toEqual({ 'export limit reached': 1 });
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Eulogy', lat: 35.588358, lng: -82.553913, rating: 'mature', ratingBasis: 'venue-default' });
    }
  });

  it('keeps the museum’s own programs at 283 Victoria Road and its walks elsewhere on the worklist', () => {
    const result = fixtureFor('Asheville Museum of History');
    expect(result.records.map((record) => record.venue)).toEqual(['Asheville Museum of History', 'Asheville Museum of History']);
    expect(Object.keys(result.unmapped).sort()).toEqual(['Cataloochee Valley', 'Downtown Asheville', 'Point Lookout Greenway (Ridgecrest/Black Mountain)', 'Reuter Center - UNCA/OLLI']);
  });

  it('places Black Mountain College Museum performances at the museum and campus tours at Camp Rockmont', () => {
    const result = fixtureFor('Black Mountain College Museum + Arts Center');
    expect(result.skipped).toEqual({});
    expect(result.records.map((record) => record.venue)).toEqual([
      'Black Mountain College Museum + Arts Center', 'Camp Rockmont', 'Black Mountain College Museum + Arts Center', 'Camp Rockmont',
    ]);
  });

  it('places chamber concerts at the church each names, leaving the season subscription unmapped', () => {
    const result = fixtureFor('Asheville Chamber Music Series');
    expect(result.records.map((record) => [record.title, record.venue])).toEqual([
      ['Pre-concert discussion of the evening’s program with Andrea Adamcova', 'West Asheville Baptist Church'],
      ['Fauré Quartet', 'West Asheville Baptist Church'],
    ]);
    expect(result.unmapped).toEqual({ 'Various Locations': 1 });
  });
});

// Phase B: a venue calendar written into its page as a FullCalendar literal.
describe('venue calendar literals', () => {
  it('lists White Horse Black Mountain’s shows as all-ages and skips the private booking and the members’ shows', () => {
    const result = fixtureFor('White Horse Black Mountain');
    expect(result.records).toHaveLength(68);
    expect(result.skipped).toEqual({ 'restricted or room-booking listing': 3 });
    const titles = result.records.map((record) => record.title);
    for (const title of ['Private Event', 'Nanseera', 'Macon Music Revue - Members Show']) expect(titles).not.toContain(title);
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      // The venue's ticket policy: children of all ages are welcome unless a listing says otherwise.
      expect(record).toMatchObject({ venue: 'White Horse Black Mountain', lat: 35.617887, lng: -82.321319, rating: 'general' });
    }
    expect(result.records.find((record) => record.title === 'Macon Music Revue')).toMatchObject({
      startsAtIso: '2026-10-09T23:30:00.000Z', sourceUrl: 'https://whitehorseblackmountain.org/product/macon-music-revue/',
    });
  });
});

// Phase B: event pages that label their facts (DATE, VENUE, EVENT TIME(S)).
describe('labeled event pages', () => {
  it('lists Harrah’s Cherokee Center events at the auditorium or the center’s rooms, reporting pages with no stated time', () => {
    const result = fixtureFor('Harrah\'s Cherokee Center – Asheville');
    expect(result.skipped).toEqual({});
    expect(result.diagnostics).toEqual({ 'missing event time': 6 });
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(['Thomas Wolfe Auditorium', 'Harrah\'s Cherokee Center Asheville']).toContain(record.venue);
      expect(record).toMatchObject({ lat: 35.597478, lng: -82.555293 });
    }
    const volleyball = result.records.find((record) => record.title === 'Indoor Volleyball: Open Play');
    expect(volleyball).toMatchObject({ venue: 'Harrah\'s Cherokee Center Asheville', category: 'sports', startsAtIso: '2026-10-22T21:00:00.000Z' });
    expect(volleyball.description).toMatch(/^Where: ExploreAsheville\.com Arena\. /);
    expect(result.records.find((record) => record.title.startsWith('Canceled: Thundercat'))).toMatchObject({ isCancelled: true });
    expect(result.records.find((record) => record.title === 'Beck: Ride Lonesome Tour')).toMatchObject({
      venue: 'Thomas Wolfe Auditorium', category: 'music', startsAtIso: '2026-10-29T00:00:00.000Z',
    });
  });
});

// Phase B: the Biltmore estate's own event API.
describe('Biltmore', () => {
  it('lists dated, timed events at the estate gate, naming the place on the estate', () => {
    const result = fixtureFor('Biltmore');
    expect(result.skipped).toEqual({ 'restricted or room-booking listing': 1 });
    expect(result.diagnostics).toEqual({ 'missing event date': 2, 'missing event time': 4 });
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Biltmore Estate', lat: 35.560657, lng: -82.55345 });
    }
    const titles = new Set(result.records.map((record) => record.title));
    expect([...titles].sort()).toEqual(['Antler Hill Village Illumination', 'Biltmore Employee Craft Fair', 'Live Music at the Bandstand']);
    expect(result.records.find((record) => record.title === 'Biltmore Employee Craft Fair')).toMatchObject({
      category: 'sales', startsAtIso: '2026-10-22T15:00:00.000Z', endsAtIso: '2026-10-22T21:00:00.000Z',
    });
    expect(result.records.find((record) => record.title === 'Live Music at the Bandstand').description).toMatch(/^Included with admission/);
  });
});

// Phase B: Revival's Webflow show cards.
describe('Revival', () => {
  it('lists the show cards at Revival as a bar, with the weekday fixing the year', () => {
    const result = fixtureFor('Revival');
    expect(result.records).toHaveLength(24);
    expect(result.skipped).toEqual({});
    for (const record of result.records) {
      expect(validateRecord(record).ok).toBe(true);
      expect(record).toMatchObject({ venue: 'Revival', rating: 'mature', category: 'music' });
      expect(record.description).not.toMatch(/lorem/i);
    }
    expect(result.records[0]).toMatchObject({ title: 'Improvement Movement - Your Perfect Real LIVE \'26', startsAtIso: '2026-10-09T00:00:00.000Z' });
  });
});
