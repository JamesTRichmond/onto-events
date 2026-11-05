#!/usr/bin/env node
/**
 * Propose Wikimedia Commons photos for Asheville, Black Mountain, and Weaverville.
 * Never writes venues.json. A row is the picture hosted for review.
 *
 * Usage: node scripts/propose-venue-photos-nc.js
 * Writes: docs/sources/proposals/venue-photos-nc.md
 */
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const outPath = join(root, 'docs/sources/proposals/venue-photos-nc.md');
const FORBIDDEN = ['data/venues.json', 'data/spots.ts'];

const PROPOSALS = [
  {
    "venue": "Asheville Art Museum",
    "locality": "Asheville",
    "file": "File:Asheville Art Museum (March 2023) 3.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "DiscoA340",
    "why": "The sign in front reads ASHEVILLE ART MUSEUM.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Asheville_Art_Museum_(March_2023)_3.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Asheville Museum of Science",
    "locality": "Asheville",
    "file": "File:Asheville Museum of Science 3.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Stilfehler",
    "why": "AMOS is lit over the door of the Asheville Museum of Science.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Asheville_Museum_of_Science_3.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Thomas Wolfe Memorial",
    "locality": "Asheville",
    "file": "File:Thomas Wolfe Memorial in Asheville, North Carolina, built in 1883 where American author, Thomas Wolfe grew up.jpg",
    "license": "Public domain",
    "credit": "Carol M. Highsmith",
    "why": "The yellow boarding house where Thomas Wolfe grew up, which is the Thomas Wolfe Memorial.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Thomas_Wolfe_Memorial_in_Asheville,_North_Carolina,_built_in_1883_where_American_author,_Thomas_Wolfe_grew_up.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Black Mountain College Museum + Arts Center",
    "locality": "Asheville",
    "file": "File:Black Mountain College Museum + Arts Center (March 2023).jpg",
    "license": "CC BY-SA 4.0",
    "credit": "DiscoA340",
    "why": "The awning reads BLACK MOUNTAIN COLLEGE MUSEUM + ARTS CENTER, on the Asheville building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Black_Mountain_College_Museum_+_Arts_Center_(March_2023).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Diana Wortham Theatre",
    "locality": "Asheville",
    "file": "File:Diana Wortham Theatre Sign, Asheville, NC (46691724142).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The marquee reads WORTHAM. This is the Diana Wortham Theatre.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Diana_Wortham_Theatre_Sign,_Asheville,_NC_(46691724142).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Harrah's Cherokee Center Asheville",
    "locality": "Asheville",
    "file": "File:Asheville Civic Center, Asheville, NC (46690372192).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The exterior of the Asheville Civic Center. That building is now Harrah's Cherokee Center.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Asheville_Civic_Center,_Asheville,_NC_(46690372192).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Thomas Wolfe Auditorium",
    "locality": "Asheville",
    "file": "File:Thomas Wolfe Auditorium, Harrah's Cherokee Center Asheville.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "PCN02WPS",
    "why": "The seats and stage inside Thomas Wolfe Auditorium, photographed in March 2025.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Thomas_Wolfe_Auditorium,_Harrah's_Cherokee_Center_Asheville.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Highland Brewing Company",
    "locality": "Asheville",
    "file": "File:Highland Brewery - sign.jpg",
    "license": "CC BY-SA 2.0",
    "credit": "mdl70",
    "why": "The round sign on the door reads HIGHLAND BREWING COMPANY.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Highland_Brewery_-_sign.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "First Baptist Church of Asheville",
    "locality": "Asheville",
    "file": "File:First Baptist Church in Asheville, North Carolina.jpg",
    "license": "Public domain",
    "credit": "Carol M. Highsmith",
    "why": "The domed First Baptist Church in Asheville.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:First_Baptist_Church_in_Asheville,_North_Carolina.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "YMI Cultural Center",
    "locality": "Asheville",
    "file": "File:YMI Cultural Center, Asheville, NC (46019883934).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The brick Young Men's Institute building, which is the YMI Cultural Center.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:YMI_Cultural_Center,_Asheville,_NC_(46019883934).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The Orange Peel",
    "locality": "Asheville",
    "file": "File:The Orange Peel, Asheville, NC.jpg",
    "license": "CC BY-SA 2.0",
    "credit": "Shannon McGee",
    "why": "ORANGE PEEL is painted on the brick wall of the music hall.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:The_Orange_Peel,_Asheville,_NC.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The North Carolina Arboretum",
    "locality": "Asheville",
    "file": "File:NCArboretum-27527-2.jpg",
    "license": "Public domain",
    "credit": "Ken Thomas",
    "why": "The Baker Exhibit Center at the North Carolina Arboretum, with the greenhouse beside it.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:NCArboretum-27527-2.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Holy Trinity Greek Orthodox Church",
    "locality": "Asheville",
    "file": "File:Holy Trinity Greek Orthodox Church, Montford, Asheville, NC (39776866423).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The domed church in Montford. The file names Holy Trinity Greek Orthodox Church.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Holy_Trinity_Greek_Orthodox_Church,_Montford,_Asheville,_NC_(39776866423).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "New Belgium Brewing Asheville",
    "locality": "Asheville",
    "file": "File:New Belgium Brewing, Asheville, NC 2017.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Timothyjosephwood",
    "why": "The arch over the walk reads NEW BELGIUM, at the Asheville brewery.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:New_Belgium_Brewing,_Asheville,_NC_2017.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Biltmore Estate",
    "locality": "Asheville",
    "file": "File:Biltmore House front facade Asheville North Carolina - May 2026.jpg",
    "license": "CC BY 4.0",
    "credit": "WillThomas",
    "why": "The front of Biltmore House, photographed in May 2026.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Biltmore_House_front_facade_Asheville_North_Carolina_-_May_2026.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "White Horse Black Mountain",
    "locality": "Black Mountain",
    "file": "File:White Horse Black Mountain.jpg",
    "license": "CC BY 2.0",
    "credit": "Norton Gusky",
    "why": "The patio sign reads WHITE HORSE BLACK MOUNTAIN.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:White_Horse_Black_Mountain.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "First Presbyterian Church of Asheville",
    "locality": "Asheville",
    "file": "File:First Presbyterian Church, Asheville, NC (45830206205).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The brick First Presbyterian Church in Asheville.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:First_Presbyterian_Church,_Asheville,_NC_(45830206205).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Central United Methodist Church of Asheville",
    "locality": "Asheville",
    "file": "File:Central United Methodist Church, Asheville, NC (32870382708).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The stone Central United Methodist Church in Asheville.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Central_United_Methodist_Church,_Asheville,_NC_(32870382708).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Wicked Weed Brewpub",
    "locality": "Asheville",
    "file": "File:Wicked Weed Brewing Pub, Asheville, NC (46691720982).jpg",
    "license": "CC0",
    "credit": "Warren LeMay",
    "why": "The sign on the white building reads Wicked Weed. This is the brewpub.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Wicked_Weed_Brewing_Pub,_Asheville,_NC_(46691720982).jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Asheville Museum of History",
    "locality": "Asheville",
    "file": "File:Smith McDowell House.jpg",
    "license": "CC BY-SA 3.0",
    "credit": "Bill Fitzpatrick",
    "why": "The Smith-McDowell House at 283 Victoria Road. That house is the Asheville Museum of History.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Smith_McDowell_House.jpg",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "Homewood",
    "locality": "Asheville",
    "file": "File:Homewood School Building, Zillicoa St., Montford Area.JPG",
    "license": "CC BY-SA 3.0",
    "credit": "Karen D. Hoffman",
    "why": "The stone Homewood School on Zillicoa Street. The venue is that building.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:Homewood_School_Building,_Zillicoa_St.,_Montford_Area.JPG",
    "checkedOn": "2026-10-17"
  },
  {
    "venue": "The Lobster Trap",
    "locality": "Asheville",
    "file": "File:The Lobster Trap Asheville.jpg",
    "license": "CC BY-SA 4.0",
    "credit": "Stilfehler",
    "why": "The awning reads THE LOBSTER TRAP.",
    "sourcePage": "https://commons.wikimedia.org/wiki/File:The_Lobster_Trap_Asheville.jpg",
    "checkedOn": "2026-10-17"
  }
];

function page(file) {
  return 'https://commons.wikimedia.org/wiki/' + encodeURI(file.replace(/ /g, '_'));
}

function renderLedger(list) {
  const lines = [
    '# Venue photo proposals, Asheville, Black Mountain, and Weaverville',
    '',
    'Review record. This does not change `data/venues.json`.',
    '',
    'Source: Wikimedia Commons, option A. Checked 2026-10-17.',
    'Searched: 171 venues in the Asheville region, including Asheville, Black Mountain, and Weaverville. Proposed: ' + list.length + '. The rest had no file that was clearly that place.',
    '',
    'Weaverville was searched. None of its venues had a picture of that place. A file of a different city, a picture of a person, or a frame of only trees was not proposed. The Black Mountain Library file was a library in Australia. The Asheville Yacht Club file was a lake club, not the bar on Patton Avenue.',
    '',
    'No image is better than a wrong image.',
    '',
    '| Venue | File | License | Credit | Why it matches |',
    '|---|---|---|---|---|',
  ];
  for (const row of list) {
    const link = '[' + row.file.replace(/^File:/, '').replace(/\|/g, '\\|') + '](' + row.sourcePage + ')';
    lines.push('| ' + row.venue.replace(/\|/g, '\\|') + ' | ' + link + ' | ' + row.license + ' | ' + row.credit.replace(/\|/g, '\\|') + ' | ' + row.why.replace(/\|/g, '\\|') + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function assertReviewOnly(path) {
  const normalized = path.replace(/\\/g, '/');
  if (FORBIDDEN.some((banned) => normalized.endsWith(banned))) {
    throw new Error('refusing to write ' + path);
  }
}

function main() {
  for (const row of PROPOSALS) {
    if (page(row.file) !== row.sourcePage) throw new Error('page does not match file: ' + row.venue);
  }
  assertReviewOnly(outPath);
  writeFileSync(outPath, renderLedger(PROPOSALS));
  console.log('wrote ' + PROPOSALS.length + ' proposals to ' + outPath);
}

if (require.main === module) main();

module.exports = { PROPOSALS, renderLedger, assertReviewOnly };
