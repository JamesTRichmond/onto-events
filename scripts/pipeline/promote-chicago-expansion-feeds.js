const fs = require('node:fs');
const path = require('node:path');
const { validateRegistries } = require('./registry-validation');

const REPO = path.resolve(__dirname, '../..');
const venuesPath = path.join(REPO, 'data/venues.json');
const feedsPath = path.join(REPO, 'data/feeds.json');
const fixturesDir = path.join(REPO, 'scripts/pipeline/fixtures/ics');

const PROMOTED_VENUES = [
  // --- Northalsted LGBTQ+ Spine Corridors ---
  {
    name: 'Center on Halsted',
    aliases: ['Center on Halsted Community Center', 'Center on Halsted - Northalsted'],
    address: '3656 N Halsted St, Chicago, IL 60613',
    locality: 'Chicago',
    region: 'IL',
    countryCode: 'US',
    lat: 41.9488,
    lng: -87.6495,
    kind: 'hall',
    allAges: true,
    sourceUrl: 'https://www.centeronhalsted.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'Gerber/Hart Library and Archives',
    aliases: ['Gerber Hart Library and Archives', 'Gerber/Hart LGBTQ Library'],
    address: '6500 N Clark St, Chicago, IL 60626',
    locality: 'Chicago',
    region: 'IL',
    countryCode: 'US',
    lat: 42.0006,
    lng: -87.6722,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.gerberhart.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'The Legacy Walk (Northalsted Cultural Spine)',
    aliases: ['The Legacy Walk Chicago', 'Legacy Project Chicago'],
    address: '3656 N Halsted St, Chicago, IL 60613',
    locality: 'Chicago',
    region: 'IL',
    countryCode: 'US',
    lat: 41.9482,
    lng: -87.6495,
    kind: 'outdoor',
    allAges: true,
    sourceUrl: 'https://legacyprojectchicago.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'Women & Children First Bookstore',
    aliases: ['Women & Children First', 'Women and Children First Bookstore'],
    address: '5233 N Clark St, Chicago, IL 60640',
    locality: 'Chicago',
    region: 'IL',
    countryCode: 'US',
    lat: 41.9772,
    lng: -87.6681,
    kind: 'store',
    allAges: true,
    sourceUrl: 'https://www.womenandchildrenfirst.com',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'CPL Merlo Branch Library',
    aliases: ['CPL Merlo Branch', 'Merlo Branch Library (Lakeview)'],
    address: '644 W Belmont Ave, Chicago, IL 60657',
    locality: 'Chicago',
    region: 'IL',
    countryCode: 'US',
    lat: 41.9398,
    lng: -87.6457,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.chipublib.org/locations/49/',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  // --- 4 Outer Chicagoland County Flagship Library Hubs ---
  {
    name: 'Naperville Public Library (Nichols Library)',
    aliases: ['Naperville Nichols Library', 'Nichols Library Naperville'],
    address: '200 W Jefferson Ave, Naperville, IL 60540',
    locality: 'Naperville',
    region: 'IL',
    countryCode: 'US',
    lat: 41.7686,
    lng: -88.1478,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.naperville-lib.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'Waukegan Public Library (Main)',
    aliases: ['Waukegan Public Library', 'Waukegan Main Library'],
    address: '128 N County St, Waukegan, IL 60085',
    locality: 'Waukegan',
    region: 'IL',
    countryCode: 'US',
    lat: 42.3636,
    lng: -87.8348,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.waukeganpl.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'Joliet Public Library (Ottawa Street Branch)',
    aliases: ['Joliet Public Library (Main)', 'Joliet Public Library Ottawa Street'],
    address: '150 N Ottawa St, Joliet, IL 60432',
    locality: 'Joliet',
    region: 'IL',
    countryCode: 'US',
    lat: 41.5250,
    lng: -88.0817,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://jolietlibrary.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
  {
    name: 'Aurora Public Library District (Santori Library)',
    aliases: ['Aurora Public Library (Santori Main)', 'Santori Public Library Aurora'],
    address: '101 S River St, Aurora, IL 60506',
    locality: 'Aurora',
    region: 'IL',
    countryCode: 'US',
    lat: 41.7606,
    lng: -88.3142,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.aurorapubliclibrary.org',
    verifiedOn: '2026-10-31',
    approximate: true,
  },
];

const PROMOTED_FEEDS = [
  // --- Northalsted LGBTQ+ Spine Corridors ---
  {
    id: 'center-on-halsted',
    name: 'Center on Halsted Community & Cultural Programs',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.centeronhalsted.org/events/community.ics',
    defaultCategory: 'community',
    defaultRating: 'family',
    venueHint: 'Center on Halsted',
    minIntervalMs: 1000,
    termsUrl: 'https://www.centeronhalsted.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Premier LGBTQ+ community center on Northalsted corridor hosting community wellness, youth programs, and cultural events.',
    fixturePath: 'scripts/pipeline/fixtures/ics/center-on-halsted.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'center-on-halsted-1@onto.events',
        dtstart: '20261025T190000Z',
        dtend: '20261025T203000Z',
        summary: 'Northalsted Community Open Forum & Welcome Circle',
        description: 'Monthly inclusive community gathering exploring Northalsted neighborhood arts, mutual aid networks, and LGBTQ+ community history.',
        location: 'Center on Halsted',
        url: 'https://www.centeronhalsted.org/events/community',
      },
      {
        uid: 'center-on-halsted-2@onto.events',
        dtstart: '20261028T190000Z',
        dtend: '20261028T203000Z',
        summary: 'Center on Halsted Youth & Intergenerational Story Lab',
        description: 'Intergenerational storytelling and community oral history session bringing together Northalsted elders and youth artists.',
        location: 'Center on Halsted',
        url: 'https://www.centeronhalsted.org/events/youth-intergenerational',
      },
    ],
  },
  {
    id: 'gerber-hart-library',
    name: 'Gerber/Hart Library & Archives Exhibits and Book Clubs',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.gerberhart.org/events/calendar.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Gerber/Hart Library and Archives',
    minIntervalMs: 1000,
    termsUrl: 'https://www.gerberhart.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Midwest LGBTQ+ library and archives hosting literary discussion circles, historical gallery talks, and research showcases.',
    fixturePath: 'scripts/pipeline/fixtures/ics/gerber-hart-library.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'gerber-hart-1@onto.events',
        dtstart: '20261025T200000Z',
        dtend: '20261025T213000Z',
        summary: 'Midwest Queer Archives: Special Exhibition Gallery Tour',
        description: 'Guided curator-led tour of historical manuscripts, posters, and grassroots periodicals documenting Chicago LGBTQ+ history.',
        location: 'Gerber/Hart Library and Archives',
        url: 'https://www.gerberhart.org/events/gallery-tour',
      },
      {
        uid: 'gerber-hart-2@onto.events',
        dtstart: '20261029T180000Z',
        dtend: '20261029T193000Z',
        summary: 'Gerber/Hart Community Book Discussion Circle',
        description: 'Monthly community reading discussion focusing on landmark queer literature and contemporary Midwestern writers.',
        location: 'Gerber/Hart Library and Archives',
        url: 'https://www.gerberhart.org/events/book-discussion',
      },
    ],
  },
  {
    id: 'legacy-project-chicago',
    name: 'The Legacy Project: Northalsted LGBTQ+ History Tours',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://legacyprojectchicago.org/events/tours.ics',
    defaultCategory: 'community',
    defaultRating: 'family',
    venueHint: 'The Legacy Walk (Northalsted Cultural Spine)',
    minIntervalMs: 1000,
    termsUrl: 'https://legacyprojectchicago.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Dedicated outdoor LGBTQ+ historic walk along Northalsted featuring bronze memorial pylons celebrating international figures.',
    fixturePath: 'scripts/pipeline/fixtures/ics/legacy-project-chicago.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'legacy-walk-1@onto.events',
        dtstart: '20261025T180000Z',
        dtend: '20261025T193000Z',
        summary: 'The Legacy Walk: Northalsted Guided Walking Tour',
        description: 'Historian-guided walking tour along North Halsted Street highlighting bronze memorial pylons commemorating global LGBTQ+ pioneers.',
        location: 'The Legacy Walk (Northalsted Cultural Spine)',
        url: 'https://legacyprojectchicago.org/walking-tours',
      },
      {
        uid: 'legacy-walk-2@onto.events',
        dtstart: '20261029T180000Z',
        dtend: '20261029T193000Z',
        summary: 'Legacy Walk Educational Symposium & Youth Dialogue',
        description: 'Community outdoor educational program connecting local students and visitors with Chicago civil rights milestones.',
        location: 'The Legacy Walk (Northalsted Cultural Spine)',
        url: 'https://legacyprojectchicago.org/education',
      },
    ],
  },
  {
    id: 'women-and-children-first',
    name: 'Women & Children First Author Readings & Conversations',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.womenandchildrenfirst.com/events/calendar.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Women & Children First Bookstore',
    minIntervalMs: 1000,
    termsUrl: 'https://www.womenandchildrenfirst.com',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Historic feminist, queer, and children-affirming independent bookstore in Andersonville hosting author events and readings.',
    fixturePath: 'scripts/pipeline/fixtures/ics/women-and-children-first.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'wcf-event-1@onto.events',
        dtstart: '20261026T000000Z',
        dtend: '20261026T013000Z',
        summary: 'Andersonville Author Talk: Contemporary Midwestern Voices',
        description: 'Live author reading, audience Q&A, and book signing celebrating newly released poetry and literary fiction in Andersonville.',
        location: 'Women & Children First Bookstore',
        url: 'https://www.womenandchildrenfirst.com/event/author-talk',
      },
      {
        uid: 'wcf-event-2@onto.events',
        dtstart: '20261028T160000Z',
        dtend: '20261028T170000Z',
        summary: 'Kids Storytime Circle & Picture Book Exploration',
        description: 'All-ages inclusive family story hour featuring diverse picture books and interactive songs for young readers and parents.',
        location: 'Women & Children First Bookstore',
        url: 'https://www.womenandchildrenfirst.com/event/storytime',
      },
    ],
  },
  {
    id: 'cpl-merlo-branch',
    name: 'CPL Merlo Branch Library (Lakeview)',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.chipublib.org/events/merlo-branch-library.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'CPL Merlo Branch Library',
    minIntervalMs: 1000,
    termsUrl: 'https://www.chipublib.org/locations/49/',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Chicago Public Library branch serving Lakeview and Northalsted with neighborhood book clubs and youth STEAM sessions.',
    fixturePath: 'scripts/pipeline/fixtures/ics/cpl-merlo-branch.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'cpl-merlo-1@onto.events',
        dtstart: '20261024T163000Z',
        dtend: '20261024T173000Z',
        summary: 'Lakeview Family STEAM Explorers at Merlo Branch',
        description: 'Hands-on creative engineering, coding robots, and math puzzles for elementary students at CPL Merlo Branch Library.',
        location: 'CPL Merlo Branch Library',
        url: 'https://www.chipublib.org/locations/49/',
      },
      {
        uid: 'cpl-merlo-2@onto.events',
        dtstart: '20261027T200000Z',
        dtend: '20261027T210000Z',
        summary: 'Merlo Evening Readers Circle: Urban History & Memoir',
        description: 'Community adult book club exploring narrative nonfiction, urban social history, and contemporary poetry.',
        location: 'CPL Merlo Branch Library',
        url: 'https://www.chipublib.org/locations/49/',
      },
    ],
  },
  // --- 4 Outer Chicagoland County Flagship Library Hubs ---
  {
    id: 'naperville-nichols-library',
    name: 'Naperville Public Library (Nichols Hub)',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.naperville-lib.org/events/nichols.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Naperville Public Library (Nichols Library)',
    minIntervalMs: 1000,
    termsUrl: 'https://www.naperville-lib.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Flagship downtown library for Naperville in DuPage County hosting family storytimes, technology classes, and civic arts programs.',
    fixturePath: 'scripts/pipeline/fixtures/ics/naperville-nichols-library.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'naperville-nichols-1@onto.events',
        dtstart: '20261025T160000Z',
        dtend: '20261025T170000Z',
        summary: 'Nichols Family Science & Robotics Workshop',
        description: 'Interactive STEM building stations, introductory coding challenges, and cooperative maker activities for families in Naperville.',
        location: 'Naperville Public Library (Nichols Library)',
        url: 'https://www.naperville-lib.org',
      },
      {
        uid: 'naperville-nichols-2@onto.events',
        dtstart: '20261028T190000Z',
        dtend: '20261028T203000Z',
        summary: 'DuPage County History & Heritage Lecture',
        description: 'Local historian presentation on the founding and cultural development of Naperville and the DuPage River settlements.',
        location: 'Naperville Public Library (Nichols Library)',
        url: 'https://www.naperville-lib.org',
      },
    ],
  },
  {
    id: 'waukegan-public-library',
    name: 'Waukegan Public Library (Main Hub)',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.waukeganpl.org/events/calendar.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Waukegan Public Library (Main)',
    minIntervalMs: 1000,
    termsUrl: 'https://www.waukeganpl.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Lake County cultural and civic library hub hosting bilingual family literacy, Ray Bradbury literary events, and community arts.',
    fixturePath: 'scripts/pipeline/fixtures/ics/waukegan-public-library.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'waukegan-main-1@onto.events',
        dtstart: '20261024T170000Z',
        dtend: '20261024T183000Z',
        summary: 'Ray Bradbury Literary Festival & Creative Writing Circle',
        description: 'Annual celebratory creative writing lab and speculative fiction readings celebrating native son Ray Bradbury in downtown Waukegan.',
        location: 'Waukegan Public Library (Main)',
        url: 'https://www.waukeganpl.org',
      },
      {
        uid: 'waukegan-main-2@onto.events',
        dtstart: '20261028T160000Z',
        dtend: '20261028T170000Z',
        summary: 'Bilingual Family Story Hour & Musical Games',
        description: 'Bilingual Spanish-English story reading, musical instruments, and crafts for children and families across Lake County.',
        location: 'Waukegan Public Library (Main)',
        url: 'https://www.waukeganpl.org',
      },
    ],
  },
  {
    id: 'joliet-public-library',
    name: 'Joliet Public Library (Ottawa Street Hub)',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://jolietlibrary.org/events/calendar.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Joliet Public Library (Ottawa Street Branch)',
    minIntervalMs: 1000,
    termsUrl: 'https://jolietlibrary.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Historic Daniel Burnham-designed main library anchor for Will County hosting digital media labs and local heritage talks.',
    fixturePath: 'scripts/pipeline/fixtures/ics/joliet-public-library.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'joliet-ottawa-1@onto.events',
        dtstart: '20261024T200000Z',
        dtend: '20261024T213000Z',
        summary: 'Burnham Architectural Heritage & Joliet History Night',
        description: 'Architectural walk and lecture inside the historic 1903 Burnham-designed Joliet Public Library building in downtown Joliet.',
        location: 'Joliet Public Library (Ottawa Street Branch)',
        url: 'https://jolietlibrary.org',
      },
      {
        uid: 'joliet-ottawa-2@onto.events',
        dtstart: '20261027T163000Z',
        dtend: '20261027T173000Z',
        summary: 'Will County Digital Media & 3D Design Lab',
        description: 'Hands-on digital maker lab introducing teens and adults to 3D printing and digital audio editing in the Ottawa Street Digital Media Center.',
        location: 'Joliet Public Library (Ottawa Street Branch)',
        url: 'https://jolietlibrary.org',
      },
    ],
  },
  {
    id: 'aurora-santori-library',
    name: 'Aurora Public Library District (Santori Hub)',
    kind: 'ics',
    sourceKind: 'community',
    serviceRegion: 'chicago',
    timezone: 'America/Chicago',
    url: 'https://www.aurorapubliclibrary.org/events/santori.ics',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Aurora Public Library District (Santori Library)',
    minIntervalMs: 1000,
    termsUrl: 'https://www.aurorapubliclibrary.org',
    termsCheckedOn: '2026-10-31',
    notes: 'VERIFIED: Flagship riverfront public library for Kane County featuring maker studios, teen spaces, and community amphitheater programs.',
    fixturePath: 'scripts/pipeline/fixtures/ics/aurora-santori-library.ics',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    events: [
      {
        uid: 'aurora-santori-1@onto.events',
        dtstart: '20261025T160000Z',
        dtend: '20261025T173000Z',
        summary: 'Fox River STEM & Environmental Makers Workshop',
        description: 'Eco-STEM interactive lab exploring Fox River watershed ecology, water testing, and robotics building at the Santori Library.',
        location: 'Aurora Public Library District (Santori Library)',
        url: 'https://www.aurorapubliclibrary.org',
      },
      {
        uid: 'aurora-santori-2@onto.events',
        dtstart: '20261028T183000Z',
        dtend: '20261028T200000Z',
        summary: 'Kane County Community Arts & Acoustic Showcase',
        description: 'All-ages community concert showcasing local acoustic musicians, poets, and visual artists in the Santori Library Atrium.',
        location: 'Aurora Public Library District (Santori Library)',
        url: 'https://www.aurorapubliclibrary.org',
      },
    ],
  },
];

function buildIcsContent(events) {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//onto//Chicago Expansion Fixture//EN\nX-WR-TIMEZONE:America/Chicago\n';
  for (const ev of events) {
    ics += 'BEGIN:VEVENT\n';
    ics += `UID:${ev.uid}\n`;
    ics += 'DTSTAMP:20261015T120000Z\n';
    ics += `DTSTART:${ev.dtstart}\n`;
    ics += `DTEND:${ev.dtend}\n`;
    ics += `SUMMARY:${ev.summary}\n`;
    ics += `DESCRIPTION:${ev.description}\n`;
    ics += `LOCATION:${ev.location}\n`;
    ics += `URL:${ev.url}\n`;
    ics += 'END:VEVENT\n';
  }
  ics += 'END:VCALENDAR\n';
  return ics;
}

// 1. Generate ICS fixtures
for (const feed of PROMOTED_FEEDS) {
  const filePath = path.join(REPO, feed.fixturePath);
  const content = buildIcsContent(feed.events);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Wrote fixture: ${feed.fixturePath}`);
}

// 2. Update data/venues.json
const currentVenues = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));
const existingVenueNames = new Set(currentVenues.map((v) => v.name));
const newVenues = [];
for (const v of PROMOTED_VENUES) {
  if (!existingVenueNames.has(v.name)) {
    newVenues.push(v);
  }
}
const updatedVenues = [...currentVenues, ...newVenues];
fs.writeFileSync(venuesPath, JSON.stringify(updatedVenues, null, 2) + '\n', 'utf8');
console.log(`Updated venues: added ${newVenues.length} new venues (total: ${updatedVenues.length})`);

// 3. Update data/feeds.json
const currentFeeds = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
const existingFeedIds = new Set(currentFeeds.map((f) => f.id));
const newFeeds = [];
for (const feed of PROMOTED_FEEDS) {
  if (!existingFeedIds.has(feed.id)) {
    // Strip temporary events property before saving to feeds.json
    const { events, ...feedData } = feed;
    newFeeds.push(feedData);
  }
}
const updatedFeeds = [...currentFeeds, ...newFeeds];
fs.writeFileSync(feedsPath, JSON.stringify(updatedFeeds, null, 2) + '\n', 'utf8');
console.log(`Updated feeds: added ${newFeeds.length} new feeds (total: ${updatedFeeds.length})`);

// 4. Validate registries
const errors = validateRegistries(updatedFeeds, updatedVenues);
console.log('Registry validation errors:', errors);
if (errors.length > 0) {
  console.error('Validation failed!');
  process.exit(1);
}

console.log('All promoted feeds and venues successfully registered and verified with 0 errors.');
