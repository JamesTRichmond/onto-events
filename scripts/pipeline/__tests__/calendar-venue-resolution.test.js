const { createIcsAdapter } = require('../adapters/ics');
const { processSourceItems } = require('../run-source');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const saturday = feeds.find((feed) => feed.id === 'slc-track-club-saturday-runs');
const now = Date.parse('2026-09-11T00:00:00Z');

// Exercise ICS unescaping, venue resolution and record validation together.
function ingest({ location = '', description = '', venueHint = null, venueAliases, offSiteTitles, campusRooms, summary = 'Saturday group run' } = {}) {
  const escape = (value) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, '\\$&');
  const options = { ...(venueAliases ? { venueAliases } : {}), ...(offSiteTitles ? { offSiteTitles } : {}), ...(campusRooms ? { campusRooms } : {}) };
  const adapter = createIcsAdapter({ ...saturday, venueHint, ...options }, venues);
  const snapshot = adapter.parseFixture([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:venue-regression',
    'DTSTART;TZID=America/Denver:20260912T073000', `SUMMARY:${escape(summary)}`,
    `LOCATION:${escape(location)}`, `DESCRIPTION:${escape(description)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\n'), { now });
  return processSourceItems(adapter, snapshot, { now, overrides: {} });
}

it.each([
  ['an unknown explicit venue', 'Uncurated retreat center', ''],
  ['an unknown explicit venue despite a known description', 'Uncurated retreat center', 'Meet at Liberty Park at 7:30'],
  ['an online location', 'Virtual', 'Meet at Liberty Park at 7:30'],
  ['a video meeting URL', 'https://zoom.us/j/123', 'Meet at Liberty Park at 7:30'],
  ['a map link without a named meeting place', 'https://maps.app.goo.gl/example', 'Bring water'],
  ['an unknown described meeting place', '', 'Meet at Uncurated retreat center at 7:30'],
])('does not invent a default-venue event for %s', (_, location, description) => {
  const result = ingest({ location, description, venueHint: 'Salt Lake Buddhist Temple' });
  expect(result.records).toEqual([]);
  expect(result.skipped).toEqual({ 'unmapped venue': 1 });
});

it('keeps an explicit curated address authoritative over a description and default', () => {
  const result = ingest({
    location: '2600 Sunnyside Ave S, Salt Lake City, UT 84108, USA',
    description: 'Meet at Liberty Park at 7:30', venueHint: 'Salt Lake Buddhist Temple',
  });
  expect(result.records.map((record) => record.venue)).toEqual(["Utah's Hogle Zoo"]);
});

it('uses the curated default only when the event has no location evidence', () => {
  const result = ingest({ description: 'Bring water', venueHint: 'Salt Lake Buddhist Temple' });
  expect(result.records.map((record) => record.venue)).toEqual(['Salt Lake Buddhist Temple']);
});

it.each([
  ['a plain line break', 'Meet at the Historic Sandy TRAX station\nBring water', 'Historic Sandy TRAX Station'],
  ['an HTML line break', 'Meet at the Historic Sandy TRAX station<br />Bring water', 'Historic Sandy TRAX Station'],
  ['HTML paragraphs', '<p>Meet at the Historic Sandy TRAX station</p><p>Bring water</p>', 'Historic Sandy TRAX Station'],
  ['a named entity', 'Meet at the SLCC South City Campus Center for Arts &amp; Media at 7:00', 'SLCC South City Campus Center for Arts & Media'],
  ['a numeric entity', 'Meet at the SLCC South City Campus Center for Arts &#38; Media at 7:00', 'SLCC South City Campus Center for Arts & Media'],
  ['a venue named The', 'Meet at The Murray Theater at 7:00', 'The Murray Theater'],
  ['an article before a venue named The', 'Meet at the The Murray Theater at 7:00', 'The Murray Theater'],
  ['an abbreviated venue name', 'Meet at the J. Willard Marriott Library at 7:00', 'J. Willard Marriott Library'],
])('imports the exact curated venue from %s', (_, description, expectedVenue) => {
  const result = ingest({ description });
  expect(result.records.map((record) => record.venue)).toEqual([expectedVenue]);
  expect(result.rejectedCount).toBe(0);
  expect(result.skipped).toEqual({});
});

it('resolves a named meeting place alongside a map link without guessing its coordinates', () => {
  const result = ingest({
    location: 'https://maps.app.goo.gl/example',
    description: 'Meet at the Historic Sandy TRAX station at 7:30 to carpool',
  });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]).toMatchObject({ venue: 'Historic Sandy TRAX Station', lat: 40.58968, lng: -111.88567 });
});

it('does not match a venue name that is only a substring of the meeting place', () => {
  const result = ingest({ description: 'Meet at Liberty Park annex at 7:30' });
  expect(result.records).toEqual([]);
  expect(result.skipped).toEqual({ 'unmapped venue': 1 });
});

it.each([
  ['Meet at Liberty Park. Bring water', 'Liberty Park'],
  ['Meet at the J. Willard Marriott Library. Bring water', 'J. Willard Marriott Library'],
  ['Meet at Liberty Park. Snacks &bogus;', 'Liberty Park'],
  ['Meet at Liberty Park; Snacks &bogus;', 'Liberty Park'],
  ['Meet at Liberty Park! Snacks &bogus;', 'Liberty Park'],
  ['Meet at Liberty Park? Snacks &bogus;', 'Liberty Park'],
  ['Meet at the J. Willard Marriott Library. Snacks &bogus;', 'J. Willard Marriott Library'],
  ['Meet at Liberty Park at 7:30\nSnacks &bogus;', 'Liberty Park'],
  ['Meet at Liberty Park at 7:30. Snacks &bogus;', 'Liberty Park'],
])('limits location parsing to the meeting clause: %s', (description, expectedVenue) => {
  const result = ingest({ description });
  expect(result.records.map((record) => record.venue)).toEqual([expectedVenue]);
});

it('does not parse unrelated description entities when using a default venue', () => {
  const result = ingest({ description: 'Snacks &bogus;', venueHint: 'Liberty Park' });
  expect(result.records.map((record) => record.venue)).toEqual(['Liberty Park']);
});

it.each(['Meet at 7:30 am', 'Meet at 7 AM', 'Meeting at 07:30', 'Meet at noon', 'Meet at 7:30 to carpool',
  'Meet at 7:30 am. Bring water', 'Meet at noon. Bring water'])(
  'uses the default venue when the meeting phrase supplies only a time: %s', (description) => {
    const result = ingest({ description, venueHint: 'Salt Lake Buddhist Temple' });
    expect(result.records.map((record) => record.venue)).toEqual(['Salt Lake Buddhist Temple']);
  },
);

it('uses a named meeting point after a separate time-only sentence', () => {
  const result = ingest({
    description: 'Meet at 7:30 am. Meet at Liberty Park.', venueHint: 'Salt Lake Buddhist Temple',
  });
  expect(result.records.map((record) => record.venue)).toEqual(['Liberty Park']);
});

// The skip report is the alias worklist for step 17: a lost venue name must be
// recorded verbatim, and a URL or online placeholder must never enter it.
it('records an unresolved venue name in the skip report', () => {
  const result = ingest({ location: 'Uncurated retreat center', venueHint: 'Salt Lake Buddhist Temple' });
  expect(result.unmapped).toEqual({ 'Uncurated retreat center': 1 });
});

it('records an unresolved meeting place from a description', () => {
  const result = ingest({ description: 'Meet at Liberty Park annex at 7:30' });
  expect(result.unmapped).toEqual({ 'Liberty Park annex': 1 });
});

it.each([
  ['an online location', 'Virtual'],
  ['a video meeting URL', 'https://zoom.us/j/123'],
  ['a map link', 'https://maps.app.goo.gl/example'],
])('keeps %s out of the skip report', (_, location) => {
  const result = ingest({ location, description: 'Bring water', venueHint: 'Salt Lake Buddhist Temple' });
  expect(result.skipped).toEqual({ 'unmapped venue': 1 });
  expect(result.unmapped).toEqual({});
});

it('leaves the skip report empty when every venue resolves', () => {
  const result = ingest({ description: 'Meet at the Historic Sandy TRAX station at 7:00' });
  expect(result.records).toHaveLength(1);
  expect(result.unmapped).toEqual({});
});

it('maps a feed-scoped venue alias only for the feed that names it', () => {
  const venueAliases = { 'Taproom Stage': 'Liberty Park' };
  expect(ingest({ location: 'Taproom Stage', venueAliases }).records.map((record) => record.venue)).toEqual(['Liberty Park']);
  expect(ingest({ location: 'taproom stage', venueAliases }).records.map((record) => record.venue)).toEqual(['Liberty Park']);
  const elsewhere = ingest({ location: 'Taproom Stage' });
  expect(elsewhere.records).toEqual([]);
  expect(elsewhere.unmapped).toEqual({ 'Taproom Stage': 1 });
});

it.each(['CLOSED for THANKSGIVING', 'Closed: Labor Day', 'Closed today', '*CLOSED*', 'Closed'])(
  'skips a closure notice: %s', (summary) => {
    const result = ingest({ summary, venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'closure notice': 1 });
  },
);

it.each(['Closed Captioned Screening', 'Closed Door Session', 'Doors closed at nine'])(
  'keeps a listing that only mentions closing: %s', (summary) => {
    expect(ingest({ summary, venueHint: 'Liberty Park' }).records).toHaveLength(1);
  },
);

describe('a campus feed that also runs off-site trips (offSiteTitles)', () => {
  const venueOf = (options) => ingest({ venueHint: 'Liberty Park', offSiteTitles: true, ...options });

  it('places a trip at the place its title names, never at the campus', () => {
    expect(venueOf({ summary: 'Birding at Sugar House Park', description: 'Let’s go walk around the pond.' })
      .records.map((record) => record.venue)).toEqual(['Sugar House Park']);
    const result = venueOf({ summary: 'Birding at Lake Junaluska', description: 'Let’s go walk around Lake Junaluska.' });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'unmapped venue': 1 });
    expect(result.unmapped).toEqual({ 'Lake Junaluska': 1 });
  });

  it('keeps a title that names the feed’s own venue, a time, or no place at all', () => {
    for (const summary of ['Photography at the Liberty Park', 'Guided Walk at Noon', 'Fall Tree ID']) {
      expect(venueOf({ summary }).records.map((record) => record.venue)).toEqual(['Liberty Park']);
    }
  });

  it('places a trip at its stated meeting point, a feed alias included', () => {
    expect(venueOf({ summary: 'Hike at Max Patch', description: 'Meet at Sugar House Park at 7:30.' }).records.map((record) => record.venue))
      .toEqual(['Sugar House Park']);
    const venueAliases = { 'Visitor Center': 'Liberty Park' };
    expect(venueOf({ summary: 'River Field Class', venueAliases, description: 'We will meet at the Visitor Center and return to the Visitor Center. Bring water.' })
      .records.map((record) => record.venue)).toEqual(['Liberty Park']);
  });

  it('leaves feeds without the option on the venue hint', () => {
    expect(ingest({ summary: 'Birding at Lake Junaluska', venueHint: 'Liberty Park' }).records.map((record) => record.venue)).toEqual(['Liberty Park']);
  });
});

it.each(['Funeral for A. Member', 'Visitation for A. Member', 'Memorial Service for A. Member', 'Wedding of A. and B. Member', 'Baptism of C. Member'])(
  'skips a personal ceremony for named people: %s', (summary) => {
    const result = ingest({ summary, venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'personal ceremony': 1 });
  },
);

it.each(['Baptism of the Lord', 'Memorial Day Parade', 'Wedding Expo', 'Liturgy with Memorials'])(
  'keeps a public listing that only mentions a ceremony: %s', (summary) => {
    expect(ingest({ summary, venueHint: 'Liberty Park' }).records).toHaveLength(1);
  },
);

// James, 2026-10-08 (reevaluated): a place a typical local could find on their
// own or with a phone map is enough; an exact meeting point is not required.
describe('a place a local could find', () => {
  const venueOf = (options) => ingest(options).records.map((record) => record.venue);

  it.each(['Meet at the trailhead.', 'Meet at the main parking lot at 7:30.', 'Meet at the front entrance. Bring water'])(
    'reads a bare spot as the listing’s own place: %s', (description) => {
      expect(venueOf({ description, venueHint: 'Liberty Park' })).toEqual(['Liberty Park']);
      expect(venueOf({ summary: 'Hike at Sugar House Park', description, venueHint: 'Liberty Park' })).toEqual(['Sugar House Park']);
      expect(venueOf({ summary: 'Hike at Uncurated Ridge', description, venueHint: 'Liberty Park' })).toEqual([]);
    },
  );

  it.each([
    ['Meet at the Sugar House Park parking lot.', 'Sugar House Park'],
    ['Meet at the parking lot at Sugar House Park at 7:30.', 'Sugar House Park'],
    ['Meet at Sugar House Park’s north entrance.', 'Sugar House Park'],
  ])('reads a spot at a named place as that place: %s', (description, expected) => {
    expect(venueOf({ description, venueHint: 'Salt Lake Buddhist Temple' })).toEqual([expected]);
  });

  it('keeps an unknown named place unmapped instead of falling back to the hint', () => {
    const result = ingest({ description: 'Meet at the Uncurated Ridge trailhead.', venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.unmapped).toEqual({ 'the Uncurated Ridge trailhead': 1 });
  });

  it.each(['UT', 'Utah', 'Salt Lake City, UT', 'Salt Lake City, Utah 84105', 'Front Lobby'])(
    'reads a location that names only the venue’s own town or a spot there as the venue: %s', (location) => {
      expect(venueOf({ location, venueHint: 'Liberty Park' })).toEqual(['Liberty Park']);
    },
  );

  it('does not take the hint for another town', () => {
    const result = ingest({ location: 'Ogden, UT', venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.unmapped).toEqual({ 'Ogden, UT': 1 });
  });

  it.each([
    ['Where: Sugar House Park\nDifficulty: easy', 'Sugar House Park'],
    ['Time: 6:00 P.M. Location: Salt Lake City, UT', 'Liberty Park'],
    ['Where: Sugar House Park Distance: 2 miles', 'Sugar House Park'],
    ['Meeting point: the parking lot. Bring water', 'Liberty Park'],
  ])('reads a labeled place in the text: %s', (description, expected) => {
    expect(venueOf({ description, venueHint: 'Liberty Park' })).toEqual([expected]);
  });

  it('skips a labeled place in another town instead of taking the hint', () => {
    const result = ingest({ description: 'Time: 6:00 P.M. Location: Charlotte, NC', venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.unmapped).toEqual({ 'Charlotte, NC': 1 });
  });

  it('only reports an unrecognized labeled place, keeping the feed’s own venue', () => {
    expect(venueOf({ description: 'Location: Room 204', venueHint: 'Liberty Park' })).toEqual(['Liberty Park']);
    const result = ingest({ description: 'Where: Uncurated Ridge' });
    expect(result.skipped).toEqual({ 'unmapped venue': 1 });
    expect(result.unmapped).toEqual({ 'Uncurated Ridge': 1 });
  });

  it.each([
    ['Welcome Shabbat Sha-Zoom', 'A celebration for the community.'],
    ['Book Club (Virtual)', 'Discuss the month’s pick.'],
    ['Book Club', 'The club meets on Zoom for the month’s pick.'],
    ['Shabbat', 'A virtual celebration that gathers online every month.'],
  ])('skips an online listing instead of placing it at the hint: %s', (summary, description) => {
    const result = ingest({ summary, description, venueHint: 'Liberty Park' });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'online event': 1 });
  });

  it.each([
    ['Virtual Reality Night', 'Try a headset.'],
    ['Online Safety Workshop', 'Learn to spot scams.'],
    ['Book Club', 'Meets in person, with a Zoom link for those at home. Hybrid.'],
    // First Unitarian Church of Salt Lake City's Sunday services.
    ['Sunday Service 9am', 'Service will be live-streamed on Zoom: See front page of the website for the zoom link'],
    ['Book Club', 'Join us at the library, or join on Zoom.'],
  ])('keeps an in-person listing that mentions the internet: %s', (summary, description) => {
    expect(venueOf({ summary, description, venueHint: 'Liberty Park' })).toEqual(['Liberty Park']);
  });

  it('does not place a sponsored event at the sponsor', () => {
    const result = ingest({
      summary: 'Jewish Film Festival', venueHint: 'Liberty Park',
      description: 'The JCC is pleased to be a sponsor of this year’s Jewish Film Festival.',
    });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'missing location': 1 });
  });

  it.each(['UT', 'Salt Lake City, UT', 'Front Lobby'])(
    'skips an online listing instead of reading %s as the hint', (location) => {
      const result = ingest({
        location, summary: 'Book Club (Virtual)', description: 'Discuss the month’s pick.', venueHint: 'Liberty Park',
      });
      expect(result.records).toEqual([]);
      expect(result.skipped).toEqual({ 'online event': 1 });
    },
  );

  it('keeps a different registered place even when the title says virtual', () => {
    expect(ingest({
      location: 'Sugar House Park', summary: 'Book Club (Virtual)', description: 'Discuss the pick.',
      venueHint: 'Liberty Park',
    }).records.map((record) => record.venue)).toEqual(['Sugar House Park']);
  });

  it('does not place a sponsored event at the hint when the location only names its town', () => {
    const result = ingest({
      location: 'Salt Lake City, UT', venueHint: 'Liberty Park', summary: 'Jewish Film Festival',
      description: 'The JCC is pleased to be a sponsor of this year’s Jewish Film Festival.',
    });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'missing location': 1 });
  });

  it('does not cut a labeled place at an abbreviation', () => {
    const elsewhere = ingest({ description: 'Location: St. George, UT', venueHint: 'Liberty Park' });
    expect(elsewhere.records).toEqual([]);
    expect(elsewhere.unmapped).toEqual({ 'St. George, UT': 1 });
    expect(ingest({ description: 'Where: Mt. Olympus trailhead' }).unmapped).toEqual({ 'Mt. Olympus trailhead': 1 });
  });

  it('skips a listing that says it is not in person', () => {
    const result = ingest({
      summary: 'Weekly Gathering', venueHint: 'Liberty Park',
      description: 'This is not an in-person event. The club meets on Zoom.',
    });
    expect(result.records).toEqual([]);
    expect(result.skipped).toEqual({ 'online event': 1 });
  });

  it('does not let a Zoom aside cancel an online title', () => {
    const result = ingest({
      summary: 'Book Club (Virtual)', venueHint: 'Liberty Park', description: 'Also on Zoom for those at home.',
    });
    expect(result.skipped).toEqual({ 'online event': 1 });
  });

  it('keeps an in-person listing that uses not elsewhere in the sentence', () => {
    expect(ingest({
      summary: 'Open House', venueHint: 'Liberty Park', description: 'Do not miss this in-person open house.',
    }).records).toHaveLength(1);
  });

  describe('a campus feed (campusRooms)', () => {
    const campus = (location, description = 'Come play chess.') => ingest({ location, description, venueHint: 'Liberty Park', campusRooms: true });

    it('places a room on the campus and keeps the room on the card', () => {
      const result = campus('Sage Cafe');
      expect(result.records.map((record) => record.venue)).toEqual(['Liberty Park']);
      expect(result.records[0].description).toBe('Where: Sage Cafe. Come play chess.');
      expect(campus('Sunderland, 007').records.map((record) => record.venue)).toEqual(['Liberty Park']);
      expect(campus('Sage Cafe', 'Chess Club meets in Sage Cafe every Monday.').records[0].description)
        .toBe('Chess Club meets in Sage Cafe every Monday.');
    });

    it.each(['Charlotte, NC', '129 Carrier Ave', 'Downtown Asheville', 'Black Mountain Brewing', 'Zoom', 'Online', 'Zoom Meeting'])(
      'never treats another town, a street address or an online placeholder as a room: %s', (location) => {
        expect(campus(location).records).toEqual([]);
      },
    );

    it('does not pin an online listing to the campus just because its location is a room', () => {
      const result = ingest({
        location: 'Sage Cafe', summary: 'Book Club (Virtual)', description: 'Discuss the month’s pick.',
        venueHint: 'Liberty Park', campusRooms: true,
      });
      expect(result.records).toEqual([]);
      expect(result.skipped).toEqual({ 'online event': 1 });
    });

    it('leaves feeds without the option unmapped', () => {
      expect(ingest({ location: 'Sage Cafe', venueHint: 'Liberty Park' }).records).toEqual([]);
    });
  });

  it('skips a short closure notice that names the program first', () => {
    const result = ingest({ summary: 'Shalom Closed for Teacher Trainings', venueHint: 'Liberty Park' });
    expect(result.skipped).toEqual({ 'closure notice': 1 });
  });
});
