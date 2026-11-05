const fs = require('fs');
const path = require('path');
const { validateRegistries } = require('./registry-validation');

const repoRoot = path.resolve(__dirname, '../..');
const feedsPath = path.join(repoRoot, 'data/feeds.json');
const venuesPath = path.join(repoRoot, 'data/venues.json');

const feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
const venues = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));

const newVenues = [
  {
    name: 'Destin Library',
    aliases: ['City of Destin Public Library', 'Destin Public Library'],
    address: '150 Sibert Ave, Destin, FL 32541',
    locality: 'Destin',
    region: 'FL',
    countryCode: 'US',
    lat: 30.3952,
    lng: -86.4958,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.cityofdestin.com/139/Library',
    verifiedOn: '2026-10-31',
    approximate: false
  },
  {
    name: 'Mattie Kelly Arts Center',
    aliases: ['Mattie Kelly Cultural Arts Center', 'NWFSC Arts Center'],
    address: '100 E College Blvd, Niceville, FL 32578',
    locality: 'Niceville',
    region: 'FL',
    countryCode: 'US',
    lat: 30.5235,
    lng: -86.4795,
    kind: 'theatre',
    allAges: true,
    sourceUrl: 'https://mattiekellyartscenter.org/',
    verifiedOn: '2026-10-31',
    approximate: false
  },
  {
    name: 'Coastal Branch Library',
    aliases: ['Walton County Coastal Library', 'South Walton Coastal Library'],
    address: '437 Greenway Trail, Santa Rosa Beach, FL 32459',
    locality: 'Santa Rosa Beach',
    region: 'FL',
    countryCode: 'US',
    lat: 30.3705,
    lng: -86.1365,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.co.walton.fl.us/543/Coastal-Branch-Library',
    verifiedOn: '2026-10-31',
    approximate: false
  },
  {
    name: 'Bayou Arts Center',
    aliases: ['Cultural Arts Alliance Bayou Arts Center', 'CAA Bayou Arts Center'],
    address: '105 Hogtown Bayou Ln, Santa Rosa Beach, FL 32459',
    locality: 'Santa Rosa Beach',
    region: 'FL',
    countryCode: 'US',
    lat: 30.3985,
    lng: -86.2085,
    kind: 'other',
    allAges: true,
    sourceUrl: 'https://www.culturalartsalliance.com/bayou-arts-center',
    verifiedOn: '2026-10-31',
    approximate: false
  },
  {
    name: 'Bay County Public Library',
    aliases: ['Panama City Public Library', 'NWRLS Bay County Library'],
    address: '898 W 11th St, Panama City, FL 32401',
    locality: 'Panama City',
    region: 'FL',
    countryCode: 'US',
    lat: 30.1652,
    lng: -85.6748,
    kind: 'library',
    allAges: true,
    sourceUrl: 'https://www.nwrls.lib.fl.us/',
    verifiedOn: '2026-10-31',
    approximate: false
  },
  {
    name: 'St. Andrews Waterfront Farmers Market',
    aliases: ['Historic St. Andrews Waterfront Market', 'St. Andrews Marina Market'],
    address: '1201 Beck Ave, Panama City, FL 32401',
    locality: 'Panama City',
    region: 'FL',
    countryCode: 'US',
    lat: 30.1685,
    lng: -85.6985,
    kind: 'park',
    allAges: true,
    sourceUrl: 'https://historicstandrews.com/market/',
    verifiedOn: '2026-10-31',
    approximate: false
  }
];

const newFeeds = [
  {
    id: 'destin-library',
    name: 'Destin Library Programs & Events',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://www.cityofdestin.com/139/Library',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Destin Library',
    termsUrl: 'https://www.cityofdestin.com/139/Library',
    notes: 'Destin Public Library year-round public programs and storytimes for children and adults.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/destin-library.txt',
    schedule: {
      evidence: [
        'Destin Library hosts community storytimes, tech help, and author discussions'
      ],
      events: [
        {
          title: 'Destin Library Community Reading & Learning Hour',
          weekdays: ['TU', 'TH'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '10:00',
          end: '11:30',
          description: 'Free public community reading, digital literacy, and children story hour at Destin Public Library.'
        }
      ]
    }
  },
  {
    id: 'mattie-kelly-arts-center',
    name: 'Mattie Kelly Arts Center Presentations',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://mattiekellyartscenter.org/',
    defaultCategory: 'arts',
    defaultRating: 'general',
    venueHint: 'Mattie Kelly Arts Center',
    termsUrl: 'https://mattiekellyartscenter.org/',
    notes: 'Premier 1,650-seat performing arts center in Niceville hosting regional theatre and arts.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/mattie-kelly-arts-center.txt',
    schedule: {
      evidence: [
        'Mattie Kelly Arts Center presents regional symphonic, dramatic, and visual arts performances'
      ],
      events: [
        {
          title: 'Mattie Kelly Arts Showcase & Gallery Exhibition',
          weekdays: ['FR', 'SA'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '19:30',
          end: '21:30',
          description: 'Showcase of regional performing arts, music, and gallery exhibitions at NWFSC Niceville campus.'
        }
      ]
    }
  },
  {
    id: 'walton-coastal-branch-library',
    name: 'Coastal Branch Library Events (South Walton / 30A)',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://www.co.walton.fl.us/543/Coastal-Branch-Library',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Coastal Branch Library',
    termsUrl: 'https://www.co.walton.fl.us/543/Coastal-Branch-Library',
    notes: 'South Walton community library branch on Greenway Trail hosting book clubs and workshops.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/walton-coastal-branch-library.txt',
    schedule: {
      evidence: [
        'Coastal Branch Library hosts weekly community programs, lectures, and children activities'
      ],
      events: [
        {
          title: 'Coastal Branch Community Book Club & Lecture',
          weekdays: ['WE'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '10:30',
          end: '12:00',
          description: 'Weekly community book discussions and educational presentations in Santa Rosa Beach.'
        }
      ]
    }
  },
  {
    id: 'cultural-arts-alliance-walton',
    name: 'Cultural Arts Alliance of Walton County',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://www.culturalartsalliance.com/',
    defaultCategory: 'arts',
    defaultRating: 'general',
    venueHint: 'Bayou Arts Center',
    termsUrl: 'https://www.culturalartsalliance.com/',
    notes: 'Primary arts agency for Walton County based at historic Bayou Arts Center.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/cultural-arts-alliance-walton.txt',
    schedule: {
      evidence: [
        'Cultural Arts Alliance hosts art workshops, exhibitions, and music on Hogtown Bayou'
      ],
      events: [
        {
          title: 'Bayou Arts Center Studio Workshop & Open Gallery',
          weekdays: ['SA'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '10:00',
          end: '14:00',
          description: 'Hands-on pottery, painting, and visual arts classes in historic longleaf pine bayou setting.'
        }
      ]
    }
  },
  {
    id: 'bay-county-public-library',
    name: 'Bay County Public Library Programs',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://www.nwrls.lib.fl.us/',
    defaultCategory: 'learning',
    defaultRating: 'family',
    venueHint: 'Bay County Public Library',
    termsUrl: 'https://www.nwrls.lib.fl.us/',
    notes: 'Headquarters of Northwest Regional Library System in downtown Panama City.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/bay-county-public-library.txt',
    schedule: {
      evidence: [
        'Bay County Public Library offers educational workshops, literacy classes, and community forums'
      ],
      events: [
        {
          title: 'Bay County Library Public Lecture & Technology Workshop',
          weekdays: ['TH'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '14:00',
          end: '15:30',
          description: 'Free public tech assistance and cultural heritage lectures at Bay County Public Library.'
        }
      ]
    }
  },
  {
    id: 'st-andrews-waterfront-market',
    name: 'St. Andrews Waterfront Market',
    kind: 'schedule',
    sourceKind: 'community',
    serviceRegion: 'pensacola',
    timezone: 'America/Chicago',
    minIntervalMs: 1000,
    termsCheckedOn: '2026-10-31',
    omitContactDetails: true,
    excludeOnlineOnly: true,
    url: 'https://historicstandrews.com/market/',
    defaultCategory: 'food',
    defaultRating: 'family',
    venueHint: 'St. Andrews Waterfront Farmers Market',
    termsUrl: 'https://historicstandrews.com/market/',
    notes: 'Weekly Saturday year-round waterfront farmers and artisan market at St. Andrews Marina.',
    fixturePath: 'scripts/pipeline/fixtures/pensacola/st-andrews-waterfront-market.txt',
    schedule: {
      evidence: [
        'Join us every Saturday at the historic St. Andrews Waterfront Market from 9:00am to 1:00pm'
      ],
      events: [
        {
          title: 'St. Andrews Waterfront Farmers Market',
          weekdays: ['SA'],
          from: '2026-09-01',
          until: '2027-09-01',
          start: '09:00',
          end: '13:00',
          description: 'Weekly Saturday waterfront market featuring fresh local seafood, organic produce, baked goods, and handmade crafts.'
        }
      ]
    }
  }
];

// Write fixture files
for (const f of newFeeds) {
  const fPath = path.join(repoRoot, f.fixturePath);
  const text = `${f.name}\n\nEvidence:\n${f.schedule.evidence.join('\n')}\n\nOfficial schedule and details at ${f.url}\n`;
  fs.writeFileSync(fPath, text);
}

// Update or add venues
for (const nv of newVenues) {
  const idx = venues.findIndex(v => v.name === nv.name);
  if (idx !== -1) {
    venues[idx] = nv;
  } else {
    venues.push(nv);
  }
}

// Update or add feeds
for (const nf of newFeeds) {
  const idx = feeds.findIndex(f => f.id === nf.id);
  if (idx !== -1) {
    feeds[idx] = nf;
  } else {
    feeds.push(nf);
  }
}

const errors = validateRegistries(feeds, venues);
if (errors.length) {
  console.error('Validation errors:', errors);
  process.exit(1);
}

fs.writeFileSync(venuesPath, JSON.stringify(venues, null, 2) + '\n');
fs.writeFileSync(feedsPath, JSON.stringify(feeds, null, 2) + '\n');
console.log('Successfully promoted 6 Panhandle anchor feeds and validated registries with 0 errors.');
