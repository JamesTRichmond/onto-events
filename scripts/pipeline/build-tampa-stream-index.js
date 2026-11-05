const fs = require('fs');
const path = require('path');

const streams = [];

function addStream(stream) {
  if (streams.some(s => s.id === stream.id)) {
    throw new Error(`Duplicate stream id: ${stream.id}`);
  }
  streams.push(stream);
}

// 1. Civic & Public Libraries (Target 75+)
// Hillsborough County Public Library Cooperative (HCPLC) 27 branches
const hcplcBranches = [
  { id: 'john-f-germany', name: 'John F. Germany Public Library', addr: '900 N Ashley Dr, Tampa, FL 33602', lat: 27.9510, lng: -82.4632, status: 'active-anchor' },
  { id: 'c-blythe-andrews', name: 'C. Blythe Andrews, Jr. Public Library', addr: '2607 E Dr MLK Jr Blvd, Tampa, FL 33610', lat: 27.9818, lng: -82.4308, status: 'active-anchor' },
  { id: 'west-tampa', name: 'West Tampa Library', addr: '2312 W Union St, Tampa, FL 33607', lat: 27.9572, lng: -82.4842, status: 'active-anchor' },
  { id: 'robert-saunders', name: 'Robert W. Saunders, Sr. Public Library', addr: '1505 N Nebraska Ave, Tampa, FL 33602', lat: 27.9605, lng: -82.4510, status: 'active-anchor' },
  { id: 'seminole-heights', name: 'Seminole Heights Branch Library', addr: '4711 Central Ave, Tampa, FL 33603', lat: 27.9892, lng: -82.4552, status: 'active-anchor' },
  { id: 'jan-platt', name: 'Jan Kaminis Platt Regional Library', addr: '3910 S Manhattan Ave, Tampa, FL 33611', lat: 27.9065, lng: -82.5173, status: 'active-anchor' },
  { id: 'north-tampa', name: 'North Tampa Branch Library', addr: '8916 N Blvd, Tampa, FL 33604', lat: 28.0315, lng: -82.4695, status: 'active-anchor' },
  { id: 'brandon-regional', name: 'Brandon Regional Library', addr: '619 Vonderburg Dr, Brandon, FL 33511', lat: 27.9308, lng: -82.2905, status: 'active-anchor' },
  { id: 'jimmie-b-keel', name: 'Jimmie B. Keel Regional Library', addr: '2902 W Bearss Ave, Tampa, FL 33618', lat: 28.0805, lng: -82.4891, status: 'candidate' },
  { id: 'upper-tampa-bay', name: 'Upper Tampa Bay Regional Library', addr: '11211 Countryway Blvd, Tampa, FL 33534', lat: 28.0520, lng: -82.6075, status: 'candidate' },
  { id: 'riverview-branch', name: 'Riverview Public Library', addr: '9951 Balm Riverview Rd, Riverview, FL 33569', lat: 27.8685, lng: -82.3382, status: 'candidate' },
  { id: 'maureen-gauzza', name: 'Maureen B. Gauzza Public Library', addr: '11211 Countryway Blvd, Tampa, FL 33626', lat: 28.0531, lng: -82.6105, status: 'candidate' },
  { id: 'lutz-branch', name: 'Lutz Branch Library', addr: '101 W Lutz Lake Fern Rd, Lutz, FL 33548', lat: 28.1481, lng: -82.4635, status: 'candidate' },
  { id: 'arthenia-joyner', name: 'Arthenia L. Joyner University Area Library', addr: '13619 N 22nd St, Tampa, FL 33613', lat: 28.0708, lng: -82.4342, status: 'candidate' },
  { id: 'town-n-country', name: 'Town \'N Country Regional Library', addr: '7606 Paula Dr, Tampa, FL 33615', lat: 28.0162, lng: -82.5715, status: 'candidate' },
  { id: 'new-tampa', name: 'New Tampa Regional Library', addr: '10001 Cross Creek Blvd, Tampa, FL 33647', lat: 28.1458, lng: -82.3275, status: 'candidate' },
  { id: 'south-shore', name: 'SouthShore Regional Library', addr: '15816 Beth Shields Way, Ruskin, FL 33573', lat: 27.7125, lng: -82.3920, status: 'candidate' },
  { id: 'seffner-mango', name: 'Seffner-Mango Branch Library', addr: '410 N Kingsway Rd, Seffner, FL 33584', lat: 27.9995, lng: -82.2785, status: 'candidate' },
  { id: 'temple-terrace', name: 'Temple Terrace Public Library', addr: '202 Bullard Pkwy, Temple Terrace, FL 33617', lat: 28.0353, lng: -82.3893, status: 'candidate' },
  { id: 'bruton-memorial', name: 'Bruton Memorial Library', addr: '302 W McLendon St, Plant City, FL 33563', lat: 28.0170, lng: -82.1165, status: 'candidate' },
  { id: 'norma-tina-reid', name: 'Norma and Joseph Tina Public Library', addr: '14502 N 22nd St, Tampa, FL 33613', lat: 28.0772, lng: -82.4345, status: 'candidate' },
  { id: 'port-tampa', name: 'Port Tampa City Library', addr: '4902 W Commerce St, Tampa, FL 33616', lat: 27.8652, lng: -82.5295, status: 'candidate' },
  { id: '78th-street', name: '78th Street Community Library', addr: '7625 Palm River Rd, Tampa, FL 33619', lat: 27.9355, lng: -82.3710, status: 'candidate' },
  { id: 'bloomingdale', name: 'Bloomingdale Regional Public Library', addr: '1906 Bloomingdale Ave, Valrico, FL 33596', lat: 27.8925, lng: -82.2610, status: 'candidate' },
  { id: 'thonotosassa-branch', name: 'Thonotosassa Branch Library', addr: '10715 Main St, Thonotosassa, FL 33592', lat: 28.0545, lng: -82.3020, status: 'candidate' },
  { id: 'charles-j-fendig', name: 'Charles J. Fendig Public Library', addr: '3909 W Neptune St, Tampa, FL 33629', lat: 27.9315, lng: -82.5085, status: 'candidate' },
  { id: 'sulzer-regional', name: 'College Hill Public Library', addr: '2607 E 24th Ave, Tampa, FL 33605', lat: 27.9735, lng: -82.4320, status: 'candidate' },
  { id: 'pinecrest-branch', name: 'Pinecrest Branch Library', addr: 'Lithia Pinecrest Rd, Lithia, FL 33547', lat: 27.8545, lng: -82.1645, status: 'candidate' },
  { id: 'wimauma-branch', name: 'Wimauma Branch Library', addr: '5705 Hillsborough St, Wimauma, FL 33598', lat: 27.7125, lng: -82.3085, status: 'candidate' },
  { id: 'ruskin-branch', name: 'Ruskin Branch Library', addr: '26 Dickman Dr SE, Ruskin, FL 33570', lat: 27.7175, lng: -82.4335, status: 'candidate' },
  { id: 'apollo-beach-branch', name: 'Apollo Beach Branch Library', addr: 'Apollo Beach Blvd, Apollo Beach, FL 33572', lat: 27.7725, lng: -82.4115, status: 'candidate' }
];

for (const b of hcplcBranches) {
  addStream({
    id: `hcplc-${b.id}`,
    name: `HCPLC ${b.name}`,
    vertical: 'civic-libraries',
    verticalLabel: 'Civic & Public Libraries',
    county: 'Hillsborough',
    countyCode: '12057',
    municipality: b.addr.includes('Temple Terrace') ? 'Temple Terrace' : (b.addr.includes('Plant City') ? 'Plant City' : 'Tampa'),
    state: 'FL',
    venue: b.name,
    address: b.addr,
    lat: b.lat,
    lng: b.lng,
    kind: 'schedule',
    status: b.status,
    feedUrl: `https://hcplc.org/events/${b.id}`,
    sourceUrl: 'https://hcplc.org/',
    notes: `Hillsborough County Public Library branch providing public lectures, creative tech labs, and community programs.`
  });
}

// Pinellas Public Library Cooperative (PPLC) 18 branches across 14 municipal systems
const pplcBranches = [
  { id: 'spl-main', name: 'St. Petersburg Main Library', mun: 'St. Petersburg', addr: '3745 9th Ave N, St. Petersburg, FL 33713', lat: 27.7818, lng: -82.6845 },
  { id: 'spl-mirror-lake', name: 'Mirror Lake Community Library', mun: 'St. Petersburg', addr: '280 5th St N, St. Petersburg, FL 33701', lat: 27.7760, lng: -82.6412 },
  { id: 'spl-south-branch', name: 'South Branch Community Library', mun: 'St. Petersburg', addr: '2300 Roy Hanna Dr S, St. Petersburg, FL 33712', lat: 27.7315, lng: -82.6650 },
  { id: 'spl-north-branch', name: 'North End Community Library', mun: 'St. Petersburg', addr: '861 70th Ave N, St. Petersburg, FL 33702', lat: 27.8345, lng: -82.6455 },
  { id: 'spl-west-branch', name: 'West Community Library at SPC', mun: 'St. Petersburg', addr: '6700 8th Ave N, St. Petersburg, FL 33710', lat: 27.7802, lng: -82.7305 },
  { id: 'spl-childs-park', name: 'Childs Park Community Library', mun: 'St. Petersburg', addr: '691 43rd St S, St. Petersburg, FL 33711', lat: 27.7605, lng: -82.6935 },
  { id: 'clearwater-main', name: 'Clearwater Main Library', mun: 'Clearwater', addr: '100 N Osceola Ave, Clearwater, FL 33755', lat: 27.9659, lng: -82.8001 },
  { id: 'clearwater-countryside', name: 'Clearwater Countryside Library', mun: 'Clearwater', addr: '2642 Sabal Springs Dr, Clearwater, FL 33761', lat: 28.0210, lng: -82.7295 },
  { id: 'clearwater-east', name: 'Clearwater East Community Library at SPC', mun: 'Clearwater', addr: '2465 Drew St, Clearwater, FL 33765', lat: 27.9665, lng: -82.7405 },
  { id: 'clearwater-north-greenwood', name: 'North Greenwood Library', mun: 'Clearwater', addr: '905 N MLK Jr Ave, Clearwater, FL 33755', lat: 27.9745, lng: -82.7885 },
  { id: 'largo-public', name: 'Largo Public Library', mun: 'Largo', addr: '120 Central Park Dr, Largo, FL 33771', lat: 27.9095, lng: -82.7795 },
  { id: 'dunedin-public', name: 'Dunedin Public Library', mun: 'Dunedin', addr: '223 Douglas Ave, Dunedin, FL 34698', lat: 28.0135, lng: -82.7872 },
  { id: 'tarpon-springs-public', name: 'Tarpon Springs Public Library', mun: 'Tarpon Springs', addr: '138 E Lemon St, Tarpon Springs, FL 34689', lat: 28.1465, lng: -82.7545 },
  { id: 'safety-harbor-public', name: 'Safety Harbor Public Library', mun: 'Safety Harbor', addr: '101 2nd St N, Safety Harbor, FL 34695', lat: 27.9942, lng: -82.6925 },
  { id: 'gulfport-public', name: 'Gulfport Public Library', mun: 'Gulfport', addr: '5501 28th Ave S, Gulfport, FL 33707', lat: 27.7425, lng: -82.7095 },
  { id: 'pinellas-park-public', name: 'Barbara S. Ponce Public Library', mun: 'Pinellas Park', addr: '7770 52nd St N, Pinellas Park, FL 33781', lat: 27.8425, lng: -82.7065 },
  { id: 'oldsmar-public', name: 'Oldsmar Public Library', mun: 'Oldsmar', addr: '400 St Petersburg Dr E, Oldsmar, FL 34677', lat: 28.0335, lng: -82.6685 },
  { id: 'palm-harbor-library', name: 'Palm Harbor Library', mun: 'Palm Harbor', addr: '2330 Nebraska Ave, Palm Harbor, FL 34683', lat: 28.0862, lng: -82.7681 },
  { id: 'seminole-community', name: 'Seminole Community Library at SPC', mun: 'Seminole', addr: '9200 113th St N, Seminole, FL 33772', lat: 27.8545, lng: -82.7935 },
  { id: 'east-lake-community', name: 'East Lake Community Library', mun: 'Palm Harbor', addr: '4153 E Lake Rd S, Palm Harbor, FL 34685', lat: 28.1095, lng: -82.6985 }
];

for (const b of pplcBranches) {
  addStream({
    id: `pplc-${b.id}`,
    name: `PPLC ${b.name}`,
    vertical: 'civic-libraries',
    verticalLabel: 'Civic & Public Libraries',
    county: 'Pinellas',
    countyCode: '12103',
    municipality: b.mun,
    state: 'FL',
    venue: b.name,
    address: b.addr,
    lat: b.lat,
    lng: b.lng,
    kind: 'schedule',
    status: 'candidate',
    feedUrl: `https://pplc.us/locations/${b.id}`,
    sourceUrl: 'https://pplc.us/',
    notes: `Pinellas Public Library Cooperative municipal branch providing literacy, arts, and civic lectures.`
  });
}

// Pasco County Library System (8 branches)
const pascoBranches = [
  { id: 'centennial-park', name: 'Centennial Park Branch Library', mun: 'Holiday', addr: '5740 Moog Rd, Holiday, FL 34690', lat: 28.1885, lng: -82.7385, status: 'active-anchor' },
  { id: 'hugh-embry', name: 'Hugh Embry Library', mun: 'Dade City', addr: '14215 4th St, Dade City, FL 33523', lat: 28.3645, lng: -82.1965, status: 'candidate' },
  { id: 'land-o-lakes', name: 'Land O\' Lakes Branch Library', mun: 'Land O\' Lakes', addr: '2818 Collier Pkwy, Land O\' Lakes, FL 34639', lat: 28.1925, lng: -82.4495, status: 'candidate' },
  { id: 'new-river', name: 'New River Branch Library', mun: 'Zephyrhills', addr: '34043 State Road 54, Zephyrhills, FL 33543', lat: 28.2435, lng: -82.2615, status: 'candidate' },
  { id: 'regency-park', name: 'Regency Park Branch Library', mun: 'New Port Richey', addr: '9701 Little Rd, New Port Richey, FL 34654', lat: 28.2985, lng: -82.6845, status: 'candidate' },
  { id: 'south-holiday', name: 'South Holiday Branch Library', mun: 'Holiday', addr: '4649 Mile Stretch Dr, Holiday, FL 34690', lat: 28.1815, lng: -82.7485, status: 'candidate' },
  { id: 'hudson-branch', name: 'Hudson Regional Library', mun: 'Hudson', addr: '8012 Library Rd, Hudson, FL 34667', lat: 28.3495, lng: -82.6845, status: 'candidate' },
  { id: 'starkey-ranch', name: 'Starkey Ranch TLC Library', mun: 'Odessa', addr: '12118 Lake Blanche Dr, Odessa, FL 33556', lat: 28.1955, lng: -82.6025, status: 'candidate' },
  { id: 'new-port-richey-public', name: 'New Port Richey Public Library', mun: 'New Port Richey', addr: '5939 Main St, New Port Richey, FL 34652', lat: 28.2445, lng: -82.7195, status: 'candidate' },
  { id: 'zephyrhills-public', name: 'Zephyrhills Public Library', mun: 'Zephyrhills', addr: '5344 9th St, Zephyrhills, FL 33542', lat: 28.2345, lng: -82.1795, status: 'candidate' },
  { id: 'wiregrass-ranch', name: 'Wiregrass Ranch Branch Library', mun: 'Wesley Chapel', addr: '28211 Paseo Dr, Wesley Chapel, FL 33543', lat: 28.1885, lng: -82.3385, status: 'candidate' }
];

for (const b of pascoBranches) {
  addStream({
    id: `pasco-${b.id}`,
    name: b.name,
    vertical: 'civic-libraries',
    verticalLabel: 'Civic & Public Libraries',
    county: 'Pasco',
    countyCode: '12101',
    municipality: b.mun,
    state: 'FL',
    venue: b.name,
    address: b.addr,
    lat: b.lat,
    lng: b.lng,
    kind: 'schedule',
    status: b.status,
    feedUrl: `https://www.pascolibraries.org/branches/${b.id}`,
    sourceUrl: 'https://www.pascolibraries.org/',
    notes: `Pasco County public library branch offering literacy classes, STEM sessions, and local history archives.`
  });
}

// Manatee County Public Library System (8 branches)
const manateeBranches = [
  { id: 'downtown-bradenton', name: 'Manatee County Central Library', mun: 'Bradenton', addr: '1301 Barcarrota Blvd W, Bradenton, FL 34205', lat: 27.4989, lng: -82.5748, status: 'active-anchor' },
  { id: 'braden-river', name: 'Braden River Branch Library', mun: 'Bradenton', addr: '4915 53rd Ave E, Bradenton, FL 34203', lat: 27.4425, lng: -82.4985, status: 'candidate' },
  { id: 'island-branch', name: 'Island Branch Library', mun: 'Holmes Beach', addr: '5701 Marina Dr, Holmes Beach, FL 34217', lat: 27.5095, lng: -82.7155, status: 'candidate' },
  { id: 'palmetto-branch', name: 'Palmetto Branch Library', mun: 'Palmetto', addr: '923 6th St W, Palmetto, FL 34221', lat: 27.5185, lng: -82.5745, status: 'candidate' },
  { id: 'rocky-bluff', name: 'Rocky Bluff Branch Library', mun: 'Ellenton', addr: '6750 US-301, Ellenton, FL 34222', lat: 27.5345, lng: -82.4995, status: 'candidate' },
  { id: 'south-manatee', name: 'South Manatee Branch Library', mun: 'Bradenton', addr: '6081 26th St W, Bradenton, FL 34207', lat: 27.4375, lng: -82.5835, status: 'candidate' },
  { id: 'lakewood-ranch-library', name: 'Lakewood Ranch Library', mun: 'Lakewood Ranch', addr: '16410 Rangeland Pkwy, Lakewood Ranch, FL 34211', lat: 27.4325, lng: -82.3525, status: 'candidate' },
  { id: 'palmetto-carnegie', name: 'Palmetto Carnegie Historical Library', mun: 'Palmetto', addr: '515 10th Ave W, Palmetto, FL 34221', lat: 27.5215, lng: -82.5765, status: 'candidate' }
];

for (const b of manateeBranches) {
  addStream({
    id: `manatee-${b.id}`,
    name: b.name,
    vertical: 'civic-libraries',
    verticalLabel: 'Civic & Public Libraries',
    county: 'Manatee',
    countyCode: '12081',
    municipality: b.mun,
    state: 'FL',
    venue: b.name,
    address: b.addr,
    lat: b.lat,
    lng: b.lng,
    kind: 'schedule',
    status: b.status,
    feedUrl: `https://www.mymanatee.org/departments/library/${b.id}`,
    sourceUrl: 'https://www.mymanatee.org/library',
    notes: `Manatee County library branch providing community book discussions, educational technology, and children programs.`
  });
}

// Polk County Library System (Western Polk: Lakeland & Mulberry, 6 branches)
const polkBranches = [
  { id: 'lakeland-main', name: 'Lakeland Public Library Main Branch', mun: 'Lakeland', addr: '100 Lake Morton Dr, Lakeland, FL 33801', lat: 28.0385, lng: -81.9485, status: 'active-anchor' },
  { id: 'larry-jackson', name: 'Larry R. Jackson Branch Library', mun: 'Lakeland', addr: '1700 N Florida Ave, Lakeland, FL 33805', lat: 28.0615, lng: -81.9565, status: 'candidate' },
  { id: 'elibrary-south-lakeland', name: 'eLibrary South Lakeland', mun: 'Lakeland', addr: '4740 S Florida Ave, Lakeland, FL 33813', lat: 27.9815, lng: -81.9585, status: 'candidate' },
  { id: 'highland-city', name: 'Highland City Community Library', mun: 'Highland City', addr: 'Highland City, FL 33846', lat: 27.9545, lng: -81.8825, status: 'candidate' },
  { id: 'mulberry-public', name: 'Mulberry Public Library', mun: 'Mulberry', addr: '905 NE 5th St, Mulberry, FL 33860', lat: 27.9045, lng: -81.9685, status: 'candidate' },
  { id: 'kathleen-branch', name: 'Kathleen Community Library', mun: 'Lakeland', addr: 'Kathleen, FL 33810', lat: 28.1125, lng: -82.0125, status: 'candidate' },
  { id: 'medulla-resource', name: 'Medulla Resource Branch', mun: 'Lakeland', addr: 'Lakeland, FL 33813', lat: 27.9625, lng: -81.9685, status: 'candidate' }
];

for (const b of polkBranches) {
  addStream({
    id: `polk-${b.id}`,
    name: b.name,
    vertical: 'civic-libraries',
    verticalLabel: 'Civic & Public Libraries',
    county: 'Polk',
    countyCode: '12105',
    municipality: b.mun,
    state: 'FL',
    venue: b.name,
    address: b.addr,
    lat: b.lat,
    lng: b.lng,
    kind: 'schedule',
    status: b.status,
    feedUrl: `https://www.lakelandgov.net/departments/library/${b.id}`,
    sourceUrl: 'https://www.lakelandgov.net/library',
    notes: `Public library facility serving Western Polk County with community reading circles, family workshops, and digital media access.`
  });
}

console.log(`Civic Libraries total: ${streams.length}`);

// 2. Live Performing Arts & Stage (Target 40+)
const performingArts = [
  { id: 'straz-center-morsani', name: 'Carol Morsani Hall at Straz Center', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1010 N MacInnes Pl, Tampa, FL 33602', lat: 27.9535, lng: -82.4645, status: 'active-anchor' },
  { id: 'straz-center-ferguson', name: 'Ferguson Hall at Straz Center', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1010 N MacInnes Pl, Tampa, FL 33602', lat: 27.9538, lng: -82.4648, status: 'candidate' },
  { id: 'straz-center-jaeb', name: 'Jaeb Theater at Straz Center', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1010 N MacInnes Pl, Tampa, FL 33602', lat: 27.9532, lng: -82.4642, status: 'candidate' },
  { id: 'tampa-theatre', name: 'Tampa Theatre Historic Movie Palace', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '711 N Franklin St, Tampa, FL 33602', lat: 27.9492, lng: -82.4595, status: 'active-anchor' },
  { id: 'mahaffey-theater', name: 'Mahaffey Theater Duke Energy Center', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '400 1st St S, St. Petersburg, FL 33701', lat: 27.7665, lng: -82.6335, status: 'active-anchor' },
  { id: 'ruth-eckerd-hall', name: 'Ruth Eckerd Hall Performing Arts', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '1111 McMullen Booth Rd, Clearwater, FL 33759', lat: 27.9715, lng: -82.7105, status: 'active-anchor' },
  { id: 'bilheimer-capitol', name: 'Bilheimer Capitol Theatre', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '405 Cleveland St, Clearwater, FL 33755', lat: 27.9655, lng: -82.8005, status: 'candidate' },
  { id: 'american-stage', name: 'American Stage Theatre Company', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '163 3rd St N, St. Petersburg, FL 33701', lat: 27.7735, lng: -82.6375, status: 'active-anchor' },
  { id: 'freefall-theatre', name: 'freeFall Theatre Company', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '6099 Central Ave, St. Petersburg, FL 33710', lat: 27.7712, lng: -82.7175, status: 'candidate' },
  { id: 'stageworks-theatre', name: 'Stageworks Theatre Tampa', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1120 E Kennedy Blvd, Tampa, FL 33602', lat: 27.9515, lng: -82.4485, status: 'candidate' },
  { id: 'jobsite-theater', name: 'Jobsite Theater Resident Company', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1010 N MacInnes Pl, Tampa, FL 33602', lat: 27.9535, lng: -82.4645, status: 'active-anchor' },
  { id: 'the-palladium-spc', name: 'The Palladium at St. Petersburg College', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '253 5th Ave N, St. Petersburg, FL 33701', lat: 27.7775, lng: -82.6385, status: 'active-anchor' },
  { id: 'st-pete-city-theatre', name: 'St. Petersburg City Theatre', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '4025 31st St S, St. Petersburg, FL 33712', lat: 27.7285, lng: -82.6775, status: 'candidate' },
  { id: 'francis-wilson-playhouse', name: 'Francis Wilson Playhouse', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '302 Seminole St, Clearwater, FL 33755', lat: 27.9712, lng: -82.8025, status: 'candidate' },
  { id: 'tarpon-performing-arts', name: 'Tarpon Springs Performing Arts Center', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '324 E Pine St, Tarpon Springs, FL 34689', lat: 28.1485, lng: -82.7535, status: 'candidate' },
  { id: 'carrollwood-cultural-center', name: 'Carrollwood Cultural Center Stage', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4537 Lowell Rd, Tampa, FL 33618', lat: 28.0585, lng: -82.5165, status: 'candidate' },
  { id: 'manatee-performing-arts', name: 'Manatee Performing Arts Center', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '502 3rd Ave W, Bradenton, FL 34205', lat: 27.4985, lng: -82.5695, status: 'candidate' },
  { id: 'asolo-rep-theatre', name: 'Asolo Repertory Theatre Mertz Stage', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '5555 N Tamiami Trl, Bradenton, FL 34243', lat: 27.3835, lng: -82.5605, status: 'candidate' },
  { id: 'polk-theatre-lakeland', name: 'Historic Polk Theatre Lakeland', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '121 S Florida Ave, Lakeland, FL 33801', lat: 28.0415, lng: -81.9545, status: 'candidate' },
  { id: 'rp-funding-center', name: 'RP Funding Center Youkey Theatre', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '701 W Lime St, Lakeland, FL 33815', lat: 28.0405, lng: -81.9665, status: 'candidate' },
  { id: 'richey-suncoast-theatre', name: 'Richey Suncoast Theatre', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '6237 Grand Blvd, New Port Richey, FL 34652', lat: 28.2435, lng: -82.7185, status: 'candidate' },
  { id: 'central-park-arts-largo', name: 'Central Park Performing Arts Center', mun: 'Largo', county: 'Pinellas', code: '12103', addr: '105 Central Park Dr, Largo, FL 33771', lat: 27.9105, lng: -82.7805, status: 'candidate' },
  { id: 'spitfire-comedy', name: 'Spitfire Comedy Theater', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1939 Central Ave, St. Petersburg, FL 33713', lat: 27.7708, lng: -82.6605, status: 'active-anchor' },
  { id: 'lab-theater-project', name: 'Lab Theater Project Ybor', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '812 E Henderson Ave, Tampa, FL 33602', lat: 27.9625, lng: -82.4505, status: 'active-anchor' },
  { id: 'studio-620', name: 'The Studio@620 Community Stage', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '620 1st Ave S, St. Petersburg, FL 33701', lat: 27.7685, lng: -82.6435, status: 'active-anchor' },
  { id: 'spanish-lyric-theatre', name: 'Spanish Lyric Theatre', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1800 E 8th Ave, Tampa, FL 33605', lat: 27.9602, lng: -82.4385, status: 'candidate' },
  { id: 'powerstories-theatre', name: 'Powerstories Theatre', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2105 W Bristol Ave, Tampa, FL 33609', lat: 27.9355, lng: -82.4825, status: 'candidate' },
  { id: 'florida-orchestra', name: 'The Florida Orchestra Community Concerts', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '244 2nd Ave N, St. Petersburg, FL 33701', lat: 27.7735, lng: -82.6380, status: 'candidate' },
  { id: 'st-pete-opera', name: 'St. Petersburg Opera Company Center', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2145 1st Ave S, St. Petersburg, FL 33712', lat: 27.7705, lng: -82.6635, status: 'candidate' },
  { id: 'opera-tampa', name: 'Opera Tampa Resident Productions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1010 N MacInnes Pl, Tampa, FL 33602', lat: 27.9535, lng: -82.4645, status: 'candidate' },
  { id: 'west-coast-players', name: 'West Coast Players Community Theatre', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '21905 US Hwy 19 N, Clearwater, FL 33765', lat: 27.9825, lng: -82.7295, status: 'candidate' },
  { id: 'eight-oclock-theatre', name: 'Eight O\'Clock Theatre Community Stage', mun: 'Largo', county: 'Pinellas', code: '12103', addr: '105 Central Park Dr, Largo, FL 33771', lat: 27.9105, lng: -82.7805, status: 'candidate' },
  { id: 'tampa-city-ballet', name: 'Tampa City Ballet Company', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1408 N Howard Ave, Tampa, FL 33607', lat: 27.9545, lng: -82.4835, status: 'candidate' },
  { id: 'florida-dance-theatre', name: 'Florida Dance Theatre Lakeland', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '305 W Main St, Lakeland, FL 33815', lat: 28.0425, lng: -81.9585, status: 'candidate' },
  { id: 'lakeland-community-theatre', name: 'Lakeland Community Theatre at Lake Mirror', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '121 S Lake Ave, Lakeland, FL 33801', lat: 28.0435, lng: -81.9485, status: 'candidate' },
  { id: 'rp-funding-center-theatre', name: 'RP Funding Center Youkey Theatre', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '701 W Lime St, Lakeland, FL 33815', lat: 28.0395, lng: -81.9615, status: 'candidate' },
  { id: 'phsc-performing-arts', name: 'PHSC Performing Arts Center West', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '10230 Ridge Rd, New Port Richey, FL 34654', lat: 28.2745, lng: -82.6645, status: 'candidate' },
  { id: 'suncoast-black-arts', name: 'Suncoast Black Arts Collaborative', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '400 12th St W, Bradenton, FL 34205', lat: 27.4965, lng: -82.5715, status: 'candidate' },
  { id: 'green-light-cinema', name: 'Green Light Cinema Independent Screen', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '221 2nd Ave N, St. Petersburg, FL 33701', lat: 27.7738, lng: -82.6372, status: 'active-anchor' },
  { id: 'carrollwood-players', name: 'Carrollwood Players Community Theatre', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4333 Gunn Hwy, Tampa, FL 33618', lat: 28.0425, lng: -82.5185, status: 'candidate' },
  { id: 'aerial-dragons-studios', name: 'Aerial Dragons Circus Arts Center', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1701 N 14th St, Tampa, FL 33605', lat: 27.9615, lng: -82.4435, status: 'active-anchor' }
];

for (const p of performingArts) {
  addStream({
    id: p.id,
    name: p.name,
    vertical: 'performing-arts',
    verticalLabel: 'Live Performing Arts & Stage',
    county: p.county,
    countyCode: p.code,
    municipality: p.mun,
    state: 'FL',
    venue: p.name,
    address: p.addr,
    lat: p.lat,
    lng: p.lng,
    kind: 'schedule',
    status: p.status,
    feedUrl: `https://events.example.org/${p.id}`,
    sourceUrl: `https://${p.id}.example.org/`,
    notes: `Performing arts venue staging live theatre, classical concerts, and independent dance performances.`
  });
}

console.log(`Performing Arts total added: ${performingArts.length}, Total now: ${streams.length}`);

// 3. Visual Arts & World Museums (Target 35+)
const visualArts = [
  { id: 'dali-museum', name: 'The Salvador Dalí Museum', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1 Dalí Blvd, St. Petersburg, FL 33701', lat: 27.7659, lng: -82.6366, status: 'active-anchor' },
  { id: 'mfa-st-pete', name: 'Museum of Fine Arts, St. Petersburg', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '255 Beach Dr NE, St. Petersburg, FL 33701', lat: 27.7745, lng: -82.6335, status: 'active-anchor' },
  { id: 'tampa-museum-of-art', name: 'Tampa Museum of Art Exhibitions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '120 W Gasparilla Plaza, Tampa, FL 33602', lat: 27.9499, lng: -82.4638, status: 'active-anchor' },
  { id: 'imagine-museum', name: 'Imagine Museum Contemporary Glass Art', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1901 Central Ave, St. Petersburg, FL 33713', lat: 27.7708, lng: -82.6595, status: 'active-anchor' },
  { id: 'james-museum', name: 'The James Museum of Western & Wildlife Art', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '150 Central Ave, St. Petersburg, FL 33701', lat: 27.7715, lng: -82.6365, status: 'active-anchor' },
  { id: 'chihuly-collection', name: 'Chihuly Collection at Morean Arts', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '720 Central Ave, St. Petersburg, FL 33701', lat: 27.7712, lng: -82.6445, status: 'active-anchor' },
  { id: 'morean-arts-center', name: 'Morean Arts Center & Glass Studio', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '719 Central Ave, St. Petersburg, FL 33701', lat: 27.7715, lng: -82.6442, status: 'active-anchor' },
  { id: 'florida-craftart', name: 'Florida CraftArt Gallery', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '501 Central Ave, St. Petersburg, FL 33701', lat: 27.7715, lng: -82.6415, status: 'active-anchor' },
  { id: 'dunedin-fine-art-center', name: 'Dunedin Fine Art Center (DFAC)', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '1143 Michigan Blvd, Dunedin, FL 34698', lat: 28.0315, lng: -82.7835, status: 'active-anchor' },
  { id: 'leepa-rattner-museum', name: 'Leepa-Rattner Museum of Art at SPC', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '600 E Klosterman Rd, Tarpon Springs, FL 34689', lat: 28.1295, lng: -82.7485, status: 'active-anchor' },
  { id: 'usf-contemporary-art', name: 'USF Contemporary Art Museum (CAM)', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '3821 USF Holly Dr, Tampa, FL 33620', lat: 28.0645, lng: -82.4145, status: 'active-anchor' },
  { id: 'polk-museum-of-art', name: 'Polk Museum of Art at Florida Southern', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '800 E Palmetto St, Lakeland, FL 33801', lat: 28.0365, lng: -81.9445, status: 'candidate' },
  { id: 'bishop-museum-science', name: 'The Bishop Museum of Science and Nature', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '201 10th St W, Bradenton, FL 34205', lat: 27.4995, lng: -82.5695, status: 'candidate' },
  { id: 'fmopa-photography', name: 'Florida Museum of Photographic Arts', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1630 E 7th Ave, Tampa, FL 33605', lat: 27.9605, lng: -82.4415, status: 'active-anchor' },
  { id: 'henry-b-plant-museum', name: 'Henry B. Plant Museum at UT', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '401 W Kennedy Blvd, Tampa, FL 33606', lat: 27.9465, lng: -82.4645, status: 'active-anchor' },
  { id: 'tampa-bay-auto-museum', name: 'Tampa Bay Automobile Museum', mun: 'Pinellas Park', county: 'Pinellas', code: '12103', addr: '3301 Gateway Centre Blvd, Pinellas Park, FL 33782', lat: 27.8775, lng: -82.6845, status: 'active-anchor' },
  { id: 'creative-clay-cultural', name: 'Creative Clay Cultural Arts Center', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1846 1st Ave S, St. Petersburg, FL 33712', lat: 27.7705, lng: -82.6585, status: 'candidate' },
  { id: 'suntan-art-center', name: 'Suntan Art Center Pass-A-Grille', mun: 'St. Pete Beach', county: 'Pinellas', code: '12103', addr: '3300 Pass A Grille Way, St. Pete Beach, FL 33706', lat: 27.6895, lng: -82.7385, status: 'active-anchor' },
  { id: 'safety-harbor-museum', name: 'Safety Harbor Museum & Cultural Center', mun: 'Safety Harbor', county: 'Pinellas', code: '12103', addr: '329 S Bayshore Blvd, Safety Harbor, FL 34695', lat: 27.9895, lng: -82.6895, status: 'candidate' },
  { id: 'pasco-fine-arts-council', name: 'Pasco Fine Arts Council Gallery', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '4145 Fairford Dr, New Port Richey, FL 34652', lat: 28.2195, lng: -82.7245, status: 'candidate' },
  { id: 'art-center-manatee', name: 'ArtCenter Manatee Fine Galleries', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '209 9th St W, Bradenton, FL 34205', lat: 27.4985, lng: -82.5685, status: 'candidate' },
  { id: 'melvin-gallery-fsc', name: 'Melvin Art Gallery at Florida Southern', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '111 Lake Hollingsworth Dr, Lakeland, FL 33801', lat: 28.0285, lng: -81.9465, status: 'candidate' },
  { id: 'platform-art-lakeland', name: 'Platform Art Public Exhibits', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '111 Lake Hollingsworth Dr, Lakeland, FL 33801', lat: 28.0295, lng: -81.9475, status: 'candidate' },
  { id: 'wada-artsxchange', name: 'WADA ArtsXchange Gallery & Studios', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '515 22nd St S, St. Petersburg, FL 33712', lat: 27.7655, lng: -82.6625, status: 'active-anchor' },
  { id: 'soft-water-gallery', name: 'Soft Water Gallery Warehouse Arts', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '515 22nd St S, St. Petersburg, FL 33712', lat: 27.7658, lng: -82.6628, status: 'candidate' },
  { id: 'tempus-projects', name: 'Tempus Projects Contemporary Space', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4624 N Florida Ave, Tampa, FL 33603', lat: 27.9885, lng: -82.4595, status: 'candidate' },
  { id: 'parachute-gallery', name: 'Parachute Gallery Kress Contemporary', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1624 E 7th Ave, Tampa, FL 33605', lat: 27.9602, lng: -82.4418, status: 'candidate' },
  { id: 'clayton-galleries', name: 'Clayton Galleries South Tampa', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4105 S MacDill Ave, Tampa, FL 33611', lat: 27.9045, lng: -82.4935, status: 'candidate' },
  { id: 'artspace-v5-dunedin', name: 'Artspace V5 Dunedin Arts', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '730 Broadway, Dunedin, FL 34698', lat: 28.0145, lng: -82.7885, status: 'candidate' },
  { id: 'stirling-art-studios', name: 'Stirling Art Studios and Gallery', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '730 Broadway, Dunedin, FL 34698', lat: 28.0142, lng: -82.7882, status: 'candidate' },
  { id: 'village-of-the-arts', name: 'Village of the Arts Studios Walk', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '1227 12th St W, Bradenton, FL 34205', lat: 27.4895, lng: -82.5715, status: 'candidate' },
  { id: 'manatee-ag-museum', name: 'Manatee County Agricultural Museum', mun: 'Palmetto', county: 'Manatee', code: '12081', addr: '1015 6th St W, Palmetto, FL 34221', lat: 27.5195, lng: -82.5755, status: 'candidate' },
  { id: 'pioneer-florida-museum', name: 'Pioneer Florida Museum & Village', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '15602 Pioneer Museum Rd, Dade City, FL 33523', lat: 28.3845, lng: -82.1995, status: 'candidate' },
  { id: 'floridarama-immersive', name: 'Floridarama Immersive Art Experience', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2606 54th Ave S, St. Petersburg, FL 33712', lat: 27.7195, lng: -82.6685, status: 'active-anchor' },
  { id: 'shamc-arts-center', name: 'Safety Harbor Art and Music Center', mun: 'Safety Harbor', county: 'Pinellas', code: '12103', addr: '706 2nd St S, Safety Harbor, FL 34695', lat: 27.9875, lng: -82.6915, status: 'active-anchor' },
  { id: 'dysfunctional-grace', name: 'Dysfunctional Grace Oddities & Natural History', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1903 E 7th Ave, Tampa, FL 33605', lat: 27.9608, lng: -82.4375, status: 'active-anchor' }
];

for (const v of visualArts) {
  addStream({
    id: v.id,
    name: v.name,
    vertical: 'visual-arts',
    verticalLabel: 'Visual Arts & World Museums',
    county: v.county,
    countyCode: v.code,
    municipality: v.mun,
    state: 'FL',
    venue: v.name,
    address: v.addr,
    lat: v.lat,
    lng: v.lng,
    kind: 'schedule',
    status: v.status,
    feedUrl: `https://events.example.org/${v.id}`,
    sourceUrl: `https://${v.id}.example.org/`,
    notes: `Museum or gallery exhibiting fine arts, sculpture, contemporary glass, and visual craft.`
  });
}

console.log(`Visual Arts total added: ${visualArts.length}, Total now: ${streams.length}`);

// 4. Heritage, Latinx & Greek Culture (Target 35+)
const heritageCulture = [
  { id: 'centro-asturiano', name: 'Centro Asturiano de Tampa', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1913 N Nebraska Ave, Tampa, FL 33602', lat: 27.9635, lng: -82.4515, status: 'active-anchor' },
  { id: 'cuban-club-ybor', name: 'El Círculo Cubano de Tampa (The Cuban Club)', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2010 N Avenida Republica de Cuba, Tampa, FL 33605', lat: 27.9638, lng: -82.4412, status: 'candidate' },
  { id: 'italian-club-ybor', name: 'The Italian Club of Tampa (L\'Unione Italiana)', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1731 E 7th Ave, Tampa, FL 33605', lat: 27.9605, lng: -82.4395, status: 'active-anchor' },
  { id: 'ybor-museum-state-park', name: 'Ybor City Museum State Park & Casitas', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1818 E 9th Ave, Tampa, FL 33605', lat: 27.9625, lng: -82.4385, status: 'candidate' },
  { id: 'tarpon-sponge-docks', name: 'Tarpon Springs Historic Sponge Docks', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: 'Dodecanese Blvd, Tarpon Springs, FL 34689', lat: 28.1565, lng: -82.7585, status: 'active-anchor' },
  { id: 'st-nicholas-cathedral', name: 'St. Nicholas Greek Orthodox Cathedral', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '36 N Pinellas Ave, Tarpon Springs, FL 34689', lat: 28.1475, lng: -82.7565, status: 'candidate' },
  { id: 'tampa-bay-history-center', name: 'Tampa Bay History Center & Touchton Map Library', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '801 Water St, Tampa, FL 33602', lat: 27.9429, lng: -82.4514, status: 'active-anchor' },
  { id: 'woodson-african-american', name: 'Dr. Carter G. Woodson African American Museum', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2240 9th Ave S, St. Petersburg, FL 33712', lat: 27.7605, lng: -82.6635, status: 'active-anchor' },
  { id: 'tampa-firefighters-museum', name: 'Tampa Firefighters Museum', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '720 E Zack St, Tampa, FL 33602', lat: 27.9515, lng: -82.4555, status: 'active-anchor' },
  { id: 'cracker-country', name: 'Cracker Country Living History Museum', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4800 US-301, Tampa, FL 33610', lat: 27.9895, lng: -82.3585, status: 'active-anchor' },
  { id: 'heritage-village-largo', name: 'Heritage Village Pinellas Living History', mun: 'Largo', county: 'Pinellas', code: '12103', addr: '11909 125th St N, Largo, FL 33774', lat: 27.8815, lng: -82.8165, status: 'active-anchor' },
  { id: 'jc-newman-cigar', name: 'J.C. Newman Cigar Co. El Reloj Factory Museum', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2701 N 16th St, Tampa, FL 33605', lat: 27.9695, lng: -82.4415, status: 'active-anchor' },
  { id: 'west-tampa-heritage', name: 'Centro Español de West Tampa', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2306 N Howard Ave, Tampa, FL 33607', lat: 27.9635, lng: -82.4835, status: 'candidate' },
  { id: 'plant-city-photo-archives', name: 'Plant City Photo Archives & History Center', mun: 'Plant City', county: 'Hillsborough', code: '12057', addr: '106 S Evers St, Plant City, FL 33563', lat: 28.0165, lng: -82.1155, status: 'candidate' },
  { id: 'willaford-railroad-museum', name: 'Robert W. Willaford Railroad Museum', mun: 'Plant City', county: 'Hillsborough', code: '12057', addr: '102 N Palmer St, Plant City, FL 33563', lat: 28.0175, lng: -82.1175, status: 'candidate' },
  { id: 'fl-holocaust-museum', name: 'The Florida Holocaust Museum', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '55 5th St S, St. Petersburg, FL 33701', lat: 27.7715, lng: -82.6405, status: 'candidate' },
  { id: 'pinellas-african-american', name: 'Pinellas African American Heritage Association', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2240 9th Ave S, St. Petersburg, FL 33712', lat: 27.7602, lng: -82.6632, status: 'candidate' },
  { id: 'gulfport-historical-society', name: 'Gulfport Historical Society & History Museum', mun: 'Gulfport', county: 'Pinellas', code: '12103', addr: '5301 28th Ave S, Gulfport, FL 33707', lat: 27.7435, lng: -82.7075, status: 'candidate' },
  { id: 'dunedin-history-museum', name: 'Dunedin History Museum at the Depot', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '349 Main St, Dunedin, FL 34698', lat: 28.0125, lng: -82.7875, status: 'candidate' },
  { id: 'safety-harbor-historical', name: 'Safety Harbor Historical Society Heritage Center', mun: 'Safety Harbor', county: 'Pinellas', code: '12103', addr: '329 S Bayshore Blvd, Safety Harbor, FL 34695', lat: 27.9892, lng: -82.6892, status: 'candidate' },
  { id: 'oldsmar-historical-museum', name: 'Oldsmar Historical Society Museum', mun: 'Oldsmar', county: 'Pinellas', code: '12103', addr: '101 State St W, Oldsmar, FL 34677', lat: 28.0345, lng: -82.6695, status: 'candidate' },
  { id: 'dade-city-heritage-museum', name: 'Dade City Heritage Cultural Museum', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '14106 7th St, Dade City, FL 33525', lat: 28.3635, lng: -82.1935, status: 'candidate' },
  { id: 'west-pasco-historical', name: 'West Pasco Historical Society Museum', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '6431 Circle Blvd, New Port Richey, FL 34652', lat: 28.2455, lng: -82.7215, status: 'candidate' },
  { id: 'zephyrhills-depot-museum', name: 'Zephyrhills Historic Depot Museum', mun: 'Zephyrhills', county: 'Pasco', code: '12101', addr: '39110 South Ave, Zephyrhills, FL 33542', lat: 28.2325, lng: -82.1765, status: 'candidate' },
  { id: 'manatee-historical-records', name: 'Manatee County Historical Records Library', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '1405 4th Ave W, Bradenton, FL 34205', lat: 27.4975, lng: -82.5765, status: 'candidate' },
  { id: 'florida-maritime-museum', name: 'Florida Maritime Museum at Cortez', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '4415 119th St W, Cortez, FL 34215', lat: 27.4685, lng: -82.6875, status: 'candidate' },
  { id: 'gamble-plantation-historic', name: 'Judah P. Benjamin Confederate Memorial at Gamble Plantation', mun: 'Ellenton', county: 'Manatee', code: '12081', addr: '3708 Patten Ave, Ellenton, FL 34222', lat: 27.5225, lng: -82.5315, status: 'candidate' },
  { id: 'de-soto-national-memorial', name: 'De Soto National Memorial', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '8300 De Soto Memorial Hwy, Bradenton, FL 34209', lat: 27.5235, lng: -82.6435, status: 'candidate' },
  { id: 'frank-lloyd-wright-visitor-center', name: 'Frank Lloyd Wright Visitor Center at FSC', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '840 Johnson Ave, Lakeland, FL 33801', lat: 28.0315, lng: -81.9475, status: 'candidate' },
  { id: 'mulberry-phosphate-museum', name: 'Mulberry Phosphate Museum & Fossil Dig', mun: 'Mulberry', county: 'Polk', code: '12105', addr: '101 S Church Ave, Mulberry, FL 33860', lat: 27.8975, lng: -81.9735, status: 'candidate' },
  { id: 'clearwater-historical-society', name: 'Clearwater Historical Society Plumb House', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '610 S Fort Harrison Ave, Clearwater, FL 33756', lat: 27.9575, lng: -82.7985, status: 'candidate' },
  { id: 'casa-pedroso-historic', name: 'Casa Pedroso Jose Marti Heritage Site', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1301 E 8th Ave, Tampa, FL 33605', lat: 27.9605, lng: -82.4455, status: 'candidate' },
  { id: 'tampa-bay-veterans-alliance', name: 'Tampa Bay Veterans Alliance Memorial', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: 'Crest Lake Park, Clearwater, FL 33756', lat: 27.9625, lng: -82.7715, status: 'candidate' },
  { id: 'florida-citrus-hall-of-fame', name: 'Florida Citrus Hall of Fame at FSC', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '111 Lake Hollingsworth Dr, Lakeland, FL 33801', lat: 28.0295, lng: -81.9485, status: 'candidate' },
  { id: 'palmetto-historical-park', name: 'Palmetto Historical Park Heritage Village', mun: 'Palmetto', county: 'Manatee', code: '12081', addr: '515 10th Ave W, Palmetto, FL 34221', lat: 27.5205, lng: -82.5765, status: 'candidate' },
  { id: 'sarasota-manatee-jewish', name: 'Jewish Federation of Sarasota-Manatee Heritage', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '580 McIntosh Rd, Bradenton, FL 34232', lat: 27.3625, lng: -82.4645, status: 'candidate' }
];

for (const h of heritageCulture) {
  addStream({
    id: h.id,
    name: h.name,
    vertical: 'heritage-culture',
    verticalLabel: 'Heritage, Latinx & Greek Culture',
    county: h.county,
    countyCode: h.code,
    municipality: h.mun,
    state: 'FL',
    venue: h.name,
    address: h.addr,
    lat: h.lat,
    lng: h.lng,
    kind: 'schedule',
    status: h.status,
    feedUrl: `https://events.example.org/${h.id}`,
    sourceUrl: `https://${h.id}.example.org/`,
    notes: `Historical institution celebrating Latinx cigar heritage, Greek sponge diving traditions, and Florida settlement archives.`
  });
}

console.log(`Heritage Culture total added: ${heritageCulture.length}, Total now: ${streams.length}`);

// 5. Parks, Springs & Gulf Coasts (Target 35+)
const parksOutdoors = [
  { id: 'fort-de-soto-park', name: 'Fort De Soto Park & North Beach Preserve', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '3500 Pinellas Bayway S, Tierra Verde, FL 33715', lat: 27.6186, lng: -82.7358, status: 'active-anchor' },
  { id: 'hillsborough-river-sp', name: 'Hillsborough River State Park', mun: 'Thonotosassa', county: 'Hillsborough', code: '12057', addr: '15402 US-301 N, Thonotosassa, FL 33592', lat: 28.1495, lng: -82.2315, status: 'active-anchor' },
  { id: 'weedon-island-preserve', name: 'Weedon Island Preserve Cultural Center', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1800 Weedon Dr NE, St. Petersburg, FL 33702', lat: 27.8485, lng: -82.6075, status: 'active-anchor' },
  { id: 'honeymoon-island-sp', name: 'Honeymoon Island State Park Nature Trail', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '1 Causeway Blvd, Dunedin, FL 34698', lat: 28.0645, lng: -82.8255, status: 'candidate' },
  { id: 'caladesi-island-sp', name: 'Caladesi Island State Park Ferry & Preserve', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '1 Causeway Blvd, Dunedin, FL 34698', lat: 28.0285, lng: -82.8235, status: 'candidate' },
  { id: 'robinson-preserve-nest', name: 'Robinson Preserve & The NEST Center', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '1704 99th St NW, Bradenton, FL 34209', lat: 27.5145, lng: -82.6625, status: 'candidate' },
  { id: 'emerson-point-preserve', name: 'Emerson Point Preserve Ancient Mound', mun: 'Palmetto', county: 'Manatee', code: '12081', addr: '5801 17th St W, Palmetto, FL 34221', lat: 27.5375, lng: -82.6285, status: 'candidate' },
  { id: 'anclote-key-sp', name: 'Anclote Key Preserve State Park Lighthouse', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: 'Anclote Key, Tarpon Springs, FL 34689', lat: 28.1695, lng: -82.8445, status: 'candidate' },
  { id: 'sunken-gardens', name: 'Sunken Gardens Historic Botanical Preserve', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1825 4th St N, St. Petersburg, FL 33704', lat: 27.7905, lng: -82.6395, status: 'active-anchor' },
  { id: 'fl-botanical-gardens', name: 'Florida Botanical Gardens & Heritage Village', mun: 'Largo', county: 'Pinellas', code: '12103', addr: '12520 Ulmerton Rd, Largo, FL 33774', lat: 27.8865, lng: -82.8175, status: 'active-anchor' },
  { id: 'usf-botanical-gardens', name: 'USF Botanical Gardens Conservation Tours', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '12210 USF Pine Dr, Tampa, FL 33620', lat: 28.0615, lng: -82.4245, status: 'active-anchor' },
  { id: 'selby-gardens-spanish-pt', name: 'Historic Spanish Point Osprey Sanctuary', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '401 N Tamiami Trl, Osprey, FL 34229', lat: 27.3525, lng: -82.4935, status: 'candidate' },
  { id: 'eureka-springs-park', name: 'Eureka Springs Conservation Park', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '6400 Eureka Springs Rd, Tampa, FL 33610', lat: 28.0075, lng: -82.3485, status: 'candidate' },
  { id: 'lettuce-lake-park', name: 'Lettuce Lake Conservation Park Boardwalk', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '6920 E Fletcher Ave, Tampa, FL 33637', lat: 28.0754, lng: -82.3746, status: 'active-anchor' },
  { id: 'upper-tampa-bay-park', name: 'Upper Tampa Bay Conservation Park', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '8001 Double Branch Rd, Tampa, FL 33635', lat: 28.0165, lng: -82.6285, status: 'candidate' },
  { id: 'aldermans-ford-park', name: 'Alderman\'s Ford Conservation Park', mun: 'Plant City', county: 'Hillsborough', code: '12057', addr: '100 Alderman\'s Ford Park Dr, Plant City, FL 33567', lat: 27.8685, lng: -82.1465, status: 'candidate' },
  { id: 'alafia-river-sp', name: 'Alafia River State Park Off-Road Trails', mun: 'Plant City', county: 'Hillsborough', code: '12057', addr: '14745 County Road 39 S, Lithia, FL 33547', lat: 27.7845, lng: -82.1195, status: 'candidate' },
  { id: 'little-manatee-river-sp', name: 'Little Manatee River State Park', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '215 Lightsey Rd, Wimauma, FL 33598', lat: 27.6745, lng: -82.3495, status: 'candidate' },
  { id: 'hollis-garden-lakeland', name: 'Hollis Garden & Lake Mirror Promenade', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '702 E Orange St, Lakeland, FL 33801', lat: 28.0435, lng: -81.9485, status: 'candidate' },
  { id: 'colt-creek-sp', name: 'Colt Creek State Park Green Swamp', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '16000 State Road 471, Lakeland, FL 33809', lat: 28.2735, lng: -82.0465, status: 'candidate' },
  { id: 'saddle-creek-park', name: 'Saddle Creek Park Bird Sanctuary', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '3730 Saddle Creek Rd, Lakeland, FL 33801', lat: 28.0705, lng: -81.8925, status: 'candidate' },
  { id: 'lake-parker-park', name: 'Lake Parker Park Environmental Trails', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '910 E Granada St, Lakeland, FL 33805', lat: 28.0645, lng: -81.9365, status: 'candidate' },
  { id: 'withlacoochee-river-park', name: 'Withlacoochee River Park & Wilderness', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '12449 Withlacoochee Blvd, Dade City, FL 33525', lat: 28.3445, lng: -82.1645, status: 'candidate' },
  { id: 'starkey-wilderness-park', name: 'J.B. Starkey Wilderness Park & Trail', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '10500 Wilderness Park Blvd, New Port Richey, FL 34655', lat: 28.2495, lng: -82.6335, status: 'candidate' },
  { id: 'werner-boyce-salt-springs', name: 'Werner-Boyce Salt Springs State Park', mun: 'Port Richey', county: 'Pasco', code: '12101', addr: '8733 Scenic Dr, Port Richey, FL 34668', lat: 28.2865, lng: -82.7215, status: 'candidate' },
  { id: 'anclote-river-park', name: 'Anclote River Park & Beach', mun: 'Holiday', county: 'Pasco', code: '12101', addr: '1119 Baillies Bluff Rd, Holiday, FL 34691', lat: 28.1795, lng: -82.7845, status: 'candidate' },
  { id: 'crews-lake-park', name: 'Crews Lake Wilderness Park', mun: 'Spring Hill', county: 'Pasco', code: '12101', addr: '16739 Crews Lake Dr, Spring Hill, FL 34610', lat: 28.4045, lng: -82.5295, status: 'candidate' },
  { id: 'wall-springs-park', name: 'Wall Springs Park & Historic Mineral Spring', mun: 'Palm Harbor', county: 'Pinellas', code: '12103', addr: '3725 De Soto Blvd, Palm Harbor, FL 34683', lat: 28.1135, lng: -82.7725, status: 'candidate' },
  { id: 'philippe-park', name: 'Philippe Park & Native American Mound', mun: 'Safety Harbor', county: 'Pinellas', code: '12103', addr: '2525 Philippe Pkwy, Safety Harbor, FL 34695', lat: 28.0085, lng: -82.6845, status: 'candidate' },
  { id: 'fred-howard-park', name: 'Fred Howard Park Gulf Causeway & Beach', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '1700 Sunset Dr, Tarpon Springs, FL 34689', lat: 28.1535, lng: -82.7915, status: 'candidate' },
  { id: 'sand-key-park', name: 'Sand Key Park Marine Preserve', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '1060 Gulf Blvd, Clearwater, FL 33767', lat: 27.9545, lng: -82.8285, status: 'candidate' },
  { id: 'boca-ciega-millennium', name: 'Boca Ciega Millennium Park Boardwalk', mun: 'Seminole', county: 'Pinellas', code: '12103', addr: '12410 Seminole Blvd, Seminole, FL 33778', lat: 27.8345, lng: -82.8095, status: 'candidate' },
  { id: 'lake-seminole-park', name: 'Lake Seminole Park Nature Trails', mun: 'Seminole', county: 'Pinellas', code: '12103', addr: '10015 Park Blvd, Seminole, FL 33777', lat: 27.8425, lng: -82.7745, status: 'candidate' },
  { id: 'rye-preserve', name: 'Rye Preserve & Manatee River Trails', mun: 'Parrish', county: 'Manatee', code: '12081', addr: '905 Rye Wilderness Trl, Parrish, FL 34219', lat: 27.5115, lng: -82.3665, status: 'candidate' },
  { id: 'duette-preserve', name: 'Duette Preserve Headwaters Nature Center', mun: 'Parrish', county: 'Manatee', code: '12081', addr: '2649 Rawls Rd, Duette, FL 33834', lat: 27.5645, lng: -82.1645, status: 'candidate' },
  { id: 'boyd-hill-nature-preserve', name: 'Boyd Hill Nature Preserve Lake Maggiore', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1101 Country Club Way S, St. Petersburg, FL 33705', lat: 27.7325, lng: -82.6515, status: 'active-anchor' },
  { id: 'bayshore-greenway-park', name: 'Bayshore Boulevard Greenway Linear Park', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: 'Bayshore Blvd, Tampa, FL 33606', lat: 27.9312, lng: -82.4655, status: 'active-anchor' }
];

for (const p of parksOutdoors) {
  addStream({
    id: p.id,
    name: p.name,
    vertical: 'parks-outdoors',
    verticalLabel: 'Parks, Springs & Gulf Coasts',
    county: p.county,
    countyCode: p.code,
    municipality: p.mun,
    state: 'FL',
    venue: p.name,
    address: p.addr,
    lat: p.lat,
    lng: p.lng,
    kind: 'schedule',
    status: p.status,
    feedUrl: `https://events.example.org/${p.id}`,
    sourceUrl: `https://${p.id}.example.org/`,
    notes: `Public nature preserve offering guided eco-walks, wildlife spotting, and coastal conservation workshops.`
  });
}

console.log(`Parks Outdoors total added: ${parksOutdoors.length}, Total now: ${streams.length}`);

// 6. Collegiate & Academic Discovery (Target 35+)
const collegiate = [
  { id: 'usf-central-events', name: 'University of South Florida Central Campus Events', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4202 E Fowler Ave, Tampa, FL 33620', lat: 28.0585, lng: -82.4135, status: 'active-anchor' },
  { id: 'usf-school-of-music', name: 'USF School of Music Barness Recital Hall', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '3755 USF Holly Dr, Tampa, FL 33620', lat: 28.0625, lng: -82.4165, status: 'active-anchor' },
  { id: 'usf-theatre-dance', name: 'USF School of Theatre and Dance Performances', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '3837 USF Holly Dr, Tampa, FL 33620', lat: 28.0635, lng: -82.4155, status: 'active-anchor' },
  { id: 'usf-st-pete-campus', name: 'USF St. Petersburg Campus Waterfront Seminars', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '140 7th Ave S, St. Petersburg, FL 33701', lat: 27.7635, lng: -82.6365, status: 'candidate' },
  { id: 'usf-sarasota-manatee', name: 'USF Sarasota-Manatee Academic Forums', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '8350 N Tamiami Trl, Sarasota, FL 34243', lat: 27.3895, lng: -82.5645, status: 'candidate' },
  { id: 'ut-sykes-college', name: 'University of Tampa Sykes College of Business Lectures', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '401 W Kennedy Blvd, Tampa, FL 33606', lat: 27.9475, lng: -82.4655, status: 'candidate' },
  { id: 'ut-sykes-chapel', name: 'UT Sykes Chapel Center for Faith & Values', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '401 W Kennedy Blvd, Tampa, FL 33606', lat: 27.9472, lng: -82.4665, status: 'active-anchor' },
  { id: 'ut-scarfone-hartley', name: 'UT Scarfone/Hartley Gallery Art Exhibitions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '310 N Blvd, Tampa, FL 33606', lat: 27.9485, lng: -82.4685, status: 'candidate' },
  { id: 'eckerd-environmental-film', name: 'Eckerd College Environmental Film Festival', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '4200 54th Ave S, St. Petersburg, FL 33711', lat: 27.7145, lng: -82.6935, status: 'candidate' },
  { id: 'eckerd-visual-arts', name: 'Eckerd College Nielsen Center Visual Arts', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '4200 54th Ave S, St. Petersburg, FL 33711', lat: 27.7148, lng: -82.6938, status: 'candidate' },
  { id: 'spc-palladium-series', name: 'St. Petersburg College Palladium Chamber Series', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '253 5th Ave N, St. Petersburg, FL 33701', lat: 27.7775, lng: -82.6385, status: 'active-anchor' },
  { id: 'spc-planetarium', name: 'St. Petersburg College Planetarium & Observatory', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '6605 5th Ave N, St. Petersburg, FL 33710', lat: 27.7772, lng: -82.7295, status: 'candidate' },
  { id: 'spc-tarpon-springs', name: 'SPC Tarpon Springs Fine Arts Amphitheater', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '600 E Klosterman Rd, Tarpon Springs, FL 34689', lat: 28.1285, lng: -82.7475, status: 'candidate' },
  { id: 'hcc-ybor-arts', name: 'Hillsborough Community College Ybor Art Gallery', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1411 E 11th Ave, Tampa, FL 33605', lat: 27.9625, lng: -82.4435, status: 'candidate' },
  { id: 'hcc-dale-mabry', name: 'HCC Dale Mabry Campus Performing Arts Stage', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4001 W Tampa Bay Blvd, Tampa, FL 33614', lat: 27.9735, lng: -82.5115, status: 'candidate' },
  { id: 'hcc-southshore', name: 'HCC SouthShore Community Science Series', mun: 'Ruskin', county: 'Hillsborough', code: '12057', addr: '551 24th St NE, Ruskin, FL 33570', lat: 27.7265, lng: -82.4145, status: 'candidate' },
  { id: 'phsc-west-campus', name: 'PHSC West Campus Performing Arts Series', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '10230 Ridge Rd, New Port Richey, FL 34654', lat: 28.2745, lng: -82.6645, status: 'candidate' },
  { id: 'phsc-east-campus', name: 'PHSC East Campus Cultural Lectures', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '36727 Blanton Rd, Dade City, FL 33523', lat: 28.3815, lng: -82.2345, status: 'candidate' },
  { id: 'scf-neel-performing-arts', name: 'State College of Florida Neel Performing Arts Center', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '5840 26th St W, Bradenton, FL 34207', lat: 27.4435, lng: -82.5845, status: 'candidate' },
  { id: 'scf-fine-arts-gallery', name: 'SCF Bradenton Fine Arts Gallery', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '5840 26th St W, Bradenton, FL 34207', lat: 27.4438, lng: -82.5848, status: 'candidate' },
  { id: 'fsc-architecture-tours', name: 'Florida Southern College Frank Lloyd Wright Seminars', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '111 Lake Hollingsworth Dr, Lakeland, FL 33801', lat: 28.0315, lng: -81.9485, status: 'candidate' },
  { id: 'fsc-branscomb-auditorium', name: 'FSC Branscomb Auditorium Fine Arts Series', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '111 Lake Hollingsworth Dr, Lakeland, FL 33801', lat: 28.0318, lng: -81.9488, status: 'candidate' },
  { id: 'seu-bush-chapel', name: 'Southeastern University Bush Chapel Concerts', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '1000 Longfellow Blvd, Lakeland, FL 33801', lat: 28.0285, lng: -81.9315, status: 'candidate' },
  { id: 'polk-state-lakeland', name: 'Polk State College Lakeland Campus Art Gallery', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '3425 Winter Lake Rd, Lakeland, FL 33803', lat: 28.0015, lng: -81.8965, status: 'candidate' },
  { id: 'florida-polytechnic-stem', name: 'Florida Polytechnic University STEM Speaker Series', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '4700 Research Way, Lakeland, FL 33805', lat: 28.1495, lng: -81.8515, status: 'candidate' },
  { id: 'stetson-law-gulfport', name: 'Stetson University College of Law Public Lectures', mun: 'Gulfport', county: 'Pinellas', code: '12103', addr: '1401 61st St S, Gulfport, FL 33707', lat: 27.7535, lng: -82.7165, status: 'candidate' },
  { id: 'saint-leo-university', name: 'Saint Leo University Historic Campus Seminars', mun: 'San Antonio', county: 'Pasco', code: '12101', addr: '33701 County Road 52, St. Leo, FL 33574', lat: 28.3375, lng: -82.2595, status: 'candidate' },
  { id: 'trinity-college-florida', name: 'Trinity College of Florida Academic Colloquia', mun: 'Trinity', county: 'Pasco', code: '12101', addr: '2430 Trinity Oaks Blvd, Trinity, FL 34655', lat: 28.1825, lng: -82.6715, status: 'candidate' },
  { id: 'usf-patel-college', name: 'USF Patel College of Global Sustainability', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4202 E Fowler Ave, Tampa, FL 33620', lat: 28.0588, lng: -82.4138, status: 'candidate' },
  { id: 'usf-marine-science-talks', name: 'USF College of Marine Science Oceanographic Lectures', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '140 7th Ave S, St. Petersburg, FL 33701', lat: 27.7615, lng: -82.6345, status: 'candidate' },
  { id: 'moffitt-community-lectures', name: 'Moffitt Cancer Center Public Science Colloquia', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '12902 USF Magnolia Dr, Tampa, FL 33612', lat: 28.0675, lng: -82.4245, status: 'candidate' },
  { id: 'jh-all-childrens-seminars', name: 'Johns Hopkins All Children\'s Pediatric Research Seminars', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '501 6th Ave S, St. Petersburg, FL 33701', lat: 27.7645, lng: -82.6415, status: 'candidate' },
  { id: 'nova-southeastern-tampa', name: 'Nova Southeastern University Tampa Regional Campus', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '3400 Gulf to Bay Blvd, Clearwater, FL 33759', lat: 27.9625, lng: -82.7165, status: 'candidate' },
  { id: 'famu-pharmacy-tampa', name: 'FAMU College of Pharmacy Tampa Public Health Clinics', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2001 E Dr MLK Jr Blvd, Tampa, FL 33610', lat: 27.9815, lng: -82.4385, status: 'candidate' },
  { id: 'ringling-college-manatee', name: 'Ringling College of Art & Design Academic Exhibitions', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '2700 N Tamiami Trl, Sarasota, FL 34234', lat: 27.3605, lng: -82.5515, status: 'candidate' }
];

for (const c of collegiate) {
  addStream({
    id: c.id,
    name: c.name,
    vertical: 'collegiate-academic',
    verticalLabel: 'Collegiate & Academic Discovery',
    county: c.county,
    countyCode: c.code,
    municipality: c.mun,
    state: 'FL',
    venue: c.name,
    address: c.addr,
    lat: c.lat,
    lng: c.lng,
    kind: 'schedule',
    status: c.status,
    feedUrl: `https://events.example.org/${c.id}`,
    sourceUrl: `https://${c.id}.example.org/`,
    notes: `University department or collegiate arts center providing academic lectures, public recitals, and research forums.`
  });
}

console.log(`Collegiate Academic total added: ${collegiate.length}, Total now: ${streams.length}`);

// 7. Nightlife, Indie & Latin Music (Target 30+)
const nightlife = [
  { id: 'crowbar-ybor', name: 'Crowbar Ybor Live Music Courtyard', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1812 N 17th St, Tampa, FL 33605', lat: 27.9608, lng: -82.4402, status: 'active-anchor' },
  { id: 'floridian-social-club', name: 'The Floridian Social Club Stage', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '687 Central Ave, St. Petersburg, FL 33701', lat: 27.7715, lng: -82.6435, status: 'candidate' },
  { id: 'jannus-live-courtyard', name: 'Jannus Live Historic Courtyard', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '200 1st Ave N, St. Petersburg, FL 33701', lat: 27.7725, lng: -82.6365, status: 'candidate' },
  { id: 'skippers-smokehouse', name: 'Skipper\'s Smokehouse Skipperdome', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '910 Skipper Rd, Tampa, FL 33613', lat: 28.0755, lng: -82.4495, status: 'active-anchor' },
  { id: 'the-ritz-ybor', name: 'The Ritz Ybor Historic Ballroom', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1503 E 7th Ave, Tampa, FL 33605', lat: 27.9602, lng: -82.4425, status: 'candidate' },
  { id: 'the-orpheum-tampa', name: 'The Orpheum Music Hall', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '14802 N Nebraska Ave, Tampa, FL 33613', lat: 28.0815, lng: -82.4515, status: 'candidate' },
  { id: 'the-bends-st-pete', name: 'The Bends Indie Music Lounge', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '919 1st Ave N, St. Petersburg, FL 33705', lat: 27.7718, lng: -82.6475, status: 'active-anchor' },
  { id: 'rubys-elixir', name: 'Ruby\'s Elixir Live Jazz & Blues', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '15 3rd St N, St. Petersburg, FL 33701', lat: 27.7722, lng: -82.6375, status: 'candidate' },
  { id: 'green-bench-brewing', name: 'Green Bench Brewing Co. Live Lawn', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1133 Baum Ave N, St. Petersburg, FL 33705', lat: 27.7715, lng: -82.6505, status: 'candidate' },
  { id: 'cigar-city-brewing', name: 'Cigar City Brewing Spruce Tasting Room', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '3924 W Spruce St, Tampa, FL 33607', lat: 27.9585, lng: -82.5085, status: 'candidate' },
  { id: 'coppertail-brewing', name: 'Coppertail Brewing Co. Ybor Hall', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2601 E 2nd Ave, Tampa, FL 33605', lat: 27.9545, lng: -82.4315, status: 'candidate' },
  { id: 'motorworks-brewing', name: 'Motorworks Brewing Outdoor Beer Garden', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '1014 9th St W, Bradenton, FL 34205', lat: 27.4915, lng: -82.5685, status: 'candidate' },
  { id: '3-daughters-brewing', name: '3 Daughters Brewing Music Stage', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '222 22nd St S, St. Petersburg, FL 33712', lat: 27.7685, lng: -82.6625, status: 'candidate' },
  { id: 'dunderbaks-brewpub', name: 'Mr. Dunderbak\'s Biergarten Stage', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '14929 Bruce B Downs Blvd, Tampa, FL 33647', lat: 28.0825, lng: -82.3995, status: 'candidate' },
  { id: 'hooch-and-hive', name: 'Hooch and Hive Arts & Music Lounge', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1001 W Cass St, Tampa, FL 33606', lat: 27.9495, lng: -82.4725, status: 'candidate' },
  { id: 'brass-mug-tampa', name: 'The Brass Mug Underground Rock Stage', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1450 Skipper Rd, Tampa, FL 33613', lat: 28.0752, lng: -82.4415, status: 'candidate' },
  { id: 'cage-brewing-stage', name: 'Cage Brewing Outdoor Music Venue', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1120 1st Ave S, St. Petersburg, FL 33705', lat: 27.7695, lng: -82.6505, status: 'candidate' },
  { id: 'ringside-cafe-blues', name: 'Ringside Cafe Blues & Soul Club', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '350 1st Ave N, St. Petersburg, FL 33701', lat: 27.7728, lng: -82.6395, status: 'candidate' },
  { id: 'dunedin-brewery-music', name: 'Dunedin Brewery Moon Tower Stage', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '937 Douglas Ave, Dunedin, FL 34698', lat: 28.0175, lng: -82.7875, status: 'candidate' },
  { id: 'gill-dawg-tiki', name: 'Gill Dawg Waterfront Music Stage', mun: 'Port Richey', county: 'Pasco', code: '12101', addr: '5419 Treadway Dr, Port Richey, FL 34668', lat: 28.2715, lng: -82.7215, status: 'candidate' },
  { id: 'bourbon-on-river', name: 'Bourbon on the River Waterfront Stage', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '5230 Tropic Dr, New Port Richey, FL 34652', lat: 28.2515, lng: -82.7245, status: 'candidate' },
  { id: 'union-hall-lakeland', name: 'Union Hall Live Music and Events', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '1023 S Florida Ave, Lakeland, FL 33803', lat: 28.0315, lng: -81.9545, status: 'candidate' },
  { id: 'swan-brewing-patio', name: 'Swan Brewing Lake Mirror Music Patio', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '115 W Pine St, Lakeland, FL 33815', lat: 28.0445, lng: -81.9565, status: 'candidate' },
  { id: 'spookeasy-lounge', name: 'The SpookEasy Lounge Botanical Lounge', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1909 N 15th St, Tampa, FL 33605', lat: 27.9625, lng: -82.4425, status: 'active-anchor' },
  { id: 'bula-kafe-acoustic', name: 'Bula Kafe Acoustic Music Sessions', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2500 5th Ave N, St. Petersburg, FL 33713', lat: 27.7775, lng: -82.6675, status: 'active-anchor' },
  { id: 'black-crow-poetry', name: 'Black Crow Coffee Co. Poetry Nights', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '722 2nd St N, St. Petersburg, FL 33701', lat: 27.7795, lng: -82.6365, status: 'active-anchor' },
  { id: 'microgroove-records', name: 'Microgroove Independent In-Store Sessions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4906 N Florida Ave, Tampa, FL 33603', lat: 27.9915, lng: -82.4595, status: 'active-anchor' },
  { id: 'daddy-kool-records', name: 'Daddy Kool Records Live Record Store Days', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2430 Terminal Dr S, St. Petersburg, FL 33712', lat: 27.7465, lng: -82.6655, status: 'active-anchor' },
  { id: 'mojo-books-music', name: 'Mojo Books & Records Acoustic Sessions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '2540 E Fowler Ave, Tampa, FL 33612', lat: 28.0545, lng: -82.4315, status: 'active-anchor' },
  { id: 'lowry-parcade', name: 'Lowry Parcade & Tavern Chiptune Nights', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1213 W Waters Ave, Tampa, FL 33604', lat: 28.0265, lng: -82.4735, status: 'active-anchor' }
];

for (const n of nightlife) {
  addStream({
    id: n.id,
    name: n.name,
    vertical: 'nightlife-music',
    verticalLabel: 'Nightlife, Indie & Latin Music',
    county: n.county,
    countyCode: n.code,
    municipality: n.mun,
    state: 'FL',
    venue: n.name,
    address: n.addr,
    lat: n.lat,
    lng: n.lng,
    kind: 'schedule',
    status: n.status,
    feedUrl: `https://events.example.org/${n.id}`,
    sourceUrl: `https://${n.id}.example.org/`,
    notes: `Music venue hosting live bands, indie showcases, acoustic songwriter sessions, and Latin jazz evenings.`
  });
}

console.log(`Nightlife total added: ${nightlife.length}, Total now: ${streams.length}`);

// 8. Family & Marine Discovery (Target 25+)
const familyMarine = [
  { id: 'florida-aquarium-programs', name: 'The Florida Aquarium Marine Discovery', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '701 Channelside Dr, Tampa, FL 33602', lat: 27.9442, lng: -82.4448, status: 'active-anchor' },
  { id: 'glazer-childrens-museum', name: 'Glazer Children\'s Museum Discovery Labs', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '110 W Gasparilla Plaza, Tampa, FL 33602', lat: 27.9505, lng: -82.4635, status: 'active-anchor' },
  { id: 'great-explorations-museum', name: 'Great Explorations Children\'s Museum', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1925 4th St N, St. Petersburg, FL 33704', lat: 27.7915, lng: -82.6395, status: 'active-anchor' },
  { id: 'zootampa-lowry-park', name: 'ZooTampa at Lowry Park Wildlife Programs', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1101 W Sligh Ave, Tampa, FL 33604', lat: 28.0125, lng: -82.4705, status: 'candidate' },
  { id: 'clearwater-marine-aquarium', name: 'Clearwater Marine Aquarium Rehabilitation', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '249 Windward Passage, Clearwater, FL 33767', lat: 27.9785, lng: -82.8185, status: 'candidate' },
  { id: 'tb-watch-discovery-center', name: 'Tampa Bay Watch Discovery Center', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '800 2nd Ave NE, St. Petersburg, FL 33701', lat: 27.7725, lng: -82.6288, status: 'active-anchor' },
  { id: 'seaside-seabird-sanctuary', name: 'Seaside Seabird Sanctuary Wildlife Hospital', mun: 'Indian Shores', county: 'Pinellas', code: '12103', addr: '18328 Gulf Blvd, Indian Shores, FL 33785', lat: 27.8485, lng: -82.8462, status: 'active-anchor' },
  { id: 'suncoast-primate-sanctuary', name: 'Suncoast Primate Sanctuary Enrichment', mun: 'Palm Harbor', county: 'Pinellas', code: '12103', addr: '4600 Alt US Hwy 19, Palm Harbor, FL 34683', lat: 28.1185, lng: -82.7665, status: 'active-anchor' },
  { id: 'manatee-viewing-center', name: 'TECO Manatee Viewing Center Clean Energy', mun: 'Apollo Beach', county: 'Hillsborough', code: '12057', addr: '6990 Dickman Rd, Apollo Beach, FL 33572', lat: 27.7945, lng: -82.4045, status: 'candidate' },
  { id: 'bishop-manatee-habitat', name: 'Parker Manatee Rehabilitation Habitat at The Bishop', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '201 10th St W, Bradenton, FL 34205', lat: 27.4995, lng: -82.5695, status: 'candidate' },
  { id: 'mosi-science-industry', name: 'MOSI (Museum of Science & Industry)', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4801 E Fowler Ave, Tampa, FL 33617', lat: 28.0545, lng: -82.4045, status: 'candidate' },
  { id: 'replay-museum-tarpon', name: 'Replay Amusement Museum Interactive Arcade', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '119 E Tarpon Ave, Tarpon Springs, FL 34689', lat: 28.1465, lng: -82.7555, status: 'active-anchor' },
  { id: 'tarpon-springs-aquarium', name: 'Tarpon Springs Aquarium and Animal Sanctuary', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: '1722 N Pinellas Ave, Tarpon Springs, FL 34689', lat: 28.1695, lng: -82.7655, status: 'candidate' },
  { id: 'tampa-bay-skating-academy', name: 'Tampa Bay Skating Academy Family Sessions', mun: 'Oldsmar', county: 'Pinellas', code: '12103', addr: '255 Forest Lakes Blvd, Oldsmar, FL 34677', lat: 28.0515, lng: -82.6715, status: 'candidate' },
  { id: 'tampa-bay-grand-prix', name: 'Tampa Bay Grand Prix Family Racing', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '3404 Cragmont Dr, Tampa, FL 33619', lat: 27.9715, lng: -82.3685, status: 'candidate' },
  { id: 'ashley-childrens-museum', name: 'Ashley Children\'s Museum at Bonnet Springs', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '400 Bonnet Springs Blvd, Lakeland, FL 33815', lat: 28.0475, lng: -81.9795, status: 'candidate' },
  { id: 'bonnet-springs-park', name: 'Bonnet Springs Park Family Nature Center', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '400 Bonnet Springs Blvd, Lakeland, FL 33815', lat: 28.0478, lng: -81.9798, status: 'candidate' },
  { id: 'common-ground-park', name: 'Common Ground Inclusive Playground Programs', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '1000 E Edgewood Dr, Lakeland, FL 33803', lat: 28.0125, lng: -81.9395, status: 'candidate' },
  { id: 'fctc-conservation-center', name: 'Florida Conservation and Technology Center', mun: 'Apollo Beach', county: 'Hillsborough', code: '12057', addr: '6990 Dickman Rd, Apollo Beach, FL 33572', lat: 27.7942, lng: -82.4042, status: 'candidate' },
  { id: 'hillsborough-4h-extension', name: 'UF/IFAS Hillsborough County 4-H Youth Events', mun: 'Seffner', county: 'Hillsborough', code: '12057', addr: '5339 County Road 579, Seffner, FL 33584', lat: 27.9965, lng: -82.2745, status: 'candidate' },
  { id: 'pinellas-4h-extension', name: 'UF/IFAS Pinellas County 4-H Extension Hub', mun: 'Largo', county: 'Pinellas', code: '12103', addr: '12520 Ulmerton Rd, Largo, FL 33774', lat: 27.8868, lng: -82.8178, status: 'candidate' },
  { id: 'pasco-4h-extension', name: 'UF/IFAS Pasco County 4-H Youth Programs', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '36702 State Road 52, Dade City, FL 33525', lat: 28.3615, lng: -82.2615, status: 'candidate' },
  { id: 'manatee-4h-extension', name: 'UF/IFAS Manatee County 4-H Youth Hub', mun: 'Palmetto', county: 'Manatee', code: '12081', addr: '1303 17th St W, Palmetto, FL 34221', lat: 27.5315, lng: -82.5785, status: 'candidate' },
  { id: 'polk-4h-extension', name: 'UF/IFAS Polk County 4-H Western Extension', mun: 'Mulberry', county: 'Polk', code: '12105', addr: '1702 Highway 60 W, Mulberry, FL 33860', lat: 27.8985, lng: -81.9695, status: 'candidate' },
  { id: 'tb-butterfly-foundation', name: 'Tampa Bay Butterfly Foundation Nature Labs', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4111 N Armenia Ave, Tampa, FL 33607', lat: 27.9825, lng: -82.4845, status: 'active-anchor' }
];

for (const f of familyMarine) {
  addStream({
    id: f.id,
    name: f.name,
    vertical: 'family-marine',
    verticalLabel: 'Family & Marine Discovery',
    county: f.county,
    countyCode: f.code,
    municipality: f.mun,
    state: 'FL',
    venue: f.name,
    address: f.addr,
    lat: f.lat,
    lng: f.lng,
    kind: 'schedule',
    status: f.status,
    feedUrl: `https://events.example.org/${f.id}`,
    sourceUrl: `https://${f.id}.example.org/`,
    notes: `Family-friendly discovery center offering marine conservation programs, tactile science exhibits, and interactive nature encounters.`
  });
}

console.log(`Family Marine total added: ${familyMarine.length}, Total now: ${streams.length}`);

// 9. Foodways, Markets & Seafood (Target 25+)
const foodwaysMarkets = [
  { id: 'ybor-saturday-market', name: 'Ybor City Saturday Open-Air Market', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1800 E 8th Ave, Tampa, FL 33605', lat: 27.9602, lng: -82.4385, status: 'active-anchor' },
  { id: 'st-pete-saturday-market', name: 'St. Petersburg Saturday Morning Market', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '230 1st St SE, St. Petersburg, FL 33701', lat: 27.7685, lng: -82.6355, status: 'active-anchor' },
  { id: 'hyde-park-fresh-market', name: 'Hyde Park Village Fresh Market', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1602 W Snow Ave, Tampa, FL 33606', lat: 27.9375, lng: -82.4765, status: 'active-anchor' },
  { id: 'seminole-heights-market', name: 'Seminole Heights Sunday Morning Market', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '5000 N Central Ave, Tampa, FL 33603', lat: 27.9925, lng: -82.4565, status: 'candidate' },
  { id: 'bradenton-public-market', name: 'Downtown Bradenton Public Market', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '400 Old Main St, Bradenton, FL 34205', lat: 27.4975, lng: -82.5695, status: 'candidate' },
  { id: 'dunedin-downtown-market', name: 'Dunedin Downtown Community Market', mun: 'Dunedin', county: 'Pinellas', code: '12103', addr: '420 Main St, Dunedin, FL 34698', lat: 28.0125, lng: -82.7865, status: 'active-anchor' },
  { id: 'safety-harbor-market-on-main', name: 'Safety Harbor Market on Main', mun: 'Safety Harbor', county: 'Pinellas', code: '12103', addr: '401 Main St, Safety Harbor, FL 34695', lat: 27.9925, lng: -82.6915, status: 'active-anchor' },
  { id: 'gulfport-tuesday-market', name: 'Gulfport Tuesday Fresh Market', mun: 'Gulfport', county: 'Pinellas', code: '12103', addr: '3101 Beach Blvd S, Gulfport, FL 33707', lat: 27.7405, lng: -82.7085, status: 'active-anchor' },
  { id: 'lakeland-farmers-curb-market', name: 'Downtown Lakeland Farmers Curb Market', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '117 N Kentucky Ave, Lakeland, FL 33801', lat: 28.0445, lng: -81.9545, status: 'candidate' },
  { id: 'dixieland-night-market', name: 'Dixieland Makers and Night Market', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '1035 S Florida Ave, Lakeland, FL 33803', lat: 28.0285, lng: -81.9585, status: 'candidate' },
  { id: 'corey-avenue-market', name: 'Corey Avenue Sunday Market', mun: 'St. Pete Beach', county: 'Pinellas', code: '12103', addr: '398 Corey Ave, St. Pete Beach, FL 33706', lat: 27.7235, lng: -82.7425, status: 'candidate' },
  { id: 'madeira-beach-market', name: 'Madeira Beach Wednesday Market', mun: 'Madeira Beach', county: 'Pinellas', code: '12103', addr: '200 Rex Pl, Madeira Beach, FL 33708', lat: 27.8015, lng: -82.7985, status: 'candidate' },
  { id: 'treasure-island-market', name: 'Treasure Island Open-Air Artisan Market', mun: 'Treasure Island', county: 'Pinellas', code: '12103', addr: '104th Ave & Park St, Treasure Island, FL 33706', lat: 27.7685, lng: -82.7695, status: 'candidate' },
  { id: 'wiregrass-fresh-market', name: 'Fresh Market at The Shops at Wiregrass', mun: 'Wesley Chapel', county: 'Pasco', code: '12101', addr: '28211 Paseo Dr, Wesley Chapel, FL 33543', lat: 28.1885, lng: -82.3505, status: 'candidate' },
  { id: 'heritage-park-pasco-market', name: 'Land O\' Lakes Heritage Park Farmers Market', mun: 'Land O\' Lakes', county: 'Pasco', code: '12101', addr: '5401 Land O\' Lakes Blvd, Land O\' Lakes, FL 34639', lat: 28.2325, lng: -82.4495, status: 'candidate' },
  { id: 'trinity-farmers-market', name: 'Trinity Saturday Farmers Market', mun: 'Trinity', county: 'Pasco', code: '12101', addr: '10720 State Road 54, Trinity, FL 34655', lat: 28.1925, lng: -82.6685, status: 'candidate' },
  { id: 'brick-street-farms', name: 'Brick Street Farms Hydroponic Tours', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2233 3rd Ave S, St. Petersburg, FL 33712', lat: 27.7688, lng: -82.6645, status: 'active-anchor' },
  { id: 'meacham-urban-farm', name: 'Meacham Urban Farm Harvest Market', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '1108 E Scott St, Tampa, FL 33602', lat: 27.9575, lng: -82.4515, status: 'active-anchor' },
  { id: 'sweetwater-organic-farm', name: 'Sweetwater Organic Farm Community Market', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '6942 W Comanche Ave, Tampa, FL 33634', lat: 28.0065, lng: -82.5595, status: 'active-anchor' },
  { id: 'pier-60-sunset-market', name: 'Sunsets at Pier 60 Artisan Market', mun: 'Clearwater', county: 'Pinellas', code: '12103', addr: '1 Causeway Blvd, Clearwater, FL 33767', lat: 27.9785, lng: -82.8295, status: 'candidate' },
  { id: 'tarpon-springs-night-market', name: 'Tarpon Springs Sponge Docks Night Market', mun: 'Tarpon Springs', county: 'Pinellas', code: '12103', addr: 'Dodecanese Blvd, Tarpon Springs, FL 34689', lat: 28.1565, lng: -82.7585, status: 'candidate' },
  { id: 'cortez-commercial-fishing', name: 'Cortez Commercial Fishing Village Fish Market', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '4415 119th St W, Cortez, FL 34215', lat: 27.4685, lng: -82.6875, status: 'candidate' },
  { id: 'palmetto-fresh-market', name: 'Palmetto Historical Park Farmers Market', mun: 'Palmetto', county: 'Manatee', code: '12081', addr: '515 10th Ave W, Palmetto, FL 34221', lat: 27.5205, lng: -82.5765, status: 'candidate' },
  { id: 'lakewood-ranch-farmers-market', name: 'The Market at Lakewood Ranch', mun: 'Lakewood Ranch', county: 'Manatee', code: '12081', addr: '8100 Lakewood Ranch Blvd, Lakewood Ranch, FL 34202', lat: 27.4125, lng: -82.4145, status: 'candidate' },
  { id: 'plant-city-downtown-market', name: 'Plant City Downtown Main Street Market', mun: 'Plant City', county: 'Hillsborough', code: '12057', addr: '100 N Collins St, Plant City, FL 33563', lat: 28.0165, lng: -82.1245, status: 'candidate' }
];

for (const m of foodwaysMarkets) {
  addStream({
    id: m.id,
    name: m.name,
    vertical: 'foodways-markets',
    verticalLabel: 'Foodways, Markets & Seafood',
    county: m.county,
    countyCode: m.code,
    municipality: m.mun,
    state: 'FL',
    venue: m.name,
    address: m.addr,
    lat: m.lat,
    lng: m.lng,
    kind: 'schedule',
    status: m.status,
    feedUrl: `https://events.example.org/${m.id}`,
    sourceUrl: `https://${m.id}.example.org/`,
    notes: `Local open-air market showcasing regional growers, artisan bakers, fresh seafood, and community makers.`
  });
}

console.log(`Foodways Markets total added: ${foodwaysMarkets.length}, Total now: ${streams.length}`);

// 10. Tech, Marine Science & Innovation (Target 20+)
const techInnovation = [
  { id: 'tampa-bay-wave', name: 'Tampa Bay Wave Tech Accelerator Showcases', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '500 E Kennedy Blvd, Tampa, FL 33602', lat: 27.9505, lng: -82.4575, status: 'active-anchor' },
  { id: 'embarc-collective', name: 'Embarc Collective Startup Innovation Sessions', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '802 E Whiting St, Tampa, FL 33602', lat: 27.9465, lng: -82.4515, status: 'active-anchor' },
  { id: 'tampa-hackerspace', name: 'Tampa Hackerspace Community Build Nights', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4931 W Nassau St, Tampa, FL 33607', lat: 27.9525, lng: -82.5295, status: 'active-anchor' },
  { id: 'suncoast-developers-guild', name: 'Suncoast Developers Guild Code Nights', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2220 Central Ave, St. Petersburg, FL 33712', lat: 27.7705, lng: -82.6645, status: 'candidate' },
  { id: 'st-pete-innovation-district', name: 'St. Pete Innovation District Science in the Sun', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '1000 3rd St S, St. Petersburg, FL 33701', lat: 27.7605, lng: -82.6365, status: 'candidate' },
  { id: 'catapult-lakeland', name: 'Catapult Lakeland Startup Incubator & Maker Labs', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '502 E Main St, Lakeland, FL 33801', lat: 28.0435, lng: -81.9475, status: 'candidate' },
  { id: 'lakeland-makerspace', name: 'Lakeland Makerspace Workshops', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '502 E Main St, Lakeland, FL 33801', lat: 28.0438, lng: -81.9478, status: 'candidate' },
  { id: 'pasco-edc-smartstart', name: 'Pasco EDC SMARTstart West Pasco Incubator', mun: 'New Port Richey', county: 'Pasco', code: '12101', addr: '6345 Grand Blvd, New Port Richey, FL 34652', lat: 28.2445, lng: -82.7205, status: 'candidate' },
  { id: 'pasco-edc-east-pasco', name: 'Pasco EDC SMARTstart East Pasco Incubator', mun: 'Dade City', county: 'Pasco', code: '12101', addr: '15029 14th St, Dade City, FL 33523', lat: 28.3615, lng: -82.1915, status: 'candidate' },
  { id: 'bradenton-edc-innovation', name: 'Bradenton Area EDC Innovation Cafes', mun: 'Bradenton', county: 'Manatee', code: '12081', addr: '2100 26th Ave E, Bradenton, FL 34208', lat: 27.4785, lng: -82.5365, status: 'candidate' },
  { id: 'maritime-defense-hub', name: 'Maritime and Defense Technology Hub', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '450 8th Ave SE, St. Petersburg, FL 33701', lat: 27.7595, lng: -82.6325, status: 'candidate' },
  { id: 'fio-research-vessel', name: 'Florida Institute of Oceanography Public Science', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '830 1st St S, St. Petersburg, FL 33701', lat: 27.7615, lng: -82.6335, status: 'candidate' },
  { id: 'high-tech-corridor-tampa', name: 'Florida High Tech Corridor STEM Council', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4202 E Fowler Ave, Tampa, FL 33620', lat: 28.0585, lng: -82.4135, status: 'candidate' },
  { id: 'bioflorida-tampa-bay', name: 'BioFlorida Tampa Bay Chapter Biotechnology', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '12902 USF Magnolia Dr, Tampa, FL 33612', lat: 28.0675, lng: -82.4245, status: 'candidate' },
  { id: 'defcon-813-cyber', name: 'DefCon 813 Tampa Bay Cybersecurity Meetups', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4931 W Nassau St, Tampa, FL 33607', lat: 27.9525, lng: -82.5295, status: 'candidate' },
  { id: 'tb-python-machine-learning', name: 'Tampa Bay Python & AI Developers User Group', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '802 E Whiting St, Tampa, FL 33602', lat: 27.9465, lng: -82.4515, status: 'candidate' },
  { id: 'tb-product-design-ux', name: 'Tampa Bay UX & Product Design Community', mun: 'St. Petersburg', county: 'Pinellas', code: '12103', addr: '2220 Central Ave, St. Petersburg, FL 33712', lat: 27.7705, lng: -82.6645, status: 'candidate' },
  { id: 'usf-cutr-transportation', name: 'USF Center for Urban Transportation Research', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4202 E Fowler Ave, Tampa, FL 33620', lat: 28.0595, lng: -82.4145, status: 'candidate' },
  { id: 'usf-clean-energy-institute', name: 'USF Clean Energy Research Institute Public Talks', mun: 'Tampa', county: 'Hillsborough', code: '12057', addr: '4202 E Fowler Ave, Tampa, FL 33620', lat: 28.0605, lng: -82.4155, status: 'candidate' },
  { id: 'florida-poly-innovation-labs', name: 'Florida Poly Innovation Labs & Robotics', mun: 'Lakeland', county: 'Polk', code: '12105', addr: '4700 Research Way, Lakeland, FL 33805', lat: 28.1495, lng: -81.8515, status: 'candidate' }
];

for (const t of techInnovation) {
  addStream({
    id: t.id,
    name: t.name,
    vertical: 'tech-innovation',
    verticalLabel: 'Tech, Marine Science & Innovation',
    county: t.county,
    countyCode: t.code,
    municipality: t.mun,
    state: 'FL',
    venue: t.name,
    address: t.addr,
    lat: t.lat,
    lng: t.lng,
    kind: 'schedule',
    status: t.status,
    feedUrl: `https://events.example.org/${t.id}`,
    sourceUrl: `https://${t.id}.example.org/`,
    notes: `Technology meetup, startup pitch series, maker build night, or oceanographic research briefing.`
  });
}

console.log(`Tech Innovation total added: ${techInnovation.length}, Total now: ${streams.length}`);

// Validation
const bounds = { minLat: 27.35, maxLat: 28.45, minLng: -83.00, maxLng: -81.85 };
for (const s of streams) {
  if (s.lat < bounds.minLat || s.lat > bounds.maxLat || s.lng < bounds.minLng || s.lng > bounds.maxLng) {
    throw new Error(`Stream out of bounds: ${s.id} at ${s.lat}, ${s.lng}`);
  }
}

const verticalCounts = {};
for (const s of streams) {
  verticalCounts[s.vertical] = (verticalCounts[s.vertical] || 0) + 1;
}
console.log('Vertical distribution:', verticalCounts);

const countyCounts = {};
for (const s of streams) {
  countyCounts[s.county] = (countyCounts[s.county] || 0) + 1;
}
console.log('County distribution:', countyCounts);

const targetPath = path.join(__dirname, '../../docs/sources/2026-10-31-tampa-stream-index.json');
fs.writeFileSync(targetPath, JSON.stringify(streams, null, 2) + '\n');
console.log(`Successfully generated ${streams.length} candidate streams into ${targetPath}`);
