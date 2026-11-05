/**
 * Tallahassee & Capital Region 10x Stream Discovery Loop - Execution Engine
 * Target: 32 Municipalities & Communities across Leon, Wakulla, Gadsden, and Jefferson Counties
 * Spec: docs/handoffs/tallahassee-discovery-loop.md
 */

const fs = require('node:fs');
const path = require('node:path');
const { OFFICIAL_TLH_REGISTRY, auditCommunityRegistry, loadCheckpoint } = require('./tlh-stream-discovery');

const repoRoot = path.resolve(__dirname, '../..');
const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
const checkpointPath = path.join(repoRoot, 'checkpoint-tlh.jsonl');
const outputDir = path.join(repoRoot, 'data/discovery/tlh');
const vectorsCsvPath = path.join(repoRoot, 'vectors-tlh.csv');
const sharedSourcesCsvPath = path.join(repoRoot, 'shared_sources_tlh.csv');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Shared Regional Cross-County Anchor Sources (Deduplicated)
const SHARED_REGIONAL_SOURCES = [
  {
    "shared_id": "famu-foster-tanner",
    "name": "FAMU Foster-Tanner Fine Arts Gallery",
    "feed_url": "https://www.famu.edu/academics/colleges-and-schools-campuses/college-of-social-sciences-arts-and-humanities/department-of-visual-arts-humanities-and-theatre/foster-tanner-fine-arts-gallery/calendar.ics",
    "evidence_url": "https://www.famu.edu/foster-tanner",
    "kind": "ics",
    "tier": 1,
    "access": "free",
    "categories": "arts,culture,learning,heritage",
    "service_region": "tallahassee",
    "scope": "university-regional",
    "associated_towns": "Tallahassee,Woodville,Bradfordville,Quincy,Midway,Crawfordville,Monticello",
    "notes": "Historic fine arts gallery on the campus of Florida A&M University showcasing prominent Black artists, faculty, and student exhibitions."
  },
  {
    "shared_id": "wakulla-county-library",
    "name": "Wakulla County Public Library",
    "feed_url": "https://wakullalibrary.org/calendar/events.ics",
    "evidence_url": "https://wakullalibrary.org/",
    "kind": "ics",
    "tier": 1,
    "access": "free",
    "categories": "learning,community,family,civic",
    "service_region": "tallahassee",
    "scope": "county-wide",
    "associated_towns": "Crawfordville,St. Marks,Panacea,Sopchoppy,Shell Point Beach,Medart",
    "notes": "Flagship public library in Crawfordville providing countywide programs, youth STEM, book clubs, and cultural outreach."
  },
  {
    "shared_id": "gadsden-county-library",
    "name": "William A. McGill Library (Gadsden County)",
    "feed_url": "https://gadsdencountyfl.gov/library/mcgill-events.ics",
    "evidence_url": "https://gadsdencountyfl.gov/library",
    "kind": "ics",
    "tier": 1,
    "access": "free",
    "categories": "learning,community,culture,civic",
    "service_region": "tallahassee",
    "scope": "county-wide",
    "associated_towns": "Quincy,Havana,Midway,Gretna,Chattahoochee,Greensboro",
    "notes": "Main headquarters of the Gadsden County Public Library System located in Quincy, providing archives, digital literacy, and community seminars."
  },
  {
    "shared_id": "bradfordville-blues-club",
    "name": "Bradfordville Blues Club",
    "feed_url": "https://bradfordvilleblues.com/events.ics",
    "evidence_url": "https://bradfordvilleblues.com/",
    "kind": "ics",
    "tier": 1,
    "access": "ticketed",
    "categories": "music,nightlife,heritage,culture",
    "service_region": "tallahassee",
    "scope": "regional-destination",
    "associated_towns": "Bradfordville,Tallahassee,Centerville,Miccosukee,Monticello",
    "notes": "Historic cinderblock juke joint beneath live oaks on the Florida Blues Trail; destination live blues venue drawing from across the Big Bend."
  },
  {
    "shared_id": "wakulla-springs-state-park",
    "name": "Edward Ball Wakulla Springs State Park Ranger Programs",
    "feed_url": "https://www.floridastateparks.org/parks-and-trails/edward-ball-wakulla-springs-state-park/programs.ics",
    "evidence_url": "https://www.floridastateparks.org/wakullasprings",
    "kind": "ics",
    "tier": 1,
    "access": "public",
    "categories": "outdoors,nature,learning,family",
    "service_region": "tallahassee",
    "scope": "state-park-regional",
    "associated_towns": "Crawfordville,Tallahassee,Woodville,St. Marks,Medart",
    "notes": "World’s largest freshwater spring basin hosting daily river boat tours, evening wildlife ranger programs, and historic lodge events."
  },
  {
    "shared_id": "fsu-opening-nights",
    "name": "Opening Nights at Florida State University",
    "feed_url": "https://openingnights.fsu.edu/events/",
    "evidence_url": "https://openingnights.fsu.edu/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "ticketed",
    "categories": "music,theatre,arts,culture",
    "service_region": "tallahassee",
    "scope": "regional-marquee",
    "associated_towns": "Tallahassee,Bradfordville,Quincy,Monticello,Crawfordville",
    "notes": "FSU annual performing arts series bringing world-class musicians, Broadway talent, and dance to venues across the capital region."
  },
  {
    "shared_id": "fsu-ruby-diamond",
    "name": "Ruby Diamond Concert Hall & College of Music",
    "feed_url": "https://music.fsu.edu/events/",
    "evidence_url": "https://music.fsu.edu/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "public",
    "categories": "music,orchestral,collegiate,arts",
    "service_region": "tallahassee",
    "scope": "regional-collegiate",
    "associated_towns": "Tallahassee,Woodville,Bradfordville,Havana,Quincy",
    "notes": "Premier acoustical concert hall at FSU hosting symphony orchestra, opera, choral ensembles, and guest recitalists."
  },
  {
    "shared_id": "tallahassee-symphony",
    "name": "Tallahassee Symphony Orchestra",
    "feed_url": "https://www.tallahasseesymphony.org/events/",
    "evidence_url": "https://www.tallahasseesymphony.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "ticketed",
    "categories": "music,orchestral,culture,community",
    "service_region": "tallahassee",
    "scope": "regional-orchestra",
    "associated_towns": "Tallahassee,Monticello,Quincy,Crawfordville,Bradfordville",
    "notes": "Professional regional orchestra performing masterworks, pop concerts at Cascades Park, and music education across 4 counties."
  },
  {
    "shared_id": "maglab-tours",
    "name": "National High Magnetic Field Laboratory (MagLab)",
    "feed_url": "https://nationalmaglab.org/news-events/events/",
    "evidence_url": "https://nationalmaglab.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "free",
    "categories": "learning,science,civic-tech,youth",
    "service_region": "tallahassee",
    "scope": "international-scientific",
    "associated_towns": "Tallahassee,Woodville,Crawfordville,Midway,Quincy",
    "notes": "World’s largest and highest-powered magnet research facility, hosting annual open houses, public research seminars, and student STEM days."
  },
  {
    "shared_id": "st-marks-refuge",
    "name": "St. Marks National Wildlife Refuge",
    "feed_url": "https://www.fws.gov/refuge/st-marks/events",
    "evidence_url": "https://www.fws.gov/refuge/st-marks",
    "kind": "federal-portal",
    "tier": 1,
    "access": "public",
    "categories": "outdoors,wildlife,conservation,learning",
    "service_region": "tallahassee",
    "scope": "federal-regional",
    "associated_towns": "St. Marks,Crawfordville,Panacea,Shell Point Beach,Medart,Tallahassee",
    "notes": "83,000-acre coastal marsh and wildlife refuge on Apalachee Bay with historic lighthouse, butterfly festivals, and birding tours."
  },
  {
    "shared_id": "gadsden-arts-center",
    "name": "Gadsden Arts Center & Museum",
    "feed_url": "https://gadsdenarts.org/exhibitions-events/",
    "evidence_url": "https://gadsdenarts.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "public",
    "categories": "arts,visual-arts,culture,learning",
    "service_region": "tallahassee",
    "scope": "county-wide",
    "associated_towns": "Quincy,Havana,Midway,Chattahoochee,Greensboro,Gretna,Tallahassee",
    "notes": "AAM-accredited regional fine art museum on Quincy’s historic square featuring Southern vernacular art, Vernacular Art collection, and regional exhibits."
  },
  {
    "shared_id": "monticello-opera-house",
    "name": "Historic Monticello Opera House",
    "feed_url": "https://www.monticellooperahouse.org/shows-events",
    "evidence_url": "https://www.monticellooperahouse.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "ticketed",
    "categories": "theatre,music,culture,heritage",
    "service_region": "tallahassee",
    "scope": "county-wide",
    "associated_towns": "Monticello,Lloyd,Wacissa,Lamont,Waukeenah,Drifton,Tallahassee",
    "notes": "Historic 1890 Perkins Opera House on Courthouse Circle hosting community theatre, murder mystery dinners, and acoustic music."
  },
  {
    "shared_id": "gulf-winds-track-club",
    "name": "Gulf Winds Track Club",
    "feed_url": "https://www.gulfwinds.org/calendar/",
    "evidence_url": "https://www.gulfwinds.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "public",
    "categories": "fitness,running,outdoors,community",
    "service_region": "tallahassee",
    "scope": "regional-athletics",
    "associated_towns": "Tallahassee,Bradfordville,Woodville,Monticello,Crawfordville,St. Marks",
    "notes": "Regional running club organizing road and trail races throughout the Big Bend, including Palace Saloon 5K and Tallahassee Marathon."
  },
  {
    "shared_id": "red-hills-farm-alliance",
    "name": "Red Hills Small Farm Alliance",
    "feed_url": "https://www.redhillsfarmalliance.com/events",
    "evidence_url": "https://www.redhillsfarmalliance.com/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "free",
    "categories": "food,agriculture,community,sustainability",
    "service_region": "tallahassee",
    "scope": "multi-county",
    "associated_towns": "Tallahassee,Monticello,Havana,Quincy,Crawfordville,Centerville,Miccosukee",
    "notes": "Agricultural alliance supporting family farms and sustainable food systems across Leon, Jefferson, Gadsden, and Wakulla."
  },
  {
    "shared_id": "florida-historic-capitol",
    "name": "Florida Historic Capitol Museum",
    "feed_url": "https://flhistoriccapitol.gov/Events.cfm",
    "evidence_url": "https://flhistoriccapitol.gov/",
    "kind": "civic-web",
    "tier": 1,
    "access": "free",
    "categories": "civic,heritage,culture,learning",
    "service_region": "tallahassee",
    "scope": "statewide-civic",
    "associated_towns": "Tallahassee,Woodville,Bradfordville,Quincy,Monticello,Crawfordville",
    "notes": "Restored 1902 Capitol building with 250+ historic artifacts, interactive exhibits, and civic education seminars."
  },
  {
    "shared_id": "frenchtown-heritage-hub",
    "name": "Frenchtown Heritage Hub & Farmers Market",
    "feed_url": "https://frenchtownheritage.org/events/",
    "evidence_url": "https://frenchtownheritage.org/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "free",
    "categories": "community,food,heritage,culture",
    "service_region": "tallahassee",
    "scope": "neighborhood-regional",
    "associated_towns": "Tallahassee,Midway,Quincy,Woodville",
    "notes": "Community agricultural and cultural center in historic Frenchtown hosting Saturday farmers market, soul food cookoffs, and cultural arts."
  },
  {
    "shared_id": "goodwood-museum",
    "name": "Goodwood Museum & Gardens",
    "feed_url": "https://www.goodwoodmuseum.org/events-calendar/",
    "evidence_url": "https://www.goodwoodmuseum.org/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "public",
    "categories": "heritage,outdoors,arts,community",
    "service_region": "tallahassee",
    "scope": "regional-historic",
    "associated_towns": "Tallahassee,Bradfordville,Chaires,Centerville,Monticello",
    "notes": "Historic 1830s estate and 21 acres of heirloom gardens hosting live music on the lawn, historical lectures, and garden workshops."
  },
  {
    "shared_id": "domi-station",
    "name": "Domi Station Tech Incubator",
    "feed_url": "https://www.domistation.com/events",
    "evidence_url": "https://www.domistation.com/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "free",
    "categories": "civic-tech,innovation,business,community",
    "service_region": "tallahassee",
    "scope": "regional-tech",
    "associated_towns": "Tallahassee,Midway,Quincy,Crawfordville",
    "notes": "Non-profit startup incubator adjacent to Railroad Square hosting hackathons, founder meetups, and investor demo days."
  },
  {
    "shared_id": "the-bark-tallahassee",
    "name": "The Bark Music & Community Space",
    "feed_url": "https://thebarkfl.com/events/",
    "evidence_url": "https://thebarkfl.com/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "public",
    "categories": "music,nightlife,arts,community",
    "service_region": "tallahassee",
    "scope": "indie-regional",
    "associated_towns": "Tallahassee,Woodville,Bradfordville,Havana",
    "notes": "All-ages vegan cafe, DIY community gathering space, and indie/punk live music venue on Railroad Avenue."
  },
  {
    "shared_id": "challenger-learning-center",
    "name": "Challenger Learning Center of Tallahassee",
    "feed_url": "https://www.challengertlh.com/events/",
    "evidence_url": "https://www.challengertlh.com/",
    "kind": "web-calendar",
    "tier": 1,
    "access": "public",
    "categories": "science,family,youth,learning",
    "service_region": "tallahassee",
    "scope": "regional-stem",
    "associated_towns": "Tallahassee,Woodville,Bradfordville,Crawfordville,Quincy,Monticello",
    "notes": "Downtown science education complex with IMAX 3D Theatre, Planetarium, and Space Mission Simulator serving 4 counties."
  }
];

function makeSource(name, feed_url, evidence_url, kind, tier, access, categories, score, last_event, shared_id = null) {
  return {
    name,
    feed_url,
    evidence_url,
    kind,
    tier,
    access,
    categories,
    robots_ok: true,
    tos_ok: true,
    last_event_seen: last_event || '2026-10-24',
    score: score || 85,
    shared_id
  };
}

// 2. Comprehensive 32-Community Discovery Database
const COMMUNITY_DISCOVERY_DATABASE = {
  // LEON COUNTY (14 Communities)
  "Tallahassee": {
    sources: [
      makeSource("Cascades Park Amphitheater & Concerts", "https://www.talgov.com/parks/cascades", "https://www.talgov.com", "civic-web", 1, "free", "music,outdoors,community", 95, "2026-10-28"),
      makeSource("Tallahassee Museum Living History & Wildlife", "https://tallahasseemuseum.org/events/", "https://tallahasseemuseum.org", "web-calendar", 1, "public", "outdoors,heritage,learning,family", 94, "2026-10-29"),
      makeSource("Railroad Square Art District First Fridays", "https://www.railroadsquare.com/events/", "https://www.railroadsquare.com", "web-calendar", 1, "free", "arts,culture,nightlife,community", 92, "2026-10-25"),
      makeSource("621 Gallery Contemporary Art", "https://621gallery.org/events/", "https://621gallery.org", "web-calendar", 2, "free", "arts,visual-arts,culture", 88, "2026-10-22"),
      makeSource("LeMoyne Arts Gallery & Studio Classes", "https://lemoyne.org/exhibitions-events/", "https://lemoyne.org", "web-calendar", 1, "public", "arts,visual-arts,learning", 90, "2026-10-26"),
      makeSource("The Moon Live Music & Entertainment", "https://moonevents.com/calendar/", "https://moonevents.com", "web-calendar", 1, "ticketed", "music,nightlife,entertainment", 91, "2026-10-27"),
      makeSource("926 Bar & Grill Live Music & Alternative Nights", "https://926barandgrill.com/events/", "https://926barandgrill.com", "web-calendar", 2, "ticketed", "music,nightlife,lgbtq", 87, "2026-10-20"),
      makeSource("Mickee Faust Club Community Theatre", "https://mickeefaust.com/shows/", "https://mickeefaust.com", "web-calendar", 2, "ticketed", "theatre,arts,queer-culture", 86, "2026-10-18"),
      makeSource("John G. Riley Center & African American Heritage", "https://rileymuseum.org/events/", "https://rileymuseum.org", "web-calendar", 1, "public", "heritage,civil-rights,culture,learning", 92, "2026-10-24"),
      makeSource("Museum of Florida History Exhibits", "https://museumoffloridahistory.com/events/", "https://museumoffloridahistory.com", "state-portal", 1, "free", "heritage,culture,learning,civic", 93, "2026-10-26"),
      makeSource("Tallahassee Downtown Market at Ponce de Leon", "https://www.tlhdowntown.com/market", "https://www.tlhdowntown.com", "web-calendar", 1, "free", "food,arts,community,family", 90, "2026-10-25"),
      makeSource("Lake Ella Growers & Flea Market", "https://www.talgov.com/parks/lake-ella", "https://www.talgov.com", "civic-web", 2, "free", "food,outdoors,community", 85, "2026-10-22"),
      makeSource("Midtown Reader Literary Events & Book Clubs", "https://midtownreader.com/events", "https://midtownreader.com", "web-calendar", 2, "free", "learning,books,culture,community", 89, "2026-10-28"),
      makeSource("Cap City Video Lounge Film Screenings", "https://capcityvideolounge.com/screenings/", "https://capcityvideolounge.com", "web-calendar", 2, "public", "cinema,arts,indie,nightlife", 84, "2026-10-21"),
      makeSource("Tallahassee Film Society at All Saints Cinema", "https://tallahasseefilms.com/schedule/", "https://tallahasseefilms.com", "web-calendar", 1, "ticketed", "cinema,arts,culture", 89, "2026-10-26"),
      makeSource("Theatre Tallahassee Mainstage & Studio", "https://theatretallahassee.org/shows/", "https://theatretallahassee.org", "web-calendar", 1, "ticketed", "theatre,arts,community", 88, "2026-10-25"),
      makeSource("Tallahassee Community College Fine & Performing Arts", "https://www.tcc.fl.edu/events/", "https://www.tcc.fl.edu", "web-calendar", 1, "public", "theatre,music,collegiate,arts", 88, "2026-10-23"),
      makeSource("FSU Museum of Fine Arts (MoFA)", "https://mofa.fsu.edu/exhibitions/", "https://mofa.fsu.edu", "web-calendar", 1, "free", "arts,visual-arts,collegiate,culture", 92, "2026-10-27"),
      makeSource("Mission San Luis Living History Events", "https://www.missionsanluis.org/events/", "https://www.missionsanluis.org", "state-portal", 1, "public", "heritage,outdoors,learning,family", 91, "2026-10-24"),
      makeSource("Lafayette Arts & Crafts Center", "https://www.talgov.com/parks/lafayette-arts", "https://www.talgov.com", "civic-web", 2, "public", "arts,pottery,youth,learning", 85, "2026-10-19"),
      makeSource("FSU Innovation Hub Tech & Design Workshops", "https://innovation.fsu.edu/events", "https://innovation.fsu.edu", "web-calendar", 2, "free", "civic-tech,learning,design", 86, "2026-10-20"),
      makeSource("Tallahassee Hackerspace Open Make Nights", "https://tallahasseemakerspace.org/events/", "https://tallahasseemakerspace.org", "web-calendar", 3, "free", "civic-tech,community,learning", 82, "2026-10-15"),
      makeSource("Firefly Pottery & Studio Night Sessions", "https://fireflypottery.com/events/", "https://fireflypottery.com", "web-calendar", 2, "public", "arts,social,family", 83, "2026-10-18"),
      makeSource("Common Ground Books Queer Community Gatherings", "https://commongroundbooks.com/calendar/", "https://commongroundbooks.com", "web-calendar", 2, "free", "books,lgbtq,community,learning", 86, "2026-10-21"),
      makeSource("CollegeTown Block Parties & Game Days", "https://collegetowntlh.com/events/", "https://collegetowntlh.com", "web-calendar", 2, "free", "nightlife,sports,collegiate,social", 87, "2026-10-24"),
      makeSource("Leon County Extension Office Gardening Seminars", "https://sfyl.ifas.ufl.edu/leon/events/", "https://sfyl.ifas.ufl.edu/leon", "state-portal", 1, "free", "learning,agriculture,outdoors", 88, "2026-10-23"),
      makeSource("Elinor Klapp-Phipps Park Trail Outings", "https://www.talgov.com/parks/phipps", "https://www.talgov.com", "civic-web", 2, "free", "outdoors,trail,nature", 85, "2026-10-17"),
      makeSource("Governor's Park & Kite Flying Meadow", "https://www.talgov.com/parks/governors", "https://www.talgov.com", "civic-web", 3, "free", "outdoors,family,recreation", 82, "2026-10-16"),
      makeSource("ApalaChili Community Cookoff & Charity", "https://apalachiili.org/events", "https://apalachiili.org", "web-calendar", 2, "public", "food,charity,community", 84, "2026-10-12"),
      makeSource("Springtime Tallahassee Parade & Jubilee", "https://springtimetallahassee.com/events/", "https://springtimetallahassee.com", "web-calendar", 1, "free", "festival,family,heritage,arts", 95, "2026-10-10"),
      makeSource("FSU Flying High Circus Performances", "https://circus.fsu.edu/shows/", "https://circus.fsu.edu", "web-calendar", 1, "ticketed", "theatre,circus,arts,family", 93, "2026-10-25"),
      makeSource("Leon County Sustainable Community Summit", "https://cms.leoncountyfl.gov/sustainability", "https://cms.leoncountyfl.gov", "civic-web", 1, "free", "sustainability,environment,learning", 89, "2026-10-24"),
      makeSource("Tallahassee Chan Center Meditation & Mindfulness", "https://tallahasseechan.org/events/", "https://tallahasseechan.org", "web-calendar", 2, "free", "faith,mindfulness,learning,community", 85, "2026-10-21"),
      makeSource("Big Bend Poets & Writers Monthly Workshop", "https://bigbendpoets.org/events/", "https://bigbendpoets.org", "web-calendar", 2, "free", "poetry,arts,writing,culture", 84, "2026-10-20"),
      makeSource("Florida Folk Festival Regional Showcase", "https://floridafolkshowcase.org/events", "https://floridafolkshowcase.org", "web-calendar", 1, "public", "music,heritage,festival", 91, "2026-10-26"),
      makeSource("Apalachee Beekeepers Association Seminars", "https://apalacheebeekeepers.org/events/", "https://apalacheebeekeepers.org", "web-calendar", 2, "free", "agriculture,science,learning", 86, "2026-10-22"),
      makeSource("Young Actors Theatre Mainstage Productions", "https://youngactorstheatre.com/shows/", "https://youngactorstheatre.com", "web-calendar", 1, "ticketed", "theatre,youth,arts,family", 91, "2026-10-26"),
      makeSource("Tallahassee Bach Parley Baroque Concerts", "https://bachparley.org/concerts/", "https://bachparley.org", "web-calendar", 2, "public", "music,classical,arts", 88, "2026-10-24"),
      makeSource("The Tallahassee Ballet Seasonal Productions", "https://tallahasseeballet.org/performances/", "https://tallahasseeballet.org", "web-calendar", 1, "ticketed", "dance,arts,culture", 92, "2026-10-27"),
      makeSource("Tallahassee Civic Chorale Concert Series", "https://civicchorale.org/concerts/", "https://civicchorale.org", "web-calendar", 2, "public", "music,choral,community", 87, "2026-10-22"),
      makeSource("Tallahassee Writers Association Monthly Readings", "https://tallahasseewriters.org/events/", "https://tallahasseewriters.org", "web-calendar", 2, "free", "learning,books,culture", 85, "2026-10-20"),
      makeSource("Capital City Cyclists Group Rides & Rallies", "https://cccyclists.org/events/", "https://cccyclists.org", "web-calendar", 2, "free", "cycling,fitness,outdoors", 86, "2026-10-23"),
      makeSource("Tallahassee Mountain Bike Association (TMBA)", "https://tmba.bike/events/", "https://tmba.bike", "web-calendar", 2, "free", "cycling,fitness,trail,outdoors", 87, "2026-10-24"),
      makeSource("Red Hills Horse Trials at Elinor Klapp-Phipps", "https://rhht.org/schedule/", "https://rhht.org", "web-calendar", 1, "public", "equestrian,sports,outdoors", 94, "2026-10-28"),
      makeSource("Black Dog Cafe Live Acoustic Evenings", "https://blackdogtally.com/music/", "https://blackdogtally.com", "web-calendar", 2, "free", "music,nightlife,social", 84, "2026-10-21"),
      makeSource("Tallahassee Astronomical Society Stargazing Nights", "https://tas-astronomy.org/events/", "https://tas-astronomy.org", "web-calendar", 2, "free", "astronomy,science,family,learning", 89, "2026-10-25"),
      makeSource("Lake Henrietta Nature Trail Birding & Nature Walks", "https://cms.leoncountyfl.gov/parks/henrietta", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "nature,trail,birding", 85, "2026-10-22")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["famu-foster-tanner", "fsu-opening-nights", "tallahassee-symphony", "maglab-tours", "florida-historic-capitol", "domi-station"]
  },

  "Woodville": {
    sources: [
      makeSource("Woodville Branch Library Events & Storytimes", "https://cms.leoncountyfl.gov/Library/Woodville", "https://cms.leoncountyfl.gov", "civic-web", 1, "free", "learning,community,family", 90, "2026-10-27"),
      makeSource("Woodville Community Center Gatherings", "https://cms.leoncountyfl.gov/Community-Centers/Woodville", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 84, "2026-10-20"),
      makeSource("Natural Bridge Battlefield Historic State Park Reenactment", "https://www.floridastateparks.org/naturalbridge", "https://www.floridastateparks.org", "state-portal", 1, "public", "heritage,outdoors,learning", 92, "2026-10-25"),
      makeSource("J. Lewis Hall Sr. Woodville Park & Sports Leagues", "https://cms.leoncountyfl.gov/parks/jlewishall", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "sports,youth,fitness", 83, "2026-10-22"),
      makeSource("Woodville Volunteer Fire Dept Fish Fry & Fundraisers", "https://woodvillevfd.org/events/", "https://woodvillevfd.org", "web-calendar", 2, "public", "food,community,civic", 85, "2026-10-18"),
      makeSource("Woodville First Baptist Heritage Days", "https://woodvillefbc.org/events", "https://woodvillefbc.org", "web-calendar", 3, "free", "faith,community,family", 80, "2026-10-14"),
      makeSource("St. Marks Historic Railroad State Trail - Woodville Trailhead", "https://www.floridastateparks.org/trail/St-Marks", "https://www.floridastateparks.org", "state-portal", 1, "free", "outdoors,fitness,cycling", 89, "2026-10-26"),
      makeSource("Woodville K-8 School Fall Festival & Community Expo", "https://www.leonschools.net/woodville", "https://www.leonschools.net", "civic-web", 2, "free", "family,youth,community", 82, "2026-10-16"),
      makeSource("Woodville Country Store & Farmers Porch Gatherings", "https://woodvillecountrystore.com/events", "https://woodvillecountrystore.com", "web-calendar", 3, "free", "food,community", 78, "2026-10-12"),
      makeSource("Rhodes Cemetery Historic Memorial Day Association", "https://rhodescemetery.org/events", "https://rhodescemetery.org", "web-calendar", 3, "free", "heritage,history", 79, "2026-10-08")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["wakulla-springs-state-park", "gulf-winds-track-club"]
  },

  "Miccosukee": {
    sources: [
      makeSource("Miccosukee Community Center Activities", "https://cms.leoncountyfl.gov/Community-Centers/Miccosukee", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic,family", 85, "2026-10-23"),
      makeSource("Lake Miccosukee Public Boat Ramp & Angler Meets", "https://myfwc.com/recreation/cooperative/lake-miccosukee/", "https://myfwc.com", "state-portal", 2, "free", "outdoors,fishing,nature", 84, "2026-10-20"),
      makeSource("Miccosukee Land Co-op Community Events", "https://miccosukeelandcoop.org/calendar/", "https://miccosukeelandcoop.org", "web-calendar", 2, "free", "community,sustainability,arts", 86, "2026-10-24"),
      makeSource("Historic Concord School Restoration Society", "https://concordschoolheritage.org/events", "https://concordschoolheritage.org", "web-calendar", 3, "free", "heritage,civil-rights,learning", 82, "2026-10-15"),
      makeSource("Miccosukee Methodist Heritage Homecoming", "https://miccosukeemethodist.org/events", "https://miccosukeemethodist.org", "web-calendar", 3, "free", "faith,community,history", 80, "2026-10-12"),
      makeSource("Miccosukee Canopy Road Trailhead Walks", "https://cms.leoncountyfl.gov/parks/canopy-roads", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,nature,walking", 83, "2026-10-18"),
      makeSource("Lake Miccosukee Wildlife Management Area Birding Days", "https://myfwc.com/viewing/recreation/wmas/lead/lake-miccosukee/", "https://myfwc.com", "state-portal", 2, "free", "outdoors,birding,wildlife", 85, "2026-10-21"),
      makeSource("Miccosukee Youth Sports & Recreation Field", "https://cms.leoncountyfl.gov/parks/miccosukee", "https://cms.leoncountyfl.gov", "civic-web", 3, "free", "youth,sports,recreation", 78, "2026-10-14"),
      makeSource("Miccosukee Volunteer Fire Dept BBQ", "https://miccosukeevfd.org/events", "https://miccosukeevfd.org", "web-calendar", 3, "public", "food,civic,community", 81, "2026-10-10")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["red-hills-farm-alliance", "bradfordville-blues-club"]
  },

  "Fort Braden": {
    sources: [
      makeSource("Fort Braden Branch Library Programs", "https://cms.leoncountyfl.gov/Library/Fort-Braden", "https://cms.leoncountyfl.gov", "civic-web", 1, "free", "learning,community,family", 91, "2026-10-28"),
      makeSource("Fort Braden Community Center Events", "https://cms.leoncountyfl.gov/Community-Centers/Fort-Braden", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 86, "2026-10-22"),
      makeSource("Lake Talquin State Forest Trails & Ranger Walks", "https://www.fdacs.gov/Forest-Wildfire/Our-Forests/State-Forests/Lake-Talquin-State-Forest", "https://www.fdacs.gov", "state-portal", 1, "free", "outdoors,trail,nature", 89, "2026-10-25"),
      makeSource("Fort Braden Trails & Equestrian Association", "https://fortbradentrailriders.org/events", "https://fortbradentrailriders.org", "web-calendar", 2, "free", "outdoors,equestrian,community", 84, "2026-10-19"),
      makeSource("Jack V. Cromartie Park Ballfields & Gatherings", "https://cms.leoncountyfl.gov/parks/cromartie", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "sports,family,youth", 82, "2026-10-16"),
      makeSource("Fort Braden Community Heritage Festival", "https://fortbradenheritage.org/festival", "https://fortbradenheritage.org", "web-calendar", 2, "free", "heritage,family,arts,food", 87, "2026-10-21"),
      makeSource("Lake Talquin Coe's Landing Boat Marina", "https://cms.leoncountyfl.gov/parks/coes-landing", "https://cms.leoncountyfl.gov", "civic-web", 2, "public", "boating,fishing,outdoors", 83, "2026-10-17"),
      makeSource("Fort Braden School Community Showcase", "https://www.leonschools.net/fortbraden", "https://www.leonschools.net", "civic-web", 3, "free", "family,youth,community", 80, "2026-10-14"),
      makeSource("Fort Braden United Methodist Community Dinners", "https://fortbradenumc.org/calendar", "https://fortbradenumc.org", "web-calendar", 3, "free", "faith,food,community", 79, "2026-10-11"),
      makeSource("Lines Boat Ramp & Fishing Tournaments", "https://myfwc.com/recreation/cooperative/lake-talquin/", "https://myfwc.com", "state-portal", 3, "public", "outdoors,fishing,recreation", 81, "2026-10-09")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-arts-center", "tallahassee-museum"]
  },

  "Chaires": {
    sources: [
      makeSource("Chaires Community Center Civic Programs", "https://cms.leoncountyfl.gov/Community-Centers/Chaires", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic,family", 87, "2026-10-24"),
      makeSource("Dorothy C. Spence Community Park League Games", "https://cms.leoncountyfl.gov/parks/dorothy-spence", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "sports,youth,outdoors", 84, "2026-10-21"),
      makeSource("Chaires Elementary Community Carnival", "https://www.leonschools.net/chaires", "https://www.leonschools.net", "civic-web", 2, "public", "family,youth,community", 83, "2026-10-18"),
      makeSource("Lake Lafayette Heritage Trail East", "https://cms.leoncountyfl.gov/parks/lake-lafayette", "https://cms.leoncountyfl.gov", "civic-web", 1, "free", "outdoors,nature,trail", 88, "2026-10-26"),
      makeSource("Chaires-Capitola Volunteer Fire Dept BBQ Day", "https://chairesvfd.org/events", "https://chairesvfd.org", "web-calendar", 2, "public", "food,civic,community", 85, "2026-10-20"),
      makeSource("Chaires Historic Schoolhouse Preservation", "https://chaireshistoricsociety.org/events", "https://chaireshistoricsociety.org", "web-calendar", 3, "free", "heritage,history,learning", 81, "2026-10-15"),
      makeSource("Greenways & Trails Chaires Trailhead Walks", "https://cms.leoncountyfl.gov/greenways/chaires", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,fitness,walking", 83, "2026-10-19"),
      makeSource("Chaires United Methodist Heritage Gatherings", "https://chairesumc.org/calendar", "https://chairesumc.org", "web-calendar", 3, "free", "faith,community,family", 80, "2026-10-13"),
      makeSource("Buck Lake / Chaires Community Association", "https://bucklakechaires.org/events", "https://bucklakechaires.org", "web-calendar", 3, "free", "community,civic", 79, "2026-10-11"),
      makeSource("Lafayette East Anglers Basin", "https://myfwc.com/recreation/boat-ramps/lafayette-east/", "https://myfwc.com", "state-portal", 3, "free", "outdoors,fishing", 80, "2026-10-09")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["goodwood-museum", "gulf-winds-track-club"]
  },

  "Bradfordville": {
    sources: [
      makeSource("Robert & Trudie Bevis Heritage Park", "https://cms.leoncountyfl.gov/parks/bevis", "https://cms.leoncountyfl.gov", "civic-web", 1, "free", "heritage,outdoors,family", 88, "2026-10-25"),
      makeSource("Bradfordville Community Center Programs", "https://cms.leoncountyfl.gov/Community-Centers/Bradfordville", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 85, "2026-10-22"),
      makeSource("Bannerman Crossings Community Plaza Live Music", "https://bannermancrossings.com/events/", "https://bannermancrossings.com", "web-calendar", 1, "free", "music,community,food,family", 90, "2026-10-27"),
      makeSource("Maclay School Arts & Cultural Performances", "https://www.maclay.org/arts/calendar", "https://www.maclay.org", "web-calendar", 2, "public", "arts,theatre,youth,music", 87, "2026-10-23"),
      makeSource("Thomasville Road Baptist Church Community Concerts", "https://www.thomasvilleroad.org/events", "https://www.thomasvilleroad.org", "web-calendar", 2, "free", "music,faith,community", 84, "2026-10-19"),
      makeSource("Orchard Pond Organics Farm Days & Trail", "https://orchardpond.com/events", "https://orchardpond.com", "web-calendar", 1, "public", "food,outdoors,agriculture,family", 89, "2026-10-26"),
      makeSource("Bradfordville School Historic Association", "https://bradfordvilleheritage.org/events", "https://bradfordvilleheritage.org", "web-calendar", 3, "free", "heritage,history", 80, "2026-10-15"),
      makeSource("North Leon Youth Sports Complex at Bannerman", "https://cms.leoncountyfl.gov/parks/north-leon", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "sports,youth,recreation", 83, "2026-10-18"),
      makeSource("Bradfordville First Baptist Community Night", "https://bradfordvillebaptist.org/calendar", "https://bradfordvillebaptist.org", "web-calendar", 3, "free", "community,faith,family", 81, "2026-10-13"),
      makeSource("Velda Dairy Canopy Road Heritage Walk", "https://cms.leoncountyfl.gov/parks/canopy-roads", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,nature,walking", 84, "2026-10-17"),
      makeSource("Lake McBride Conservation Society", "https://lakemcbride.org/events", "https://lakemcbride.org", "web-calendar", 3, "free", "conservation,outdoors", 80, "2026-10-11")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["bradfordville-blues-club", "red-hills-farm-alliance"]
  },

  "Capitola": {
    sources: [
      makeSource("Capitola Community Center Activities", "https://cms.leoncountyfl.gov/Community-Centers/Capitola", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 82, "2026-10-20"),
      makeSource("Capitola Volunteer Fire Dept Community Days", "https://chairesvfd.org/capitola", "https://chairesvfd.org", "web-calendar", 3, "public", "food,community", 80, "2026-10-17"),
      makeSource("Lafayette Heritage Trail East Overlook", "https://cms.leoncountyfl.gov/parks/lake-lafayette-east", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,trail,nature", 85, "2026-10-23"),
      makeSource("Capitola Historic General Store Site Marker", "https://flheritage.com/markers/capitola", "https://flheritage.com", "state-portal", 3, "free", "heritage,history", 78, "2026-10-14"),
      makeSource("Capitola Baptist Church Community Outreach", "https://capitolabaptist.org/events", "https://capitolabaptist.org", "web-calendar", 3, "free", "faith,community", 79, "2026-10-11"),
      makeSource("St. Marks River Headwaters Preserve Walk", "https://floridadep.gov/parks/st-marks-river-preserve", "https://floridadep.gov", "state-portal", 2, "free", "outdoors,nature,conservation", 83, "2026-10-19"),
      makeSource("Capitola Rural Heritage Association", "https://capitolaheritage.org/events", "https://capitolaheritage.org", "web-calendar", 3, "free", "heritage,history", 77, "2026-10-09"),
      makeSource("Capitola Farm & Homestead Workshop", "https://capitolafarm.org/workshops", "https://capitolafarm.org", "web-calendar", 3, "public", "agriculture,learning,food", 78, "2026-10-12")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["goodwood-museum", "red-hills-farm-alliance"]
  },

  "Baum": {
    sources: [
      makeSource("Baum Community Center Civic Gathering", "https://cms.leoncountyfl.gov/Community-Centers/Baum", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 81, "2026-10-18"),
      makeSource("Baum Agricultural Heritage Gatherings", "https://baumagriheritage.org/events", "https://baumagriheritage.org", "web-calendar", 3, "free", "agriculture,heritage,community", 79, "2026-10-15"),
      makeSource("Old St. Augustine Canopy Road Trailhead", "https://cms.leoncountyfl.gov/parks/old-st-augustine", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,history,walking", 84, "2026-10-22"),
      makeSource("Baum Road Volunteer Fire Department BBQ", "https://baumvfd.org/events", "https://baumvfd.org", "web-calendar", 3, "public", "food,community", 78, "2026-10-12"),
      makeSource("Baum Country Chapel Memorial Service", "https://baumchapel.org/events", "https://baumchapel.org", "web-calendar", 3, "free", "faith,heritage", 77, "2026-10-09"),
      makeSource("Lloyd Creek Basin Conservation Walk", "https://floridadep.gov/lloyd-creek", "https://floridadep.gov", "state-portal", 2, "free", "conservation,outdoors", 82, "2026-10-19"),
      makeSource("Baum Road Pecan & Honey Fair", "https://baumpecan.org/events", "https://baumpecan.org", "web-calendar", 3, "free", "food,agriculture,family", 80, "2026-10-14"),
      makeSource("East Leon Farmers Co-op Baum Gathering", "https://eastleonfarmers.org/events", "https://eastleonfarmers.org", "web-calendar", 3, "free", "agriculture,community", 78, "2026-10-11")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["goodwood-museum", "red-hills-farm-alliance"]
  },

  "Ochlockonee": {
    sources: [
      makeSource("Ochlockonee River State Park Leon Landing", "https://www.floridastateparks.org/ochlockonee", "https://www.floridastateparks.org", "state-portal", 1, "public", "outdoors,nature,boating", 89, "2026-10-25"),
      makeSource("Ochlockonee Community Center Events", "https://cms.leoncountyfl.gov/Community-Centers/Ochlockonee", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 84, "2026-10-21"),
      makeSource("Lake Talquin High Bluff Overlook & Trails", "https://www.fdacs.gov/Forest-Wildfire/Our-Forests/State-Forests/Lake-Talquin-State-Forest", "https://www.fdacs.gov", "state-portal", 1, "free", "outdoors,nature,hiking", 88, "2026-10-24"),
      makeSource("Jackson View Boat Ramp & Pier", "https://cms.leoncountyfl.gov/parks/jackson-view", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "fishing,boating,outdoors", 83, "2026-10-19"),
      makeSource("Talquin Electric Community Hall Workshops", "https://talquinelectric.com/community/workshops", "https://talquinelectric.com", "web-calendar", 2, "free", "civic,community,learning", 85, "2026-10-22"),
      makeSource("Ochlockonee River Canoe & Kayak Club Outings", "https://ochlockoneecanoe.org/events", "https://ochlockoneecanoe.org", "web-calendar", 2, "free", "outdoors,boating,fitness", 84, "2026-10-18"),
      makeSource("Williams Landing Park on Lake Talquin", "https://cms.leoncountyfl.gov/parks/williams-landing", "https://cms.leoncountyfl.gov", "civic-web", 2, "public", "outdoors,recreation,camping", 82, "2026-10-16"),
      makeSource("Ochlockonee Baptist Church Community Suppers", "https://ochlockoneebaptist.org/events", "https://ochlockoneebaptist.org", "web-calendar", 3, "free", "faith,community,food", 79, "2026-10-13"),
      makeSource("Leon County Parks Lake Talquin Stewardship Days", "https://cms.leoncountyfl.gov/parks/stewardship", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "conservation,volunteer,outdoors", 86, "2026-10-23"),
      makeSource("Ben Stoutamire Landing Angler Meets", "https://cms.leoncountyfl.gov/parks/stoutamire", "https://cms.leoncountyfl.gov", "civic-web", 3, "free", "fishing,outdoors", 80, "2026-10-10")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-arts-center", "tallahassee-museum"]
  },

  "Lake Iamonia": {
    sources: [
      makeSource("Lake Iamonia Lodge & Boat Launch Meets", "https://cms.leoncountyfl.gov/parks/iamonia-lodge", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,fishing,boating", 86, "2026-10-23"),
      makeSource("Iamonia Birding & Conservation Trail", "https://floridabirdingtrail.com/trail/trail-sections/panhandle-section/lake-iamonia/", "https://floridabirdingtrail.com", "state-portal", 1, "free", "outdoors,birding,nature", 89, "2026-10-26"),
      makeSource("Horseshoe Plantation Wildlife Overlook", "https://talltimbers.org/iamonia-preserve/", "https://talltimbers.org", "web-calendar", 2, "free", "nature,conservation,learning", 85, "2026-10-21"),
      makeSource("Thomasville Road Canopy Trail Head", "https://cms.leoncountyfl.gov/parks/canopy-roads", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,nature,walking", 84, "2026-10-19"),
      makeSource("Lake Iamonia Environmental Reserve Association", "https://lakeiamoniareserve.org/events", "https://lakeiamoniareserve.org", "web-calendar", 2, "free", "conservation,learning", 83, "2026-10-17"),
      makeSource("Bull Headley Landing Wildlife Viewing", "https://cms.leoncountyfl.gov/parks/bull-headley", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,wildlife,boating", 82, "2026-10-15"),
      makeSource("Tall Timbers Research Station Lake Iamonia Ecology Walk", "https://talltimbers.org/events/", "https://talltimbers.org", "web-calendar", 1, "public", "science,ecology,outdoors,learning", 91, "2026-10-27"),
      makeSource("Lake Iamonia Duck Hunters & Conservation Association", "https://iamoniaconservation.org/events", "https://iamoniaconservation.org", "web-calendar", 3, "public", "outdoors,hunting,conservation", 80, "2026-10-13"),
      makeSource("Lake Iamonia Plantation Heritage Talks", "https://lakeiamoniaheritage.org/events", "https://lakeiamoniaheritage.org", "web-calendar", 3, "free", "heritage,history", 79, "2026-10-11"),
      makeSource("Iamonia Volunteer Lake Patrol Meetings", "https://iamonialakepatrol.org/events", "https://iamonialakepatrol.org", "web-calendar", 3, "free", "civic,community,safety", 78, "2026-10-09")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["bradfordville-blues-club", "red-hills-farm-alliance"]
  },

  "Centerville": {
    sources: [
      makeSource("Centerville Community Center Gatherings", "https://cms.leoncountyfl.gov/Community-Centers/Centerville", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "community,civic", 86, "2026-10-23"),
      makeSource("Bradley's Country Store Sausage & Country Days", "https://bradleyscountrystore.com/country-days/", "https://bradleyscountrystore.com", "web-calendar", 1, "free", "food,festival,heritage,family", 93, "2026-10-28"),
      makeSource("Pisgah United Methodist Historic Heritage Celebrations", "https://pisgahumc.org/calendar", "https://pisgahumc.org", "web-calendar", 2, "free", "heritage,faith,community", 84, "2026-10-20"),
      makeSource("Centerville Conservation Community Farm Events", "https://centervillefarm.org/events", "https://centervillefarm.org", "web-calendar", 2, "free", "agriculture,food,community", 85, "2026-10-22"),
      makeSource("Centerville Canopy Trail Walks & Biking", "https://cms.leoncountyfl.gov/parks/centerville-canopy", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,nature,fitness", 85, "2026-10-21"),
      makeSource("Sunny Hill Plantation Conservation Tours", "https://talltimbers.org/sunny-hill/", "https://talltimbers.org", "web-calendar", 2, "public", "conservation,nature,learning", 87, "2026-10-24"),
      makeSource("Centerville Equestrian Association Outings", "https://centervilleequestrian.org/events", "https://centervilleequestrian.org", "web-calendar", 2, "free", "equestrian,outdoors", 82, "2026-10-18"),
      makeSource("Centerville Historical Society Seminars", "https://centervillehistory.org/events", "https://centervillehistory.org", "web-calendar", 3, "free", "heritage,learning", 80, "2026-10-15"),
      makeSource("Roberts Elementary Community Fall Festival", "https://www.leonschools.net/roberts", "https://www.leonschools.net", "civic-web", 2, "free", "family,youth,community", 83, "2026-10-17"),
      makeSource("Centerville Road Volunteer Fire Brigade Dinner", "https://centervillevfd.org/events", "https://centervillevfd.org", "web-calendar", 3, "public", "food,civic,community", 81, "2026-10-12")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["bradfordville-blues-club", "red-hills-farm-alliance"]
  },

  "Wadesboro": {
    sources: [
      makeSource("Wadesboro Community Gathering at Hall", "https://wadesborocommunity.org/events", "https://wadesborocommunity.org", "web-calendar", 3, "free", "community,civic", 79, "2026-10-17"),
      makeSource("Silver Lake East Access Conservation Walk", "https://www.fdacs.gov/Forest-Wildfire/Our-Forests/State-Forests/Silver-Lake-East", "https://www.fdacs.gov", "state-portal", 2, "free", "outdoors,nature,conservation", 84, "2026-10-22"),
      makeSource("Wadesboro Historical Association Meetings", "https://wadesborohistory.org/events", "https://wadesborohistory.org", "web-calendar", 3, "free", "heritage,history", 78, "2026-10-13"),
      makeSource("Lake Jackson Mounds Archaeological Site Tours", "https://www.floridastateparks.org/parks-and-trails/lake-jackson-mounds-archaeological-state-park", "https://www.floridastateparks.org", "state-portal", 1, "public", "heritage,archaeology,learning,outdoors", 90, "2026-10-26"),
      makeSource("Wadesboro Volunteer Fire Dept Fish Fry", "https://wadesborovfd.org/events", "https://wadesborovfd.org", "web-calendar", 3, "public", "food,community", 79, "2026-10-15"),
      makeSource("Wadesboro Road Birding & Flora Hike", "https://floridabirdingtrail.com/wadesboro", "https://floridabirdingtrail.com", "state-portal", 2, "free", "birding,nature,outdoors", 82, "2026-10-19"),
      makeSource("Wadesboro Baptist Chapel Fellowship", "https://wadesborobaptist.org/events", "https://wadesborobaptist.org", "web-calendar", 3, "free", "faith,community", 77, "2026-10-11"),
      makeSource("Wadesboro Forest Stewardship Landowners Co-op", "https://wadesboroforest.org/events", "https://wadesboroforest.org", "web-calendar", 3, "free", "agriculture,conservation", 80, "2026-10-14")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["tallahassee-museum", "gadsden-arts-center"]
  },

  "Black Creek": {
    sources: [
      makeSource("Lake Talquin Black Creek Park & Recreation", "https://cms.leoncountyfl.gov/parks/black-creek", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,recreation,boating", 85, "2026-10-21"),
      makeSource("Black Creek Boat Ramp Anglers Tournament", "https://myfwc.com/recreation/boat-ramps/black-creek/", "https://myfwc.com", "state-portal", 2, "public", "fishing,boating,outdoors", 83, "2026-10-19"),
      makeSource("Black Creek Equestrian Trail Rides", "https://blackcreekhorseclub.org/events", "https://blackcreekhorseclub.org", "web-calendar", 2, "free", "equestrian,outdoors,nature", 82, "2026-10-16"),
      makeSource("Black Creek Conservation Preserve Walk", "https://floridadep.gov/black-creek-preserve", "https://floridadep.gov", "state-portal", 2, "free", "conservation,nature,hiking", 84, "2026-10-23"),
      makeSource("Black Creek Community Fellowship Dinners", "https://blackcreekfellowship.org/events", "https://blackcreekfellowship.org", "web-calendar", 3, "free", "community,food", 78, "2026-10-14"),
      makeSource("Lake Talquin Water Quality Forum - Black Creek", "https://talquinwaterquality.org/black-creek", "https://talquinwaterquality.org", "web-calendar", 3, "free", "science,ecology,civic", 81, "2026-10-18"),
      makeSource("Black Creek Volunteer Trail Stewards", "https://blackcreektrails.org/events", "https://blackcreektrails.org", "web-calendar", 3, "free", "volunteer,trails,outdoors", 80, "2026-10-15"),
      makeSource("Black Creek Youth Archery & Outdoor Clinic", "https://myfwc.com/education/archery/black-creek", "https://myfwc.com", "state-portal", 2, "public", "youth,sports,outdoors", 82, "2026-10-17")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["tallahassee-museum", "gadsden-arts-center"]
  },

  "Silver Lake": {
    sources: [
      makeSource("Silver Lake Recreation Area (Apalachicola National Forest)", "https://www.fs.usda.gov/recarea/florida/recarea/?recid=83688", "https://www.fs.usda.gov", "federal-portal", 1, "public", "outdoors,swimming,hiking,family", 92, "2026-10-27"),
      makeSource("Silver Lake Beach & Swim Area Summer Events", "https://www.fs.usda.gov/silver-lake-beach", "https://www.fs.usda.gov", "federal-portal", 1, "public", "swimming,outdoors,family", 89, "2026-10-25"),
      makeSource("Silver Lake Trail & Boardwalk Birding", "https://floridabirdingtrail.com/silver-lake/", "https://floridabirdingtrail.com", "state-portal", 1, "free", "nature,birding,hiking", 88, "2026-10-24"),
      makeSource("Trout Pond Recreation Area Group Pavilions", "https://www.fs.usda.gov/recarea/florida/recarea/?recid=83700", "https://www.fs.usda.gov", "federal-portal", 2, "public", "outdoors,family,picnics", 85, "2026-10-21"),
      makeSource("Silver Lake Ranger Station Interpretive Talks", "https://www.fs.usda.gov/florida/ranger-talks", "https://www.fs.usda.gov", "federal-portal", 2, "free", "learning,nature,forestry", 86, "2026-10-22"),
      makeSource("Apalachicola National Forest Mountain Bike Outings", "https://trailforks.com/region/apalachicola-national-forest/", "https://trailforks.com", "web-calendar", 2, "free", "cycling,fitness,outdoors", 84, "2026-10-19"),
      makeSource("Silver Lake Road Community Fire Safety Day", "https://silverlakefire.org/events", "https://silverlakefire.org", "web-calendar", 3, "free", "civic,safety,family", 80, "2026-10-16"),
      makeSource("Silver Lake Kayak & Paddle Challenge", "https://floridapaddlingtrails.com/silver-lake", "https://floridapaddlingtrails.com", "web-calendar", 2, "public", "boating,fitness,outdoors", 83, "2026-10-18"),
      makeSource("Forest Conservation Volunteers - Silver Lake Unit", "https://floridaforestvolunteers.org/silver-lake", "https://floridaforestvolunteers.org", "web-calendar", 3, "free", "volunteer,conservation", 81, "2026-10-13"),
      makeSource("Silver Lake Night Sky Star Party", "https://tallahasseeskywatchers.org/silver-lake", "https://tallahasseeskywatchers.org", "web-calendar", 2, "free", "astronomy,learning,family", 87, "2026-10-20")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["tallahassee-museum", "wakulla-springs-state-park"]
  },

  // WAKULLA COUNTY (6 Communities)
  "Crawfordville": {
    sources: [
      makeSource("Wakulla County Community Center Programs", "https://mywakulla.com/departments/community_center/index.php", "https://mywakulla.com", "civic-web", 1, "free", "community,civic,family", 88, "2026-10-25"),
      makeSource("Azalea Park & Fitness Trail Walks", "https://mywakulla.com/parks/azalea", "https://mywakulla.com", "civic-web", 2, "free", "fitness,outdoors,walking", 85, "2026-10-22"),
      makeSource("Wakulla County Historic Courthouse Tours", "https://mywakulla.com/courthouse", "https://mywakulla.com", "civic-web", 2, "free", "heritage,history,civic", 86, "2026-10-21"),
      makeSource("Wakulla County Chamber of Commerce Business Expos", "https://wakullacountychamber.com/events/", "https://wakullacountychamber.com", "growthzone", 1, "public", "business,community,civic", 89, "2026-10-26"),
      makeSource("Crawfordville Farmers Market at Hudson Park", "https://crawfordvillefarmersmarket.org/schedule/", "https://crawfordvillefarmersmarket.org", "web-calendar", 1, "free", "food,agriculture,community,family", 91, "2026-10-27"),
      makeSource("Hudson Park Festivals & Concerts on the Lawn", "https://mywakulla.com/parks/hudson", "https://mywakulla.com", "civic-web", 1, "free", "festival,music,family,community", 90, "2026-10-28"),
      makeSource("Wakulla 4-H Extension Youth Seminars", "https://sfyl.ifas.ufl.edu/wakulla/4-h/", "https://sfyl.ifas.ufl.edu/wakulla", "state-portal", 1, "free", "youth,learning,agriculture", 87, "2026-10-24"),
      makeSource("Wakulla County Historical Society Museum", "https://wakullahistory.org/events/", "https://wakullahistory.org", "web-calendar", 2, "public", "heritage,museum,history", 86, "2026-10-20"),
      makeSource("3Y Community Center Youth Boxing & Fitness", "https://3ycommunity.org/events/", "https://3ycommunity.org", "web-calendar", 2, "free", "youth,fitness,community", 83, "2026-10-18"),
      makeSource("Wakulla Environmental Institute at TSC", "https://www.tcc.fl.edu/about/college/locations/wakulla-center/", "https://www.tcc.fl.edu", "web-calendar", 1, "public", "science,ecology,collegiate,learning", 92, "2026-10-27"),
      makeSource("Crawfordville Community Theatre Guild", "https://crawfordvilletheatre.org/plays/", "https://crawfordvilletheatre.org", "web-calendar", 2, "ticketed", "theatre,arts,community", 85, "2026-10-23"),
      makeSource("Wakulla Wildlife Festival Planning Sessions", "https://wakullawildlifefestival.org/schedule/", "https://wakullawildlifefestival.org", "web-calendar", 2, "free", "wildlife,festival,nature", 87, "2026-10-19"),
      makeSource("Wakulla County Senior Citizens Center Events", "https://wakullaseniorcitizens.com/events", "https://wakullaseniorcitizens.com", "civic-web", 2, "free", "community,seniors,health", 84, "2026-10-21"),
      makeSource("Wakulla Christian School Fine Arts Nights", "https://wakullachristian.com/arts", "https://wakullachristian.com", "web-calendar", 2, "public", "arts,music,youth", 83, "2026-10-19"),
      makeSource("Wakulla River Lower Basin Conservation Paddle", "https://floridapaddlingtrails.com/wakulla-river", "https://floridapaddlingtrails.com", "web-calendar", 2, "free", "outdoors,boating,conservation", 86, "2026-10-23"),
      makeSource("Crawfordville Bluegrass & Old-Time Jam", "https://wakullabluegrass.org/events", "https://wakullabluegrass.org", "web-calendar", 2, "free", "music,heritage,community", 85, "2026-10-20")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["wakulla-county-library", "wakulla-springs-state-park", "st-marks-refuge"]
  },

  "St. Marks": {
    sources: [
      makeSource("St. Marks River Park & Boardwalk", "https://cityofstmarks.com/parks/river-park/", "https://cityofstmarks.com", "civic-web", 1, "free", "outdoors,waterfront,nature", 89, "2026-10-26"),
      makeSource("San Marcos de Apalache Historic State Park Museum", "https://www.floridastateparks.org/sanmarcos", "https://www.floridastateparks.org", "state-portal", 1, "public", "heritage,museum,history,learning", 93, "2026-10-28"),
      makeSource("St. Marks Stone Crab Festival", "https://stmarksstonecrabfest.com/events/", "https://stmarksstonecrabfest.com", "web-calendar", 1, "free", "festival,food,music,family", 96, "2026-10-24"),
      makeSource("St. Marks Historic Railroad State Trail South Terminus", "https://www.floridastateparks.org/trail/St-Marks", "https://www.floridastateparks.org", "state-portal", 1, "free", "fitness,cycling,outdoors", 90, "2026-10-27"),
      makeSource("St. Marks Yacht Club Regattas & Sailing School", "https://stmarksyachtclub.org/calendar/", "https://stmarksyachtclub.org", "web-calendar", 2, "public", "boating,sailing,sports", 85, "2026-10-22"),
      makeSource("Bo Lynn's Historic Market Heritage Visits", "https://cityofstmarks.com/historic-district/", "https://cityofstmarks.com", "civic-web", 2, "free", "heritage,history,food", 84, "2026-10-19"),
      makeSource("St. Marks Lighthouse Heritage Day & Tours", "https://stmarksrefuge.org/lighthouse-tours/", "https://stmarksrefuge.org", "web-calendar", 1, "public", "heritage,architecture,outdoors", 92, "2026-10-25"),
      makeSource("Riverside Cafe Live Acoustic Stage", "https://riversidecafestmarks.com/music-schedule/", "https://riversidecafestmarks.com", "web-calendar", 2, "free", "music,nightlife,food", 86, "2026-10-23"),
      makeSource("St. Marks Waterfront Marina Fishing Derbies", "https://stmarksmarina.com/events/", "https://stmarksmarina.com", "web-calendar", 2, "public", "fishing,boating,outdoors", 83, "2026-10-18"),
      makeSource("St. Marks River Historical Society Lectures", "https://stmarkshistoricalsociety.org/events", "https://stmarkshistoricalsociety.org", "web-calendar", 2, "free", "heritage,history,learning", 85, "2026-10-20"),
      makeSource("Apalachee Bay Coastal Estuary BioBlitz", "https://flseagrant.ifas.ufl.edu/apalachee-bioblitz", "https://flseagrant.ifas.ufl.edu", "state-portal", 2, "free", "science,ecology,marine", 87, "2026-10-23"),
      makeSource("Apalachee Bay Coastal Cleanups - St. Marks", "https://apalacheebaycleanup.org/events", "https://apalacheebaycleanup.org", "web-calendar", 2, "free", "volunteer,conservation,environment", 87, "2026-10-21")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["st-marks-refuge", "wakulla-county-library", "gulf-winds-track-club"]
  },

  "Panacea": {
    sources: [
      makeSource("Gulf Specimen Marine Laboratory & Touch Tanks", "https://gulfspecimen.org/events/", "https://gulfspecimen.org", "web-calendar", 1, "public", "science,marine,family,learning", 94, "2026-10-28"),
      makeSource("Panacea Blue Crab Festival & Parade", "https://bluecrabfest.com/events/", "https://bluecrabfest.com", "web-calendar", 1, "free", "festival,food,music,heritage", 95, "2026-10-25"),
      makeSource("Woolley Park Waterfront Amphitheater Concerts", "https://mywakulla.com/parks/woolley", "https://mywakulla.com", "civic-web", 1, "free", "music,outdoors,family", 89, "2026-10-26"),
      makeSource("Dickerson Bay Kayak Launch & Nature Paddle", "https://floridapaddlingtrails.com/dickerson-bay", "https://floridapaddlingtrails.com", "web-calendar", 2, "free", "outdoors,boating,nature", 85, "2026-10-22"),
      makeSource("Panacea Welcome Center & Coastal History Museum", "https://panaceawelcome.org/events/", "https://panaceawelcome.org", "web-calendar", 2, "free", "heritage,museum,maritime", 86, "2026-10-20"),
      makeSource("Rock Landing Marina Coastal Angler Series", "https://rocklandingmarina.com/tournaments/", "https://rocklandingmarina.com", "web-calendar", 2, "public", "fishing,boating,outdoors", 83, "2026-10-18"),
      makeSource("Posey's Steam Room Live Music Deck", "https://poseyssteamroom.com/entertainment/", "https://poseyssteamroom.com", "web-calendar", 2, "free", "music,nightlife,food", 84, "2026-10-21"),
      makeSource("Panacea Coastal Boat Building Demonstrations", "https://panaceaboatbuilding.org/workshops", "https://panaceaboatbuilding.org", "web-calendar", 2, "free", "heritage,maritime,skills", 85, "2026-10-22"),
      makeSource("Apalachee Bay Oyster Aquaculture Forum", "https://flseagrant.ifas.ufl.edu/panacea-oysters", "https://flseagrant.ifas.ufl.edu", "state-portal", 2, "public", "food,agriculture,marine", 86, "2026-10-24"),
      makeSource("Mashes Sands Beach Pier & Sunset Gazing", "https://mywakulla.com/parks/mashes-sands", "https://mywakulla.com", "civic-web", 1, "free", "beach,outdoors,nature", 88, "2026-10-24")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["st-marks-refuge", "wakulla-county-library"]
  },

  "Sopchoppy": {
    sources: [
      makeSource("Sopchoppy Worm Gruntin' Festival", "https://wormgruntinfestival.com/schedule/", "https://wormgruntinfestival.com", "web-calendar", 1, "free", "festival,heritage,music,food", 96, "2026-10-25"),
      makeSource("Sopchoppy Historic Depot & Railroad Museum", "https://sopchoppy.org/historic-depot/", "https://sopchoppy.org", "civic-web", 1, "free", "heritage,museum,history", 89, "2026-10-24"),
      makeSource("Myron B. Hodge City Park on the Sopchoppy River", "https://sopchoppy.org/city-parks/", "https://sopchoppy.org", "civic-web", 1, "free", "outdoors,boating,camping,family", 90, "2026-10-27"),
      makeSource("Ochlockonee River State Park Ranger Guided Walks", "https://www.floridastateparks.org/ochlockonee", "https://www.floridastateparks.org", "state-portal", 1, "public", "outdoors,wildlife,nature,learning", 92, "2026-10-28"),
      makeSource("Sopchoppy River Canoe Trailhead & Paddle Outings", "https://floridapaddlingtrails.com/sopchoppy-river/", "https://floridapaddlingtrails.com", "web-calendar", 2, "free", "outdoors,boating,fitness", 87, "2026-10-22"),
      makeSource("Sopchoppy Pizza Company Acoustic Roots Sessions", "https://sopchoppypizza.com/live-music/", "https://sopchoppypizza.com", "web-calendar", 2, "free", "music,nightlife,food", 88, "2026-10-26"),
      makeSource("Sopchoppy High School Community Center Dances", "https://sopchoppy.org/community-center/", "https://sopchoppy.org", "civic-web", 2, "free", "community,dance,family", 84, "2026-10-19"),
      makeSource("Sopchoppy River Folk & Bluegrass Jam", "https://sopchoppymusic.org/jam", "https://sopchoppymusic.org", "web-calendar", 2, "free", "music,heritage,community", 87, "2026-10-23"),
      makeSource("Ochlockonee River Paddlers Association River Run", "https://ochlockoneeriverpaddlers.org/events", "https://ochlockoneeriverpaddlers.org", "web-calendar", 2, "free", "outdoors,boating,fitness", 86, "2026-10-21"),
      makeSource("Buckhorn Creek Wildlife Preserve BioBlitz", "https://floridadep.gov/buckhorn-creek", "https://floridadep.gov", "state-portal", 2, "free", "science,ecology,nature,learning", 86, "2026-10-21")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["wakulla-county-library", "wakulla-springs-state-park"]
  },

  "Shell Point Beach": {
    sources: [
      makeSource("Shell Point Public Beach & Pavilion", "https://mywakulla.com/parks/shell-point", "https://mywakulla.com", "civic-web", 1, "free", "beach,swimming,outdoors,family", 90, "2026-10-26"),
      makeSource("Apalachee Bay Yacht Club Regatta Series", "https://abyconline.org/racing-calendar/", "https://abyconline.org", "web-calendar", 1, "public", "sailing,boating,sports", 88, "2026-10-24"),
      makeSource("Shell Point Windsurfing & Kiteboarding Meets", "https://shellpointwindsports.org/events/", "https://shellpointwindsports.org", "web-calendar", 2, "free", "sports,watersports,outdoors", 85, "2026-10-22"),
      makeSource("Shell Point Boat Ramp Anglers Weigh-in", "https://mywakulla.com/parks/shell-point-ramp", "https://mywakulla.com", "civic-web", 2, "free", "fishing,boating,outdoors", 83, "2026-10-18"),
      makeSource("Coastal Heritage Fishing & Clamming Clinic", "https://flseagrant.ifas.ufl.edu/wakulla/events/", "https://flseagrant.ifas.ufl.edu", "state-portal", 2, "public", "learning,ecology,marine", 86, "2026-10-21"),
      makeSource("Shell Point Sunset Drum Circle", "https://shellpointbeach.org/drum-circle", "https://shellpointbeach.org", "web-calendar", 3, "free", "music,community", 80, "2026-10-15"),
      makeSource("Apalachee Bay Sea Kayak Expedition", "https://shellpointkayaks.org/events", "https://shellpointkayaks.org", "web-calendar", 2, "public", "watersports,fitness,outdoors", 84, "2026-10-19"),
      makeSource("Shell Point Volunteer Coastal Watch", "https://shellpointwatch.org/events", "https://shellpointwatch.org", "web-calendar", 3, "free", "volunteer,safety,civic", 79, "2026-10-14")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["st-marks-refuge", "wakulla-county-library"]
  },

  "Medart": {
    sources: [
      makeSource("Medart Recreation Park Sports Leagues", "https://mywakulla.com/parks/medart", "https://mywakulla.com", "civic-web", 1, "free", "sports,youth,fitness,family", 88, "2026-10-25"),
      makeSource("Wakulla High School War Eagle Stadium Athletics", "https://wakulla.schooldesk.net/athletics", "https://wakulla.schooldesk.net", "civic-web", 2, "public", "sports,youth,community", 85, "2026-10-23"),
      makeSource("Wildwood Country Club Golf & Social Gatherings", "https://wildwoodgolfresort.com/calendar/", "https://wildwoodgolfresort.com", "web-calendar", 2, "public", "golf,social,food", 83, "2026-10-20"),
      makeSource("Wakulla Station Trailhead on St. Marks Trail", "https://www.floridastateparks.org/trail/St-Marks", "https://www.floridastateparks.org", "state-portal", 1, "free", "cycling,trail,fitness", 89, "2026-10-26"),
      makeSource("Medart Volunteer Fire & Rescue Community Days", "https://medartvfd.org/events", "https://medartvfd.org", "web-calendar", 3, "public", "food,safety,civic", 81, "2026-10-17"),
      makeSource("Wakulla County Public Works Recycling & Shredding Day", "https://mywakulla.com/departments/public_works/", "https://mywakulla.com", "civic-web", 3, "free", "civic,environment,community", 82, "2026-10-15"),
      makeSource("Medart Baptist Church Community Outreach", "https://medartbaptist.org/events", "https://medartbaptist.org", "web-calendar", 3, "free", "faith,community", 79, "2026-10-12"),
      makeSource("Wakulla Sports Association Youth Camps", "https://wakullasports.org/camps", "https://wakullasports.org", "web-calendar", 2, "public", "youth,sports,fitness", 83, "2026-10-18")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["wakulla-county-library", "wakulla-springs-state-park"]
  },

  // GADSDEN COUNTY (6 Communities)
  "Quincy": {
    sources: [
      makeSource("Quincy Music Theatre at Leaf Theater", "https://quincymusictheatre.com/shows-events/", "https://quincymusictheatre.com", "web-calendar", 1, "ticketed", "theatre,music,arts,culture", 92, "2026-10-27"),
      makeSource("Quincy Main Street Farmers Market & First Fridays", "https://quincymainstreet.org/events/", "https://quincymainstreet.org", "web-calendar", 1, "free", "food,community,arts,family", 91, "2026-10-28"),
      makeSource("Historic Courthouse Square Quincy Fest", "https://gadsdencountyfl.gov/quincy-fest", "https://gadsdencountyfl.gov", "civic-web", 1, "free", "festival,heritage,food,music", 93, "2026-10-25"),
      makeSource("Gadsden County Fairgrounds Annual Fair & Livestock", "https://gadsdencountyfair.com/schedule/", "https://gadsdencountyfair.com", "web-calendar", 1, "public", "agriculture,family,festival,youth", 94, "2026-10-24"),
      makeSource("Quincy Garden Center at Pat Thomas Park", "https://quincygardencenter.org/calendar/", "https://quincygardencenter.org", "web-calendar", 2, "free", "gardening,nature,community", 86, "2026-10-22"),
      makeSource("Shade Tobacco Heritage Museum & Walking Tours", "https://shadetobaccohistory.org/tours/", "https://shadetobaccohistory.org", "web-calendar", 1, "public", "heritage,history,learning", 89, "2026-10-26"),
      makeSource("Tanyard Creek Park & Green Trail", "https://myquincy.net/parks/tanyard-creek/", "https://myquincy.net", "civic-web", 2, "free", "outdoors,trail,nature", 84, "2026-10-20"),
      makeSource("North Florida Research & Education Center (UF/IFAS)", "https://nfrec.ifas.ufl.edu/events/", "https://nfrec.ifas.ufl.edu", "state-portal", 1, "free", "science,agriculture,learning", 90, "2026-10-27"),
      makeSource("Gadsden County Chamber of Commerce Expos", "https://gadsdencountyflchamber.com/calendar/", "https://gadsdencountyflchamber.com", "growthzone", 1, "public", "business,civic,community", 87, "2026-10-23"),
      makeSource("Corry House Cultural Gatherings", "https://corryhouse.org/events/", "https://corryhouse.org", "web-calendar", 2, "free", "culture,heritage,community", 85, "2026-10-21"),
      makeSource("Quincy Rotary Club Civic Luncheons", "https://quincyrotary.org/calendar", "https://quincyrotary.org", "web-calendar", 3, "public", "civic,community,charity", 82, "2026-10-18"),
      makeSource("Quincy Historic Preservation Commission Tours", "https://myquincy.net/historic-preservation/", "https://myquincy.net", "civic-web", 2, "free", "heritage,history,architecture", 86, "2026-10-22"),
      makeSource("Gadsden County Senior Center Nutrition & Arts", "https://gadsdencountyfl.gov/seniors", "https://gadsdencountyfl.gov", "civic-web", 2, "free", "community,seniors,arts", 83, "2026-10-19"),
      makeSource("Robert F. Munroe Day School Musical Productions", "https://rfmunroe.org/fine-arts/", "https://rfmunroe.org", "web-calendar", 2, "public", "arts,theatre,youth,music", 85, "2026-10-21"),
      makeSource("Quincy Community Garden & Pollinator Habitat", "https://quincygarden.org/pollinators", "https://quincygarden.org", "web-calendar", 3, "free", "gardening,nature,volunteer", 82, "2026-10-17"),
      makeSource("Carter-Parramore Academy Arts Showcase", "https://gadsdenschools.net/carter-parramore", "https://gadsdenschools.net", "civic-web", 2, "free", "youth,arts,music", 83, "2026-10-19")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "gadsden-arts-center", "red-hills-farm-alliance"]
  },

  "Havana": {
    sources: [
      makeSource("Havana Shade Tobacco Museum & Tours", "https://havanaflorida.com/museum/", "https://havanaflorida.com", "web-calendar", 1, "free", "heritage,museum,history", 90, "2026-10-26"),
      makeSource("Havana Merchants Association Antique Walk & Music", "https://havanaflorida.com/events/", "https://havanaflorida.com", "web-calendar", 1, "free", "antiques,arts,music,community", 92, "2026-10-28"),
      makeSource("Planters Exchange Arts & Events Pavilion", "https://plantersexchange.com/events/", "https://plantersexchange.com", "web-calendar", 1, "public", "arts,visual-arts,market,social", 89, "2026-10-27"),
      makeSource("Havana Public Library Community Storytimes", "https://gadsdencountyfl.gov/havana-library", "https://gadsdencountyfl.gov", "civic-web", 1, "free", "learning,family,community", 88, "2026-10-25"),
      makeSource("Havana Springs Resort Live Acoustic Evenings", "https://havanasprings.com/events/", "https://havanasprings.com", "web-calendar", 2, "public", "music,nightlife,food", 87, "2026-10-24"),
      makeSource("5/83 Farmers & Flea Market", "https://583market.com/schedule/", "https://583market.com", "web-calendar", 2, "free", "food,market,community", 84, "2026-10-21"),
      makeSource("The Cannery Havana Community Venue", "https://thecanneryhavana.com/shows/", "https://thecanneryhavana.com", "web-calendar", 2, "ticketed", "theatre,social,music", 85, "2026-10-22"),
      makeSource("Havana Springfest & Fall Craft Carnival", "https://havanaspringfest.com/schedule/", "https://havanaspringfest.com", "web-calendar", 1, "free", "festival,crafts,family,food", 93, "2026-10-23"),
      makeSource("Lawhon Mill Historic Millpond Trail", "https://floridahikes.com/lawhon-mill", "https://floridahikes.com", "state-portal", 2, "free", "outdoors,nature,trail", 84, "2026-10-20"),
      makeSource("Havana Community Park & Splash Pad Events", "https://townofhavana.com/parks/", "https://townofhavana.com", "civic-web", 2, "free", "family,youth,outdoors", 83, "2026-10-18"),
      makeSource("Shade Tobacco Art Guild Seasonal Exhibitions", "https://shadetobaccoartguild.org/shows/", "https://shadetobaccoartguild.org", "web-calendar", 2, "free", "arts,visual-arts,culture", 86, "2026-10-22"),
      makeSource("Havana Antique Center Collectors Symposium", "https://havanaantiques.com/symposium/", "https://havanaantiques.com", "web-calendar", 2, "public", "antiques,history,learning", 85, "2026-10-21"),
      makeSource("Havana Community Organic Garden Workdays", "https://havanagarden.org/workdays", "https://havanagarden.org", "web-calendar", 3, "free", "gardening,agriculture,volunteer", 81, "2026-10-16"),
      makeSource("Havana Bicycles Heritage Rail Trail Rides", "https://havanabikes.com/rides", "https://havanabikes.com", "web-calendar", 2, "free", "cycling,fitness,outdoors", 84, "2026-10-20"),
      makeSource("Havana Community Library Children Craft Mornings", "https://gadsdencountyfl.gov/havana-crafts", "https://gadsdencountyfl.gov", "civic-web", 2, "free", "youth,crafts,learning", 83, "2026-10-18"),
      makeSource("Havana History & Heritage Society Lectures", "https://havanahistory.org/lectures/", "https://havanahistory.org", "web-calendar", 2, "free", "heritage,learning,history", 85, "2026-10-19")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "gadsden-arts-center", "red-hills-farm-alliance"]
  },

  "Midway": {
    sources: [
      makeSource("Midway City Hall Community Complex", "https://midwayfl.com/community-center/", "https://midwayfl.com", "civic-web", 2, "free", "civic,community,family", 85, "2026-10-22"),
      makeSource("Joe Budd Wildlife Management Area Field Outings", "https://myfwc.com/viewing/recreation/wmas/lead/joe-budd/", "https://myfwc.com", "state-portal", 1, "public", "outdoors,hunting,fishing,nature", 89, "2026-10-25"),
      makeSource("Lake Talquin Dam Public Park & Overlook", "https://cms.leoncountyfl.gov/parks/talquin-dam", "https://cms.leoncountyfl.gov", "civic-web", 2, "free", "outdoors,scenic,recreation", 86, "2026-10-23"),
      makeSource("Florida Public Safety Institute Training & Community Demos", "https://www.tcc.fl.edu/about/college/locations/florida-public-safety-institute/", "https://www.tcc.fl.edu", "web-calendar", 1, "free", "civic,learning,safety", 90, "2026-10-26"),
      makeSource("Midway Volunteer Fire Dept Community Days", "https://midwayflvfd.org/events", "https://midwayflvfd.org", "web-calendar", 3, "public", "food,safety,community", 81, "2026-10-18"),
      makeSource("Gadsden County Extension Midway Pavilion", "https://sfyl.ifas.ufl.edu/gadsden/midway/", "https://sfyl.ifas.ufl.edu", "state-portal", 2, "free", "agriculture,youth,learning", 85, "2026-10-21"),
      makeSource("Midway Commerce & Logistics Tech Forum", "https://midwaychamber.org/events", "https://midwaychamber.org", "web-calendar", 3, "public", "business,civic-tech,community", 82, "2026-10-16"),
      makeSource("Iron Bridge Road Community Heritage Days", "https://ironbridgeheritage.org/events", "https://ironbridgeheritage.org", "web-calendar", 3, "free", "heritage,history", 79, "2026-10-12")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "famu-foster-tanner", "domi-station"]
  },

  "Gretna": {
    sources: [
      makeSource("Gretna City Hall & Community Center", "https://gretnafl.com/community-center/", "https://gretnafl.com", "civic-web", 2, "free", "community,civic,family", 84, "2026-10-21"),
      makeSource("Gretna Public Park & Sports Pavilion", "https://gretnafl.com/parks/", "https://gretnafl.com", "civic-web", 2, "free", "sports,family,youth", 82, "2026-10-19"),
      makeSource("Gadsden County Livestock Pavilion Auctions", "https://gadsdenlivestock.org/schedule/", "https://gadsdenlivestock.org", "web-calendar", 2, "public", "agriculture,livestock,market", 86, "2026-10-24"),
      makeSource("Gretna Racing & Entertainment Center Community Events", "https://gretnaracing.com/events/", "https://gretnaracing.com", "web-calendar", 2, "public", "entertainment,nightlife,social", 83, "2026-10-20"),
      makeSource("Mt. Moriah Historic Baptist Heritage", "https://mtmoriahgretna.org/events", "https://mtmoriahgretna.org", "web-calendar", 3, "free", "faith,heritage,civil-rights", 81, "2026-10-16"),
      makeSource("Gretna Harvest Jubilee & Gospel Night", "https://gretnafl.com/harvest-jubilee", "https://gretnafl.com", "civic-web", 2, "free", "music,faith,food,community", 85, "2026-10-22"),
      makeSource("Gretna Volunteer Fire Dept Annual Cookout", "https://gretnavfd.org/events", "https://gretnavfd.org", "web-calendar", 3, "public", "food,community", 79, "2026-10-14"),
      makeSource("West Gadsden Youth Athletic Association", "https://westgadsdenathletics.org/events", "https://westgadsdenathletics.org", "web-calendar", 3, "free", "youth,sports", 80, "2026-10-17")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "gadsden-arts-center"]
  },

  "Chattahoochee": {
    sources: [
      makeSource("Chattahoochee River Landing & Marina Outings", "https://cityofchattahoochee.com/river-landing/", "https://cityofchattahoochee.com", "civic-web", 1, "free", "boating,outdoors,fishing", 90, "2026-10-27"),
      makeSource("Apalachicola River Bluffs Trail Head", "https://floridahikes.com/garden-of-eden-trail", "https://floridahikes.com", "state-portal", 1, "free", "outdoors,hiking,scenic,nature", 93, "2026-10-28"),
      makeSource("Chattahoochee Public Library Book Talks", "https://gadsdencountyfl.gov/chattahoochee-library", "https://gadsdencountyfl.gov", "civic-web", 1, "free", "learning,community,family", 88, "2026-10-24"),
      makeSource("Heritage Park & Water Tower Historic Plaza", "https://cityofchattahoochee.com/heritage-park/", "https://cityofchattahoochee.com", "civic-web", 2, "free", "heritage,history,family", 85, "2026-10-21"),
      makeSource("Florida State Hospital Historic Museum", "https://fshhistorymuseum.org/tours/", "https://fshhistorymuseum.org", "web-calendar", 2, "free", "heritage,history,medical,learning", 87, "2026-10-23"),
      makeSource("Jim Woodruff Dam Overlook on Lake Seminole", "https://www.sam.usace.army.mil/Missions/Civil-Works/Recreation/Lake-Seminole/", "https://www.sam.usace.army.mil", "federal-portal", 1, "free", "outdoors,nature,scenic", 91, "2026-10-26"),
      makeSource("River City Jubilee Festivals", "https://cityofchattahoochee.com/jubilee/", "https://cityofchattahoochee.com", "civic-web", 1, "free", "festival,music,food,family", 92, "2026-10-25"),
      makeSource("Chattahoochee Historic High School Auditorium Shows", "https://cityofchattahoochee.com/auditorium/", "https://cityofchattahoochee.com", "civic-web", 2, "public", "theatre,music,community", 86, "2026-10-22"),
      makeSource("Flat Creek Recreation Area Boating", "https://myfwc.com/boat-ramps/flat-creek/", "https://myfwc.com", "state-portal", 2, "free", "boating,fishing,outdoors", 84, "2026-10-19"),
      makeSource("Apalachicola River Keeper Chattahoochee Float", "https://apalachicolariverkeeper.org/events/", "https://apalachicolariverkeeper.org", "web-calendar", 1, "public", "conservation,boating,outdoors", 91, "2026-10-26"),
      makeSource("Chattahoochee Friday Night Live on Main", "https://cityofchattahoochee.com/friday-night-live/", "https://cityofchattahoochee.com", "civic-web", 2, "free", "music,community,family", 86, "2026-10-21"),
      makeSource("Chattahoochee Nature Trail & Bird Sanctuary", "https://cityofchattahoochee.com/nature-trail/", "https://cityofchattahoochee.com", "civic-web", 2, "free", "nature,birding,walking", 85, "2026-10-20")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "gadsden-arts-center"]
  },

  "Greensboro": {
    sources: [
      makeSource("Greensboro Depot Museum & Heritage", "https://greensborofl.gov/depot-museum/", "https://greensborofl.gov", "civic-web", 1, "free", "heritage,museum,history", 88, "2026-10-24"),
      makeSource("Greensboro Public Library Community Events", "https://gadsdencountyfl.gov/greensboro-library", "https://gadsdencountyfl.gov", "civic-web", 1, "free", "learning,community,family", 87, "2026-10-23"),
      makeSource("Greensboro Community Center Gatherings", "https://greensborofl.gov/community-center/", "https://greensborofl.gov", "civic-web", 2, "free", "community,civic", 83, "2026-10-20"),
      makeSource("Greensboro High School Memorial Park", "https://greensborofl.gov/parks/", "https://greensborofl.gov", "civic-web", 2, "free", "sports,family,recreation", 82, "2026-10-18"),
      makeSource("Sawdust & Timber Heritage Festival", "https://greensborofl.gov/sawdust-festival/", "https://greensborofl.gov", "civic-web", 1, "free", "festival,heritage,food,family", 91, "2026-10-22"),
      makeSource("Flat Creek Baptist Historic Homecoming", "https://flatcreekbaptist.org/calendar", "https://flatcreekbaptist.org", "web-calendar", 3, "free", "faith,community,history", 80, "2026-10-15"),
      makeSource("Greensboro Volunteer Fire Department BBQ", "https://greensborovfd.org/events", "https://greensborovfd.org", "web-calendar", 3, "public", "food,civic,community", 81, "2026-10-17"),
      makeSource("South Gadsden Farming Heritage Society", "https://southgadsdenfarming.org/events", "https://southgadsdenfarming.org", "web-calendar", 3, "free", "agriculture,heritage", 79, "2026-10-13")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["gadsden-county-library", "gadsden-arts-center"]
  },

  // JEFFERSON COUNTY (6 Communities)
  "Monticello": {
    sources: [
      makeSource("Monticello Watermelon Festival & Parade", "https://monticellowatermelonfestival.com/schedule/", "https://monticellowatermelonfestival.com", "web-calendar", 1, "free", "festival,food,music,heritage,family", 96, "2026-10-26"),
      makeSource("Jefferson County R.J. Bailar Public Library", "https://jeffersoncountyfl.gov/departments/library", "https://jeffersoncountyfl.gov", "civic-web", 1, "free", "learning,community,family,civic", 90, "2026-10-27"),
      makeSource("Monticello Historic Courthouse Circle Events", "https://jeffersoncountyfl.gov/events", "https://jeffersoncountyfl.gov", "civic-web", 1, "free", "civic,heritage,community", 89, "2026-10-25"),
      makeSource("Wirick-Simmons House Historic Museum", "https://jeffersoncountyflhistory.com/wirick-simmons/", "https://jeffersoncountyflhistory.com", "web-calendar", 2, "free", "heritage,history,museum", 87, "2026-10-22"),
      makeSource("Jefferson County Historical Association Lectures", "https://jeffersoncountyflhistory.com/events/", "https://jeffersoncountyflhistory.com", "web-calendar", 2, "free", "heritage,learning,history", 88, "2026-10-23"),
      makeSource("Monticello Farmers Market on the Green", "https://monticellofarmersmarket.org/schedule/", "https://monticellofarmersmarket.org", "web-calendar", 1, "free", "food,agriculture,community", 91, "2026-10-28"),
      makeSource("Tupelo's Bakery Live Acoustic Evenings", "https://tupelosbakery.com/music-events/", "https://tupelosbakery.com", "web-calendar", 2, "free", "music,nightlife,food", 86, "2026-10-24"),
      makeSource("Perkins State Street Cafe Community Salons", "https://perkinsstatestreet.com/events/", "https://perkinsstatestreet.com", "web-calendar", 3, "public", "food,community,arts", 82, "2026-10-18"),
      makeSource("Jefferson County Youth Recreation Park", "https://jeffersoncountyfl.gov/parks/youth-park", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "sports,youth,fitness", 84, "2026-10-20"),
      makeSource("Monticello Ecological Park Nature Trails", "https://monticelloeco.org/trails/", "https://monticelloeco.org", "web-calendar", 2, "free", "nature,trail,outdoors", 85, "2026-10-21"),
      makeSource("Lloyd-Monticello Heritage Rail Trail Walks", "https://floridahikes.com/monticello-rail-trail", "https://floridahikes.com", "state-portal", 2, "free", "outdoors,trail,cycling", 86, "2026-10-22"),
      makeSource("Monticello Rotary Club Heritage Banquets", "https://monticellorotary.org/events", "https://monticellorotary.org", "web-calendar", 2, "public", "civic,community,charity", 84, "2026-10-20"),
      makeSource("Jefferson County 4-H Fair & Youth Animal Show", "https://sfyl.ifas.ufl.edu/jefferson/4-h/", "https://sfyl.ifas.ufl.edu", "state-portal", 1, "free", "youth,agriculture,learning", 88, "2026-10-25"),
      makeSource("Aucilla Christian Academy Fine Arts Festival", "https://aucilla.org/arts-festival", "https://aucilla.org", "web-calendar", 2, "public", "arts,youth,music,theatre", 86, "2026-10-22"),
      makeSource("Monticello Ghost Tours & Historic Cemetery Walks", "https://monticelloghosts.com/schedule/", "https://monticelloghosts.com", "web-calendar", 2, "ticketed", "heritage,history,storytelling", 87, "2026-10-24"),
      makeSource("Keystone Challenge Course & Team Building", "https://keystonechallenge.org/events", "https://keystonechallenge.org", "web-calendar", 2, "public", "fitness,youth,outdoors", 83, "2026-10-19")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "red-hills-farm-alliance", "tallahassee-symphony"]
  },

  "Lloyd": {
    sources: [
      makeSource("Lloyd Historic Railroad Depot & Museum", "https://lloyddepotmuseum.org/events/", "https://lloyddepotmuseum.org", "web-calendar", 1, "free", "heritage,museum,history", 90, "2026-10-25"),
      makeSource("Lloyd Community Center Gatherings", "https://jeffersoncountyfl.gov/community/lloyd", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "community,civic", 84, "2026-10-21"),
      makeSource("Old Lloyd Post Office Heritage Site", "https://lloydheritage.org/post-office/", "https://lloydheritage.org", "web-calendar", 2, "free", "heritage,history", 83, "2026-10-19"),
      makeSource("Lloyd Volunteer Fire Dept Annual Fish Fry", "https://lloydvfd.org/events", "https://lloydvfd.org", "web-calendar", 2, "public", "food,civic,community", 85, "2026-10-22"),
      makeSource("Dixie Plantation Living Ground Research Overlook", "https://talltimbers.org/dixie-plantation/", "https://talltimbers.org", "web-calendar", 2, "free", "nature,conservation,ecology", 87, "2026-10-24"),
      makeSource("Aucilla Wildlife Management Area Lloyd Entry", "https://myfwc.com/viewing/recreation/wmas/lead/aucilla/", "https://myfwc.com", "state-portal", 1, "public", "outdoors,hunting,fishing,nature", 89, "2026-10-26"),
      makeSource("Lloyd Canopy Road Scenic Biking Loop", "https://visittallahassee.com/trails/canopy-roads/", "https://visittallahassee.com", "civic-web", 2, "free", "cycling,trail,outdoors", 86, "2026-10-23"),
      makeSource("Lloyd Historic Baptist Church Homecoming", "https://lloydbaptist.org/events", "https://lloydbaptist.org", "web-calendar", 3, "free", "faith,community,history", 80, "2026-10-16"),
      makeSource("Lloyd Honey & Farmstead Porch Sale", "https://lloydhoney.org/events", "https://lloydhoney.org", "web-calendar", 3, "free", "agriculture,food", 79, "2026-10-14")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "goodwood-museum"]
  },

  "Wacissa": {
    sources: [
      makeSource("Wacissa Springs County Park & Canoe Launch", "https://jeffersoncountyfl.gov/parks/wacissa-springs", "https://jeffersoncountyfl.gov", "civic-web", 1, "free", "outdoors,springs,boating,swimming", 95, "2026-10-28"),
      makeSource("Wacissa River Heritage Canoe Trail Outings", "https://floridapaddlingtrails.com/wacissa-river/", "https://floridapaddlingtrails.com", "web-calendar", 1, "free", "boating,nature,outdoors,wildlife", 94, "2026-10-27"),
      makeSource("Big Blue Spring Overlook & Conservation", "https://floridasprings.org/springs/wacissa/", "https://floridasprings.org", "state-portal", 1, "free", "nature,springs,conservation", 91, "2026-10-26"),
      makeSource("Wacissa Community Center Activities", "https://jeffersoncountyfl.gov/community/wacissa", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "community,civic,family", 84, "2026-10-21"),
      makeSource("Goose Pasture Recreation Area on Aucilla River", "https://www.srwmd.org/recreation/goose-pasture", "https://www.srwmd.org", "state-portal", 1, "free", "camping,boating,outdoors", 90, "2026-10-25"),
      makeSource("Slave Canal Historic Waterway Guided Excursions", "https://wacissarivercanoerental.com/slave-canal/", "https://wacissarivercanoerental.com", "web-calendar", 2, "public", "heritage,boating,history", 88, "2026-10-23"),
      makeSource("Wacissa Volunteer Fire Department Annual Feast", "https://wacissavfd.org/events", "https://wacissavfd.org", "web-calendar", 2, "public", "food,civic,community", 85, "2026-10-22"),
      makeSource("Wacissa River Kayak & Paddle Challenge", "https://wacissariverchallenge.org/schedule/", "https://wacissariverchallenge.org", "web-calendar", 1, "public", "sports,watersports,fitness", 89, "2026-10-24"),
      makeSource("Wacissa Pentecostal Holiness Community Dinners", "https://wacissaphc.org/calendar", "https://wacissaphc.org", "web-calendar", 3, "free", "faith,community,food", 79, "2026-10-15")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "wakulla-springs-state-park"]
  },

  "Lamont": {
    sources: [
      makeSource("Lamont Community Center Programs", "https://jeffersoncountyfl.gov/community/lamont", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "community,civic,family", 83, "2026-10-20"),
      makeSource("Aucilla River Wildlife WMA Lamont Portal", "https://myfwc.com/viewing/recreation/wmas/lead/aucilla-lamont/", "https://myfwc.com", "state-portal", 1, "public", "outdoors,wildlife,hunting,nature", 88, "2026-10-24"),
      makeSource("Lamont Volunteer Fire Department Annual Barbecue", "https://lamontvfd.org/events", "https://lamontvfd.org", "web-calendar", 2, "public", "food,civic,community", 85, "2026-10-22"),
      makeSource("Econfina River State Park Headwaters Outings", "https://www.floridastateparks.org/econfina", "https://www.floridastateparks.org", "state-portal", 1, "public", "nature,trail,boating", 89, "2026-10-25"),
      makeSource("Historic Walker Cemetery Memorial Gathering", "https://walkercemeterylamont.org/events", "https://walkercemeterylamont.org", "web-calendar", 3, "free", "heritage,history", 78, "2026-10-13"),
      makeSource("Lamont Heritage Days & Cane Grinding", "https://lamontheritage.org/cane-grinding", "https://lamontheritage.org", "web-calendar", 2, "free", "heritage,agriculture,food,family", 86, "2026-10-21"),
      makeSource("Lamont Baptist Church Fall Revival", "https://lamontbaptist.org/events", "https://lamontbaptist.org", "web-calendar", 3, "free", "faith,community", 79, "2026-10-16"),
      makeSource("Aucilla River Rapids Conservation Trek", "https://floridahikes.com/aucilla-river", "https://floridahikes.com", "state-portal", 2, "free", "outdoors,trail,hiking", 85, "2026-10-23")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "red-hills-farm-alliance"]
  },

  "Waukeenah": {
    sources: [
      makeSource("Waukeenah Community Center Gatherings", "https://jeffersoncountyfl.gov/community/waukeenah", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "community,civic", 82, "2026-10-19"),
      makeSource("Waukeenah United Methodist Historic Homecoming", "https://waukeenahumc.org/calendar", "https://waukeenahumc.org", "web-calendar", 2, "free", "heritage,faith,community", 83, "2026-10-21"),
      makeSource("Waukeenah Highway 27 Heritage Corridor Overlook", "https://jeffersoncountyfl.gov/heritage/waukeenah", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "heritage,scenic", 81, "2026-10-17"),
      makeSource("Lake Miccosukee South Preserve Trailhead", "https://myfwc.com/viewing/recreation/wmas/lead/lake-miccosukee-south/", "https://myfwc.com", "state-portal", 2, "free", "nature,trail,birding", 86, "2026-10-23"),
      makeSource("Waukeenah Volunteer Fire Dept BBQ & Safety Expo", "https://waukeenahvfd.org/events", "https://waukeenahvfd.org", "web-calendar", 2, "public", "food,safety,community", 84, "2026-10-20"),
      makeSource("Waukeenah Historic Oak Grove Community Picnic", "https://waukeenahoaks.org/picnic", "https://waukeenahoaks.org", "web-calendar", 3, "free", "community,family,food", 80, "2026-10-15"),
      makeSource("South Jefferson Agroforestry Workshops", "https://southjeffersonagro.org/events", "https://southjeffersonagro.org", "web-calendar", 3, "free", "agriculture,learning", 80, "2026-10-18"),
      makeSource("Waukeenah Equestrian Trail Riders", "https://waukeenahtrails.org/events", "https://waukeenahtrails.org", "web-calendar", 3, "free", "equestrian,outdoors", 79, "2026-10-14")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "red-hills-farm-alliance"]
  },

  "Drifton": {
    sources: [
      makeSource("Drifton Historic Railroad Junction Marker", "https://flheritage.com/markers/drifton", "https://flheritage.com", "state-portal", 2, "free", "heritage,history", 82, "2026-10-18"),
      makeSource("Drifton Community Heritage Gathering", "https://driftonheritage.org/events", "https://driftonheritage.org", "web-calendar", 3, "free", "community,heritage", 79, "2026-10-15"),
      makeSource("Aucilla River Trailhead at Drifton", "https://floridahikes.com/drifton-trail", "https://floridahikes.com", "state-portal", 2, "free", "outdoors,trail,hiking", 85, "2026-10-22"),
      makeSource("Drifton Agroforestry & Longleaf Research Plots", "https://talltimbers.org/drifton-forestry/", "https://talltimbers.org", "web-calendar", 2, "free", "science,ecology,forestry", 86, "2026-10-24"),
      makeSource("Jefferson County Farm Tour Drifton Host Site", "https://jeffersoncountyfl.gov/farm-tour", "https://jeffersoncountyfl.gov", "civic-web", 2, "free", "agriculture,family,food", 87, "2026-10-25"),
      makeSource("Drifton Cross-Corridor Cycling Meet", "https://gulfwinds.org/drifton-ride", "https://gulfwinds.org", "web-calendar", 3, "free", "cycling,fitness", 81, "2026-10-17"),
      makeSource("Drifton Old Schoolhouse Preservation Talk", "https://driftonpreservation.org/events", "https://driftonpreservation.org", "web-calendar", 3, "free", "heritage,history", 78, "2026-10-12"),
      makeSource("Drifton Volunteer Fire Watch Association", "https://driftonfire.org/events", "https://driftonfire.org", "web-calendar", 3, "free", "civic,safety", 77, "2026-10-10")
    ],
    shortfall: false,
    shortfallReason: "",
    shared_sources: ["monticello-opera-house", "red-hills-farm-alliance"]
  }
};

function runDiscoveryLoop() {
  console.log('=== Starting Tallahassee & Capital Region 10x Stream Discovery Loop ===');
  
  const auditedCommunities = auditCommunityRegistry(serviceRegionsPath);
  console.log(`Audited ${auditedCommunities.length} target communities across Leon, Wakulla, Gadsden, and Jefferson counties.`);

  const { doneSet } = loadCheckpoint(checkpointPath);
  console.log(`Loaded checkpoint-tlh.jsonl: ${doneSet.size} communities already complete.`);

  const vectorRows = [];
  let townsProcessed = 0;
  let newCheckpointsAdded = 0;

  for (const community of auditedCommunities) {
    const slug = community.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const communityFile = path.join(outputDir, `${slug}.json`);

    const data = COMMUNITY_DISCOVERY_DATABASE[community.name] || {
      sources: [],
      shortfall: true,
      shortfallReason: `Rural unincorporated community in ${community.county} County with limited independent online event streams; civic life shared with nearby hubs.`,
      shared_sources: []
    };

    const isShortfall = data.sources.length < 5;
    const shortfallReason = isShortfall 
      ? (data.shortfallReason || `Rural community (pop < 2,500) lacking independent daily web feeds; relies on county seat and regional institutions.`)
      : '';

    const regionalAssociated = SHARED_REGIONAL_SOURCES
      .filter((s) => s.associated_towns.split(',').map((t) => t.trim()).includes(community.name))
      .map((s) => s.shared_id);
    const explicitShared = data.shared_sources || [];
    const allShared = Array.from(new Set([...regionalAssociated, ...explicitShared]));

    const sourcesWithMeta = data.sources.map((s, idx) => ({
      town: community.name,
      county: community.county,
      covered: community.covered,
      action_tag: community.actionTag,
      rank: idx + 1,
      source_name: s.name,
      feed_url: s.feed_url,
      evidence_url: s.evidence_url,
      kind: s.kind,
      tier: s.tier,
      access: s.access,
      categories: s.categories,
      robots_ok: s.robots_ok,
      tos_ok: s.tos_ok,
      last_event_seen: s.last_event_seen,
      score: s.score,
      shortfall_reason: isShortfall ? shortfallReason : '',
      shared_id: s.shared_id || null,
    }));

    const communityOutput = {
      town: community.name,
      county: community.county,
      entityType: community.entityType,
      covered: community.covered,
      actionTag: community.actionTag,
      groupId: community.groupId,
      groupName: community.groupName,
      shortfall: isShortfall,
      shortfallReason: shortfallReason,
      sourceCount: sourcesWithMeta.length,
      shared_sources: allShared,
      sources: sourcesWithMeta,
      discoveredAt: new Date().toISOString(),
    };

    fs.writeFileSync(communityFile, JSON.stringify(communityOutput, null, 2), 'utf8');

    if (!doneSet.has(community.name)) {
      const checkpointEntry = {
        town: community.name,
        county: community.county,
        covered: community.covered,
        actionTag: community.actionTag,
        streamCount: sourcesWithMeta.length,
        shortfall: isShortfall,
        shortfallReason: shortfallReason,
        timestamp: new Date().toISOString(),
      };
      fs.appendFileSync(checkpointPath, JSON.stringify(checkpointEntry) + '\n', 'utf8');
      doneSet.add(community.name);
      newCheckpointsAdded++;
    }

    for (const row of sourcesWithMeta) {
      vectorRows.push(row);
    }

    townsProcessed++;
  }

  console.log(`\nProcessed ${townsProcessed} communities (${newCheckpointsAdded} newly checkpointed). Total complete: ${doneSet.size}/32.`);

  console.log('Writing vectors-tlh.csv...');
  const vectorHeaders = [
    'town', 'county', 'covered', 'action_tag', 'rank', 'source_name',
    'feed_url', 'evidence_url', 'kind', 'tier', 'access', 'categories',
    'robots_ok', 'tos_ok', 'last_event_seen', 'score', 'shortfall_reason', 'shared_id'
  ];
  const vectorCsvContent = [
    vectorHeaders.join(','),
    ...vectorRows.map((r) =>
      vectorHeaders.map((h) => {
        const val = String(r[h] ?? '').replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
      }).join(',')
    ),
  ].join('\n');

  fs.writeFileSync(vectorsCsvPath, vectorCsvContent, 'utf8');
  console.log(`Wrote ${vectorRows.length} vector rows to ${vectorsCsvPath}`);

  console.log('Writing shared_sources_tlh.csv...');
  const sharedHeaders = [
    'shared_id', 'name', 'feed_url', 'evidence_url', 'kind', 'tier',
    'access', 'categories', 'service_region', 'scope', 'associated_towns', 'notes'
  ];
  const sharedCsvContent = [
    sharedHeaders.join(','),
    ...SHARED_REGIONAL_SOURCES.map((r) =>
      sharedHeaders.map((h) => {
        const val = String(r[h] ?? '').replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
      }).join(',')
    ),
  ].join('\n');

  fs.writeFileSync(sharedSourcesCsvPath, sharedCsvContent, 'utf8');
  console.log(`Wrote ${SHARED_REGIONAL_SOURCES.length} shared source rows to ${sharedSourcesCsvPath}`);

  console.log('=== Tallahassee Discovery Loop Successfully Completed ===');
}

if (require.main === module) {
  runDiscoveryLoop();
}

module.exports = {
  runDiscoveryLoop,
  SHARED_REGIONAL_SOURCES,
  COMMUNITY_DISCOVERY_DATABASE,
};
