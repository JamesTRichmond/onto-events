#!/usr/bin/env node
/**
 * Propose Wikimedia Commons photos for review. Never writes venues.json.
 *
 * A row is a proposal only. It lands in the app after a person checks the
 * picture against the building and the license. The script will not invent a
 * file, a license, or a reason: every field below was confirmed against the
 * Commons imageinfo API on the checkedOn date, and the picture was looked at.
 *
 * Usage: node scripts/propose-venue-photos.js
 * Writes: docs/sources/proposals/venue-photos.md
 */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const outPath = join(root, 'docs/sources/proposals/venue-photos.md');

const FORBIDDEN = ['data/venues.json', 'data/spots.ts'];

const PROPOSALS = [
  {
    venue: 'Clark Planetarium',
    locality: 'Salt Lake City',
    file: 'File:Clark Planetarium at The Gateway.JPG',
    license: 'CC BY-SA 4.0',
    credit: 'An Errant Knight',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Clark_Planetarium_at_The_Gateway.JPG',
    why: 'The building sign reads CLARK PLANETARIUM, at The Gateway in Salt Lake City. Same building as the venue.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Natural History Museum of Utah',
    locality: 'Salt Lake City',
    file: 'File:Natural History Museum of Utah.jpg',
    license: 'CC BY-SA 3.0',
    credit: 'Jim Nista',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Natural_History_Museum_of_Utah.jpg',
    why: 'The copper Rio Tinto Center, the museum\'s own building on the University of Utah campus. The file title and description name this museum.',
    checkedOn: '2026-10-17',
  },
  {
    venue: "Utah's Hogle Zoo",
    locality: 'Salt Lake City',
    file: 'File:Hogle zoo entrance.JPG',
    license: 'CC BY-SA 4.0',
    credit: 'Bobjgalindo',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Hogle_zoo_entrance.JPG',
    why: 'The entrance wall is lettered UTAH\'S HOGLE ZOO. This is the gate, not an animal exhibit.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Utah Museum of Fine Arts',
    locality: 'Salt Lake City',
    file: 'File:Utah Museum of Fine Arts.jpeg',
    license: 'CC BY-SA 3.0',
    credit: 'Tricia Simpson',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Utah_Museum_of_Fine_Arts.jpeg',
    why: 'The Marcia and John Price Museum Building. The UMFA sign is at the door. Same building as the venue.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'The Gallivan Center',
    locality: 'Salt Lake City',
    file: 'File:Gallivan Center stage, Oct 16.jpg',
    license: 'CC BY-SA 4.0',
    credit: 'An Errant Knight',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Gallivan_Center_stage,_Oct_16.jpg',
    why: 'The plaza stage is lettered The John W. Gallivan Utah Center. This is the venue\'s own outdoor room, not a nearby tower.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Red Butte Garden',
    locality: 'Salt Lake City',
    file: 'File:Red Butte Garden2.jpg',
    license: 'CC BY-SA 3.0',
    credit: 'Cory Maylett',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Red_Butte_Garden2.jpg',
    why: 'A planted garden court at Red Butte Garden in Salt Lake City. The file description names that garden. Not used for the amphitheatre, which is a different venue.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Kingsbury Hall',
    locality: 'Salt Lake City',
    file: 'File:Kingsbury Hall.jpg',
    license: 'CC BY-SA 3.0',
    credit: 'Brian Davis',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Kingsbury_Hall.jpg',
    why: 'The facade is carved KINGSBURY HALL, at the University of Utah. A different Kingsbury Hall in England was rejected.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'J. Willard Marriott Library',
    locality: 'Salt Lake City',
    file: 'File:Uofu marriottlibraryside.jpg',
    license: 'Public domain',
    credit: 'Klubbit',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Uofu_marriottlibraryside.jpg',
    why: 'The file description names the J. Willard Marriott Library at the University of Utah, and the picture is that glass building. The 1905 library photo was rejected as a different building.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Pioneer Memorial Theatre',
    locality: 'Salt Lake City',
    file: 'File:Uofu pioneermemorialtheatre.jpg',
    license: 'Public domain',
    credit: 'Klubbit',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Uofu_pioneermemorialtheatre.jpg',
    why: 'The frieze reads ROY W. & ELIZABETH E. SIMMONS PIONEER MEMORIAL THEATRE, the venue\'s building at the University of Utah.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Warnock Engineering Building',
    locality: 'Salt Lake City',
    file: 'File:Uofu warnockside.jpg',
    license: 'Public domain',
    credit: 'Klubbit',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Uofu_warnockside.jpg',
    why: 'The file description names the Warnock Engineering Building at the University of Utah, and the picture is that brick-and-glass building.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Spencer Fox Eccles Business Building',
    locality: 'Salt Lake City',
    file: 'File:Sfebb exterior univ of utah.jpg',
    license: 'CC BY-SA 4.0',
    credit: 'Ricardo630',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Sfebb_exterior_univ_of_utah.jpg',
    why: 'The building lettering reads SPENCER FOX ECCLES BUSINESS BUILDING. A 2012 construction photo of the same site was rejected.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Liberty Park',
    locality: 'Salt Lake City',
    file: 'File:Liberty Park.jpg',
    license: 'CC BY-SA 3.0',
    credit: 'Argyleist',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Liberty_Park.jpg',
    why: 'The park sign reads LIBERTY PARK, at the 900 South entrance in Salt Lake City. A 1912 parade photo and a Liberty Street park in another city were rejected.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Historic Sandy TRAX Station',
    locality: 'Sandy',
    file: 'File:HistoricSandyTRAXstation.jpg',
    license: 'CC BY-SA 3.0',
    credit: 'Griffinofwales',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:HistoricSandyTRAXstation.jpg',
    why: 'The platform shelters and the file description name the Historic Sandy TRAX station in Sandy, Utah. A Blue Line train video of the same stop was not used; this is a still of the platform.',
    checkedOn: '2026-10-17',
  },
  {
    venue: 'Wheeler Historic Farm',
    locality: 'Murray',
    file: 'File:Wheeler Farm House.JPG',
    license: 'Public domain',
    credit: 'Stundra',
    sourcePage: 'https://commons.wikimedia.org/wiki/File:Wheeler_Farm_House.JPG',
    why: 'The Wheeler farmhouse, the historic building on the farm. The 1990 activity barn was rejected because it is a newer building, not the house.',
    checkedOn: '2026-10-17',
  },
];

function page(file) {
  return 'https://commons.wikimedia.org/wiki/' + encodeURI(file.replace(/ /g, '_'));
}

function renderLedger(rows, { searched = 51, city = 'Salt Lake City area' } = {}) {
  const lines = [
    '# Venue photo proposals',
    '',
    'Review file only. This does not change `data/venues.json`.',
    '',
    `Source: Wikimedia Commons, option A. Checked ${rows[0]?.checkedOn ?? 'unknown'}.`,
    `Searched: ${searched} venues in the ${city}. Proposed: ${rows.length}. The rest had no file that was clearly that place.`,
    '',
    'A row is not in the app until a person agrees the picture is that building. No image is better than a wrong image.',
    '',
    '| Venue | File | License | Credit | Why it matches |',
    '|---|---|---|---|---|',
  ];
  for (const row of rows) {
    const link = `[${row.file.replace(/^File:/, '')}](${row.sourcePage})`;
    lines.push(`| ${row.venue} | ${link} | ${row.license} | ${row.credit} | ${row.why} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function assertReviewOnly(path) {
  const normalized = path.replace(/\\/g, '/');
  if (FORBIDDEN.some((banned) => normalized.endsWith(banned))) {
    throw new Error(`refusing to write ${path}`);
  }
}

function main() {
  for (const row of PROPOSALS) {
    if (!row.sourcePage.startsWith('https://commons.wikimedia.org/wiki/File:')) {
      throw new Error(`not a Commons file page: ${row.venue}`);
    }
    if (page(row.file) !== row.sourcePage) throw new Error(`page does not match file: ${row.venue}`);
  }
  assertReviewOnly(outPath);
  writeFileSync(outPath, renderLedger(PROPOSALS));
  console.log(`wrote ${PROPOSALS.length} proposals to ${outPath}`);
}

if (require.main === module) main();

module.exports = { PROPOSALS, renderLedger, assertReviewOnly };
