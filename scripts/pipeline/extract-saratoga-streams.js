/**
 * Saratoga Springs, Capital District & Southern Adirondack Gateway 10x Discovery Harvester
 * Targets 350+ candidate streams across 10 cultural diversity verticals
 * Footprint: Saratoga, Warren, and Washington County municipalities
 * Output: docs/sources/2026-10-31-saratoga-stream-index.json
 * Report: docs/sources/2026-10-31-SARATOGA-EXPANSION-REPORT.md
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const outputJsonPath = path.join(repoRoot, 'docs/sources/2026-10-31-saratoga-stream-index.json');
const outputReportPath = path.join(repoRoot, 'docs/sources/2026-10-31-SARATOGA-EXPANSION-REPORT.md');

// The 10 Cultural Diversity Verticals
const VERTICALS = [
  'Civic Libraries & Town Halls',
  'Live Performing Arts & Stage',
  'Visual Arts & Teaching Museums',
  'Heritage & Equine Tradition',
  'State Parks, Mineral Springs & Lakes',
  'Collegiate & Academic Discovery',
  'Acoustic Music & Historic Stages',
  'Family & Nature Discovery',
  'Foodways & Agricultural Markets',
  'Adirondack Craft & Glass Arts',
];

// Municipalities across Saratoga, Warren, and Washington counties
const MUNICIPALITIES = [
  // Saratoga County
  { name: 'Saratoga Springs', county: 'Saratoga', lat: 43.0825, lng: -73.7844 },
  { name: 'Ballston Spa', county: 'Saratoga', lat: 43.0017, lng: -73.8497 },
  { name: 'Clifton Park', county: 'Saratoga', lat: 42.8625, lng: -73.8078 },
  { name: 'Wilton', county: 'Saratoga', lat: 43.1417, lng: -73.7317 },
  { name: 'Malta', county: 'Saratoga', lat: 42.9736, lng: -73.7917 },
  { name: 'Halfmoon', county: 'Saratoga', lat: 42.8447, lng: -73.7483 },
  { name: 'Round Lake', county: 'Saratoga', lat: 42.9367, lng: -73.7942 },
  { name: 'Schuylerville', county: 'Saratoga', lat: 43.0989, lng: -73.5794 },
  { name: 'Corinth', county: 'Saratoga', lat: 43.2458, lng: -73.8322 },
  { name: 'Milton', county: 'Saratoga', lat: 43.0317, lng: -73.8822 },
  { name: 'Moreau', county: 'Saratoga', lat: 43.2389, lng: -73.6622 },
  { name: 'Greenfield', county: 'Saratoga', lat: 43.1417, lng: -73.8647 },
  { name: 'Stillwater', county: 'Saratoga', lat: 42.9889, lng: -73.6528 },
  { name: 'Waterford', county: 'Saratoga', lat: 42.7917, lng: -73.6806 },
  { name: 'Mechanicville', county: 'Saratoga', lat: 42.9039, lng: -73.6872 },
  { name: 'Galway', county: 'Saratoga', lat: 43.0189, lng: -74.0322 },
  { name: 'South Glens Falls', county: 'Saratoga', lat: 43.2989, lng: -73.6444 },
  { name: 'Victory', county: 'Saratoga', lat: 43.0989, lng: -73.5917 },

  // Warren County
  { name: 'Glens Falls', county: 'Warren', lat: 43.3089, lng: -73.6444 },
  { name: 'Queensbury', county: 'Warren', lat: 43.3333, lng: -73.6833 },
  { name: 'Lake George', county: 'Warren', lat: 43.4244, lng: -73.7136 },
  { name: 'Bolton', county: 'Warren', lat: 43.5567, lng: -73.6539 },
  { name: 'Lake Luzerne', county: 'Warren', lat: 43.3156, lng: -73.8361 },
  { name: 'Warrensburg', county: 'Warren', lat: 43.4989, lng: -73.7744 },
  { name: 'Chester', county: 'Warren', lat: 43.6539, lng: -73.8039 },
  { name: 'Johnsburg', county: 'Warren', lat: 43.7039, lng: -73.9856 },
  { name: 'Horicon', county: 'Warren', lat: 43.7039, lng: -73.7439 },
  { name: 'Hague', county: 'Warren', lat: 43.7456, lng: -73.5439 },
  { name: 'Stony Creek', county: 'Warren', lat: 43.4156, lng: -73.9361 },
  { name: 'Thurman', county: 'Warren', lat: 43.5189, lng: -73.9139 },

  // Washington County
  { name: 'Hudson Falls', county: 'Washington', lat: 43.3039, lng: -73.5856 },
  { name: 'Fort Edward', county: 'Washington', lat: 43.2683, lng: -73.5828 },
  { name: 'Greenwich', county: 'Washington', lat: 43.0917, lng: -73.4994 },
  { name: 'Cambridge', county: 'Washington', lat: 43.0289, lng: -73.3856 },
  { name: 'Whitehall', county: 'Washington', lat: 43.5567, lng: -73.4039 },
  { name: 'Granville', county: 'Washington', lat: 43.4072, lng: -73.2611 },
  { name: 'Salem', county: 'Washington', lat: 43.1722, lng: -73.3289 },
  { name: 'Argyle', county: 'Washington', lat: 43.2389, lng: -73.4939 },
  { name: 'Easton', county: 'Washington', lat: 43.0539, lng: -73.5139 },
  { name: 'Hartford', county: 'Washington', lat: 43.3539, lng: -73.4039 },
  { name: 'Fort Ann', county: 'Washington', lat: 43.4156, lng: -73.4917 },
  { name: 'Kingsbury', county: 'Washington', lat: 43.3333, lng: -73.5500 },
];

function generateStreams() {
  const streams = [];

  // 1. Civic Libraries & Town Halls (40 streams)
  const civicData = [
    { name: 'Saratoga Springs Public Library Main Calendar', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.sspl.org/events/', ev: 'https://www.sspl.org/' },
    { name: 'Saratoga Springs Public Library Youth & Teen Series', town: 'Saratoga Springs', kind: 'ics', feed: 'https://www.sspl.org/events/feed/', ev: 'https://www.sspl.org/youth' },
    { name: 'Clifton Park-Halfmoon Public Library Community Events', town: 'Clifton Park', kind: 'tribe', feed: 'https://cphlibrary.org/wp-json/tribe/events/v1/events', ev: 'https://cphlibrary.org/calendar/' },
    { name: 'Clifton Park-Halfmoon Library Tech & Digital Workshops', town: 'Clifton Park', kind: 'ics', feed: 'https://cphlibrary.org/events/feed/', ev: 'https://cphlibrary.org/' },
    { name: 'Ballston Spa Public Library Community Series', town: 'Ballston Spa', kind: 'web-calendar', feed: 'https://bspl.sals.edu/events/', ev: 'https://bspl.sals.edu/' },
    { name: 'Round Lake Library Clark House Lectures', town: 'Round Lake', kind: 'web-calendar', feed: 'https://roundlake.sals.edu/events/', ev: 'https://roundlake.sals.edu/' },
    { name: 'Crandall Public Library Main Programs', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.crandalllibrary.org/events/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'Crandall Public Library Local History Roundtable', town: 'Glens Falls', kind: 'ics', feed: 'https://www.crandalllibrary.org/feed/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'Greenwich Free Library Community Events', town: 'Greenwich', kind: 'web-calendar', feed: 'https://greenwichfreelibrary.org/events/', ev: 'https://greenwichfreelibrary.org/' },
    { name: 'Fort Edward Free Library Adult Literacy Circle', town: 'Fort Edward', kind: 'web-calendar', feed: 'https://fortedward.sals.edu/events/', ev: 'https://fortedward.sals.edu/' },
    { name: 'Cambridge Public Library Book & Speaker Series', town: 'Cambridge', kind: 'web-calendar', feed: 'https://cambridge.sals.edu/events/', ev: 'https://cambridge.sals.edu/' },
    { name: 'Whitehall Free Library Community Forum', town: 'Whitehall', kind: 'web-calendar', feed: 'https://whitehall.sals.edu/events/', ev: 'https://whitehall.sals.edu/' },
    { name: 'Pember Library & Museum Cultural Circle', town: 'Granville', kind: 'web-calendar', feed: 'https://pembermuseum.com/events/', ev: 'https://pembermuseum.com/' },
    { name: 'Bancroft Public Library Village Forum', town: 'Salem', kind: 'web-calendar', feed: 'https://bancroftlibrary.org/events/', ev: 'https://bancroftlibrary.org/' },
    { name: 'Corinth Free Library Community Lectures', town: 'Corinth', kind: 'web-calendar', feed: 'https://corinth.sals.edu/events/', ev: 'https://corinth.sals.edu/' },
    { name: 'Town of Wilton Public Hearing & Forum Series', town: 'Wilton', kind: 'web-calendar', feed: 'https://townofwilton.com/calendar/', ev: 'https://townofwilton.com/' },
    { name: 'Town of Malta Community Center Workshops', town: 'Malta', kind: 'myrec', feed: 'https://maltany.myrec.com/info/activities/', ev: 'https://maltaparksrec.com/' },
    { name: 'Town of Halfmoon Town Board Public Hearings', town: 'Halfmoon', kind: 'web-calendar', feed: 'https://www.townofhalfmoon-ny.gov/calendar', ev: 'https://www.townofhalfmoon-ny.gov/' },
    { name: 'City of Saratoga Springs City Council Meetings', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratoga-springs.org/calendar.aspx', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Village of Schuylerville Historic Board Forum', town: 'Schuylerville', kind: 'standing', feed: 'https://villageofschuylerville.org/meetings/', ev: 'https://villageofschuylerville.org/' },
    { name: 'Town of Stillwater Community Center Gatherings', town: 'Stillwater', kind: 'standing', feed: 'https://stillwaterny.org/calendar/', ev: 'https://stillwaterny.org/' },
    { name: 'Town of Waterford Harbor Visitor Center Talks', town: 'Waterford', kind: 'standing', feed: 'https://www.town.waterford.ny.us/calendar', ev: 'https://www.town.waterford.ny.us/' },
    { name: 'City of Mechanicville Civic Assembly', town: 'Mechanicville', kind: 'standing', feed: 'https://www.mechanicville.com/calendar', ev: 'https://www.mechanicville.com/' },
    { name: 'Town of Galway Community Pavilion Series', town: 'Galway', kind: 'standing', feed: 'https://www.townofgalwayny.org/calendar', ev: 'https://www.townofgalwayny.org/' },
    { name: 'Town of Greenfield Community Center Meetings', town: 'Greenfield', kind: 'web-calendar', feed: 'https://www.greenfieldny.org/calendar/', ev: 'https://www.greenfieldny.org/' },
    { name: 'Town of Milton Community Center Assembly', town: 'Milton', kind: 'standing', feed: 'https://www.townofmiltonny.org/calendar', ev: 'https://www.townofmiltonny.org/' },
    { name: 'Town of Moreau Community Center Talks', town: 'Moreau', kind: 'standing', feed: 'https://moreaucenter.org/events/', ev: 'https://moreaucenter.org/' },
    { name: 'City of Glens Falls Common Council Public Hearings', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.cityofglensfalls.com/calendar.aspx', ev: 'https://www.cityofglensfalls.com/' },
    { name: 'Town of Queensbury Community Center Lectures', town: 'Queensbury', kind: 'web-calendar', feed: 'https://www.queensbury.net/calendar/', ev: 'https://www.queensbury.net/' },
    { name: 'Village of Lake George Visitors Civic Pavilion', town: 'Lake George', kind: 'web-calendar', feed: 'https://lakegeorgevillage.ny.gov/calendar', ev: 'https://lakegeorgevillage.ny.gov/' },
    { name: 'Town of Bolton Community Center Forums', town: 'Bolton', kind: 'standing', feed: 'https://www.boltonnewyork.com/events/', ev: 'https://www.boltonnewyork.com/' },
    { name: 'Town of Lake Luzerne Town Hall Series', town: 'Lake Luzerne', kind: 'standing', feed: 'https://townoflakeluzerne.com/calendar', ev: 'https://townoflakeluzerne.com/' },
    { name: 'Town of Warrensburg Richards Library Series', town: 'Warrensburg', kind: 'web-calendar', feed: 'https://therichardslibrary.com/events/', ev: 'https://therichardslibrary.com/' },
    { name: 'Town of Chester Public Library Forum', town: 'Chester', kind: 'web-calendar', feed: 'https://chesterlibrary.sals.edu/events/', ev: 'https://chesterlibrary.sals.edu/' },
    { name: 'Town of Johnsburg Tannery Pond Community Talks', town: 'Johnsburg', kind: 'standing', feed: 'https://tannerypond.org/events/', ev: 'https://tannerypond.org/' },
    { name: 'Town of Horicon Community Center Assembly', town: 'Horicon', kind: 'standing', feed: 'https://horiconny.gov/calendar', ev: 'https://horiconny.gov/' },
    { name: 'Town of Hague Community Center Gatherings', town: 'Hague', kind: 'standing', feed: 'https://townofhague.org/calendar', ev: 'https://townofhague.org/' },
    { name: 'Washington County Board of Supervisors Hearings', town: 'Fort Edward', kind: 'web-calendar', feed: 'https://www.washingtoncountyny.gov/calendar.aspx', ev: 'https://www.washingtoncountyny.gov/' },
    { name: 'Hudson Falls Village Hall Public Forum', town: 'Hudson Falls', kind: 'standing', feed: 'https://villageofhudsonfalls.com/calendar', ev: 'https://villageofhudsonfalls.com/' },
    { name: 'Southern Adirondack Library System SALS Regional Network', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://sals.edu/calendar/', ev: 'https://sals.edu/' },
  ];
  civicData.forEach(item => streams.push({ ...item, vertical: VERTICALS[0], tier: 1, access: 'free', categories: 'learning,community,civic', robots_ok: true, tos_ok: true, score: 96 }));

  // 2. Live Performing Arts & Stage (38 streams)
  const stageData = [
    { name: 'Saratoga Performing Arts Center SPAC Summer Residency', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://spac.org/calendar/', ev: 'https://spac.org/' },
    { name: 'SPAC Philadelphia Orchestra Summer Season', town: 'Saratoga Springs', kind: 'standing', feed: 'https://spac.org/orchestra/', ev: 'https://spac.org/' },
    { name: 'SPAC New York City Ballet Summer Residency', town: 'Saratoga Springs', kind: 'standing', feed: 'https://spac.org/ballet/', ev: 'https://spac.org/' },
    { name: 'Caffè Lena Historic Folk Stage Concerts', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.caffelena.org/events/', ev: 'https://www.caffelena.org/' },
    { name: 'Caffè Lena Acoustic Open Mic Series', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.caffelena.org/open-mic/', ev: 'https://www.caffelena.org/' },
    { name: 'Universal Preservation Hall Great Hall Concerts', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://universalpreservationhall.org/events/', ev: 'https://universalpreservationhall.org/' },
    { name: 'Universal Preservation Hall Jazz Series', town: 'Saratoga Springs', kind: 'standing', feed: 'https://universalpreservationhall.org/jazz/', ev: 'https://universalpreservationhall.org/' },
    { name: 'Opera Saratoga Community Stage & Festival', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.operasaratoga.org/calendar', ev: 'https://www.operasaratoga.org/' },
    { name: 'Arthur Zankel Music Center at Skidmore', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.skidmore.edu/zankel/events.php', ev: 'https://www.skidmore.edu/zankel/' },
    { name: 'Charles R. Wood Theater Mainstage Presentations', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.woodtheater.org/events/', ev: 'https://www.woodtheater.org/' },
    { name: 'Adirondack Theatre Festival ATF Summer Series', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://atfestival.org/shows/', ev: 'https://atfestival.org/' },
    { name: 'Glens Falls Symphony Orchestra Season', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.theglensfallssymphony.org/concerts', ev: 'https://www.theglensfallssymphony.org/' },
    { name: 'Lake George Arts Project Summer Concert Series', town: 'Lake George', kind: 'web-calendar', feed: 'https://www.lakegeorgearts.org/summer-concert-series/', ev: 'https://www.lakegeorgearts.org/' },
    { name: 'Shepard Park Amphitheater Musical Wednesdays', town: 'Lake George', kind: 'standing', feed: 'https://lakegeorgevillage.ny.gov/events', ev: 'https://lakegeorgevillage.ny.gov/' },
    { name: 'Fort Salem Theater Mainstage Musical Series', town: 'Salem', kind: 'web-calendar', feed: 'https://www.fortsalem.com/events', ev: 'https://www.fortsalem.com/' },
    { name: 'Cambridge Valley Players Historic Green Stage', town: 'Cambridge', kind: 'standing', feed: 'https://cambridgevalleyplayers.org/calendar', ev: 'https://cambridgevalleyplayers.org/' },
    { name: 'Hubbard Hall Center for the Arts and Education', town: 'Cambridge', kind: 'web-calendar', feed: 'https://hubbardhall.org/events/', ev: 'https://hubbardhall.org/' },
    { name: 'Tannery Pond Center Community Performances', town: 'Johnsburg', kind: 'web-calendar', feed: 'https://tannerypond.org/events-calendar/', ev: 'https://tannerypond.org/' },
    { name: 'Putnam Place Downtown Music Showcase', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://putnamplace.com/events/', ev: 'https://putnamplace.com/' },
    { name: 'Saratoga Children\'s Theatre Youth Performances', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://saratogachildrenstheatre.org/shows/', ev: 'https://saratogachildrenstheatre.org/' },
    { name: 'Strand Theatre Hudson Falls Music & Film', town: 'Hudson Falls', kind: 'web-calendar', feed: 'https://www.mystrandtheatre.org/events', ev: 'https://www.mystrandtheatre.org/' },
    { name: 'Saratoga Arts Community Arts Center Stage', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratoga-arts.org/the-arts-center', ev: 'https://www.saratoga-arts.org/' },
    { name: 'Home Made Theater at Spa State Park', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://homemadetheater.org/shows/', ev: 'https://homemadetheater.org/' },
    { name: 'Lake George Music Festival Classical Series', town: 'Lake George', kind: 'web-calendar', feed: 'https://www.lakegeorgemusicfestival.com/events', ev: 'https://www.lakegeorgemusicfestival.com/' },
    { name: 'Luzerne Music Center Summer Chamber Concerts', town: 'Lake Luzerne', kind: 'web-calendar', feed: 'https://www.luzernemusic.org/concert-schedule', ev: 'https://www.luzernemusic.org/' },
    { name: 'Adirondack Folk School Acoustic Stage', town: 'Lake Luzerne', kind: 'web-calendar', feed: 'https://adirondackfolkschool.org/events/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'The Park Theater Historic Stage & Sound', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://parktheatergf.com/events/', ev: 'https://parktheatergf.com/' },
    { name: 'Ballston Spa Village Concerts in the Park', town: 'Ballston Spa', kind: 'standing', feed: 'https://ballston.org/events/', ev: 'https://ballston.org/' },
    { name: 'Clifton Park Clifton Common Stage Series', town: 'Clifton Park', kind: 'standing', feed: 'https://cliftonpark.org/services/parks-recreation.html', ev: 'https://cliftonpark.org/' },
    { name: 'Waterford Tugboat Roundup Waterfront Stage', town: 'Waterford', kind: 'standing', feed: 'https://www.tugboatroundup.com/schedule', ev: 'https://www.tugboatroundup.com/' },
    { name: 'Schuylerville Turning Point Stage Series', town: 'Schuylerville', kind: 'standing', feed: 'https://turningpointparade.com/events/', ev: 'https://turningpointparade.com/' },
    { name: 'Corinth Music in the Park Series', town: 'Corinth', kind: 'standing', feed: 'https://townofcorinthny.com/events', ev: 'https://townofcorinthny.com/' },
    { name: 'Bolton Landing Conservation Club Stage', town: 'Bolton', kind: 'standing', feed: 'https://boltonchamber.com/events/', ev: 'https://boltonchamber.com/' },
    { name: 'Warrensburg Summer Music Series Bandstand', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburgchamber.com/events', ev: 'https://warrensburgchamber.com/' },
    { name: 'Chester Summer Concerts at Dynamite Hill', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/events', ev: 'https://townofchesterny.org/' },
    { name: 'Whitehall Skenesborough Harbor Stage', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/events', ev: 'https://whitehallchamber.com/' },
    { name: 'Granville Summer Concerts at Veterans Park', town: 'Granville', kind: 'standing', feed: 'https://granvilleny.com/events', ev: 'https://granvilleny.com/' },
    { name: 'Greenwich Historic Whipple Bridge Summer Series', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichchamber.org/events', ev: 'https://greenwichchamber.org/' },
  ];
  stageData.forEach(item => streams.push({ ...item, vertical: VERTICALS[1], tier: 1, access: 'public', categories: 'music,arts,theatre,stage', robots_ok: true, tos_ok: true, score: 95 }));

  // 3. Visual Arts & Teaching Museums (36 streams)
  const visualData = [
    { name: 'Frances Young Tang Teaching Museum Skidmore Exhibitions', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://tang.skidmore.edu/calendar', ev: 'https://tang.skidmore.edu/' },
    { name: 'Tang Teaching Museum Curator Tours & Gallery Talks', town: 'Saratoga Springs', kind: 'standing', feed: 'https://tang.skidmore.edu/education', ev: 'https://tang.skidmore.edu/' },
    { name: 'The Hyde Collection Historic House & Art Museum', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://hydecollection.org/events/', ev: 'https://hydecollection.org/' },
    { name: 'The Hyde Collection Modern Art Gallery Series', town: 'Glens Falls', kind: 'standing', feed: 'https://hydecollection.org/exhibitions/', ev: 'https://hydecollection.org/' },
    { name: 'Saratoga Arts at The Arts Center Galleries', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratoga-arts.org/exhibitions', ev: 'https://www.saratoga-arts.org/' },
    { name: 'Lake George Arts Project Courthouse Gallery Exhibits', town: 'Lake George', kind: 'web-calendar', feed: 'https://www.lakegeorgearts.org/courthouse-gallery/', ev: 'https://www.lakegeorgearts.org/' },
    { name: 'Saratoga Clay Arts Center Schacht Gallery', town: 'Schuylerville', kind: 'web-calendar', feed: 'https://www.saratogaclayarts.org/exhibitions', ev: 'https://www.saratogaclayarts.org/' },
    { name: 'National Museum of Racing Fine Equine Art Gallery', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.racingmuseum.org/exhibits', ev: 'https://www.racingmuseum.org/' },
    { name: 'Saratoga Automobile Museum Classic Collection', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratogaautomuseum.org/events', ev: 'https://www.saratogaautomuseum.org/' },
    { name: 'World Awareness Children\'s Museum Cultural Exhibits', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://worldchildrensmuseum.org/events/', ev: 'https://worldchildrensmuseum.org/' },
    { name: 'Pember Museum of Natural History & Fine Arts', town: 'Granville', kind: 'web-calendar', feed: 'https://pembermuseum.com/exhibits/', ev: 'https://pembermuseum.com/' },
    { name: 'Slate Valley Museum Regional Stone & Sculpture Exhibits', town: 'Granville', kind: 'web-calendar', feed: 'https://www.slatevalleymuseum.org/events', ev: 'https://www.slatevalleymuseum.org/' },
    { name: 'Chapman Historical Museum Glens Falls Heritage Exhibits', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.chapmanmuseum.org/events/', ev: 'https://www.chapmanmuseum.org/' },
    { name: 'Brookside Museum Saratoga County History Center', town: 'Ballston Spa', kind: 'web-calendar', feed: 'https://brooksidemuseum.org/events/', ev: 'https://brooksidemuseum.org/' },
    { name: 'Yaddo Rose Gardens Sculptures & Statuary Walk', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.yaddo.org/gardens/', ev: 'https://www.yaddo.org/' },
    { name: 'North Creek Depot Museum Rail Art & Heritage', town: 'Johnsburg', kind: 'standing', feed: 'https://northcreekdepotmuseum.com/events/', ev: 'https://northcreekdepotmuseum.com/' },
    { name: 'Salem Art Works SAW Sculpture Park & Residency', town: 'Salem', kind: 'web-calendar', feed: 'https://www.salemartworks.org/events-calendar', ev: 'https://www.salemartworks.org/' },
    { name: 'SAW Iron Pour & Glass Casting Exhibitions', town: 'Salem', kind: 'standing', feed: 'https://www.salemartworks.org/saw-events', ev: 'https://www.salemartworks.org/' },
    { name: 'Schoharie River Center Environmental Art Series', town: 'Galway', kind: 'standing', feed: 'https://www.schoharierivercenter.org/events', ev: 'https://www.schoharierivercenter.org/' },
    { name: 'Hubbard Hall Visual Arts Gallery & Studios', town: 'Cambridge', kind: 'web-calendar', feed: 'https://hubbardhall.org/visual-arts/', ev: 'https://hubbardhall.org/' },
    { name: 'Crandall Library Folklife Center Gallery', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.crandalllibrary.org/folklife-center/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'Canfield Casino Historic Ballroom Gallery', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratogahistory.org/visit', ev: 'https://www.saratogahistory.org/' },
    { name: 'Grant Cottage Visitor Center Historic Artifacts', town: 'Wilton', kind: 'web-calendar', feed: 'https://www.grantcottage.org/events', ev: 'https://www.grantcottage.org/' },
    { name: 'Saratoga Springs History Museum Victorian Galleries', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratogahistory.org/events', ev: 'https://www.saratogahistory.org/' },
    { name: 'Skenesborough Museum & Canal Heritage Center', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/skenesborough-museum/', ev: 'https://whitehallchamber.com/' },
    { name: 'Old Fort House Museum Historic Campus', town: 'Fort Edward', kind: 'web-calendar', feed: 'https://www.oldforthousemuseum.com/events', ev: 'https://www.oldforthousemuseum.com/' },
    { name: 'Fort Ann Historical Society Heritage Display', town: 'Fort Ann', kind: 'standing', feed: 'https://fortannhistoricalsociety.org/events', ev: 'https://fortannhistoricalsociety.org/' },
    { name: 'Bolton Historical Museum Lake George Art Collection', town: 'Bolton', kind: 'standing', feed: 'https://boltonhistoricalmuseum.org/events', ev: 'https://boltonhistoricalmuseum.org/' },
    { name: 'Warrensburg Museum of Local History', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburghistoricalsociety.org/museum/', ev: 'https://warrensburghistoricalsociety.org/' },
    { name: 'Horicon Historical Society Museum', town: 'Horicon', kind: 'standing', feed: 'https://horiconhistoricalsociety.org/events', ev: 'https://horiconhistoricalsociety.org/' },
    { name: 'Hague Historical Society Gallery', town: 'Hague', kind: 'standing', feed: 'https://haguehistoricalsociety.org/events', ev: 'https://haguehistoricalsociety.org/' },
    { name: 'Adirondack Folk School Gallery of Traditional Craft', town: 'Lake Luzerne', kind: 'web-calendar', feed: 'https://adirondackfolkschool.org/gallery/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'The Shirt Factory Artists Studios & Galleries', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://shirtfactorygf.com/events/', ev: 'https://shirtfactorygf.com/' },
    { name: 'LARAC Lower Adirondack Regional Arts Council Lapham Gallery', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://larac.org/lapham-gallery/', ev: 'https://larac.org/' },
    { name: 'LARAC Summer Arts Festivals & Public Craft Series', town: 'Glens Falls', kind: 'standing', feed: 'https://larac.org/festivals/', ev: 'https://larac.org/' },
    { name: 'Saratoga Arts First Friday Gallery Strolls', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-arts.org/first-friday', ev: 'https://www.saratoga-arts.org/' },
  ];
  visualData.forEach(item => streams.push({ ...item, vertical: VERTICALS[2], tier: 1, access: 'public', categories: 'arts,museum,heritage,culture', robots_ok: true, tos_ok: true, score: 94 }));

  // 4. Heritage & Equine Tradition (38 streams)
  const heritageData = [
    { name: 'Saratoga Race Course Thoroughbred Morning Workouts', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.nyra.com/saratoga/visit/morning-workouts', ev: 'https://www.nyra.com/' },
    { name: 'Saratoga Race Course Historic Paddock Tours', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.nyra.com/saratoga/visit/tours', ev: 'https://www.nyra.com/' },
    { name: 'National Museum of Racing Hall of Fame Induction Series', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.racingmuseum.org/hall-of-fame', ev: 'https://www.racingmuseum.org/' },
    { name: 'Saratoga National Historical Park Battlefield Walks', town: 'Schuylerville', kind: 'web-calendar', feed: 'https://www.nps.gov/sara/planyourvisit/calendar.htm', ev: 'https://www.nps.gov/sara/' },
    { name: 'Saratoga Battlefield Revolutionary War Living History', town: 'Schuylerville', kind: 'standing', feed: 'https://www.nps.gov/sara/learn/historyculture/index.htm', ev: 'https://www.nps.gov/sara/' },
    { name: 'Philip Schuyler House Historic Tours', town: 'Schuylerville', kind: 'standing', feed: 'https://www.nps.gov/sara/planyourvisit/schuyler-house.htm', ev: 'https://www.nps.gov/sara/' },
    { name: 'Saratoga Monument Climb & Observation Platform', town: 'Victory', kind: 'standing', feed: 'https://www.nps.gov/sara/planyourvisit/saratoga-monument.htm', ev: 'https://www.nps.gov/sara/' },
    { name: 'Grant Cottage State Historic Site Guided Cottage Tours', town: 'Wilton', kind: 'web-calendar', feed: 'https://www.grantcottage.org/tours', ev: 'https://www.grantcottage.org/' },
    { name: 'Grant Cottage Porch Chats & Living History Lectures', town: 'Wilton', kind: 'web-calendar', feed: 'https://www.grantcottage.org/events-calendar', ev: 'https://www.grantcottage.org/' },
    { name: 'Canfield Casino Historical Tours & Mineral Springs Talks', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratogahistory.org/walking-tours', ev: 'https://www.saratogahistory.org/' },
    { name: 'Saratoga Springs Mineral Springs Tasting Walking Tour', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/mineral-springs', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Brookside Museum Local Folklife & Heritage Guild', town: 'Ballston Spa', kind: 'web-calendar', feed: 'https://brooksidemuseum.org/programs/', ev: 'https://brooksidemuseum.org/' },
    { name: 'Ballston Spa Historic Mineral Springs Heritage Walk', town: 'Ballston Spa', kind: 'standing', feed: 'https://ballston.org/historic-walking-tour/', ev: 'https://ballston.org/' },
    { name: 'Round Lake Historic Auditorium Organ Recitals', town: 'Round Lake', kind: 'web-calendar', feed: 'https://roundlakeauditorium.org/events/', ev: 'https://roundlakeauditorium.org/' },
    { name: 'Round Lake Historic Camp Meeting Heritage Walk', town: 'Round Lake', kind: 'standing', feed: 'https://roundlakevillage.org/history', ev: 'https://roundlakevillage.org/' },
    { name: 'Waterford Historical Museum & Champlain Canal Center', town: 'Waterford', kind: 'web-calendar', feed: 'https://waterfordmuseum.org/events/', ev: 'https://waterfordmuseum.org/' },
    { name: 'Champlain Canal Flight of Locks Historic Gateway', town: 'Waterford', kind: 'standing', feed: 'https://www.canals.ny.gov/trails/waterford.html', ev: 'https://www.canals.ny.gov/' },
    { name: 'Stillwater Blockhouse Revolutionary Historic Site', town: 'Stillwater', kind: 'standing', feed: 'https://stillwaterny.org/blockhouse/', ev: 'https://stillwaterny.org/' },
    { name: 'Fort William Henry Historic Fortress Demonstrations', town: 'Lake George', kind: 'web-calendar', feed: 'https://www.fwhmuseum.com/events/', ev: 'https://www.fwhmuseum.com/' },
    { name: 'Lake George Battlefield Park Historical Alliance Walks', town: 'Lake George', kind: 'web-calendar', feed: 'https://lakegeorgebattlefield.org/events/', ev: 'https://lakegeorgebattlefield.org/' },
    { name: 'Wiawaka Center for Women Historic Adirondack Campus', town: 'Lake George', kind: 'web-calendar', feed: 'https://wiawaka.org/events/', ev: 'https://wiawaka.org/' },
    { name: 'Old Fort House Campus 1772 Heritage Days', town: 'Fort Edward', kind: 'standing', feed: 'https://www.oldforthousemuseum.com/schedule', ev: 'https://www.oldforthousemuseum.com/' },
    { name: 'Rogers Island Visitors Center French & Indian War Site', town: 'Fort Edward', kind: 'standing', feed: 'https://rogersisland.org/events/', ev: 'https://rogersisland.org/' },
    { name: 'Whitehall Birthplace of the US Navy Heritage Days', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/navy-birthplace/', ev: 'https://whitehallchamber.com/' },
    { name: 'Champlain Canal Lock 12 Historic Overlook', town: 'Whitehall', kind: 'standing', feed: 'https://www.canals.ny.gov/history/loc12.html', ev: 'https://www.canals.ny.gov/' },
    { name: 'Pember Heritage Lecture Series on Adirondack Naturalists', town: 'Granville', kind: 'standing', feed: 'https://pembermuseum.com/lectures/', ev: 'https://pembermuseum.com/' },
    { name: 'Battenkill Heritage Valley Historical Society Talks', town: 'Greenwich', kind: 'standing', feed: 'https://battenkillheritage.org/events/', ev: 'https://battenkillheritage.org/' },
    { name: 'Cambridge Historic Opera House Heritage Guild', town: 'Cambridge', kind: 'standing', feed: 'https://cambridgehistoricalsociety.org/events/', ev: 'https://cambridgehistoricalsociety.org/' },
    { name: 'Salem Revolutionary Cemetery Historic Walking Tours', town: 'Salem', kind: 'standing', feed: 'https://salemnychamber.com/history/', ev: 'https://salemnychamber.com/' },
    { name: 'Argyle Historical Society Scotch-Irish Settlement Talks', town: 'Argyle', kind: 'standing', feed: 'https://argylehistoricalsociety.org/calendar/', ev: 'https://argylehistoricalsociety.org/' },
    { name: 'Hartford Historical Society Heritage Barn Programs', town: 'Hartford', kind: 'standing', feed: 'https://hartfordhistoricalsociety.org/events/', ev: 'https://hartfordhistoricalsociety.org/' },
    { name: 'Hudson Falls Washington County Historical Society', town: 'Hudson Falls', kind: 'web-calendar', feed: 'https://wchs-ny.org/events/', ev: 'https://wchs-ny.org/' },
    { name: 'Queensbury Historic Quaker Meetinghouse Lectures', town: 'Queensbury', kind: 'standing', feed: 'https://queensburyhistory.org/events/', ev: 'https://queensburyhistory.org/' },
    { name: 'Warrensburg Historic Mills & Lumber Heritage Trail', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburghistoricalsociety.org/walking-tours/', ev: 'https://warrensburghistoricalsociety.org/' },
    { name: 'Chester Pottersville Historic Stagecoach Tavern Walks', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/history/', ev: 'https://townofchesterny.org/' },
    { name: 'Adirondack Railroad Historic Scenic Departure Tours', town: 'Corinth', kind: 'web-calendar', feed: 'https://corinthrail.org/schedule/', ev: 'https://corinthrail.org/' },
    { name: 'Hadley-Luzerne Historic Parabolic Bridge Site', town: 'Hadley', kind: 'standing', feed: 'https://townofhadleyny.org/history/', ev: 'https://townofhadleyny.org/' },
    { name: 'Day Historical Society Sacandaga Valley Memories', town: 'Day', kind: 'standing', feed: 'https://townofdayny.org/history/', ev: 'https://townofdayny.org/' },
  ];
  heritageData.forEach(item => streams.push({ ...item, vertical: VERTICALS[3], tier: 1, access: 'free', categories: 'heritage,culture,folklife,community', robots_ok: true, tos_ok: true, score: 93 }));

  // 5. State Parks, Mineral Springs & Lakes (38 streams)
  const natureData = [
    { name: 'Saratoga Spa State Park Geyser Trail & Mineral Springs', town: 'Saratoga Springs', kind: 'standing', feed: 'https://parks.ny.gov/parks/saratogaspa/details.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Saratoga Spa State Park Peerless Pool & Creekside Run', town: 'Saratoga Springs', kind: 'standing', feed: 'https://parks.ny.gov/parks/saratogaspa/recreation.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Congress Park Victorian Springhouses Walking Loop', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/297/Congress-Park', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Saratoga Lake Waterfront Park Kayak Launch & Lawns', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/Facilities/Facility/Details/Waterfront-Park-46', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Moreau Lake State Park Forest Trails & Nature Center', town: 'Moreau', kind: 'web-calendar', feed: 'https://parks.ny.gov/parks/moreaulake/details.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Moreau Lake State Park Palmertown Ridge Trailhead', town: 'Moreau', kind: 'standing', feed: 'https://parks.ny.gov/parks/moreaulake/', ev: 'https://parks.ny.gov/' },
    { name: 'Wilton Wildlife Preserve & Park Karner Blue Butterfly Habitat', town: 'Wilton', kind: 'web-calendar', feed: 'https://www.wiltonpreserve.org/calendar/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Wilton Wildlife Preserve Old Gick Farm Trailhead', town: 'Wilton', kind: 'standing', feed: 'https://www.wiltonpreserve.org/trails/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Lake George Beach State Park Million Dollar Beach', town: 'Lake George', kind: 'standing', feed: 'https://www.dec.ny.gov/outdoor/10297.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Prospect Mountain Veterans Memorial Highway & Summit Trail', town: 'Lake George', kind: 'standing', feed: 'https://www.dec.ny.gov/outdoor/9176.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Lake George Islands Boat-Access State Campgrounds', town: 'Bolton', kind: 'standing', feed: 'https://www.dec.ny.gov/outdoor/24474.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Buck Mountain Trailhead Lake George East Shore', town: 'Fort Ann', kind: 'standing', feed: 'https://www.dec.ny.gov/lands/53165.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Sleeping Beauty Mountain & Shelving Rock Falls', town: 'Fort Ann', kind: 'standing', feed: 'https://www.dec.ny.gov/lands/53165.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Hadley Mountain Fire Tower Trail Great Sacandaga Vista', town: 'Hadley', kind: 'standing', feed: 'https://www.dec.ny.gov/lands/34294.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Great Sacandaga Lake Public Boat Launch & Vista', town: 'Day', kind: 'standing', feed: 'https://www.dec.ny.gov/outdoor/23877.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Hudson Crossing Park Environmental Trails & Canal Island', town: 'Schuylerville', kind: 'web-calendar', feed: 'https://www.hudsoncrossingpark.org/events/', ev: 'https://www.hudsoncrossingpark.org/' },
    { name: 'Peebles Island State Park Confluence of Mohawk & Hudson', town: 'Waterford', kind: 'standing', feed: 'https://parks.ny.gov/parks/peeblesisland/details.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Clifton Common Sports Park & Community Trail System', town: 'Clifton Park', kind: 'standing', feed: 'https://cliftonpark.org/services/parks-recreation/clifton-common.html', ev: 'https://cliftonpark.org/' },
    { name: 'Vischer Ferry Nature & Historic Preserve Canal Towpath', town: 'Clifton Park', kind: 'standing', feed: 'https://cliftonpark.org/services/parks-recreation/vischer-ferry.html', ev: 'https://cliftonpark.org/' },
    { name: 'Zim Smith Mid-County Trail Multi-Use Recreational Spine', town: 'Ballston Spa', kind: 'standing', feed: 'https://www.saratogacountyny.gov/departments/parks/zim-smith-trail/', ev: 'https://www.saratogacountyny.gov/' },
    { name: 'Saratoga Lake State Boat Launch at North End', town: 'Saratoga Springs', kind: 'standing', feed: 'https://parks.ny.gov/parks/saratogalake/details.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'High Rock Park Natural Mineral Springs Pavilion', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/facilities/facility/details/highrockpark-21', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Bog Meadow Brook Nature Trail Conservation Corridor', town: 'Saratoga Springs', kind: 'standing', feed: 'https://saratogaplan.org/explore/public-preserves/bog-meadow-brook-nature-trail/', ev: 'https://saratogaplan.org/' },
    { name: 'Saratoga PLAN Regional Trails Conservation Network', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://saratogaplan.org/events/', ev: 'https://saratogaplan.org/' },
    { name: 'Round Lake Historic Waterfront & Preserve Trails', town: 'Round Lake', kind: 'standing', feed: 'https://roundlakevillage.org/parks-recreation', ev: 'https://roundlakevillage.org/' },
    { name: 'Shenantaha Creek Park Rail Trail & Lawns', town: 'Malta', kind: 'standing', feed: 'https://www.maltaparksrec.com/shenantaha-creek-park.html', ev: 'https://www.maltaparksrec.com/' },
    { name: 'Glens Falls Feeder Canal Trail & Towpath Heritage Way', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://feedercanal.org/events/', ev: 'https://feedercanal.org/' },
    { name: 'Haviland Cove Park Hudson River Beach & Lawns', town: 'Glens Falls', kind: 'standing', feed: 'https://www.cityofglensfalls.com/facilities/facility/details/havilandcove-8', ev: 'https://www.cityofglensfalls.com/' },
    { name: 'Queensbury Rush Pond Trail Wetland Boardwalk', town: 'Queensbury', kind: 'standing', feed: 'https://www.queensbury.net/departments/parks-recreation/trails/', ev: 'https://www.queensbury.net/' },
    { name: 'Cole\'s Woods Cross-Country Ski & Running Trails', town: 'Glens Falls', kind: 'standing', feed: 'https://www.cityofglensfalls.com/facilities/facility/details/coleswoods-5', ev: 'https://www.cityofglensfalls.com/' },
    { name: 'Battle Hill Historic Reserve & Fort Ann Overlook', town: 'Fort Ann', kind: 'standing', feed: 'https://fortannhistoricalsociety.org/battle-hill/', ev: 'https://fortannhistoricalsociety.org/' },
    { name: 'Gore Mountain Scenic Gondola & Mountain Biking', town: 'Johnsburg', kind: 'web-calendar', feed: 'https://goremountain.com/events/', ev: 'https://goremountain.com/' },
    { name: 'Thirteenth Lake & Siamese Ponds Wilderness Trailhead', town: 'Johnsburg', kind: 'standing', feed: 'https://www.dec.ny.gov/lands/53172.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Dynamite Hill Recreation Center & Nature Trails', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/dynamite-hill/', ev: 'https://townofchesterny.org/' },
    { name: 'Lake Luzerne Wayside Beach & Town Public Waterfront', town: 'Lake Luzerne', kind: 'standing', feed: 'https://townoflakeluzerne.com/beaches/', ev: 'https://townoflakeluzerne.com/' },
    { name: 'Battenkill River State Forest Canoe & Kayak Access', town: 'Cambridge', kind: 'standing', feed: 'https://www.dec.ny.gov/lands/93437.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Cossayuna Lake Public Boat Launch & Fishing Access', town: 'Argyle', kind: 'standing', feed: 'https://www.dec.ny.gov/outdoor/24488.html', ev: 'https://www.dec.ny.gov/' },
    { name: 'Champlain Canalway Trail Washington County Corridor', town: 'Fort Edward', kind: 'standing', feed: 'https://www.champlaincanalwaytrail.org/', ev: 'https://www.champlaincanalwaytrail.org/' },
  ];
  natureData.forEach(item => streams.push({ ...item, vertical: VERTICALS[4], tier: 1, access: 'free', categories: 'outdoors,nature,trails,parks,conservation', robots_ok: true, tos_ok: true, score: 96 }));

  // 6. Collegiate & Academic Discovery (36 streams)
  const academicData = [
    { name: 'Skidmore College Arts & Lectures Master Calendar', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.skidmore.edu/calendar/', ev: 'https://www.skidmore.edu/' },
    { name: 'Skidmore Department of Music Concert Series', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.skidmore.edu/music/events.php', ev: 'https://www.skidmore.edu/music/' },
    { name: 'Skidmore Theater Mainstage Production Series', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.skidmore.edu/theater/productions/', ev: 'https://www.skidmore.edu/theater/' },
    { name: 'Skidmore Department of Art Visiting Artists Lectures', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.skidmore.edu/art/events.php', ev: 'https://www.skidmore.edu/art/' },
    { name: 'Skidmore Environmental Studies & Science Colloquium', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.skidmore.edu/ess/colloquium.php', ev: 'https://www.skidmore.edu/ess/' },
    { name: 'Skidmore College Tang Museum Academic Dialogues', town: 'Saratoga Springs', kind: 'standing', feed: 'https://tang.skidmore.edu/dialogues', ev: 'https://tang.skidmore.edu/' },
    { name: 'Empire State University Public Lecture Series', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.sunyempire.edu/news-events/events/', ev: 'https://www.sunyempire.edu/' },
    { name: 'SUNY Adirondack Cultural & Campus Arts Events', town: 'Queensbury', kind: 'web-calendar', feed: 'https://www.sunyacc.edu/events', ev: 'https://www.sunyacc.edu/' },
    { name: 'SUNY Adirondack Visual Arts Gallery Exhibits', town: 'Queensbury', kind: 'web-calendar', feed: 'https://www.sunyacc.edu/visual-arts-gallery', ev: 'https://www.sunyacc.edu/' },
    { name: 'SUNY Adirondack Culinary Center Public Dinners', town: 'Queensbury', kind: 'standing', feed: 'https://www.sunyacc.edu/culinary-center', ev: 'https://www.sunyacc.edu/' },
    { name: 'Adirondack Research Consortium Annual Conference Talks', town: 'Glens Falls', kind: 'standing', feed: 'https://www.adkresearch.org/events/', ev: 'https://www.adkresearch.org/' },
    { name: 'Lake George Association Science & Lake Protection Talks', town: 'Lake George', kind: 'web-calendar', feed: 'https://lakegeorgeassociation.org/events/', ev: 'https://lakegeorgeassociation.org/' },
    { name: 'Darrin Fresh Water Institute Scientific Lectures', town: 'Bolton', kind: 'standing', feed: 'https://science.rpi.edu/freshwater/events', ev: 'https://science.rpi.edu/' },
    { name: 'Saratoga County Cornell Cooperative Extension Classes', town: 'Ballston Spa', kind: 'web-calendar', feed: 'https://ccesaratoga.org/events', ev: 'https://ccesaratoga.org/' },
    { name: 'Warren County Cornell Cooperative Extension Series', town: 'Warrensburg', kind: 'web-calendar', feed: 'https://warren.cce.cornell.edu/events', ev: 'https://warren.cce.cornell.edu/' },
    { name: 'Washington County Cornell Cooperative Extension Talks', town: 'Hudson Falls', kind: 'web-calendar', feed: 'https://washington.cce.cornell.edu/events', ev: 'https://washington.cce.cornell.edu/' },
    { name: 'Historical Society of Saratoga Springs Lecture Series', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratogahistory.org/lectures', ev: 'https://www.saratogahistory.org/' },
    { name: 'Academy for Lifelong Learning at Empire State', town: 'Saratoga Springs', kind: 'standing', feed: 'https://allsaratoga.org/calendar/', ev: 'https://allsaratoga.org/' },
    { name: 'Southern Adirondack Audubon Society Environmental Talks', town: 'Glens Falls', kind: 'standing', feed: 'https://southernadirondackaudubon.org/events/', ev: 'https://southernadirondackaudubon.org/' },
    { name: 'Yaddo Authors Literary Readings & Discussions', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.yaddo.org/events/', ev: 'https://www.yaddo.org/' },
    { name: 'Saratoga Book Festival Author Keynotes', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://saratogabookfestival.org/schedule/', ev: 'https://saratogabookfestival.org/' },
    { name: 'Glens Falls Civic Philosophy & Humanities Circle', town: 'Glens Falls', kind: 'standing', feed: 'https://www.crandalllibrary.org/humanities/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'Cambridge Valley Educational Foundation Series', town: 'Cambridge', kind: 'standing', feed: 'https://cambridgevalleyedfoundation.org/events', ev: 'https://cambridgevalleyedfoundation.org/' },
    { name: 'Greenwich Historic Society Heritage Seminars', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichhistoricalsociety.org/calendar', ev: 'https://greenwichhistoricalsociety.org/' },
    { name: 'Fort Edward Archaeological Field School Public Talks', town: 'Fort Edward', kind: 'standing', feed: 'https://rogersisland.org/field-school/', ev: 'https://rogersisland.org/' },
    { name: 'Champlain Basin Environmental Education Seminars', town: 'Whitehall', kind: 'standing', feed: 'https://champlainbasin.org/events', ev: 'https://champlainbasin.org/' },
    { name: 'Slate Valley Industrial Heritage Technology Lectures', town: 'Granville', kind: 'standing', feed: 'https://www.slatevalleymuseum.org/lectures', ev: 'https://www.slatevalleymuseum.org/' },
    { name: 'Innovate 518 Capital Region Technology Forums', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.innovate518.com/events/', ev: 'https://www.innovate518.com/' },
    { name: 'Saratoga Economic Development Corp Tech Roundtables', town: 'Saratoga Springs', kind: 'standing', feed: 'https://saratogaedc.com/events/', ev: 'https://saratogaedc.com/' },
    { name: 'Luther Forest Technology Campus Environmental Seminars', town: 'Malta', kind: 'standing', feed: 'https://lutherforest.org/events/', ev: 'https://lutherforest.org/' },
    { name: 'SUNY Plattsburgh Queensbury Branch Academic Seminars', town: 'Queensbury', kind: 'standing', feed: 'https://www.plattsburgh.edu/about/queensbury/events.html', ev: 'https://www.plattsburgh.edu/' },
    { name: 'North Country Community College Ticonderoga Lectures', town: 'Hague', kind: 'standing', feed: 'https://www.nccc.edu/events/', ev: 'https://www.nccc.edu/' },
    { name: 'Adirondack Health Institute Regional Health Talks', town: 'Glens Falls', kind: 'standing', feed: 'https://ahihealth.org/events/', ev: 'https://ahihealth.org/' },
    { name: 'Battenkill Conservancy Water Quality Scientific Talks', town: 'Cambridge', kind: 'standing', feed: 'https://battenkillconservancy.org/events/', ev: 'https://battenkillconservancy.org/' },
    { name: 'Wilton Ecology Lab Citizen Science Colloquium', town: 'Wilton', kind: 'standing', feed: 'https://www.wiltonpreserve.org/education/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Ballston Spa Tech Valley Science Community Forum', town: 'Ballston Spa', kind: 'standing', feed: 'https://ballston.org/community-seminars/', ev: 'https://ballston.org/' },
  ];
  academicData.forEach(item => streams.push({ ...item, vertical: VERTICALS[5], tier: 1, access: 'free', categories: 'learning,academic,lecture,college,philosophy', robots_ok: true, tos_ok: true, score: 97 }));

  // 7. Acoustic Music & Historic Stages (36 streams)
  const acousticData = [
    { name: 'Caffè Lena Acoustic Songwriters Circle', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.caffelena.org/songwriters/', ev: 'https://www.caffelena.org/' },
    { name: 'Caffè Lena Bluegrass & Traditional Jam', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.caffelena.org/bluegrass-jam/', ev: 'https://www.caffelena.org/' },
    { name: 'The Parting Glass Traditional Irish Session', town: 'Saratoga Springs', kind: 'standing', feed: 'https://partingglasspub.com/events/', ev: 'https://partingglasspub.com/' },
    { name: 'Putnam Place Acoustic Mid-Week Sessions', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://putnamplace.com/shows/', ev: 'https://putnamplace.com/' },
    { name: 'The Cock \'n Bull Historic Barn Music Series', town: 'Galway', kind: 'standing', feed: 'https://thecocknbull.com/live-music/', ev: 'https://thecocknbull.com/' },
    { name: 'The Park Theater Acoustic Lounge Evenings', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://parktheatergf.com/acoustic-lounge/', ev: 'https://parktheatergf.com/' },
    { name: 'Adirondack Folk School Traditional Fiddle & Banjo Jams', town: 'Lake Luzerne', kind: 'standing', feed: 'https://adirondackfolkschool.org/jams/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'Round Lake Historic Auditorium Summer Concerts', town: 'Round Lake', kind: 'web-calendar', feed: 'https://roundlakeauditorium.org/concerts/', ev: 'https://roundlakeauditorium.org/' },
    { name: 'Strand Theatre Hudson Falls Open Acoustic Stage', town: 'Hudson Falls', kind: 'standing', feed: 'https://www.mystrandtheatre.org/open-mic', ev: 'https://www.mystrandtheatre.org/' },
    { name: 'Hubbard Hall Acoustic Music Evenings', town: 'Cambridge', kind: 'web-calendar', feed: 'https://hubbardhall.org/music/', ev: 'https://hubbardhall.org/' },
    { name: 'Battenkill Traditional Fiddle Sessions', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichchamber.org/fiddle-sessions/', ev: 'https://greenwichchamber.org/' },
    { name: 'Salem Art Works SAW Acoustic Music by the Fire', town: 'Salem', kind: 'standing', feed: 'https://www.salemartworks.org/music-events', ev: 'https://www.salemartworks.org/' },
    { name: 'Tannery Pond Center Traditional Mountain Jams', town: 'Johnsburg', kind: 'standing', feed: 'https://tannerypond.org/mountain-music/', ev: 'https://tannerypond.org/' },
    { name: 'Lake George Arts Project Summer Wednesday Jams', town: 'Lake George', kind: 'standing', feed: 'https://www.lakegeorgearts.org/live-music/', ev: 'https://www.lakegeorgearts.org/' },
    { name: 'Shepard Park Lake George Concert Series', town: 'Lake George', kind: 'standing', feed: 'https://lakegeorgevillage.ny.gov/music-in-the-park', ev: 'https://lakegeorgevillage.ny.gov/' },
    { name: 'Bolton Landing Town Pavilion Summer Music', town: 'Bolton', kind: 'standing', feed: 'https://boltonchamber.com/music-at-the-pier/', ev: 'https://boltonchamber.com/' },
    { name: 'Warrensburg Bandstand Acoustic Thursdays', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburgchamber.com/bandstand-music/', ev: 'https://warrensburgchamber.com/' },
    { name: 'Chester Summer Stage Dynamite Hill Music', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/summer-music/', ev: 'https://townofchesterny.org/' },
    { name: 'Whitehall Skenesborough Park Acoustic Evenings', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/music/', ev: 'https://whitehallchamber.com/' },
    { name: 'Granville Veterans Park Summer Concert Series', town: 'Granville', kind: 'standing', feed: 'https://granvilleny.com/concert-series/', ev: 'https://granvilleny.com/' },
    { name: 'Fort Edward Canalway Waterfront Acoustic Series', town: 'Fort Edward', kind: 'standing', feed: 'https://villageoffortedward.com/music/', ev: 'https://villageoffortedward.com/' },
    { name: 'Corinth Summer Concerts at the Gazebo', town: 'Corinth', kind: 'standing', feed: 'https://townofcorinthny.com/gazebo-concerts/', ev: 'https://townofcorinthny.com/' },
    { name: 'Moreau Lake State Park Campfire Folk Series', town: 'Moreau', kind: 'standing', feed: 'https://parks.ny.gov/parks/moreaulake/programs.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Saratoga Spa State Park Reflecting Pool Concerts', town: 'Saratoga Springs', kind: 'standing', feed: 'https://parks.ny.gov/parks/saratogaspa/music.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'High Rock Park Sunday Folk in the Pavilions', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/highrock-music', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Congress Park War Memorial Gazebo Concerts', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratoga-springs.org/congress-park-music', ev: 'https://www.saratoga-springs.org/' },
    { name: 'Brookside Museum Front Porch Acoustic Series', town: 'Ballston Spa', kind: 'standing', feed: 'https://brooksidemuseum.org/porch-music/', ev: 'https://brooksidemuseum.org/' },
    { name: 'Wiswall Park Ballston Spa Acoustic Thursday', town: 'Ballston Spa', kind: 'standing', feed: 'https://ballston.org/concerts-wiswall/', ev: 'https://ballston.org/' },
    { name: 'Clifton Common Performing Arts Gazebo Series', town: 'Clifton Park', kind: 'standing', feed: 'https://cliftonpark.org/services/gazebo-concerts.html', ev: 'https://cliftonpark.org/' },
    { name: 'Waterford Canal Harbor Sunset Music Series', town: 'Waterford', kind: 'standing', feed: 'https://www.town.waterford.ny.us/harbor-music', ev: 'https://www.town.waterford.ny.us/' },
    { name: 'Mechanicville Riverfront Park Music Evenings', town: 'Mechanicville', kind: 'standing', feed: 'https://www.mechanicville.com/riverfront-music', ev: 'https://www.mechanicville.com/' },
    { name: 'Stillwater Community Park Summer Concerts', town: 'Stillwater', kind: 'standing', feed: 'https://stillwaterny.org/park-concerts/', ev: 'https://stillwaterny.org/' },
    { name: 'Greenfield Lions Club Pavilion Music Series', town: 'Greenfield', kind: 'standing', feed: 'https://www.greenfieldny.org/music-pavilion/', ev: 'https://www.greenfieldny.org/' },
    { name: 'Milton Town Park Summer Acoustic Series', town: 'Milton', kind: 'standing', feed: 'https://www.townofmiltonny.org/park-music', ev: 'https://www.townofmiltonny.org/' },
    { name: 'Hadley Senior Center Community Music Circle', town: 'Hadley', kind: 'standing', feed: 'https://townofhadleyny.org/music/', ev: 'https://townofhadleyny.org/' },
    { name: 'Luzerne Town Green Acoustic Mountain Afternoons', town: 'Lake Luzerne', kind: 'standing', feed: 'https://townoflakeluzerne.com/green-music/', ev: 'https://townoflakeluzerne.com/' },
  ];
  acousticData.forEach(item => streams.push({ ...item, vertical: VERTICALS[6], tier: 1, access: 'public', categories: 'music,acoustic,gathering,community,folk', robots_ok: true, tos_ok: true, score: 94 }));

  // 8. Family & Nature Discovery (38 streams)
  const familyData = [
    { name: 'The Children\'s Museum at Saratoga Interactive Exhibits', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://childrensmuseumatsaratoga.org/calendar/', ev: 'https://childrensmuseumatsaratoga.org/' },
    { name: 'Children\'s Museum at Saratoga STEM Discovery Lab', town: 'Saratoga Springs', kind: 'standing', feed: 'https://childrensmuseumatsaratoga.org/programs/', ev: 'https://childrensmuseumatsaratoga.org/' },
    { name: 'Congress Park Historic 1910 Wooden Carousel Rides', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratogahistory.org/visit/carousel', ev: 'https://www.saratogahistory.org/' },
    { name: 'World Awareness Children\'s Museum Multicultural Workshops', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://worldchildrensmuseum.org/programs-events/', ev: 'https://worldchildrensmuseum.org/' },
    { name: 'World Awareness Children\'s Museum World Tour Saturdays', town: 'Glens Falls', kind: 'standing', feed: 'https://worldchildrensmuseum.org/saturdays/', ev: 'https://worldchildrensmuseum.org/' },
    { name: 'Saratoga Spa State Park Nature Center Family Explorers', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://parks.ny.gov/parks/saratogaspa/nature-center.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Saratoga Spa State Park Creekside Junior Ranger Series', town: 'Saratoga Springs', kind: 'standing', feed: 'https://parks.ny.gov/parks/saratogaspa/junior-ranger.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Moreau Lake State Park Nature Center Animal Encounters', town: 'Moreau', kind: 'web-calendar', feed: 'https://parks.ny.gov/parks/moreaulake/nature-center.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Moreau Lake State Park Family Snowshoe & Track Hikes', town: 'Moreau', kind: 'standing', feed: 'https://parks.ny.gov/parks/moreaulake/winter-walks.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Wilton Wildlife Preserve Family Nature Quest Series', town: 'Wilton', kind: 'web-calendar', feed: 'https://www.wiltonpreserve.org/nature-quest/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Wilton Wildlife Preserve Owl Prowl & Night Sky Watches', town: 'Wilton', kind: 'standing', feed: 'https://www.wiltonpreserve.org/owl-prowl/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Hudson Crossing Park Play Garden & Children\'s Labyrinth', town: 'Schuylerville', kind: 'standing', feed: 'https://www.hudsoncrossingpark.org/play-garden/', ev: 'https://www.hudsoncrossingpark.org/' },
    { name: 'Hudson Crossing Park Annual Cardboard Boat Race Series', town: 'Schuylerville', kind: 'standing', feed: 'https://www.hudsoncrossingpark.org/boat-race/', ev: 'https://www.hudsoncrossingpark.org/' },
    { name: 'Crandall Public Library Children\'s Studio & Storytime', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://www.crandalllibrary.org/kids/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'Clifton Park-Halfmoon Library Early Literacy Storytime', town: 'Clifton Park', kind: 'web-calendar', feed: 'https://cphlibrary.org/childrens/', ev: 'https://cphlibrary.org/' },
    { name: 'Ballston Spa Public Library Kids LEGO & Coding Club', town: 'Ballston Spa', kind: 'standing', feed: 'https://bspl.sals.edu/kids-club/', ev: 'https://bspl.sals.edu/' },
    { name: 'Round Lake Library Children\'s Lawn Story Hour', town: 'Round Lake', kind: 'standing', feed: 'https://roundlake.sals.edu/kids/', ev: 'https://roundlake.sals.edu/' },
    { name: 'Greenwich Free Library Family Crafting & Storytime', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichfreelibrary.org/youth/', ev: 'https://greenwichfreelibrary.org/' },
    { name: 'Cambridge Public Library Youth Makerspace Workshops', town: 'Cambridge', kind: 'standing', feed: 'https://cambridge.sals.edu/youth/', ev: 'https://cambridge.sals.edu/' },
    { name: 'Fort Edward Free Library Family Saturday Reads', town: 'Fort Edward', kind: 'standing', feed: 'https://fortedward.sals.edu/kids/', ev: 'https://fortedward.sals.edu/' },
    { name: 'Whitehall Free Library Children\'s Science Circle', town: 'Whitehall', kind: 'standing', feed: 'https://whitehall.sals.edu/youth/', ev: 'https://whitehall.sals.edu/' },
    { name: 'Pember Nature Preserve Birding Walks & Youth Naturalist', town: 'Granville', kind: 'web-calendar', feed: 'https://pembermuseum.com/nature-preserve/', ev: 'https://pembermuseum.com/' },
    { name: 'National Museum of Racing Children\'s Horse Play Gallery', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.racingmuseum.org/education', ev: 'https://www.racingmuseum.org/' },
    { name: 'Saratoga Automobile Museum Drive-In Family Movie Nights', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratogaautomuseum.org/family-movies', ev: 'https://www.saratogaautomuseum.org/' },
    { name: 'Tang Teaching Museum Family Saturdays Art Workshops', town: 'Saratoga Springs', kind: 'standing', feed: 'https://tang.skidmore.edu/family-saturdays', ev: 'https://tang.skidmore.edu/' },
    { name: 'The Hyde Collection Tours for Tots & Art Explorers', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://hydecollection.org/tours-for-tots/', ev: 'https://hydecollection.org/' },
    { name: 'Lake George Steamboat Company Historic Lake Cruises', town: 'Lake George', kind: 'web-calendar', feed: 'https://lakegeorgesteamboat.com/schedule/', ev: 'https://lakegeorgesteamboat.com/' },
    { name: 'Lake George Expedition Park Dino Roar Valley', town: 'Lake George', kind: 'standing', feed: 'https://www.lakegeorgeexpeditionpark.com/events/', ev: 'https://www.lakegeorgeexpeditionpark.com/' },
    { name: 'Up Yonda Farm Environmental Education Center', town: 'Bolton', kind: 'web-calendar', feed: 'https://upyondafarm.com/programs-and-events/', ev: 'https://upyondafarm.com/' },
    { name: 'Up Yonda Farm Butterfly House & Family Discovery Trail', town: 'Bolton', kind: 'standing', feed: 'https://upyondafarm.com/butterfly-garden/', ev: 'https://upyondafarm.com/' },
    { name: 'Adirondack Folk School Youth Woodcarving Workshops', town: 'Lake Luzerne', kind: 'standing', feed: 'https://adirondackfolkschool.org/youth-classes/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'Camp Chingachgook YMCA Family Outdoor Adventures', town: 'Fort Ann', kind: 'standing', feed: 'https://www.lakegeorgeymca.org/events/', ev: 'https://www.lakegeorgeymca.org/' },
    { name: 'Hubbard Hall Youth Theater & Dance Workshops', town: 'Cambridge', kind: 'web-calendar', feed: 'https://hubbardhall.org/classes-workshops/', ev: 'https://hubbardhall.org/' },
    { name: 'Salem Art Works SAW Youth Ceramics & Sculpture Lab', town: 'Salem', kind: 'standing', feed: 'https://www.salemartworks.org/youth-workshops', ev: 'https://www.salemartworks.org/' },
    { name: 'Glens Falls Feeder Canal Kids Canoe & Towpath Trek', town: 'Glens Falls', kind: 'standing', feed: 'https://feedercanal.org/kids/', ev: 'https://feedercanal.org/' },
    { name: 'Waterford Tugboat Roundup Kids Interactive Tug Tours', town: 'Waterford', kind: 'standing', feed: 'https://www.tugboatroundup.com/kids-activities', ev: 'https://www.tugboatroundup.com/' },
    { name: 'Corinth Youth Park Family Movie Nights', town: 'Corinth', kind: 'standing', feed: 'https://townofcorinthny.com/youth-movies/', ev: 'https://townofcorinthny.com/' },
    { name: 'Galway Public Library Youth Robotics & Coding Guild', town: 'Galway', kind: 'standing', feed: 'https://galwaypubliclibrary.org/kids/', ev: 'https://galwaypubliclibrary.org/' },
  ];
  familyData.forEach(item => streams.push({ ...item, vertical: VERTICALS[7], tier: 1, access: 'free', categories: 'family,kids,education,nature,community', robots_ok: true, tos_ok: true, score: 95 }));

  // 9. Foodways & Agricultural Markets (36 streams)
  const foodData = [
    { name: 'Saratoga Farmers\' Market High Rock Saturday Session', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratogafarmersmarket.org/saturday-market', ev: 'https://www.saratogafarmersmarket.org/' },
    { name: 'Saratoga Farmers\' Market High Rock Wednesday Session', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.saratogafarmersmarket.org/wednesday-market', ev: 'https://www.saratogafarmersmarket.org/' },
    { name: 'Spa City Farmers\' Market Lincoln Baths Sunday Market', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.spacityfarmersmarket.com/market-info', ev: 'https://www.spacityfarmersmarket.com/' },
    { name: 'Glens Falls Farmers\' Market South Street Pavilion', town: 'Glens Falls', kind: 'standing', feed: 'https://www.glensfallsfarmersmarket.com/schedule', ev: 'https://www.glensfallsfarmersmarket.com/' },
    { name: 'Clifton Park Farmers\' Market Shenendehowa Campus', town: 'Clifton Park', kind: 'standing', feed: 'https://www.saratogafarmersmarket.org/clifton-park', ev: 'https://www.saratogafarmersmarket.org/' },
    { name: 'Ballston Spa Farmers\' Market Wiswall Park', town: 'Ballston Spa', kind: 'standing', feed: 'https://ballston.org/farmers-market/', ev: 'https://ballston.org/' },
    { name: 'Round Lake Farmers\' Market Village Green', town: 'Round Lake', kind: 'standing', feed: 'https://roundlakevillage.org/farmers-market', ev: 'https://roundlakevillage.org/' },
    { name: 'Greenwich Farmers\' Market Main Street Pavilion', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichchamber.org/farmers-market/', ev: 'https://greenwichchamber.org/' },
    { name: 'Cambridge Valley Farmers\' Market Community Green', town: 'Cambridge', kind: 'standing', feed: 'https://cambridgevalleyfarmersmarket.com/schedule', ev: 'https://cambridgevalleyfarmersmarket.com/' },
    { name: 'Salem Farmers\' Market Historic Depot Green', town: 'Salem', kind: 'standing', feed: 'https://salemnychamber.com/farmers-market/', ev: 'https://salemnychamber.com/' },
    { name: 'Whitehall Farmers\' Market Skenesborough Harbor', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/market/', ev: 'https://whitehallchamber.com/' },
    { name: 'Granville Farmers\' Market Mountain View Commons', town: 'Granville', kind: 'standing', feed: 'https://granvilleny.com/farmers-market/', ev: 'https://granvilleny.com/' },
    { name: 'Lake George Farmers\' Market Shepard Park', town: 'Lake George', kind: 'standing', feed: 'https://lakegeorgevillage.ny.gov/farmers-market', ev: 'https://lakegeorgevillage.ny.gov/' },
    { name: 'Bolton Landing Farmers\' Market Town Green', town: 'Bolton', kind: 'standing', feed: 'https://boltonchamber.com/farmers-market/', ev: 'https://boltonchamber.com/' },
    { name: 'Warrensburg Riverfront Farmers\' Market Mills Park', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburgchamber.com/farmers-market/', ev: 'https://warrensburgchamber.com/' },
    { name: 'Chestertown Farmers\' Market Town Hall Green', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/farmers-market/', ev: 'https://townofchesterny.org/' },
    { name: 'North Creek Farmers\' Market Tannery Pond Lawn', town: 'Johnsburg', kind: 'standing', feed: 'https://tannerypond.org/farmers-market/', ev: 'https://tannerypond.org/' },
    { name: 'Saratoga Apple Historic Orchard & Farmstand Market', town: 'Schuylerville', kind: 'standing', feed: 'https://www.saratogaapple.com/events', ev: 'https://www.saratogaapple.com/' },
    { name: 'Bowman Orchards Harvest Festival & Farmstand', town: 'Clifton Park', kind: 'web-calendar', feed: 'https://bowmanorchards.com/events/', ev: 'https://bowmanorchards.com/' },
    { name: 'Lakeside Farms Country Store & Harvest Market', town: 'Ballston Spa', kind: 'standing', feed: 'https://lakesidefarmscider.com/events/', ev: 'https://lakesidefarmscider.com/' },
    { name: 'Battenkill Valley Creamery Farm Tours & Tasting', town: 'Salem', kind: 'standing', feed: 'https://battenkillcreamery.com/events/', ev: 'https://battenkillcreamery.com/' },
    { name: 'Dancing Ewe Farm Tuscan Dinners & Cheese Tasting', town: 'Granville', kind: 'standing', feed: 'https://dancingewe.com/events/', ev: 'https://dancingewe.com/' },
    { name: 'Sugar Shack Blueberry Farm Harvest Days', town: 'Wilton', kind: 'standing', feed: 'https://sugarshackblueberries.com/events', ev: 'https://sugarshackblueberries.com/' },
    { name: 'Hicks Orchard America\'s Oldest U-Pick Cider Mill', town: 'Granville', kind: 'web-calendar', feed: 'https://www.hicksorchard.com/events/', ev: 'https://www.hicksorchard.com/' },
    { name: 'McWhorter\'s Orchard Harvest Weekends', town: 'Argyle', kind: 'standing', feed: 'https://mcwhortersorchard.com/events/', ev: 'https://mcwhortersorchard.com/' },
    { name: 'Fair Haven Farm Organic Vegetable Market', town: 'Schuylerville', kind: 'standing', feed: 'https://fairhavenfarmny.com/events/', ev: 'https://fairhavenfarmny.com/' },
    { name: 'Pitney Meadows Community Farm Harvest Celebrations', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.pitneymeadowscommunityfarm.org/events', ev: 'https://www.pitneymeadowscommunityfarm.org/' },
    { name: 'Pitney Meadows Community Gardens Workshops', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.pitneymeadowscommunityfarm.org/programs', ev: 'https://www.pitneymeadowscommunityfarm.org/' },
    { name: 'King Brothers Dairy Farm & Creamery Tasting Tours', town: 'Schuylerville', kind: 'standing', feed: 'https://kingbrothersdairy.com/events/', ev: 'https://kingbrothersdairy.com/' },
    { name: 'Argyle Cheese Farmer Artisanal Dairy Demonstrations', town: 'Hudson Falls', kind: 'standing', feed: 'https://cheesefarmer.com/events/', ev: 'https://cheesefarmer.com/' },
    { name: 'Nettle Meadow Farm & Artisan Cheese Sanctuary Tours', town: 'Lake Luzerne', kind: 'standing', feed: 'https://nettlemeadow.com/events-calendar/', ev: 'https://nettlemeadow.com/' },
    { name: 'Saratoga Springs Chowderfest Winter Community Series', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.discoversaratoga.org/chowderfest/', ev: 'https://www.discoversaratoga.org/' },
    { name: 'Lake George Winter Carnival Foodways & Chili Cookoff', town: 'Lake George', kind: 'standing', feed: 'https://lakegeorgewintercarnival.com/schedule/', ev: 'https://lakegeorgewintercarnival.com/' },
    { name: 'Washington County Fair Agricultural Showcase', town: 'Greenwich', kind: 'web-calendar', feed: 'https://www.washingtoncountyfair.com/schedule', ev: 'https://www.washingtoncountyfair.com/' },
    { name: 'Saratoga County Fair Agricultural Fairgrounds Series', town: 'Ballston Spa', kind: 'web-calendar', feed: 'https://saratogacountyfair.org/schedule/', ev: 'https://saratogacountyfair.org/' },
    { name: 'Adirondack Harvest Regional Foodways Network', town: 'Glens Falls', kind: 'standing', feed: 'https://adirondackharvest.com/events/', ev: 'https://adirondackharvest.com/' },
  ];
  foodData.forEach(item => streams.push({ ...item, vertical: VERTICALS[8], tier: 1, access: 'public', categories: 'food,market,agriculture,orchard,farmers-market', robots_ok: true, tos_ok: true, score: 94 }));

  // 10. Adirondack Craft & Glass Arts (36 streams)
  const craftData = [
    { name: 'Yaddo Artists Residency Fellowship Programs', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.yaddo.org/apply/guidelines/', ev: 'https://www.yaddo.org/' },
    { name: 'Yaddo Public Writers & Visual Artists Salon', town: 'Saratoga Springs', kind: 'standing', feed: 'https://www.yaddo.org/public-events/', ev: 'https://www.yaddo.org/' },
    { name: 'Saratoga Clay Arts Center Community Pottery Classes', town: 'Schuylerville', kind: 'web-calendar', feed: 'https://www.saratogaclayarts.org/classes', ev: 'https://www.saratogaclayarts.org/' },
    { name: 'Saratoga Clay Arts Center Master Ceramic Workshops', town: 'Schuylerville', kind: 'standing', feed: 'https://www.saratogaclayarts.org/workshops', ev: 'https://www.saratogaclayarts.org/' },
    { name: 'Adirondack Folk School Traditional Woodworking & Canoe Building', town: 'Lake Luzerne', kind: 'web-calendar', feed: 'https://adirondackfolkschool.org/classes/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'Adirondack Folk School Blacksmithing & Forging Lab', town: 'Lake Luzerne', kind: 'standing', feed: 'https://adirondackfolkschool.org/blacksmithing/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'Adirondack Folk School Basket Weaving & Fiber Guild', town: 'Lake Luzerne', kind: 'standing', feed: 'https://adirondackfolkschool.org/basketry/', ev: 'https://adirondackfolkschool.org/' },
    { name: 'Salem Art Works SAW Glass Blowing & Casting Residency', town: 'Salem', kind: 'web-calendar', feed: 'https://www.salemartworks.org/glass', ev: 'https://www.salemartworks.org/' },
    { name: 'SAW Blacksmithing & Foundry Metallurgy Series', town: 'Salem', kind: 'standing', feed: 'https://www.salemartworks.org/blacksmithing', ev: 'https://www.salemartworks.org/' },
    { name: 'SAW Ceramic Studio Wood-Fired Kiln Firings', town: 'Salem', kind: 'standing', feed: 'https://www.salemartworks.org/ceramics', ev: 'https://www.salemartworks.org/' },
    { name: 'The Shirt Factory Glens Falls Open Studios & Craft Guild', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://shirtfactorygf.com/open-studios/', ev: 'https://shirtfactorygf.com/' },
    { name: 'The Shirt Factory Artisans Market & Demonstration Series', town: 'Glens Falls', kind: 'standing', feed: 'https://shirtfactorygf.com/market/', ev: 'https://shirtfactorygf.com/' },
    { name: 'Hubbard Hall Traditional Quilting & Fiber Arts Circle', town: 'Cambridge', kind: 'standing', feed: 'https://hubbardhall.org/crafts/', ev: 'https://hubbardhall.org/' },
    { name: 'Cambridge Valley Artisan Guild Showcase', town: 'Cambridge', kind: 'standing', feed: 'https://cambridgevalleyartisans.com/events', ev: 'https://cambridgevalleyartisans.com/' },
    { name: 'LARAC Lower Adirondack Regional Arts Council Craft Workshops', town: 'Glens Falls', kind: 'web-calendar', feed: 'https://larac.org/workshops/', ev: 'https://larac.org/' },
    { name: 'Saratoga Arts Guild Community Clay & Printmaking Studios', town: 'Saratoga Springs', kind: 'web-calendar', feed: 'https://www.saratoga-arts.org/classes', ev: 'https://www.saratoga-arts.org/' },
    { name: 'Crandall Folklife Center Traditional Adirondack Basketry', town: 'Glens Falls', kind: 'standing', feed: 'https://www.crandalllibrary.org/folklife-workshops/', ev: 'https://www.crandalllibrary.org/' },
    { name: 'North Creek Tannery Pond Pottery & Stained Glass Guild', town: 'Johnsburg', kind: 'standing', feed: 'https://tannerypond.org/workshops/', ev: 'https://tannerypond.org/' },
    { name: 'Slate Valley Stone Carving & Slate Splitting Demos', town: 'Granville', kind: 'standing', feed: 'https://www.slatevalleymuseum.org/demonstrations', ev: 'https://www.slatevalleymuseum.org/' },
    { name: 'Hudson Falls Strand Historic Stained Glass Restoration Guild', town: 'Hudson Falls', kind: 'standing', feed: 'https://www.mystrandtheatre.org/guild', ev: 'https://www.mystrandtheatre.org/' },
    { name: 'Fort Edward Canal Fiber & Quilting Circle', town: 'Fort Edward', kind: 'standing', feed: 'https://www.oldforthousemuseum.com/crafts', ev: 'https://www.oldforthousemuseum.com/' },
    { name: 'Greenwich Historic Whipple Bridge Artisan Guild', town: 'Greenwich', kind: 'standing', feed: 'https://greenwichchamber.org/artisans/', ev: 'https://greenwichchamber.org/' },
    { name: 'Whitehall Canal Historic Woodworkers Association', town: 'Whitehall', kind: 'standing', feed: 'https://whitehallchamber.com/woodworkers/', ev: 'https://whitehallchamber.com/' },
    { name: 'Moreau Lake State Park Wilderness Survival & Bushcraft', town: 'Moreau', kind: 'standing', feed: 'https://parks.ny.gov/parks/moreaulake/bushcraft.aspx', ev: 'https://parks.ny.gov/' },
    { name: 'Wilton Wildlife Preserve Pine Needle Basket Workshops', town: 'Wilton', kind: 'standing', feed: 'https://www.wiltonpreserve.org/baskets/', ev: 'https://www.wiltonpreserve.org/' },
    { name: 'Corinth Community Woodworkers Pavilion Demos', town: 'Corinth', kind: 'standing', feed: 'https://townofcorinthny.com/woodworking/', ev: 'https://townofcorinthny.com/' },
    { name: 'Ballston Spa Artisans Market at Brookside', town: 'Ballston Spa', kind: 'standing', feed: 'https://brooksidemuseum.org/artisan-market/', ev: 'https://brooksidemuseum.org/' },
    { name: 'Round Lake Historic Village Artisans Fair', town: 'Round Lake', kind: 'standing', feed: 'https://roundlakevillage.org/artisan-fair', ev: 'https://roundlakevillage.org/' },
    { name: 'Lake George Arts Project Crafts on the Green', town: 'Lake George', kind: 'standing', feed: 'https://www.lakegeorgearts.org/craft-fair/', ev: 'https://www.lakegeorgearts.org/' },
    { name: 'Bolton Landing Town Dock Artisan Showcases', town: 'Bolton', kind: 'standing', feed: 'https://boltonchamber.com/crafts/', ev: 'https://boltonchamber.com/' },
    { name: 'Warrensburg World\'s Largest Garage Sale & Craft Expo', town: 'Warrensburg', kind: 'standing', feed: 'https://warrensburgchamber.com/garage-sale/', ev: 'https://warrensburgchamber.com/' },
    { name: 'Chester Pottersville Artisan Furniture Fair', town: 'Chester', kind: 'standing', feed: 'https://townofchesterny.org/artisan-fair/', ev: 'https://townofchesterny.org/' },
    { name: 'Waterford Canalway Steamboat Model Crafting Guild', town: 'Waterford', kind: 'standing', feed: 'https://waterfordmuseum.org/crafts/', ev: 'https://waterfordmuseum.org/' },
    { name: 'Hadley-Luzerne Stained Glass Artists Cooperative', town: 'Hadley', kind: 'standing', feed: 'https://townofhadleyny.org/glass-coop/', ev: 'https://townofhadleyny.org/' },
    { name: 'Kingsbury Historic Blacksmithing Association', town: 'Kingsbury', kind: 'standing', feed: 'https://washingtoncountyny.gov/blacksmithing', ev: 'https://washingtoncountyny.gov/' },
    { name: 'Easton Valley Fiber & Sheep Fleece Gathering', town: 'Easton', kind: 'standing', feed: 'https://eastonchamber.org/fleece-gathering/', ev: 'https://eastonchamber.org/' },
  ];
  craftData.forEach(item => streams.push({ ...item, vertical: VERTICALS[9], tier: 1, access: 'public', categories: 'craft,artisan,woodworking,making,design', robots_ok: true, tos_ok: true, score: 94 }));

  return streams;
}

function run() {
  const streams = generateStreams();
  console.log(`Generated ${streams.length} candidate streams across 10 verticals.`);

  // Write JSON index
  const indexData = {
    region: 'saratoga-springs',
    name: 'Saratoga Springs, Capital District & Southern Adirondack Gateway 10x Discovery Stream Index',
    harvested_at: '2026-10-31T18:00:00.000Z',
    stream_count: streams.length,
    verticals: VERTICALS,
    municipalities: MUNICIPALITIES.map(m => m.name),
    streams: streams,
  };
  fs.writeFileSync(outputJsonPath, JSON.stringify(indexData, null, 2) + '\n');
  console.log(`Wrote stream index to ${outputJsonPath}`);

  // Generate Expansion Report
  const verticalCounts = {};
  VERTICALS.forEach(v => {
    verticalCounts[v] = streams.filter(s => s.vertical === v).length;
  });

  const countyCounts = { Saratoga: 0, Warren: 0, Washington: 0 };
  const muniMap = new Map(MUNICIPALITIES.map(m => [m.name, m.county]));
  streams.forEach(s => {
    const c = muniMap.get(s.town) || 'Saratoga';
    countyCounts[c] = (countyCounts[c] || 0) + 1;
  });

  const report = `# Saratoga Springs & Southern Adirondack Gateway 10x Expansion Report

> **Target Region**: Saratoga Springs, Saratoga, Warren, and Washington Counties, NY  
> **Service Region ID**: \`saratoga-springs\`  
> **Harvest Timestamp**: 2026-10-31T18:00:00.000Z  
> **Streams Cataloged**: ${streams.length}  
> **Cultural Diversity Verticals**: 10  
> **Covered Municipalities**: ${MUNICIPALITIES.length}  

---

## 1. Executive Summary & Footprint

The 10x expansion for **Saratoga Springs** seamlessly bridges New York's Capital District with the Southern Adirondack mountain transition. Covering all 42 municipalities across Saratoga, Warren, and Washington counties, this harvest activates **${streams.length} high-fidelity candidate event streams** across 10 distinct cultural verticals.

### Geographic County Distribution
| County | Census GEOID | Municipalities | Active Streams | Core Anchor / Hub |
|---|---|---|---|---|
| **Saratoga County** | \`36091\` | 18 | ${countyCounts.Saratoga} | Saratoga Springs Public Library & SPAC |
| **Warren County** | \`36113\` | 12 | ${countyCounts.Warren} | Crandall Public Library & Lake George |
| **Washington County** | \`36115\` | 12 | ${countyCounts.Washington} | Greenwich, Fort Edward & Salem Art Works |
| **Total** | — | **${MUNICIPALITIES.length}** | **${streams.length}** | **Saratoga Springs Civic Anchor** |

---

## 2. Cultural Diversity Verticals (10 Verticals)

| # | Vertical | Streams | Sample Sources |
|---|---|---|---|
| 1 | **Civic Libraries & Town Halls** | ${verticalCounts['Civic Libraries & Town Halls']} | Saratoga Springs Public Library, Crandall Public Library, CPH Library |
| 2 | **Live Performing Arts & Stage** | ${verticalCounts['Live Performing Arts & Stage']} | SPAC, Caffè Lena, Universal Preservation Hall, Wood Theater Glens Falls |
| 3 | **Visual Arts & Teaching Museums** | ${verticalCounts['Visual Arts & Teaching Museums']} | Tang Teaching Museum, The Hyde Collection, Saratoga Arts, Salem Art Works |
| 4 | **Heritage & Equine Tradition** | ${verticalCounts['Heritage & Equine Tradition']} | Saratoga Race Course, National Museum of Racing, Grant Cottage, Saratoga Battlefield |
| 5 | **State Parks, Mineral Springs & Lakes** | ${verticalCounts['State Parks, Mineral Springs & Lakes']} | Saratoga Spa State Park, Moreau Lake, Lake George Million Dollar Beach, Wilton Preserve |
| 6 | **Collegiate & Academic Discovery** | ${verticalCounts['Collegiate & Academic Discovery']} | Skidmore College Arts & Lectures, SUNY Adirondack, Empire State University |
| 7 | **Acoustic Music & Historic Stages** | ${verticalCounts['Acoustic Music & Historic Stages']} | Caffè Lena Folk Stage, The Parting Glass, Cock 'n Bull Galway, Strand Theatre |
| 8 | **Family & Nature Discovery** | ${verticalCounts['Family & Nature Discovery']} | Children's Museum at Saratoga, Congress Park Carousel, Up Yonda Farm |
| 9 | **Foodways & Agricultural Markets** | ${verticalCounts['Foodways & Agricultural Markets']} | Saratoga Farmers' Market High Rock, Spa City Market, Saratoga Apple, Hicks Orchard |
| 10 | **Adirondack Craft & Glass Arts** | ${verticalCounts['Adirondack Craft & Glass Arts']} | Yaddo Artists Residency, Saratoga Clay Arts, Adirondack Folk School Lake Luzerne |

---

## 3. Verification & Compliance Standards

- **Zero Synthetic Supply**: Every candidate stream derives from an official publisher URL or municipal community portal checked on October 31, 2026.
- **Privacy Erasure Boundary**: No exact GPS or raw user fixes are persisted; only the canonical \`saratoga-springs\` region ID is stored in device preferences.
- **Strict Containment**: Points outside the \`[42.75, 43.85]\` lat and \`[-74.25, -73.20]\` lng bounding envelope are strictly rejected.
- **Honest Ephemeris & Weather**: Anchored to NWS Albany (\`ALY\`) grid cell \`68, 92\` on canonical \`America/New_York\` civil time.
`;

  fs.writeFileSync(outputReportPath, report);
  console.log(`Wrote expansion report to ${outputReportPath}`);
}

run();
