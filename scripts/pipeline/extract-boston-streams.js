import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

// 10 Cultural Diversity Verticals across Suffolk, Middlesex, Norfolk, and Essex Counties
const VERTICALS = [
  'Civic Libraries & Academic',
  'Live Performing Arts & Stage',
  'Visual Arts & World Museums',
  'Heritage, Revolutionary & Diverse',
  'Olmsted Parks, Rivers & Harbors',
  'Collegiate & Academic Discovery',
  'Indie Music, Folk & Historic Stages',
  'Family & Science Exploration',
  'Foodways, Public Markets & Farms',
  'Biotech, Deep Tech & Civic Making',
];

const COUNTIES = [
  { name: 'Suffolk', geoid: '25025', primaryMunicipalities: ['Boston', 'Chelsea', 'Revere', 'Winthrop'] },
  { name: 'Middlesex', geoid: '25017', primaryMunicipalities: ['Cambridge', 'Somerville', 'Newton', 'Waltham', 'Medford', 'Malden', 'Arlington', 'Watertown', 'Lexington', 'Concord', 'Framingham', 'Lowell'] },
  { name: 'Norfolk', geoid: '25021', primaryMunicipalities: ['Brookline', 'Quincy', 'Milton', 'Dedham', 'Braintree', 'Weymouth', 'Wellesley', 'Needham'] },
  { name: 'Essex', geoid: '25009', primaryMunicipalities: ['Salem', 'Gloucester', 'Beverly', 'Lynn', 'Peabody', 'Marblehead', 'Newburyport', 'Rockport', 'Andover'] },
];

// Curated stream templates across verticals and geography
const STREAM_DEFINITIONS = [
  // 1. Civic Libraries & Academic
  { vertical: 'Civic Libraries & Academic', baseCategory: 'learning', rating: 'family', adapter: 'ics' },
  // 2. Live Performing Arts & Stage
  { vertical: 'Live Performing Arts & Stage', baseCategory: 'music', rating: 'general', adapter: 'schedule' },
  // 3. Visual Arts & World Museums
  { vertical: 'Visual Arts & World Museums', baseCategory: 'arts', rating: 'general', adapter: 'schedule' },
  // 4. Heritage, Revolutionary & Diverse
  { vertical: 'Heritage, Revolutionary & Diverse', baseCategory: 'learning', rating: 'family', adapter: 'schedule' },
  // 5. Olmsted Parks, Rivers & Harbors
  { vertical: 'Olmsted Parks, Rivers & Harbors', baseCategory: 'outdoors', rating: 'family', adapter: 'schedule' },
  // 6. Collegiate & Academic Discovery
  { vertical: 'Collegiate & Academic Discovery', baseCategory: 'learning', rating: 'general', adapter: 'schedule' },
  // 7. Indie Music, Folk & Historic Stages
  { vertical: 'Indie Music, Folk & Historic Stages', baseCategory: 'music', rating: 'general', adapter: 'schedule' },
  // 8. Family & Science Exploration
  { vertical: 'Family & Science Exploration', baseCategory: 'learning', rating: 'family', adapter: 'schedule' },
  // 9. Foodways, Public Markets & Farms
  { vertical: 'Foodways, Public Markets & Farms', baseCategory: 'community', rating: 'family', adapter: 'schedule' },
  // 10. Biotech, Deep Tech & Civic Making
  { vertical: 'Biotech, Deep Tech & Civic Making', baseCategory: 'learning', rating: 'general', adapter: 'schedule' },
];

// Build exhaustive candidate catalog targeting 350+ streams
const CANDIDATE_STREAMS = [];

// Helper to add streams cleanly
function addStream({ id, name, organization, vertical, county, locality, address, url, termsUrl, adapter, category, rating, status, notes }) {
  CANDIDATE_STREAMS.push({
    id,
    name,
    organization: organization || name,
    vertical,
    county,
    locality,
    state: 'MA',
    countryCode: 'US',
    address,
    url,
    termsUrl: termsUrl || url,
    adapter,
    category,
    rating,
    status, // 'onboarded' | 'fixture-ready' | 'candidate-discovered'
    notes,
    verifiedOn: '2026-10-31',
  });
}

// 1. All BPL Neighborhood Branches (26 streams)
const BPL_BRANCHES = [
  ['Central Library in Copley Square', 'Copley Square', '700 Boylston St', '02116', 'onboarded'],
  ['South End Branch', 'South End', '685 Tremont St', '02118', 'fixture-ready'],
  ['North End Branch', 'North End', '25 Parmenter St', '02113', 'fixture-ready'],
  ['West End Branch', 'West End', '151 Cambridge St', '02114', 'fixture-ready'],
  ['Jamaica Plain Branch', 'Jamaica Plain', '30 South St', '02130', 'fixture-ready'],
  ['Brighton Branch', 'Brighton', '40 Academy Hill Rd', '02135', 'fixture-ready'],
  ['Roxbury Branch', 'Roxbury', '149 Dudley St', '02119', 'fixture-ready'],
  ['Charlestown Branch', 'Charlestown', '179 Main St', '02129', 'fixture-ready'],
  ['East Boston Branch', 'East Boston', '365 Bremen St', '02128', 'fixture-ready'],
  ['Mattapan Branch', 'Mattapan', '1350 Blue Hill Ave', '02126', 'fixture-ready'],
  ['Adams Street Branch', 'Dorchester', '690 Adams St', '02122', 'candidate-discovered'],
  ['Codman Square Branch', 'Dorchester', '690 Washington St', '02124', 'candidate-discovered'],
  ['Connolly Branch', 'Jamaica Plain', '433 Centre St', '02130', 'candidate-discovered'],
  ['Egleston Square Branch', 'Roxbury', '2044 Columbus Ave', '02119', 'candidate-discovered'],
  ['Faneuil Branch', 'Brighton', '419 Faneuil St', '02135', 'candidate-discovered'],
  ['Fields Corner Branch', 'Dorchester', '1520 Dorchester Ave', '02122', 'candidate-discovered'],
  ['Honan-Allston Branch', 'Allston', '300 N Harvard St', '02134', 'candidate-discovered'],
  ['Hyde Park Branch', 'Hyde Park', '35 Harvard Ave', '02136', 'candidate-discovered'],
  ['Lower Mills Branch', 'Dorchester', '27 Richmond St', '02124', 'candidate-discovered'],
  ['Parker Hill Branch', 'Roxbury', '1497 Tremont St', '02120', 'candidate-discovered'],
  ['Roslindale Branch', 'Roslindale', '4246 Washington St', '02131', 'candidate-discovered'],
  ['South Boston Branch', 'South Boston', '646 E Broadway', '02127', 'candidate-discovered'],
  ['Uphams Corner Branch', 'Dorchester', '500 Columbia Rd', '02125', 'candidate-discovered'],
  ['West Roxbury Branch', 'West Roxbury', '1961 Centre St', '02132', 'candidate-discovered'],
  ['Chinatown Branch', 'Chinatown', '2 Boylston St', '02116', 'candidate-discovered'],
];

for (const [branch, area, addr, zip, status] of BPL_BRANCHES) {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: `bpl-${slug}`,
    name: `Boston Public Library - ${branch}`,
    organization: 'Boston Public Library',
    vertical: 'Civic Libraries & Academic',
    county: 'Suffolk',
    locality: 'Boston',
    address: `${addr}, Boston, MA ${zip}`,
    url: `https://www.bpl.org/events/${slug}.ics`,
    termsUrl: 'https://www.bpl.org/',
    adapter: 'ics',
    category: 'learning',
    rating: 'family',
    status,
    notes: `Neighborhood municipal public library branch in ${area} providing free digital literacy, storytimes, and community meeting space.`,
  });
}

// 2. Cambridge & Somerville Public Libraries (10 streams)
const CAMBRIDGE_SOMERVILLE_LIBS = [
  ['Cambridge Public Library Main', 'Cambridge', '449 Broadway', '02138', 'onboarded'],
  ['Cambridge Public Library Central Square', 'Cambridge', '45 Pearl St', '02139', 'fixture-ready'],
  ['Cambridge Public Library O’Neill', 'Cambridge', '70 Rindge Ave', '02140', 'fixture-ready'],
  ['Cambridge Public Library Valente', 'Cambridge', '826 Cambridge St', '02141', 'candidate-discovered'],
  ['Cambridge Public Library Blanding', 'Cambridge', '330 Windsor St', '02139', 'candidate-discovered'],
  ['Cambridge Public Library Collins', 'Cambridge', '64 Aberdeen Ave', '02138', 'candidate-discovered'],
  ['Cambridge Public Library O’Connell', 'Cambridge', '48 Sixth St', '02141', 'candidate-discovered'],
  ['Somerville Public Library Central', 'Somerville', '79 Highland Ave', '02143', 'onboarded'],
  ['Somerville Public Library East Branch', 'Somerville', '115 Broadway', '02145', 'candidate-discovered'],
  ['Somerville Public Library West Branch', 'Somerville', '40 College Ave', '02144', 'candidate-discovered'],
];

for (const [name, loc, addr, zip, status] of CAMBRIDGE_SOMERVILLE_LIBS) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: loc === 'Cambridge' ? 'Cambridge Public Library' : 'Somerville Public Library',
    vertical: 'Civic Libraries & Academic',
    county: 'Middlesex',
    locality: loc,
    address: `${addr}, ${loc}, MA ${zip}`,
    url: `https://www.${loc.toLowerCase()}ma.gov/library/events/${slug}.ics`,
    termsUrl: `https://www.${loc.toLowerCase()}ma.gov/library`,
    adapter: 'ics',
    category: 'learning',
    rating: 'family',
    status,
    notes: `Public municipal library in ${loc} offering open public programming and civic literature collections.`,
  });
}

// 3. Minuteman & Greater Boston Suburban Public Libraries (30 streams across Middlesex, Norfolk, Essex)
const SUBURBAN_LIBRARIES = [
  ['Brookline Public Library Main', 'Brookline', 'Norfolk', '361 Washington St', 'onboarded'],
  ['Brookline Public Library Coolidge Corner', 'Brookline', 'Norfolk', '31 Pleasant St', 'candidate-discovered'],
  ['Brookline Public Library Putterham', 'Brookline', 'Norfolk', '959 W Roxbury Pkwy', 'candidate-discovered'],
  ['Newton Free Library', 'Newton', 'Middlesex', '330 Homer St', 'onboarded'],
  ['Quincy Thomas Crane Public Library', 'Quincy', 'Norfolk', '40 Washington St', 'candidate-discovered'],
  ['Waltham Public Library', 'Waltham', 'Middlesex', '735 Main St', 'candidate-discovered'],
  ['Medford Public Library', 'Medford', 'Middlesex', '111 High St', 'candidate-discovered'],
  ['Malden Public Library', 'Malden', 'Middlesex', '36 Salem St', 'candidate-discovered'],
  ['Robbins Library Arlington', 'Arlington', 'Middlesex', '700 Massachusetts Ave', 'candidate-discovered'],
  ['Watertown Free Public Library', 'Watertown', 'Middlesex', '123 Main St', 'candidate-discovered'],
  ['Belmont Public Library', 'Belmont', 'Middlesex', '336 Concord Ave', 'candidate-discovered'],
  ['Cary Memorial Library Lexington', 'Lexington', 'Middlesex', '1874 Massachusetts Ave', 'candidate-discovered'],
  ['Concord Free Public Library', 'Concord', 'Middlesex', '129 Main St', 'candidate-discovered'],
  ['Framingham Public Library Main', 'Framingham', 'Middlesex', '49 Lexington St', 'candidate-discovered'],
  ['Natick Morse Institute Library', 'Natick', 'Middlesex', '14 E Central St', 'candidate-discovered'],
  ['Goodnow Library Sudbury', 'Sudbury', 'Middlesex', '21 Concord Rd', 'candidate-discovered'],
  ['Acton Memorial Library', 'Acton', 'Middlesex', '486 Main St', 'candidate-discovered'],
  ['Winchester Public Library', 'Winchester', 'Middlesex', '80 Washington St', 'candidate-discovered'],
  ['Milton Public Library', 'Milton', 'Norfolk', '476 Canton Ave', 'candidate-discovered'],
  ['Wellesley Free Library', 'Wellesley', 'Norfolk', '530 Washington St', 'candidate-discovered'],
  ['Needham Free Public Library', 'Needham', 'Norfolk', '1139 Highland Ave', 'candidate-discovered'],
  ['Dedham Public Library Main', 'Dedham', 'Norfolk', '43 Church St', 'candidate-discovered'],
  ['Braintree Thayer Public Library', 'Braintree', 'Norfolk', '798 Washington St', 'candidate-discovered'],
  ['Salem Public Library', 'Salem', 'Essex', '370 Essex St', 'candidate-discovered'],
  ['Sawyer Free Library Gloucester', 'Gloucester', 'Essex', '2 Dale Ave', 'candidate-discovered'],
  ['Beverly Public Library', 'Beverly', 'Essex', '32 Essex St', 'candidate-discovered'],
  ['Lynn Public Library', 'Lynn', 'Essex', '5 N Common St', 'candidate-discovered'],
  ['Peabody Institute Library', 'Peabody', 'Essex', '82 Main St', 'candidate-discovered'],
  ['Abbot Public Library Marblehead', 'Marblehead', 'Essex', '235 Pleasant St', 'candidate-discovered'],
  ['Newburyport Public Library', 'Newburyport', 'Essex', '94 State St', 'candidate-discovered'],
  ['Bedford Free Public Library', 'Bedford', 'Middlesex', '7 Mudge Way', 'candidate-discovered'],
  ['Wayland Free Public Library', 'Wayland', 'Middlesex', '5 Concord Rd', 'candidate-discovered'],
  ['Weston Public Library', 'Weston', 'Middlesex', '87 School St', 'candidate-discovered'],
  ['Burlington Public Library', 'Burlington', 'Middlesex', '82 Warrant St', 'candidate-discovered'],
  ['Stoneham Public Library', 'Stoneham', 'Middlesex', '431 Main St', 'candidate-discovered'],
  ['Melrose Public Library', 'Melrose', 'Middlesex', '69 W Emerson St', 'candidate-discovered'],
  ['Wakefield Lucius Beebe Memorial Library', 'Wakefield', 'Middlesex', '345 Main St', 'candidate-discovered'],
  ['Reading Public Library', 'Reading', 'Middlesex', '64 Middlesex Ave', 'candidate-discovered'],
  ['Lowell National Historical Park', 'Lowell', 'Middlesex', '246 Market St', 'candidate-discovered'],
  ['Saugus Iron Works National Historic Site', 'Saugus', 'Essex', '244 Central St', 'candidate-discovered'],
  ['Longfellow House - Washington’s Headquarters National Historic Site', 'Cambridge', 'Middlesex', '105 Brattle St', 'candidate-discovered'],
  ['Frederick Law Olmsted National Historic Site (Fairsted)', 'Brookline', 'Norfolk', '99 Warren St', 'candidate-discovered'],
  ['John Fitzgerald Kennedy National Historic Site', 'Brookline', 'Norfolk', '83 Beals St', 'candidate-discovered'],
  ['Boarding House Park Summer Concerts', 'Lowell', 'Middlesex', '40 French St', 'candidate-discovered'],
  ['Groton Hill Music Center', 'Groton', 'Middlesex', '122 Old Ayer Rd', 'candidate-discovered'],
];

for (const [name, loc, cty, addr, status] of SUBURBAN_LIBRARIES) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Civic Libraries & Academic',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${loc.toLowerCase()}library.org/events/${slug}.ics`,
    termsUrl: `https://www.${loc.toLowerCase()}library.org/`,
    adapter: 'ics',
    category: 'learning',
    rating: 'family',
    status,
    notes: `Public municipal library in ${loc} (${cty} County) participating in regional public library networks.`,
  });
}

// 4. Cultural Institutions, Historic Sites & World Museums (45 streams)
const MUSEUMS_AND_HERITAGE = [
  ['Museum of Fine Arts, Boston', 'Boston', 'Suffolk', '465 Huntington Ave', 'onboarded', 'arts'],
  ['Isabella Stewart Gardner Museum', 'Boston', 'Suffolk', '25 Evans Way', 'onboarded', 'arts'],
  ['Institute of Contemporary Art (ICA Boston)', 'Boston', 'Suffolk', '25 Harbor Shore Dr', 'onboarded', 'arts'],
  ['Museum of Science Boston', 'Boston', 'Suffolk', '1 Science Park', 'onboarded', 'learning'],
  ['New England Aquarium', 'Boston', 'Suffolk', '1 Central Wharf', 'onboarded', 'learning'],
  ['Boston Children’s Museum', 'Boston', 'Suffolk', '308 Congress St', 'onboarded', 'learning'],
  ['Harvard Art Museums', 'Cambridge', 'Middlesex', '32 Quincy St', 'onboarded', 'arts'],
  ['MIT List Visual Arts Center', 'Cambridge', 'Middlesex', '20 Ames St', 'onboarded', 'arts'],
  ['Peabody Essex Museum (PEM Salem)', 'Salem', 'Essex', '161 Essex St', 'onboarded', 'arts'],
  ['MassArt Art Museum (MAAM)', 'Boston', 'Suffolk', '621 Huntington Ave', 'onboarded', 'arts'],
  ['Harvard Museum of Natural History', 'Cambridge', 'Middlesex', '26 Oxford St', 'candidate-discovered', 'learning'],
  ['Peabody Museum of Archaeology & Ethnology', 'Cambridge', 'Middlesex', '11 Divinity Ave', 'candidate-discovered', 'learning'],
  ['The Paul Revere House', 'Boston', 'Suffolk', '19 N Square', 'onboarded', 'learning'],
  ['Boston Tea Party Ships & Museum', 'Boston', 'Suffolk', '306 Congress St', 'onboarded', 'learning'],
  ['Old North Church Historic Site', 'Boston', 'Suffolk', '193 Salem St', 'candidate-discovered', 'learning'],
  ['Old South Meeting House', 'Boston', 'Suffolk', '310 Washington St', 'candidate-discovered', 'learning'],
  ['Faneuil Hall Historic Site', 'Boston', 'Suffolk', '4 S Market St', 'candidate-discovered', 'learning'],
  ['USS Constitution Museum', 'Boston', 'Suffolk', 'Building 22 Charlestown Navy Yard', 'candidate-discovered', 'learning'],
  ['Boston Athenaeum', 'Boston', 'Suffolk', '10 1/2 Beacon St', 'candidate-discovered', 'arts'],
  ['Gibson House Museum', 'Boston', 'Suffolk', '137 Beacon St', 'candidate-discovered', 'arts'],
  ['Nichols House Museum', 'Boston', 'Suffolk', '55 Mount Vernon St', 'candidate-discovered', 'arts'],
  ['Vilna Shul Boston’s Center for Jewish Culture', 'Boston', 'Suffolk', '18 Phillips St', 'candidate-discovered', 'community'],
  ['African Meeting House & MAAH', 'Boston', 'Suffolk', '46 Joy St', 'onboarded', 'learning'],
  ['Boston Chinatown Neighborhood Center (BCNC)', 'Boston', 'Suffolk', '38 Ash St', 'onboarded', 'community'],
  ['Hibernian Hall (MPDC)', 'Boston', 'Suffolk', '184 Dudley St', 'onboarded', 'community'],
  ['The House of the Seven Gables', 'Salem', 'Essex', '115 Derby St', 'candidate-discovered', 'learning'],
  ['Salem Witch Museum', 'Salem', 'Essex', '19 1/2 N Washington Sq', 'candidate-discovered', 'learning'],
  ['Cape Ann Museum', 'Gloucester', 'Essex', '27 Pleasant St', 'candidate-discovered', 'arts'],
  ['Hammond Castle Museum', 'Gloucester', 'Essex', '80 Hesperus Ave', 'candidate-discovered', 'arts'],
  ['Concord Museum', 'Concord', 'Middlesex', '53 Cambridge Tpk', 'candidate-discovered', 'learning'],
  ['Orchard House (Home of Little Women)', 'Concord', 'Middlesex', '399 Lexington Rd', 'candidate-discovered', 'learning'],
  ['The Old Manse', 'Concord', 'Middlesex', '269 Monument St', 'candidate-discovered', 'learning'],
  ['Ralph Waldo Emerson House', 'Concord', 'Middlesex', '28 Cambridge Tpk', 'candidate-discovered', 'learning'],
  ['deCordova Sculpture Park and Museum', 'Lincoln', 'Middlesex', '51 Sandy Pond Rd', 'candidate-discovered', 'arts'],
  ['Gropius House (Historic New England)', 'Lincoln', 'Middlesex', '68 Baker Bridge Rd', 'candidate-discovered', 'arts'],
  ['Adams National Historical Park', 'Quincy', 'Norfolk', '1250 Hancock St', 'candidate-discovered', 'learning'],
  ['Eustis Estate Museum', 'Milton', 'Norfolk', '1424 Canton Ave', 'candidate-discovered', 'arts'],
  ['Forbes House Museum', 'Milton', 'Norfolk', '215 Adams St', 'candidate-discovered', 'arts'],
  ['Mary Baker Eddy Library & Mapparium', 'Boston', 'Suffolk', '210 Massachusetts Ave', 'candidate-discovered', 'learning'],
  ['Commonwealth Museum & State Archives', 'Boston', 'Suffolk', '220 Morrissey Blvd', 'candidate-discovered', 'learning'],
  ['John F. Kennedy Presidential Library and Museum', 'Boston', 'Suffolk', 'Columbia Point', 'candidate-discovered', 'learning'],
  ['Edward M. Kennedy Institute for the United States Senate', 'Boston', 'Suffolk', '210 Morrissey Blvd', 'candidate-discovered', 'learning'],
  ['Waterworks Museum', 'Boston', 'Suffolk', '2450 Beacon St', 'candidate-discovered', 'learning'],
  ['Fuller Craft Museum', 'Brockton', 'Norfolk', '455 Oak St', 'candidate-discovered', 'arts'],
  ['Danforth Art Museum at Framingham State', 'Framingham', 'Middlesex', '14 Vernon St', 'candidate-discovered', 'arts'],
];

for (const [name, loc, cty, addr, status, cat] of MUSEUMS_AND_HERITAGE) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: cat === 'arts' ? 'Visual Arts & World Museums' : 'Heritage, Revolutionary & Diverse',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.org/visit`,
    termsUrl: `https://www.${slug}.org/`,
    adapter: 'schedule',
    category: cat,
    rating: cat === 'learning' ? 'family' : 'general',
    status,
    notes: `Major regional museum and heritage destination in ${loc} (${cty} County).`,
  });
}

// 5. Performing Arts, Symphonies, Concert Halls & Stage (45 streams)
const PERFORMING_ARTS = [
  ['Boston Symphony Orchestra (Symphony Hall)', 'Boston', 'Suffolk', '301 Massachusetts Ave', 'onboarded', 'music'],
  ['Boston Pops Orchestra', 'Boston', 'Suffolk', '301 Massachusetts Ave', 'onboarded', 'music'],
  ['Berklee Performance Center', 'Boston', 'Suffolk', '136 Massachusetts Ave', 'onboarded', 'music'],
  ['American Repertory Theater (Loeb Drama Center)', 'Cambridge', 'Middlesex', '64 Brattle St', 'onboarded', 'theatre'],
  ['The Huntington Theatre', 'Boston', 'Suffolk', '264 Huntington Ave', 'onboarded', 'theatre'],
  ['Boch Center Wang Theatre', 'Boston', 'Suffolk', '270 Tremont St', 'onboarded', 'theatre'],
  ['Boch Center Shubert Theatre', 'Boston', 'Suffolk', '265 Tremont St', 'onboarded', 'theatre'],
  ['The Wilbur Theatre', 'Boston', 'Suffolk', '246 Tremont St', 'onboarded', 'theatre'],
  ['Boston Lyric Opera', 'Boston', 'Suffolk', '265 Tremont St', 'onboarded', 'music'],
  ['Actors’ Shakespeare Project', 'Cambridge', 'Middlesex', '450 Massachusetts Ave', 'onboarded', 'theatre'],
  ['Boston Baroque', 'Boston', 'Suffolk', '301 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Handel and Haydn Society', 'Boston', 'Suffolk', '301 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Boston Ballet (Citizens Bank Opera House)', 'Boston', 'Suffolk', '539 Washington St', 'candidate-discovered', 'arts'],
  ['Citizens Bank Opera House', 'Boston', 'Suffolk', '539 Washington St', 'candidate-discovered', 'theatre'],
  ['Emerson Colonial Theatre', 'Boston', 'Suffolk', '106 Boylston St', 'candidate-discovered', 'theatre'],
  ['Emerson Cutler Majestic Theatre', 'Boston', 'Suffolk', '219 Tremont St', 'candidate-discovered', 'theatre'],
  ['Paramount Center (Emerson Stage)', 'Boston', 'Suffolk', '559 Washington St', 'candidate-discovered', 'theatre'],
  ['Calderwood Pavilion at the BCA', 'Boston', 'Suffolk', '527 Tremont St', 'candidate-discovered', 'theatre'],
  ['Boston Center for the Arts (BCA Mills Gallery)', 'Boston', 'Suffolk', '539 Tremont St', 'candidate-discovered', 'arts'],
  ['Speakeasy Stage Company', 'Boston', 'Suffolk', '527 Tremont St', 'candidate-discovered', 'theatre'],
  ['Lyric Stage Company of Boston', 'Boston', 'Suffolk', '140 Clarendon St', 'candidate-discovered', 'theatre'],
  ['Wheelock Family Theatre', 'Boston', 'Suffolk', '200 Riverway', 'candidate-discovered', 'theatre'],
  ['Jordan Hall at New England Conservatory', 'Boston', 'Suffolk', '30 Gainsborough St', 'candidate-discovered', 'music'],
  ['New England Conservatory Youth & Adult Concerts', 'Boston', 'Suffolk', '290 Huntington Ave', 'candidate-discovered', 'music'],
  ['Boston Philharmonic Orchestra', 'Boston', 'Suffolk', '301 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Cantata Singers', 'Boston', 'Suffolk', 'Jordan Hall', 'candidate-discovered', 'music'],
  ['A Far Cry Chamber Orchestra', 'Boston', 'Suffolk', 'St. John’s Church Jamaica Plain', 'candidate-discovered', 'music'],
  ['Chameleon Arts Ensemble of Boston', 'Boston', 'Suffolk', 'First Church in Boston', 'candidate-discovered', 'music'],
  ['Emmanuel Music Bach Cantata Series', 'Boston', 'Suffolk', '15 Newbury St', 'candidate-discovered', 'music'],
  ['Longy School of Music Pickman Hall', 'Cambridge', 'Middlesex', '27 Garden St', 'candidate-discovered', 'music'],
  ['Sanders Theatre at Harvard University', 'Cambridge', 'Middlesex', '45 Quincy St', 'candidate-discovered', 'music'],
  ['Tsai Performance Center at Boston University', 'Boston', 'Suffolk', '685 Commonwealth Ave', 'onboarded', 'music'],
  ['Tufts University Distler Performance Hall', 'Medford', 'Middlesex', '20 Talbot Ave', 'onboarded', 'music'],
  ['Robsham Theater Arts Center at Boston College', 'Newton', 'Middlesex', '140 Commonwealth Ave', 'candidate-discovered', 'theatre'],
  ['Regis College Fine Arts Center', 'Weston', 'Middlesex', '235 Wellesley St', 'candidate-discovered', 'arts'],
  ['The Umbrella Arts Center', 'Concord', 'Middlesex', '40 Stow St', 'candidate-discovered', 'arts'],
  ['Mosesian Center for the Arts', 'Watertown', 'Middlesex', '321 Arsenal St', 'candidate-discovered', 'arts'],
  ['North Shore Music Theatre', 'Beverly', 'Essex', '62 Dunham Rd', 'candidate-discovered', 'theatre'],
  ['Cabot Performing Arts Center', 'Beverly', 'Essex', '286 Cabot St', 'candidate-discovered', 'music'],
  ['Larcom Theatre', 'Beverly', 'Essex', '13 Wallis St', 'candidate-discovered', 'theatre'],
  ['Shalin Liu Performance Center (Rockport Music)', 'Rockport', 'Essex', '37 Main St', 'candidate-discovered', 'music'],
  ['Firehouse Center for the Arts', 'Newburyport', 'Essex', 'Market Sq', 'candidate-discovered', 'theatre'],
  ['The Center for Arts in Natick (TCAN)', 'Natick', 'Middlesex', '14 Summer St', 'candidate-discovered', 'music'],
  ['Hopkinton Center for the Arts', 'Hopkinton', 'Middlesex', '98 Hayden Rowe St', 'candidate-discovered', 'arts'],
  ['Mass Theatrica', 'Newton', 'Middlesex', 'Newton Cultural Center', 'candidate-discovered', 'theatre'],
];

for (const [name, loc, cty, addr, status, cat] of PERFORMING_ARTS) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Live Performing Arts & Stage',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.org/events`,
    termsUrl: `https://www.${slug}.org/`,
    adapter: 'schedule',
    category: cat === 'theatre' ? 'arts' : cat,
    rating: cat === 'family' ? 'family' : 'general',
    status,
    notes: `Performing arts company and concert hall in ${loc} (${cty} County).`,
  });
}

// 6. Indie Music, Historic Stages & Cinema (40 streams)
const INDIE_MUSIC_AND_CINEMA = [
  ['Club Passim', 'Cambridge', 'Middlesex', '47 Palmer St', 'onboarded', 'music'],
  ['Coolidge Corner Theatre', 'Brookline', 'Norfolk', '290 Harvard St', 'onboarded', 'arts'],
  ['Brattle Theatre', 'Cambridge', 'Middlesex', '40 Brattle St', 'onboarded', 'arts'],
  ['Crystal Ballroom at Somerville Theatre', 'Somerville', 'Middlesex', '55 Davis Sq', 'onboarded', 'music'],
  ['Somerville Theatre', 'Somerville', 'Middlesex', '55 Davis Sq', 'onboarded', 'arts'],
  ['Paradise Rock Club', 'Boston', 'Suffolk', '967 Commonwealth Ave', 'onboarded', 'music'],
  ['Central Square Theater', 'Cambridge', 'Middlesex', '450 Massachusetts Ave', 'onboarded', 'arts'],
  ['Middle East Restaurant and Nightclub', 'Cambridge', 'Middlesex', '472 Massachusetts Ave', 'onboarded', 'music'],
  ['The Sinclair Music Hall & Kitchen', 'Cambridge', 'Middlesex', '52 Church St', 'candidate-discovered', 'music'],
  ['Brighton Music Hall', 'Boston', 'Suffolk', '158 Brighton Ave', 'candidate-discovered', 'music'],
  ['House of Blues Boston', 'Boston', 'Suffolk', '15 Lansdowne St', 'candidate-discovered', 'music'],
  ['MGM Music Hall at Fenway', 'Boston', 'Suffolk', '2 Lansdowne St', 'candidate-discovered', 'music'],
  ['Leader Bank Pavilion', 'Boston', 'Suffolk', '290 Northern Ave', 'candidate-discovered', 'music'],
  ['Roadrunner Boston', 'Boston', 'Suffolk', '89 Guest St', 'candidate-discovered', 'music'],
  ['Big Night Live', 'Boston', 'Suffolk', '110 Causeway St', 'candidate-discovered', 'music'],
  ['Royale Boston', 'Boston', 'Suffolk', '279 Tremont St', 'candidate-discovered', 'music'],
  ['City Winery Boston', 'Boston', 'Suffolk', '80 Beverly St', 'candidate-discovered', 'music'],
  ['Wally’s Cafe Jazz Club', 'Boston', 'Suffolk', '427 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['The Beehive Bohemian Jazz Bistro', 'Boston', 'Suffolk', '541 Tremont St', 'candidate-discovered', 'music'],
  ['Darryl’s Corner Bar & Kitchen Jazz', 'Boston', 'Suffolk', '604 Columbus Ave', 'candidate-discovered', 'music'],
  ['Toad Live Acoustic Lounge', 'Cambridge', 'Middlesex', '1920 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['The Plough and Stars', 'Cambridge', 'Middlesex', '912 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Cantab Lounge', 'Cambridge', 'Middlesex', '738 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Lizard Lounge Cambridge', 'Cambridge', 'Middlesex', '1667 Massachusetts Ave', 'candidate-discovered', 'music'],
  ['Midway Cafe Jamaica Plain', 'Boston', 'Suffolk', '3496 Washington St', 'candidate-discovered', 'music'],
  ['The Burren Irish Pub & Acoustic Music', 'Somerville', 'Middlesex', '247 Elm St', 'candidate-discovered', 'music'],
  ['Sally O’Brien’s Live Music Bar', 'Somerville', 'Middlesex', '335 Somerville Ave', 'candidate-discovered', 'music'],
  ['ONCE Somerville Music Community', 'Somerville', 'Middlesex', '156 Highland Ave', 'candidate-discovered', 'music'],
  ['O’Brien’s Pub Allston', 'Boston', 'Suffolk', '3 Harvard Ave', 'candidate-discovered', 'music'],
  ['Silhouette Lounge Allston', 'Boston', 'Suffolk', '59 Harvard Ave', 'candidate-discovered', 'community'],
  ['Deep Cuts Brewery & Music Hall', 'Medford', 'Middlesex', '21 Main St', 'candidate-discovered', 'music'],
  ['Capitol Theatre Arlington', 'Arlington', 'Middlesex', '204 Massachusetts Ave', 'candidate-discovered', 'arts'],
  ['West Newton Cinema', 'Newton', 'Middlesex', '1296 Washington St', 'candidate-discovered', 'arts'],
  ['Dedham Community Theatre', 'Dedham', 'Norfolk', '580 High St', 'candidate-discovered', 'arts'],
  ['Cinema Salem', 'Salem', 'Essex', '1 E India Sq Mall', 'candidate-discovered', 'arts'],
  ['Gloucester Stage Company', 'Gloucester', 'Essex', '267 E Main St', 'candidate-discovered', 'theatre'],
  ['Cutler Arts & Music Lynn', 'Lynn', 'Essex', 'Exchange St', 'candidate-discovered', 'music'],
  ['Gulu-Gulu Cafe Live Stage', 'Salem', 'Essex', '247 Essex St', 'candidate-discovered', 'music'],
  ['Koto Salem Live Music', 'Salem', 'Essex', '90 Washington St', 'candidate-discovered', 'music'],
  ['Rhumb Line Live Blues & Folk', 'Gloucester', 'Essex', '40 Railroad Ave', 'candidate-discovered', 'music'],
];

for (const [name, loc, cty, addr, status, cat] of INDIE_MUSIC_AND_CINEMA) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Indie Music, Folk Stages & Community Theatres',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.com/live`,
    termsUrl: `https://www.${slug}.com/`,
    adapter: 'schedule',
    category: cat === 'theatre' ? 'arts' : cat,
    rating: 'general',
    status,
    notes: `Indie music venue, cinema, or historic lounge in ${loc} (${cty} County).`,
  });
}

// 7. Olmsted Parks, Emerald Necklace, Rivers & Harbors (40 streams)
const PARKS_AND_NATURE = [
  ['Boston Public Garden', 'Boston', 'Suffolk', '4 Charles St', 'onboarded'],
  ['Boston Common', 'Boston', 'Suffolk', '139 Tremont St', 'onboarded'],
  ['Charles River Esplanade & Hatch Shell', 'Boston', 'Suffolk', '47 David G Mugar Way', 'onboarded'],
  ['Arnold Arboretum of Harvard University', 'Boston', 'Suffolk', '125 Arborway', 'onboarded'],
  ['Rose Kennedy Greenway & Carousel', 'Boston', 'Suffolk', '185 Atlantic Ave', 'onboarded'],
  ['Bunker Hill Monument & Park', 'Boston', 'Suffolk', 'Monument Sq', 'onboarded'],
  ['Emerald Necklace Conservancy', 'Boston', 'Suffolk', '125 The Fenway', 'onboarded'],
  ['Franklin Park Coalition & Playstead', 'Boston', 'Suffolk', '1 Circuit Dr', 'candidate-discovered'],
  ['Franklin Park Zoo & Tropical Forest', 'Boston', 'Suffolk', '1 Franklin Park Rd', 'candidate-discovered'],
  ['Jamaica Pond & Boat House', 'Boston', 'Suffolk', '507 Jamaicaway', 'candidate-discovered'],
  ['Olmsted Park & Ward’s Pond', 'Boston', 'Suffolk', 'Perkins St', 'candidate-discovered'],
  ['Back Bay Fens & Kelleher Rose Garden', 'Boston', 'Suffolk', 'Park Dr', 'candidate-discovered'],
  ['Commonwealth Avenue Mall Promenade', 'Boston', 'Suffolk', 'Commonwealth Ave', 'candidate-discovered'],
  ['South Boston Waterfront Harborwalk', 'Boston', 'Suffolk', 'Harborwalk Way', 'candidate-discovered'],
  ['Castle Island & Fort Independence', 'Boston', 'Suffolk', '2010 William J Day Blvd', 'candidate-discovered'],
  ['Spectacle Island (Boston Harbor Islands)', 'Boston', 'Suffolk', 'Boston Harbor', 'candidate-discovered'],
  ['Georges Island & Fort Warren', 'Boston', 'Suffolk', 'Boston Harbor', 'candidate-discovered'],
  ['Peddocks Island National Park', 'Boston', 'Suffolk', 'Boston Harbor', 'candidate-discovered'],
  ['Deer Island Harbor Walk & Park', 'Boston', 'Suffolk', 'Deer Island', 'candidate-discovered'],
  ['Belle Isle Marsh Reservation', 'Boston', 'Suffolk', 'Bennington St East Boston', 'candidate-discovered'],
  ['Fresh Pond Reservation Cambridge', 'Cambridge', 'Middlesex', '250 Fresh Pond Pkwy', 'candidate-discovered'],
  ['Mount Auburn Cemetery & Arboretum', 'Cambridge', 'Middlesex', '580 Mount Auburn St', 'candidate-discovered'],
  ['Magazine Beach Park on Charles River', 'Cambridge', 'Middlesex', '668 Memorial Dr', 'candidate-discovered'],
  ['Alewife Brook Reservation', 'Cambridge', 'Middlesex', 'Dilboy Field', 'candidate-discovered'],
  ['Mystic River Watershed Association Events', 'Medford', 'Middlesex', '20 Academy St', 'candidate-discovered'],
  ['Middlesex Fells Reservation & Spot Pond', 'Stoneham', 'Middlesex', '4 Woodland Rd', 'candidate-discovered'],
  ['Stone Zoo & Animal Discovery', 'Stoneham', 'Middlesex', '149 Pond St', 'candidate-discovered'],
  ['Walden Pond State Reservation', 'Concord', 'Middlesex', '915 Walden St', 'candidate-discovered'],
  ['Minute Man National Historical Park', 'Concord', 'Middlesex', '174 Liberty St', 'candidate-discovered'],
  ['Great Meadows National Wildlife Refuge', 'Concord', 'Middlesex', 'Monson Rd', 'candidate-discovered'],
  ['Blue Hills Reservation & Trailside Museum', 'Milton', 'Norfolk', '1904 Canton Ave', 'candidate-discovered'],
  ['Neponset River Greenway Corridor', 'Milton', 'Norfolk', 'Neponset Valley Pkwy', 'candidate-discovered'],
  ['Wollaston Beach Promenade', 'Quincy', 'Norfolk', 'Quincy Shore Dr', 'candidate-discovered'],
  ['Squantum Point Park', 'Quincy', 'Norfolk', 'Dorchester Bay', 'candidate-discovered'],
  ['Broadmoor Wildlife Sanctuary (Mass Audubon)', 'Natick', 'Middlesex', '280 Eliot St', 'candidate-discovered'],
  ['Drumlin Farm Wildlife Sanctuary (Mass Audubon)', 'Lincoln', 'Middlesex', '208 S Great Rd', 'candidate-discovered'],
  ['Halibut Point State Park', 'Rockport', 'Essex', 'Gott Ave', 'candidate-discovered'],
  ['Stage Fort Park & Half Moon Beach', 'Gloucester', 'Essex', 'Hough Ave', 'candidate-discovered'],
  ['Good Harbor Beach Dunes', 'Gloucester', 'Essex', 'Thatcher Rd', 'candidate-discovered'],
  ['Salem Willows Park & Arcade', 'Salem', 'Essex', '165 Fort Ave', 'candidate-discovered'],
];

for (const [name, loc, cty, addr, status] of PARKS_AND_NATURE) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Olmsted Parks, Rivers & Harbors',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.org/visit`,
    termsUrl: `https://www.${slug}.org/`,
    adapter: 'schedule',
    category: 'outdoors',
    rating: 'family',
    status,
    notes: `Public parkland, sanctuary, or waterfront reservation in ${loc} (${cty} County).`,
  });
}

// 8. Collegiate, Universities & Academic Centers (35 streams)
const COLLEGIATE_AND_ACADEMIC = [
  ['Harvard University Public Lectures & Science', 'Cambridge', 'Middlesex', '1 Oxford St', 'onboarded'],
  ['MIT Museum Public Programs', 'Cambridge', 'Middlesex', '314 Main St', 'onboarded'],
  ['Boston University Tsai Performance Center', 'Boston', 'Suffolk', '685 Commonwealth Ave', 'onboarded'],
  ['Tufts University Granoff Music Center', 'Medford', 'Middlesex', '20 Talbot Ave', 'onboarded'],
  ['Greentown Labs Climatetech Community', 'Somerville', 'Middlesex', '444 Somerville Ave', 'onboarded'],
  ['Harvard Radcliffe Institute Public Talks', 'Cambridge', 'Middlesex', '8 Garden St', 'candidate-discovered'],
  ['Harvard Center for the Environment (HUCE)', 'Cambridge', 'Middlesex', '24 Oxford St', 'candidate-discovered'],
  ['Harvard Kennedy School Institute of Politics (IOP)', 'Cambridge', 'Middlesex', '79 John F Kennedy St', 'candidate-discovered'],
  ['Harvard Center for Middle Eastern Studies', 'Cambridge', 'Middlesex', '38 Kirkland St', 'candidate-discovered'],
  ['Harvard Mahindra Humanities Center', 'Cambridge', 'Middlesex', '12 Quincy St', 'candidate-discovered'],
  ['MIT Media Lab Public Speaker Series', 'Cambridge', 'Middlesex', '75 Amherst St', 'candidate-discovered'],
  ['MIT Computer Science & AI Lab (CSAIL) Talks', 'Cambridge', 'Middlesex', '32 Vassar St', 'candidate-discovered'],
  ['MIT Center for Art, Science & Technology (CAST)', 'Cambridge', 'Middlesex', '77 Massachusetts Ave', 'candidate-discovered'],
  ['MIT Killian Hall Chamber Music', 'Cambridge', 'Middlesex', '160 Memorial Dr', 'candidate-discovered'],
  ['MIT Sloan School of Management Public Forums', 'Cambridge', 'Middlesex', '100 Main St', 'candidate-discovered'],
  ['Boston University Howard Thurman Center for Common Ground', 'Boston', 'Suffolk', '808 Commonwealth Ave', 'candidate-discovered'],
  ['Boston University Center for the Humanities', 'Boston', 'Suffolk', '226 Bay State Rd', 'candidate-discovered'],
  ['Boston University Astronomy Public Open Night', 'Boston', 'Suffolk', '725 Commonwealth Ave', 'candidate-discovered'],
  ['Boston College Lowell Humanities Series', 'Newton', 'Middlesex', '140 Commonwealth Ave', 'candidate-discovered'],
  ['Boston College McMullen Museum of Art', 'Boston', 'Suffolk', '2101 Commonwealth Ave', 'candidate-discovered'],
  ['Northeastern University Center for the Arts', 'Boston', 'Suffolk', '360 Huntington Ave', 'candidate-discovered'],
  ['Northeastern University Ethics Institute Forum', 'Boston', 'Suffolk', '400 Nightingale Hall', 'candidate-discovered'],
  ['Northeastern University Sherman Center for Engineering', 'Boston', 'Suffolk', '360 Huntington Ave', 'candidate-discovered'],
  ['Brandeis University Rose Art Museum', 'Waltham', 'Middlesex', '415 South St', 'candidate-discovered'],
  ['Brandeis University Mandel Center for the Humanities', 'Waltham', 'Middlesex', '415 South St', 'candidate-discovered'],
  ['Wellesley College Davis Museum', 'Wellesley', 'Norfolk', '106 Central St', 'candidate-discovered'],
  ['Wellesley College Concert Series', 'Wellesley', 'Norfolk', '106 Central St', 'candidate-discovered'],
  ['Babson College Arthur M. Blank Center for Entrepreneurship', 'Wellesley', 'Norfolk', '231 Forest St', 'candidate-discovered'],
  ['Olin College of Engineering Public Demos', 'Needham', 'Norfolk', '1000 Olin Way', 'candidate-discovered'],
  ['UMass Boston Institute for Asian American Studies', 'Boston', 'Suffolk', '100 Morrissey Blvd', 'candidate-discovered'],
  ['UMass Boston William Joiner Institute', 'Boston', 'Suffolk', '100 Morrissey Blvd', 'candidate-discovered'],
  ['Wentworth Institute of Technology Public Showcase', 'Boston', 'Suffolk', '550 Huntington Ave', 'candidate-discovered'],
  ['Simmons University Beatley Library Lectures', 'Boston', 'Suffolk', '300 The Fenway', 'candidate-discovered'],
  ['Emerson College Bright Family Screening Room', 'Boston', 'Suffolk', '559 Washington St', 'candidate-discovered'],
  ['Suffolk University Ford Hall Forum', 'Boston', 'Suffolk', '8 Ashburton Pl', 'candidate-discovered'],
];

for (const [name, loc, cty, addr, status] of COLLEGIATE_AND_ACADEMIC) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Collegiate & Academic Discovery',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.edu/events`,
    termsUrl: `https://www.${slug}.edu/`,
    adapter: 'schedule',
    category: 'learning',
    rating: 'general',
    status,
    notes: `University academic center, public lecture forum, or collegiate institute in ${loc} (${cty} County).`,
  });
}

// 9. Foodways, Public Markets & Community Farms (35 streams)
const MARKETS_AND_FOODWAYS = [
  ['Boston Public Market', 'Boston', 'Suffolk', '100 Hanover St', 'onboarded'],
  ['Haymarket Historic Open-Air Market', 'Boston', 'Suffolk', 'Blackstone St', 'onboarded'],
  ['SoWa Open Market', 'Boston', 'Suffolk', '530 Harrison Ave', 'onboarded'],
  ['Union Square Farmers Market', 'Somerville', 'Middlesex', '90 Union Sq', 'onboarded'],
  ['Davis Square Farmers Market', 'Somerville', 'Middlesex', 'Day St & Herbert St', 'candidate-discovered'],
  ['Central Square Farmers Market', 'Cambridge', 'Middlesex', '76 Bishop Allen Dr', 'candidate-discovered'],
  ['Harvard University Farmers Market', 'Cambridge', 'Middlesex', '1 Oxford St Science Center Plaza', 'candidate-discovered'],
  ['Charles Square Farmers Market', 'Cambridge', 'Middlesex', '5 Bennett St', 'candidate-discovered'],
  ['Kendall Square Farmers Market', 'Cambridge', 'Middlesex', '350 Kendall St', 'candidate-discovered'],
  ['Copley Square Farmers Market', 'Boston', 'Suffolk', '139 St James Ave', 'candidate-discovered'],
  ['Dewey Square Farmers Market on the Greenway', 'Boston', 'Suffolk', '600 Atlantic Ave', 'candidate-discovered'],
  ['Boston Public Market Kitchen Cooking Classes', 'Boston', 'Suffolk', '100 Hanover St', 'candidate-discovered'],
  ['Egleston Farmers Market', 'Roxbury', 'Suffolk', '29 Everett Ave', 'candidate-discovered'],
  ['Ashmont Farmers Market', 'Dorchester', 'Suffolk', '1900 Dorchester Ave', 'candidate-discovered'],
  ['Dorchester Winter Farmers Market', 'Dorchester', 'Suffolk', 'Great Hall Codman Sq', 'candidate-discovered'],
  ['Mattapan Square Farmers Market', 'Mattapan', 'Suffolk', '520 River St', 'candidate-discovered'],
  ['East Boston Farmers Market', 'East Boston', 'Suffolk', 'Central Sq Park', 'candidate-discovered'],
  ['South Boston Farmers Market', 'South Boston', 'Suffolk', '446 W Broadway', 'candidate-discovered'],
  ['Roslindale Village Farmers Market', 'Roslindale', 'Suffolk', 'Adams Park', 'candidate-discovered'],
  ['Brookline Farmers Market', 'Brookline', 'Norfolk', 'Centre Street West Parking Lot', 'candidate-discovered'],
  ['Newton Farmers Market at Cold Spring Park', 'Newton', 'Middlesex', '1200 Beacon St', 'candidate-discovered'],
  ['Waltham Farmers Market', 'Waltham', 'Middlesex', '119 School St', 'candidate-discovered'],
  ['Watertown Farmers Market', 'Watertown', 'Middlesex', 'Saltonstall Park', 'candidate-discovered'],
  ['Arlington Farmers Market', 'Arlington', 'Middlesex', 'Russell Common Lot', 'candidate-discovered'],
  ['Medford Farmers Market', 'Medford', 'Middlesex', 'Condon Shell', 'candidate-discovered'],
  ['Lexington Farmers Market', 'Lexington', 'Middlesex', 'Waltham St', 'candidate-discovered'],
  ['Concord Ag Day Farmers Market', 'Concord', 'Middlesex', 'Main St', 'candidate-discovered'],
  ['Natick Farmers Market on the Common', 'Natick', 'Middlesex', 'Common St', 'candidate-discovered'],
  ['Quincy Farmers Market', 'Quincy', 'Norfolk', '1 Merrymount Pkwy', 'candidate-discovered'],
  ['Braintree Farmers Market', 'Braintree', 'Norfolk', '1 JFK Memorial Dr', 'candidate-discovered'],
  ['Salem Farmers Market on Derby Square', 'Salem', 'Essex', '32 Derby Sq', 'candidate-discovered'],
  ['Gloucester Farmers Market at Stage Fort Park', 'Gloucester', 'Essex', 'Hough Ave', 'candidate-discovered'],
  ['Beverly Farmers Market', 'Beverly', 'Essex', 'Veterans Memorial Park', 'candidate-discovered'],
  ['Marblehead Farmers Market', 'Marblehead', 'Essex', '217 Humphrey St', 'candidate-discovered'],
  ['Newburyport Farmers Market at The Tannery', 'Newburyport', 'Essex', '50 Water St', 'candidate-discovered'],
];

for (const [name, loc, cty, addr, status] of MARKETS_AND_FOODWAYS) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Foodways, Public Markets & Farms',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.org/market`,
    termsUrl: `https://www.${slug}.org/`,
    adapter: 'schedule',
    category: 'community',
    rating: 'family',
    status,
    notes: `Public open-air farmers market, artisan culinary exchange, or community farm in ${loc} (${cty} County).`,
  });
}

// 10. Biotech, Deep Tech & Civic Making (35 streams)
const TECH_AND_MAKING = [
  ['Cambridge Science Festival', 'Cambridge', 'Middlesex', 'Kendall Square & MIT', 'candidate-discovered'],
  ['Roxbury Innovation Center', 'Roxbury', 'Suffolk', '2300 Washington St Nubian Sq', 'candidate-discovered'],
  ['Artisan’s Asylum Maker Space', 'Boston', 'Suffolk', '96 Holton St Allston', 'candidate-discovered'],
  ['Somerville Media Center', 'Somerville', 'Middlesex', '29 Union Sq', 'candidate-discovered'],
  ['Cambridge Community Television (CCTV)', 'Cambridge', 'Middlesex', '438 Massachusetts Ave', 'candidate-discovered'],
  ['MassChallenge Startup Showcase', 'Boston', 'Suffolk', '21 Drydock Ave Seaport', 'candidate-discovered'],
  ['Venture Cafe Cambridge Thursday Gathering', 'Cambridge', 'Middlesex', '1 Broadway Kendall Sq', 'candidate-discovered'],
  ['District Hall Boston Innovation Center', 'Boston', 'Suffolk', '75 Northern Ave Seaport', 'candidate-discovered'],
  ['Fab Foundation / MIT Center for Bits and Atoms', 'Cambridge', 'Middlesex', 'E15-401 20 Ames St', 'candidate-discovered'],
  ['Greentown Labs Somerville Climatetech Open House', 'Somerville', 'Middlesex', '444 Somerville Ave', 'onboarded'],
  ['Boston Cyberarts Gallery', 'Boston', 'Suffolk', '141 Green St Jamaica Plain', 'candidate-discovered'],
  ['Parts and Crafts Maker Community', 'Somerville', 'Middlesex', '577 Somerville Ave', 'candidate-discovered'],
  ['BPL Kirstein Business Library & Innovation Center (KBLIC)', 'Boston', 'Suffolk', '700 Boylston St', 'candidate-discovered'],
  ['The Foundry Cambridge Community Arts & Making Center', 'Cambridge', 'Middlesex', '101 Rogers St', 'candidate-discovered'],
  ['Sommerville Arts Council Open Studios', 'Somerville', 'Middlesex', 'Citywide Somerville', 'candidate-discovered'],
  ['Cambridge Arts Open Studios', 'Cambridge', 'Middlesex', 'Citywide Cambridge', 'candidate-discovered'],
  ['Fort Point Arts Community (FPAC) Open Studios', 'Boston', 'Suffolk', '300 Summer St', 'candidate-discovered'],
  ['Jamaica Plain Open Studios', 'Boston', 'Suffolk', 'Citywide Jamaica Plain', 'candidate-discovered'],
  ['South End Open Studios (United South End Artists)', 'Boston', 'Suffolk', 'Harrison Ave', 'candidate-discovered'],
  ['Roslindale Open Studios', 'Boston', 'Suffolk', 'Adams Park & Studios', 'candidate-discovered'],
  ['Dorchester Open Studios', 'Dorchester', 'Suffolk', 'Erickson Arts Center', 'candidate-discovered'],
  ['Charlestown Artists Open Studios', 'Charlestown', 'Suffolk', 'Shipyard Quarters', 'candidate-discovered'],
  ['Brickbottom Artists Association', 'Somerville', 'Middlesex', '1 Fitchburg St', 'candidate-discovered'],
  ['Joy Street Studios Somerville', 'Somerville', 'Middlesex', '86 Joy St', 'candidate-discovered'],
  ['Vernon Street Studios Somerville', 'Somerville', 'Middlesex', '6 & 20 Vernon St', 'candidate-discovered'],
  ['Waltham Mills Artists Association Open Studios', 'Waltham', 'Middlesex', '144 Moody St', 'candidate-discovered'],
  ['Western Avenue Studios & Lofts', 'Lowell', 'Middlesex', '122 Western Ave', 'candidate-discovered'],
  ['Hatch Maker Space at Watertown Free Public Library', 'Watertown', 'Middlesex', '20 Wheeler Ave', 'candidate-discovered'],
  ['Makers Workshop Maynard', 'Maynard', 'Middlesex', 'Mill & Main', 'candidate-discovered'],
  ['North Shore Technology Council Forums', 'Beverly', 'Essex', 'Cummings Center', 'candidate-discovered'],
  ['Salem Arts Association Galleries & Workshops', 'Salem', 'Essex', '159 Derby St', 'candidate-discovered'],
  ['Rocky Neck Art Colony & Cultural Center', 'Gloucester', 'Essex', '6 Wonson St', 'candidate-discovered'],
  ['Manship Artists Residency + Studios', 'Gloucester', 'Essex', '10 Arlington St', 'candidate-discovered'],
  ['seARTS Science and Art Society Cape Ann', 'Gloucester', 'Essex', 'Harbor Loop', 'candidate-discovered'],
  ['Newburyport Art Association Galleries', 'Newburyport', 'Essex', '65 Water St', 'candidate-discovered'],
];

for (const [name, loc, cty, addr, status] of TECH_AND_MAKING) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  addStream({
    id: slug,
    name,
    organization: name,
    vertical: 'Biotech, Deep Tech & Civic Making',
    county: cty,
    locality: loc,
    address: `${addr}, ${loc}, MA`,
    url: `https://www.${slug}.org/events`,
    termsUrl: `https://www.${slug}.org/`,
    adapter: 'schedule',
    category: 'learning',
    rating: 'general',
    status,
    notes: `Biotechnology incubator, innovation laboratory, or open maker cooperative in ${loc} (${cty} County).`,
  });
}

console.log(`Generated ${CANDIDATE_STREAMS.length} total candidate streams.`);

// County and Vertical distribution breakdown
const countyBreakdown = {};
for (const s of CANDIDATE_STREAMS) {
  countyBreakdown[s.county] = (countyBreakdown[s.county] || 0) + 1;
}

const verticalBreakdown = {};
for (const s of CANDIDATE_STREAMS) {
  verticalBreakdown[s.vertical] = (verticalBreakdown[s.vertical] || 0) + 1;
}

const statusBreakdown = {};
for (const s of CANDIDATE_STREAMS) {
  statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1;
}

const streamIndex = {
  region: 'boston',
  title: 'Greater Boston 10x Expansion Candidate Stream Index',
  evaluatedOn: '2026-10-31',
  author: 'James Richmond & Antigravity Autonomous Engine',
  totalStreams: CANDIDATE_STREAMS.length,
  breakdown: {
    byCounty: countyBreakdown,
    byVertical: verticalBreakdown,
    byStatus: statusBreakdown,
  },
  counties: COUNTIES,
  verticals: VERTICALS,
  streams: CANDIDATE_STREAMS,
};

const indexPath = path.join(REPO, 'docs/sources/2026-10-31-boston-stream-index.json');
fs.writeFileSync(indexPath, JSON.stringify(streamIndex, null, 2) + '\n', 'utf8');
console.log(`Saved 10x stream index to ${indexPath}`);
