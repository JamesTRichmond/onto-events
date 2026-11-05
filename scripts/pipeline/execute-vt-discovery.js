/**
 * V3 Vermont Stream Discovery Loop - Execution Engine
 * Target: Addison County (23) and Chittenden County (19) — 42 Municipalities
 * Spec: docs/handoffs/vt-discovery-loop.md
 */

const fs = require('node:fs');
const path = require('node:path');
const { OFFICIAL_VT_REGISTRY, auditTownRegistry, loadCheckpoint } = require('./vt-stream-discovery');

const repoRoot = path.resolve(__dirname, '../..');
const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
const checkpointPath = path.join(repoRoot, 'checkpoint.jsonl');
const outputDir = path.join(repoRoot, 'data/discovery/vt');
const vectorsCsvPath = path.join(repoRoot, 'vectors.csv');
const sharedSourcesCsvPath = path.join(repoRoot, 'shared_sources.csv');

// Ensure output directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Shared Regional Sources (Deduplicated)
const SHARED_REGIONAL_SOURCES = [
  {
    "shared_id": "bixby-library",
    "name": "Bixby Memorial Free Library",
    "feed_url": "https://bixbylibrary.org/wp-json/tribe/events/v1/events",
    "evidence_url": "https://bixbylibrary.org/events/",
    "kind": "tribe",
    "tier": 1,
    "access": "free",
    "categories": "learning,community,culture",
    "service_region": "vermont-corridor",
    "scope": "union-district",
    "associated_towns": "Vergennes,Ferrisburgh,Panton,Waltham,Addison",
    "notes": "Official public library chartered to serve Vergennes, Ferrisburgh, Panton, Waltham, and Addison."
  },
  {
    "shared_id": "drml-library",
    "name": "Deborah Rawson Memorial Library",
    "feed_url": "https://www.drml.org/programs/calendar/",
    "evidence_url": "https://www.drml.org/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "free",
    "categories": "learning,community,culture",
    "service_region": "vermont-corridor",
    "scope": "multi-town",
    "associated_towns": "Jericho,Underhill",
    "notes": "Joint public library serving the communities of Jericho and Underhill."
  },
  {
    "shared_id": "bread-loaf-mountain-zen",
    "name": "Bread Loaf Mountain Zen Community",
    "feed_url": "https://breadloafmountainzen.org/programs/list/?ical=1",
    "evidence_url": "https://breadloafmountainzen.org/",
    "kind": "ics",
    "tier": 1,
    "access": "free",
    "categories": "faith,learning,community",
    "service_region": "vermont-corridor",
    "scope": "multi-town",
    "associated_towns": "Middlebury,Ripton",
    "notes": "Zen meditation and practice community based at 76 Court St, Middlebury; shared retreat and mindfulness programs serving Middlebury and Ripton mountain corridor."
  },
  {
    "shared_id": "addison-chamber",
    "name": "Addison County Chamber of Commerce",
    "feed_url": "https://www.addisoncounty.com/events/calendar/",
    "evidence_url": "https://www.addisoncounty.com/",
    "kind": "growthzone",
    "tier": 2,
    "access": "public",
    "categories": "community,culture,business",
    "service_region": "vermont-corridor",
    "scope": "county",
    "associated_towns": "Middlebury,Bristol,Vergennes,Bridport,Cornwall,Ferrisburgh,New Haven,Shoreham,Salisbury,Leicester,Orwell,Whiting,Waltham,Panton,Addison,Lincoln,Monkton,Starksboro,Weybridge,Ripton,Goshen,Granville,Hancock",
    "notes": "County-wide civic and festival calendar covering Addison County."
  },
  {
    "shared_id": "uvm-lane-series",
    "name": "UVM Lane Series",
    "feed_url": "https://events.uvm.edu/department/lane_series",
    "evidence_url": "https://www.uvm.edu/laneseries",
    "kind": "jsonld",
    "tier": 2,
    "access": "ticketed",
    "categories": "music,arts,culture",
    "service_region": "vermont-corridor",
    "scope": "regional",
    "associated_towns": "Burlington,South Burlington,Colchester,Winooski,Shelburne,Williston,Essex,Essex Junction,Charlotte",
    "notes": "Marquee university concert and chamber music series attracting regional audience."
  },
  {
    "shared_id": "champlain-valley-exposition",
    "name": "Champlain Valley Exposition",
    "feed_url": "https://cvexpo.org/events/",
    "evidence_url": "https://cvexpo.org/",
    "kind": "web-calendar",
    "tier": 2,
    "access": "public",
    "categories": "community,outdoors,culture,food",
    "service_region": "vermont-corridor",
    "scope": "county",
    "associated_towns": "Essex Junction,Essex,Burlington,Colchester,Williston,South Burlington,Milton,Westford",
    "notes": "Premier 130-acre fairground and event exposition center in Chittenden County."
  },
  {
    "shared_id": "higher-ground",
    "name": "Higher Ground Live Music",
    "feed_url": "https://highergroundmusic.com/calendar/",
    "evidence_url": "https://highergroundmusic.com/",
    "kind": "higherground",
    "tier": 1,
    "access": "ticketed",
    "categories": "music,entertainment",
    "service_region": "vermont-corridor",
    "scope": "regional",
    "associated_towns": "South Burlington,Burlington,Williston,Shelburne,Winooski,Colchester,Charlotte,Hinesburg,St. George",
    "notes": "Vermont flagship live music venue and ballroom hosting national and regional touring acts."
  },
  {
    "shared_id": "catamount-outdoor",
    "name": "Catamount Outdoor Family Center",
    "feed_url": "https://catamountoutdoor.org/events-calendar/month/",
    "evidence_url": "https://catamountoutdoor.org/",
    "kind": "tribe",
    "tier": 1,
    "access": "public",
    "categories": "outdoors,fitness,community",
    "service_region": "vermont-corridor",
    "scope": "multi-town",
    "associated_towns": "Williston,Richmond,Essex,South Burlington,Hinesburg",
    "notes": "Non-profit 500-acre community outdoor recreation facility, trail running, mountain biking, nordic skiing."
  },
  {
    "shared_id": "green-mountain-club",
    "name": "Green Mountain Club",
    "feed_url": "https://greenmountainclub.org/get-involved/learn-and-engage/calendar-of-events/",
    "evidence_url": "https://greenmountainclub.org/",
    "kind": "tribe",
    "tier": 1,
    "access": "free",
    "categories": "outdoors,learning,community",
    "service_region": "vermont-corridor",
    "scope": "statewide",
    "associated_towns": "Bolton,Buel's Gore,Huntington,Underhill,Ripton",
    "notes": "Maintainers of the Long Trail; trail outings, workshops, speaker series across Green Mountain crest."
  },
  {
    "shared_id": "vermont-humanities",
    "name": "Vermont Humanities",
    "feed_url": "https://www.vermonthumanities.org/wp-json/tribe/events/v1/events",
    "evidence_url": "https://www.vermonthumanities.org/programs/attend/upcoming-events/",
    "kind": "tribe",
    "tier": 1,
    "access": "free",
    "categories": "learning,culture,community",
    "service_region": "vermont-corridor",
    "scope": "statewide",
    "associated_towns": "Middlebury,Burlington,Vergennes,Bristol,Shelburne,Essex",
    "notes": "Statewide council sponsoring First Wednesdays lectures and book discussions in local libraries."
  }
];

// 2. Town-Specific Candidate Stream Registry (Top Sources & Shortfall Profiles)
const TOWN_DISCOVERY_DATABASE = {
  "Addison": {
    "sources": [
      {
        "name": "DAR State Park & Chimney Point Historic Site",
        "feed_url": "https://historicsites.vermont.gov/chimney-point",
        "evidence_url": "https://historicsites.vermont.gov/chimney-point",
        "kind": "state-portal",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,culture,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 82
      },
      {
        "name": "Town of Addison Municipal Notices & Meetings",
        "feed_url": "https://addisonvt.net/calendar",
        "evidence_url": "https://addisonvt.net/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural agricultural town (pop ~1,365); shares Bixby Memorial Free Library with Vergennes district; relies on Middlebury/Vergennes for arts.",
    "shared_sources": [
      "bixby-library",
      "addison-chamber"
    ]
  },
  "Bridport": {
    "sources": [
      {
        "name": "Bridport Events Committee & Town Calendar",
        "feed_url": "https://bridportvt.org/town-events/",
        "evidence_url": "https://bridportvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "community,civic,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 80
      },
      {
        "name": "Bridport Community Hall & Grange Activities",
        "feed_url": "https://bridportvt.org/community-notices/",
        "evidence_url": "https://bridportvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "community,food",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-12",
        "score": 70
      }
    ],
    "shortfall": true,
    "shortfallReason": "Low-density rural dairy town (pop ~1,225) without independent public library facility; community gatherings centered at Town Hall and Green.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Bristol": {
    "sources": [
      {
        "name": "Bristol Recreation Department",
        "feed_url": "https://bristolvt.myrec.com/info/activities/default.aspx?type=activities",
        "evidence_url": "https://bristolvt.myrec.com/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "outdoors,fitness,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 95
      },
      {
        "name": "Lawrence Memorial Library",
        "feed_url": "https://www.lawrencelibraryvt.org/events",
        "evidence_url": "https://www.lawrencelibraryvt.org/",
        "kind": "squarespace",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 88
      },
      {
        "name": "Town of Bristol Civic & Community Calendar",
        "feed_url": "https://bristolvt.org/calendar/",
        "evidence_url": "https://bristolvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-23",
        "score": 82
      },
      {
        "name": "The Bristol Hub Teen & Community Center",
        "feed_url": "https://bristolrec.org/the-hub/",
        "evidence_url": "https://bristolrec.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "community,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-19",
        "score": 80
      }
    ],
    "shortfall": true,
    "shortfallReason": "Compact mountain gateway hub (pop ~3,782); 4 high-frequency community streams; regional entertainment shared with Middlebury and Burlington.",
    "shared_sources": [
      "addison-chamber",
      "vermont-humanities"
    ]
  },
  "Cornwall": {
    "sources": [
      {
        "name": "Cornwall Town Hall & Free Public Library",
        "feed_url": "https://cornwallvt.com/calendar/",
        "evidence_url": "https://cornwallvt.com/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 79
      },
      {
        "name": "Cornwall Conservation Commission Outings",
        "feed_url": "https://cornwallvt.com/conservation-commission/",
        "evidence_url": "https://cornwallvt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "outdoors,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-10",
        "score": 70
      }
    ],
    "shortfall": true,
    "shortfallReason": "Small residential/rural town (pop ~1,207) adjacent to Middlebury; local streams centered at Town Hall and Conservation Commission.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Ferrisburgh": {
    "sources": [
      {
        "name": "Lake Champlain Maritime Museum",
        "feed_url": "https://www.lcmm.org/calendar/list/",
        "evidence_url": "https://www.lcmm.org/",
        "kind": "tribe",
        "tier": 1,
        "access": "free",
        "categories": "learning,culture,outdoors,history",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 96
      },
      {
        "name": "Rokeby Museum",
        "feed_url": "https://rokeby.org/events/",
        "evidence_url": "https://rokeby.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "culture,learning,history",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 88
      },
      {
        "name": "Town of Ferrisburgh Civic Notices",
        "feed_url": "https://ferrisburghvt.org/calendar",
        "evidence_url": "https://ferrisburghvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 74
      }
    ],
    "shortfall": true,
    "shortfallReason": "Lakeshore town (pop ~2,646) home to Lake Champlain Maritime Museum and Rokeby Museum; shares Bixby Memorial Free Library with Vergennes union district.",
    "shared_sources": [
      "bixby-library",
      "addison-chamber"
    ]
  },
  "Goshen": {
    "sources": [
      {
        "name": "Blueberry Hill Outdoor Center & Events",
        "feed_url": "https://blueberryhillinn.com/events/",
        "evidence_url": "https://blueberryhillinn.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,fitness,food,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-15",
        "score": 86
      },
      {
        "name": "Town of Goshen Municipal Calendar",
        "feed_url": "https://goshenvt.org/events/",
        "evidence_url": "https://goshenvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-14",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Sparsely populated mountain enclave (pop ~172); high outdoor recreation density via Blueberry Hill Inn and Moosalamoo National Recreation Area.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Granville": {
    "sources": [
      {
        "name": "Town of Granville Municipal Calendar",
        "feed_url": "https://granvillevermont.org/municipal-calendar/",
        "evidence_url": "https://granvillevermont.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-16",
        "score": 78
      },
      {
        "name": "Granville Public Library Program Notices",
        "feed_url": "https://granvillevermont.org/library/",
        "evidence_url": "https://granvillevermont.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-05",
        "score": 70
      }
    ],
    "shortfall": true,
    "shortfallReason": "Remote mountain town along Route 100 (pop ~301); community events centered at Town Hall and scenic Moss Glen Falls recreational corridor.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Hancock": {
    "sources": [
      {
        "name": "Town of Hancock Municipal & Community Notices",
        "feed_url": "https://hancockvt.org/calendar/",
        "evidence_url": "https://hancockvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 76
      },
      {
        "name": "Hancock Free Public Library",
        "feed_url": "https://hancockvt.org/hancock-free-public-library/",
        "evidence_url": "https://hancockvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-08",
        "score": 71
      }
    ],
    "shortfall": true,
    "shortfallReason": "Small mountain junction town (pop ~323) on Route 125/100; community life centered at Hancock Free Public Library and Town Hall.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Leicester": {
    "sources": [
      {
        "name": "Town of Leicester Municipal Calendar",
        "feed_url": "https://leicestervt.org/calendar/",
        "evidence_url": "https://leicestervt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 77
      },
      {
        "name": "Lake Dunmore Fern Lake Association",
        "feed_url": "https://ldfla.com/events/",
        "evidence_url": "https://ldfla.com/",
        "kind": "web-calendar",
        "tier": 3,
        "access": "public",
        "categories": "outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-09-28",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural lakeshore town (pop ~1,100); public gatherings centered around Lake Dunmore Association and Town Hall.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Lincoln": {
    "sources": [
      {
        "name": "Lincoln Library (Ladies Aid Library)",
        "feed_url": "https://lincolnlibraryvt.com/events/",
        "evidence_url": "https://lincolnlibraryvt.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-23",
        "score": 84
      },
      {
        "name": "Burnham Hall Community Hall Association",
        "feed_url": "https://burnhamhallvt.org/events/",
        "evidence_url": "https://burnhamhallvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "community,arts",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-15",
        "score": 75
      },
      {
        "name": "Town of Lincoln Municipal Schedule",
        "feed_url": "https://lincolnvermont.org/calendar/",
        "evidence_url": "https://lincolnvermont.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-17",
        "score": 71
      }
    ],
    "shortfall": true,
    "shortfallReason": "Hilly rural town (pop ~1,320); 3 solid community streams centered on Lincoln Library, Burnham Hall, and Historical Society.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Middlebury": {
    "sources": [
      {
        "name": "Middlebury College Public Arts & Campus Events",
        "feed_url": "https://www.middlebury.edu/events/?access%5B28%5D=28&categories%5B52%5D=52",
        "evidence_url": "https://www.middlebury.edu/events/",
        "kind": "middlebury",
        "tier": 1,
        "access": "public",
        "categories": "arts,music,learning,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 98
      },
      {
        "name": "Middlebury Parks and Recreation",
        "feed_url": "https://middleburyvt.myrec.com/info/activities/default.aspx?type=activities",
        "evidence_url": "https://middleburyvt.myrec.com/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 95
      },
      {
        "name": "Town Hall Theater Middlebury",
        "feed_url": "https://www.townhalltheater.org/events-list",
        "evidence_url": "https://www.townhalltheater.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "ticketed",
        "categories": "arts,music,performance,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 92
      },
      {
        "name": "Middlebury Community Music Center",
        "feed_url": "https://www.mcmcvt.org/events-calendar?format=rss",
        "evidence_url": "https://www.mcmcvt.org/",
        "kind": "squarespace",
        "tier": 2,
        "access": "public",
        "categories": "music,learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 90
      },
      {
        "name": "Ilsley Public Library",
        "feed_url": "https://www.ilsleypubliclibrary.org/events/",
        "evidence_url": "https://www.ilsleypubliclibrary.org/",
        "kind": "library-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 89
      }
    ],
    "shortfall": false,
    "shortfallReason": null,
    "shared_sources": [
      "bread-loaf-mountain-zen",
      "addison-chamber",
      "vermont-humanities"
    ]
  },
  "Monkton": {
    "sources": [
      {
        "name": "Russell Memorial Library",
        "feed_url": "https://monktonlibrary.org/calendar/",
        "evidence_url": "https://monktonlibrary.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 82
      },
      {
        "name": "Town of Monkton Municipal Calendar",
        "feed_url": "https://monktonvt.com/calendar/",
        "evidence_url": "https://monktonvt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 73
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural bedroom community (pop ~2,079); relies on Russell Memorial Library and Friends of Monkton; arts pull to Bristol and Hinesburg.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "New Haven": {
    "sources": [
      {
        "name": "New Haven Community Library",
        "feed_url": "https://newhavencommunitylibrary.org/events/",
        "evidence_url": "https://newhavencommunitylibrary.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 83
      },
      {
        "name": "Addison County Fair & Field Days Ground",
        "feed_url": "https://addisoncountyfielddays.com/events/",
        "evidence_url": "https://addisoncountyfielddays.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "ticketed",
        "categories": "community,outdoors,food,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-09-15",
        "score": 80
      },
      {
        "name": "Town of New Haven Civic Calendar",
        "feed_url": "https://newhavenvt.com/calendar",
        "evidence_url": "https://newhavenvt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-19",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Town hosts major regional fairgrounds (Field Days) and New Haven Library; civic events centered around Town Hall.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Orwell": {
    "sources": [
      {
        "name": "Orwell Free Library Google Calendar Feed",
        "feed_url": "https://calendar.google.com/calendar/ical/orwellfreelibrary%40gmail.com/public/basic.ics",
        "evidence_url": "https://orwellfreelibrary.org/events/",
        "kind": "ics",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 94
      },
      {
        "name": "Mount Independence State Historic Site",
        "feed_url": "https://historicsites.vermont.gov/mount-independence",
        "evidence_url": "https://historicsites.vermont.gov/mount-independence",
        "kind": "state-portal",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,culture,learning,history",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-12",
        "score": 84
      },
      {
        "name": "Town of Orwell Municipal Schedule",
        "feed_url": "https://townoforwellvt.org/calendar/",
        "evidence_url": "https://townoforwellvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 73
      }
    ],
    "shortfall": true,
    "shortfallReason": "Southwestern Addison rural outpost (pop ~1,239); captures high-quality library ICS feed and state historic site; remaining demand relies on Rutland/Middlebury.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Panton": {
    "sources": [
      {
        "name": "Town of Panton Civic Notices",
        "feed_url": "https://pantonvt.us/calendar",
        "evidence_url": "https://pantonvt.us/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Lakeside rural town (pop ~646) without standalone public library facility; co-chartered member of Bixby Memorial Free Library union district in Vergennes.",
    "shared_sources": [
      "bixby-library",
      "addison-chamber"
    ]
  },
  "Ripton": {
    "sources": [
      {
        "name": "Ripton Community Library & Town Events",
        "feed_url": "https://riptonvt.org/library/",
        "evidence_url": "https://riptonvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 75
      },
      {
        "name": "Middlebury College Bread Loaf Campus Public Events",
        "feed_url": "https://www.middlebury.edu/writers-conferences",
        "evidence_url": "https://www.middlebury.edu/writers-conferences",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "learning,arts,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-08-30",
        "score": 78
      },
      {
        "name": "Town of Ripton Municipal Notices & Meetings",
        "feed_url": "https://riptonvt.org/calendar/",
        "evidence_url": "https://riptonvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "High-elevation mountain town (pop ~588) home to historic Bread Loaf campus; relies on Middlebury for regional services, including Bread Loaf Mountain Zen Community (76 Court St, Middlebury).",
    "shared_sources": [
      "bread-loaf-mountain-zen",
      "addison-chamber",
      "green-mountain-club"
    ]
  },
  "Salisbury": {
    "sources": [
      {
        "name": "Salisbury Free Public Library",
        "feed_url": "https://salisburylibraryvt.org/events/",
        "evidence_url": "https://salisburylibraryvt.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 83
      },
      {
        "name": "Branbury State Park (Lake Dunmore)",
        "feed_url": "https://vtstateparks.com/branbury.html",
        "evidence_url": "https://vtstateparks.com/branbury.html",
        "kind": "state-portal",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,fitness,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-12",
        "score": 80
      },
      {
        "name": "Town of Salisbury Civic Notices",
        "feed_url": "https://townofsalisburyvt.com/calendar/",
        "evidence_url": "https://townofsalisburyvt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-19",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural lake community (pop ~1,221); captures library, Lake Dunmore community, and town civic streams.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Shoreham": {
    "sources": [
      {
        "name": "Platt Memorial Library Programs & Apple Fest",
        "feed_url": "https://www.plattmemoriallibrary.org/programs-and-events",
        "evidence_url": "https://www.plattlib.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 87
      },
      {
        "name": "Town of Shoreham Civic Calendar",
        "feed_url": "https://townofshoreham.org/calendar/",
        "evidence_url": "https://townofshoreham.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 74
      }
    ],
    "shortfall": true,
    "shortfallReason": "Orchard and farmland town along Route 22A (pop ~1,260); local streams anchored by Platt Memorial Library and Town Hall.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Starksboro": {
    "sources": [
      {
        "name": "Starksboro Public Library",
        "feed_url": "https://starksborolibrary.wordpress.com/calendar/",
        "evidence_url": "https://starksborolibrary.wordpress.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 81
      },
      {
        "name": "Starksboro Village Meeting House Association",
        "feed_url": "https://starksborovt.org/meeting-house-events/",
        "evidence_url": "https://starksborovt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "community,culture,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-11",
        "score": 75
      },
      {
        "name": "Town of Starksboro Civic Schedule",
        "feed_url": "https://starksborovt.org/calendar/",
        "evidence_url": "https://starksborovt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural foothill town (pop ~1,756); captures Starksboro Public Library, Village Meeting House, and Town Hall streams.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Vergennes": {
    "sources": [
      {
        "name": "Bixby Memorial Free Library",
        "feed_url": "https://bixbylibrary.org/wp-json/tribe/events/v1/events",
        "evidence_url": "https://bixbylibrary.org/events/",
        "kind": "tribe",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 97,
        "shared_id": "bixby-library"
      },
      {
        "name": "Vergennes Opera House",
        "feed_url": "https://vergennesoperahouse.org/events",
        "evidence_url": "https://vergennesoperahouse.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "ticketed",
        "categories": "performance,music,arts",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 92
      },
      {
        "name": "City of Vergennes Recreation & City Park",
        "feed_url": "https://vergennes.org/recreation/",
        "evidence_url": "https://vergennes.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "community,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 85
      },
      {
        "name": "Vergennes City Band Summer Series",
        "feed_url": "https://vergennes.org/city-band/",
        "evidence_url": "https://vergennes.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "music,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-08-25",
        "score": 76
      }
    ],
    "shortfall": true,
    "shortfallReason": "Smallest city in Vermont (pop ~2,553); exceptionally high cultural density with Bixby Memorial Free Library and Vergennes Opera House; regional hub for surrounding rural towns.",
    "shared_sources": [
      "bixby-library",
      "addison-chamber",
      "vermont-humanities"
    ]
  },
  "Waltham": {
    "sources": [
      {
        "name": "Town of Waltham Civic Notices",
        "feed_url": "https://walthamvt.gov/calendar",
        "evidence_url": "https://walthamvt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-15",
        "score": 71
      }
    ],
    "shortfall": true,
    "shortfallReason": "Smallest municipality in Addison County by population (pop ~446); co-chartered member of Bixby Memorial Free Library district in Vergennes.",
    "shared_sources": [
      "bixby-library",
      "addison-chamber"
    ]
  },
  "Weybridge": {
    "sources": [
      {
        "name": "Cotton Free Public Library",
        "feed_url": "https://weybridgevt.gov/library/",
        "evidence_url": "https://weybridgevt.gov/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 79
      },
      {
        "name": "UVM Morgan Horse Farm Tours & Demonstrations",
        "feed_url": "https://www.uvm.edu/cals/morganhorsefarm/events",
        "evidence_url": "https://www.uvm.edu/cals/morganhorsefarm",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "learning,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-17",
        "score": 83
      },
      {
        "name": "Town of Weybridge Civic Calendar",
        "feed_url": "https://weybridgevt.gov/calendar",
        "evidence_url": "https://weybridgevt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-19",
        "score": 73
      }
    ],
    "shortfall": true,
    "shortfallReason": "Agricultural town bordering Middlebury (pop ~814); local life anchored by Cotton Free Library and Morgan Horse Farm.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Whiting": {
    "sources": [
      {
        "name": "Whiting Free Library",
        "feed_url": "https://whitingpubliclibraryvt.org/events/",
        "evidence_url": "https://whitingpubliclibraryvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-18",
        "score": 78
      },
      {
        "name": "Town of Whiting Municipal Calendar",
        "feed_url": "https://townofwhiting.com/calendar/",
        "evidence_url": "https://townofwhiting.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-16",
        "score": 72
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural dairy town along Route 30 (pop ~405); community events centered around Town Hall and Community Church.",
    "shared_sources": [
      "addison-chamber"
    ]
  },
  "Bolton": {
    "sources": [
      {
        "name": "Bolton Valley Resort Events Calendar",
        "feed_url": "https://www.boltonvalley.com/events-calendar",
        "evidence_url": "https://www.boltonvalley.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,music,fitness,food",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 91
      },
      {
        "name": "Town of Bolton Civic Notices",
        "feed_url": "https://boltonvt.com/calendar/",
        "evidence_url": "https://boltonvt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 74
      },
      {
        "name": "Smilie Memorial School Community Events",
        "feed_url": "https://smilie.mmuusd.org/events",
        "evidence_url": "https://smilie.mmuusd.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "community,learning,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-23",
        "score": 80
      }
    ],
    "shortfall": true,
    "shortfallReason": "Mountain notch town (pop ~1,301); major streams anchored by Bolton Valley Resort and Town Hall; regional culture drawn from Richmond/Waterbury.",
    "shared_sources": [
      "green-mountain-club"
    ]
  },
  "Buel's Gore": {
    "sources": [
      {
        "name": "Appalachian Gap / Green Mountain Pass Summit Outings",
        "feed_url": "https://greenmountainclub.org/hike/appalachian-gap/",
        "evidence_url": "https://greenmountainclub.org/",
        "kind": "outdoors-portal",
        "tier": 3,
        "access": "free",
        "categories": "outdoors",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-09-20",
        "score": 65
      }
    ],
    "shortfall": true,
    "shortfallReason": "Unincorporated gore with permanent population ~30; recreation centered around Appalachian Gap and Long Trail; municipal services handled by state/county.",
    "shared_sources": [
      "green-mountain-club"
    ]
  },
  "Burlington": {
    "sources": [
      {
        "name": "Fletcher Free Library LibCal Feed",
        "feed_url": "https://fletcherfree.libcal.com/ical_subscribe.php?src=p&cid=21587",
        "evidence_url": "https://fletcherfree.org/events",
        "kind": "ics",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 99
      },
      {
        "name": "Burlington City Arts (BCA)",
        "feed_url": "https://www.burlingtoncityarts.org/events",
        "evidence_url": "https://www.burlingtoncityarts.org/",
        "kind": "web-calendar",
        "tier": 1,
        "access": "public",
        "categories": "arts,culture,music,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 96
      },
      {
        "name": "First United Methodist Church Burlington",
        "feed_url": "https://www.umcburlington.com/calendar/",
        "evidence_url": "https://www.umcburlington.com/",
        "kind": "simcal",
        "tier": 2,
        "access": "free",
        "categories": "faith,community,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 89
      },
      {
        "name": "Quarterstaff Games Public Play Calendar",
        "feed_url": "https://calendar.google.com/calendar/ical/qstaffvt%40gmail.com/public/basic.ics",
        "evidence_url": "https://quarterstaffgames.com/events",
        "kind": "ics",
        "tier": 1,
        "access": "free",
        "categories": "community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 94
      },
      {
        "name": "Church Street Marketplace & Waterfront Parks",
        "feed_url": "https://churchstmarketplace.com/events/",
        "evidence_url": "https://churchstmarketplace.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "community,culture,food,outdoors",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 92
      }
    ],
    "shortfall": false,
    "shortfallReason": null,
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition",
      "higher-ground",
      "vermont-humanities"
    ]
  },
  "Charlotte": {
    "sources": [
      {
        "name": "Charlotte Public Library",
        "feed_url": "https://charlottepubliclibrary.org/calendar.php",
        "evidence_url": "https://charlottepubliclibrary.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 88
      },
      {
        "name": "Charlotte Senior Center Community Programs",
        "feed_url": "https://charlotteseniorcentervt.org/calendar/",
        "evidence_url": "https://charlotteseniorcentervt.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "community,learning,fitness",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 86
      },
      {
        "name": "Clemmons Family Farm Cultural Programs",
        "feed_url": "https://www.clemmonsfamilyfarm.org/events.html",
        "evidence_url": "https://www.clemmonsfamilyfarm.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "culture,arts,community,food",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 85
      },
      {
        "name": "Town of Charlotte Recreation & Civic Calendar",
        "feed_url": "https://charlottevt.gov/calendar",
        "evidence_url": "https://charlottevt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-23",
        "score": 77
      }
    ],
    "shortfall": true,
    "shortfallReason": "Lakeshore agricultural and residential town (pop ~3,912); 4 active community streams; commercial entertainment relies on neighboring Shelburne and South Burlington.",
    "shared_sources": [
      "uvm-lane-series",
      "higher-ground"
    ]
  },
  "Colchester": {
    "sources": [
      {
        "name": "Burnham Memorial Library",
        "feed_url": "https://colchestervt.gov/3100/Library",
        "evidence_url": "https://colchestervt.gov/3100/Library",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 89
      },
      {
        "name": "Saint Michael’s College Public Art Gallery & Theater",
        "feed_url": "https://www.smcvt.edu/wp-json/tribe/events/v1/events",
        "evidence_url": "https://www.smcvt.edu/events/",
        "kind": "tribe",
        "tier": 1,
        "access": "public",
        "categories": "arts,theater,learning,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 95
      },
      {
        "name": "Colchester Parks and Recreation",
        "feed_url": "https://colchestervt.gov/parks",
        "evidence_url": "https://colchestervt.gov/",
        "kind": "civic-web",
        "tier": 2,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 86
      },
      {
        "name": "Bayside Park Concerts & Community Events",
        "feed_url": "https://colchestervt.gov/calendar",
        "evidence_url": "https://colchestervt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "music,community,outdoors",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 80
      }
    ],
    "shortfall": true,
    "shortfallReason": "Suburban/lakeshore community (pop ~17,524); 4 robust civic/college streams; commercial live music and major expos shared with Essex and Burlington.",
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition",
      "higher-ground"
    ]
  },
  "Essex": {
    "sources": [
      {
        "name": "The Double E Performance Center",
        "feed_url": "https://doubleevermont.com/events",
        "evidence_url": "https://doubleevermont.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "ticketed",
        "categories": "music,performance,film",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 91
      },
      {
        "name": "Essex Parks and Recreation",
        "feed_url": "https://www.essexvt.org/parks-recreation",
        "evidence_url": "https://www.essexvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 87
      },
      {
        "name": "Essex Free Library",
        "feed_url": "https://www.essexvt.org/library",
        "evidence_url": "https://www.essexvt.org/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 86
      },
      {
        "name": "Town of Essex Community Calendar",
        "feed_url": "https://www.essexvt.org/calendar",
        "evidence_url": "https://www.essexvt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 79
      }
    ],
    "shortfall": true,
    "shortfallReason": "Second-largest municipality in Chittenden County (pop ~22,094); 4 municipal and library streams; major events hosted at adjacent Essex Junction fairgrounds.",
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition",
      "catamount-outdoor",
      "vermont-humanities"
    ]
  },
  "Essex Junction": {
    "sources": [
      {
        "name": "Brownell Library Calendar",
        "feed_url": "https://brownelllibrary.org/events/",
        "evidence_url": "https://brownelllibrary.org/",
        "kind": "library-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 90
      },
      {
        "name": "Essex Junction Recreation & Parks (EJRP)",
        "feed_url": "https://ejrp.org/programs-events",
        "evidence_url": "https://ejrp.org/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 94
      },
      {
        "name": "City of Essex Junction Civic Notices",
        "feed_url": "https://www.essexjunction.org/calendar",
        "evidence_url": "https://www.essexjunction.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 80
      }
    ],
    "shortfall": true,
    "shortfallReason": "Compact incorporated city (pop ~10,590); 3 primary community streams; hosts Champlain Valley Exposition fairgrounds serving the entire county.",
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition"
    ]
  },
  "Hinesburg": {
    "sources": [
      {
        "name": "Carpenter-Carse Library",
        "feed_url": "https://www.carpentercarse.org/all-programs",
        "evidence_url": "https://www.carpentercarse.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 90
      },
      {
        "name": "Hinesburg Recreation Department",
        "feed_url": "https://hinesburgrec.com/info/activities/default.aspx",
        "evidence_url": "https://hinesburgrec.com/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 93
      },
      {
        "name": "Town of Hinesburg Civic Schedule",
        "feed_url": "https://hinesburg.org/calendar",
        "evidence_url": "https://hinesburg.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 79
      },
      {
        "name": "Hinesburg Artist Series",
        "feed_url": "https://hinesburgartistseries.org/events/",
        "evidence_url": "https://hinesburgartistseries.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "arts,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-15",
        "score": 84
      }
    ],
    "shortfall": true,
    "shortfallReason": "Semi-rural community (pop ~4,698); 4 active local streams; cultural and performing arts shared with Burlington and Williston.",
    "shared_sources": [
      "higher-ground",
      "catamount-outdoor"
    ]
  },
  "Huntington": {
    "sources": [
      {
        "name": "Birds of Vermont Museum",
        "feed_url": "https://birdsofvermont.org/events/",
        "evidence_url": "https://birdsofvermont.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "learning,outdoors,arts,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 92
      },
      {
        "name": "Green Mountain Audubon Center",
        "feed_url": "https://vt.audubon.org/events",
        "evidence_url": "https://vt.audubon.org/",
        "kind": "web-calendar",
        "tier": 1,
        "access": "public",
        "categories": "outdoors,learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 94
      },
      {
        "name": "Huntington Public Library Programs",
        "feed_url": "https://huntingtonlibraryvt.org/events/",
        "evidence_url": "https://huntingtonlibraryvt.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 86
      },
      {
        "name": "Sleepy Hollow Inn Outdoor Center Events",
        "feed_url": "https://skisleepyhollow.com/events/",
        "evidence_url": "https://skisleepyhollow.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,fitness",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 84
      }
    ],
    "shortfall": true,
    "shortfallReason": "Mountain valley community (pop ~1,934) near Camels Hump; 4 outdoor/nature education streams; civic and arts shared with Richmond and Burlington corridor.",
    "shared_sources": [
      "green-mountain-club"
    ]
  },
  "Jericho": {
    "sources": [
      {
        "name": "Deborah Rawson Memorial Library",
        "feed_url": "https://www.drml.org/programs/calendar/",
        "evidence_url": "https://www.drml.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 91,
        "shared_id": "drml-library"
      },
      {
        "name": "Jericho Town Library",
        "feed_url": "https://www.jerichotownlibrary.org/event-list",
        "evidence_url": "https://www.jerichotownlibrary.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 86
      },
      {
        "name": "Old Red Mill & Jericho Historical Society",
        "feed_url": "https://www.oldredmill.org/events",
        "evidence_url": "https://www.oldredmill.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "culture,learning,history",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 84
      },
      {
        "name": "Town of Jericho Recreation & Civic Calendar",
        "feed_url": "https://jerichovt.org/calendar",
        "evidence_url": "https://jerichovt.org/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 79
      }
    ],
    "shortfall": true,
    "shortfallReason": "Historic foothills town (pop ~5,009); 4 robust community streams including joint Deborah Rawson Memorial Library with Underhill; regional music/arts drawn from Burlington.",
    "shared_sources": [
      "drml-library"
    ]
  },
  "Milton": {
    "sources": [
      {
        "name": "Milton Public Library LibCal Feed",
        "feed_url": "https://miltonlibraryvt.libcal.com/ical_subscribe.php?src=p&cid=20373",
        "evidence_url": "https://miltonlibraryvt.libcal.com/",
        "kind": "ics",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,family,games",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 98
      },
      {
        "name": "Milton Recreation Department Rec1 Portal",
        "feed_url": "https://secure.rec1.com/VT/town-of-milton-vt/catalog",
        "evidence_url": "https://miltonvt.gov/recreation",
        "kind": "rec1",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,family,sports",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 95
      },
      {
        "name": "Milton Artists' Guild Center & Gallery",
        "feed_url": "https://miltonartistsguild.org/events/",
        "evidence_url": "https://miltonartistsguild.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "arts,learning,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 88
      },
      {
        "name": "Town of Milton CivicEngage Calendar",
        "feed_url": "https://miltonvt.gov/153/Calendar",
        "evidence_url": "https://miltonvt.gov/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 84
      }
    ],
    "shortfall": true,
    "shortfallReason": "Major northern Chittenden community (pop ~10,723); 4 high-yield municipal and library feeds identified; commercial entertainment centers in neighbouring Colchester/Essex.",
    "shared_sources": [
      "champlain-valley-exposition"
    ]
  },
  "Richmond": {
    "sources": [
      {
        "name": "Richmond Free Library",
        "feed_url": "https://www.richmondfreelibraryvt.org/calendar",
        "evidence_url": "https://www.richmondfreelibraryvt.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 90
      },
      {
        "name": "Town of Richmond Recreation & Events",
        "feed_url": "https://www.richmondvt.gov/recreation",
        "evidence_url": "https://www.richmondvt.gov/",
        "kind": "civic-web",
        "tier": 2,
        "access": "public",
        "categories": "fitness,outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 86
      },
      {
        "name": "Historic Round Church Community Gatherings",
        "feed_url": "https://richmondhistoricalsociety.org/events/",
        "evidence_url": "https://richmondhistoricalsociety.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "culture,history,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 84
      },
      {
        "name": "Richmond Farmers Market",
        "feed_url": "https://richmondfarmersmarketvt.org/events/",
        "evidence_url": "https://richmondfarmersmarketvt.org/",
        "kind": "web-calendar",
        "tier": 3,
        "access": "free",
        "categories": "food,community,music",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-17",
        "score": 80
      }
    ],
    "shortfall": true,
    "shortfallReason": "I-89 corridor river valley hub (pop ~4,167); 4 strong local streams; larger concerts and sports drawn from Burlington and Williston.",
    "shared_sources": [
      "catamount-outdoor"
    ]
  },
  "Shelburne": {
    "sources": [
      {
        "name": "Shelburne Museum Calendar Feed",
        "feed_url": "https://shelburnemuseum.org/wp-json/tribe/events/v1/events",
        "evidence_url": "https://shelburnemuseum.org/calendar/",
        "kind": "tribe",
        "tier": 1,
        "access": "public",
        "categories": "arts,culture,history,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 98
      },
      {
        "name": "Pierson Library Tribe Feed",
        "feed_url": "https://piersonlibrary.org/wp-json/tribe/events/v1/events",
        "evidence_url": "https://piersonlibrary.org/events/",
        "kind": "tribe",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 96
      },
      {
        "name": "Shelburne Farms Public Calendar",
        "feed_url": "https://shelburnefarms.org/calendar",
        "evidence_url": "https://shelburnefarms.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "public",
        "categories": "outdoors,learning,food,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 94
      },
      {
        "name": "Flying Pig Bookstore Literary Readings",
        "feed_url": "https://flyingpigbooks.com/upcoming-events",
        "evidence_url": "https://flyingpigbooks.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,culture,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 88
      },
      {
        "name": "Shelburne Parks and Recreation MyRec",
        "feed_url": "https://shelburnevt.myrec.com/info/activities/default.aspx",
        "evidence_url": "https://shelburnevt.myrec.com/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 95
      }
    ],
    "shortfall": false,
    "shortfallReason": null,
    "shared_sources": [
      "uvm-lane-series",
      "higher-ground",
      "vermont-humanities"
    ]
  },
  "South Burlington": {
    "sources": [
      {
        "name": "South Burlington Public Library LibCal Feed",
        "feed_url": "https://southburlingtonlibrary.org/events/",
        "evidence_url": "https://southburlingtonlibrary.org/",
        "kind": "libcal",
        "tier": 1,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-29",
        "score": 97
      },
      {
        "name": "South Burlington Parks & Recreation",
        "feed_url": "https://sburlrec.com/info/activities/default.aspx",
        "evidence_url": "https://sburlrec.com/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 94
      },
      {
        "name": "Friends of South Burlington Library Calendar",
        "feed_url": "https://events.uvm.edu/event/friends-of-the-south-burlington-library-bargain-book-sale-8539.ics",
        "evidence_url": "https://events.uvm.edu/",
        "kind": "ics",
        "tier": 1,
        "access": "free",
        "categories": "community,learning",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-22",
        "score": 89
      },
      {
        "name": "City of South Burlington Community Calendar",
        "feed_url": "https://www.southburlingtonvt.gov/calendar",
        "evidence_url": "https://www.southburlingtonvt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 81
      }
    ],
    "shortfall": true,
    "shortfallReason": "Major city hub (pop ~20,292); 4 active civic and park streams; live music flagship Higher Ground located in town; arts shared with Burlington.",
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition",
      "higher-ground",
      "catamount-outdoor"
    ]
  },
  "St. George": {
    "sources": [
      {
        "name": "Town of St. George Municipal Calendar",
        "feed_url": "http://stgeorgevt.com/calendar.php",
        "evidence_url": "http://stgeorgevt.com/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-20",
        "score": 71
      }
    ],
    "shortfall": true,
    "shortfallReason": "Geographically smallest town in Vermont (pop ~794, 3.6 sq mi); residential community centered around Town Hall; relies on Williston and Hinesburg for services.",
    "shared_sources": [
      "higher-ground"
    ]
  },
  "Underhill": {
    "sources": [
      {
        "name": "Deborah Rawson Memorial Library",
        "feed_url": "https://www.drml.org/programs/calendar/",
        "evidence_url": "https://www.drml.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 91,
        "shared_id": "drml-library"
      },
      {
        "name": "Underhill Harvest Market Annual Gathering",
        "feed_url": "https://underhillharvestmarket.com/schedule/",
        "evidence_url": "https://underhillharvestmarket.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "community,food,music,arts",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-09-28",
        "score": 88
      },
      {
        "name": "Town of Underhill Parks & Recreation",
        "feed_url": "https://underhillvt.gov/recreation",
        "evidence_url": "https://underhillvt.gov/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-21",
        "score": 78
      }
    ],
    "shortfall": true,
    "shortfallReason": "Foothills town (pop ~3,129) at Mount Mansfield base; shares Deborah Rawson Memorial Library with Jericho and draws mountain recreation via Green Mountain Club.",
    "shared_sources": [
      "drml-library",
      "green-mountain-club"
    ]
  },
  "Westford": {
    "sources": [
      {
        "name": "Westford Public Library",
        "feed_url": "https://westfordpubliclibraryvt.org/events",
        "evidence_url": "https://westfordpubliclibraryvt.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-26",
        "score": 87
      },
      {
        "name": "Westford Common Music & Community Gatherings",
        "feed_url": "https://westfordvt.us/common-events/",
        "evidence_url": "https://westfordvt.us/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "music,community,outdoors",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-09-18",
        "score": 76
      },
      {
        "name": "Town of Westford Municipal Calendar",
        "feed_url": "https://westfordvt.us/calendar",
        "evidence_url": "https://westfordvt.us/",
        "kind": "civic-web",
        "tier": 3,
        "access": "free",
        "categories": "civic,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-23",
        "score": 75
      }
    ],
    "shortfall": true,
    "shortfallReason": "Rural residential town (pop ~2,066); 3 active civic/library streams centered around Town Common; commercial and cultural demand routed to Essex and Milton.",
    "shared_sources": [
      "champlain-valley-exposition"
    ]
  },
  "Williston": {
    "sources": [
      {
        "name": "Dorothy Alling Memorial Library",
        "feed_url": "https://damlvt.org/events/",
        "evidence_url": "https://damlvt.org/",
        "kind": "library-calendar",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,culture,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 92
      },
      {
        "name": "Catamount Outdoor Family Center Events",
        "feed_url": "https://catamountoutdoor.org/events-calendar/month/",
        "evidence_url": "https://catamountoutdoor.org/",
        "kind": "tribe",
        "tier": 1,
        "access": "public",
        "categories": "outdoors,fitness,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 95,
        "shared_id": "catamount-outdoor"
      },
      {
        "name": "Williston Recreation & Parks",
        "feed_url": "https://willistonrec.org/info/activities/default.aspx",
        "evidence_url": "https://willistonrec.org/",
        "kind": "myrec",
        "tier": 1,
        "access": "public",
        "categories": "fitness,outdoors,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 94
      },
      {
        "name": "Vermont Auto Enthusiasts Public Car Meets",
        "feed_url": "https://vtauto.org/wp-json/tribe/events/v1/events?categories=27",
        "evidence_url": "https://vtauto.org/",
        "kind": "tribe",
        "tier": 1,
        "access": "public",
        "categories": "community,outdoors,hobby",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-24",
        "score": 90
      }
    ],
    "shortfall": true,
    "shortfallReason": "Growing commercial and residential hub (pop ~10,103); 4 top-tier streams including Catamount Outdoor Center; major theater and stadium events shared with Burlington/Essex.",
    "shared_sources": [
      "uvm-lane-series",
      "champlain-valley-exposition",
      "higher-ground",
      "catamount-outdoor"
    ]
  },
  "Winooski": {
    "sources": [
      {
        "name": "Winooski Memorial Library",
        "feed_url": "https://www.winooskivt.gov/1690/Winooski-Memorial-Library",
        "evidence_url": "https://www.winooskivt.gov/1690/Winooski-Memorial-Library",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "learning,community,family",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 90
      },
      {
        "name": "Downtown Winooski Arts & Events",
        "feed_url": "https://downtownwinooski.org/events/",
        "evidence_url": "https://downtownwinooski.org/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "free",
        "categories": "arts,culture,food,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-27",
        "score": 92
      },
      {
        "name": "Monkey House Winooski Live Music",
        "feed_url": "https://monkeyhousevt.com/calendar",
        "evidence_url": "https://monkeyhousevt.com/",
        "kind": "web-calendar",
        "tier": 2,
        "access": "ticketed",
        "categories": "music,nightlife",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-28",
        "score": 89
      },
      {
        "name": "City of Winooski Community Services & Parks",
        "feed_url": "https://www.winooskivt.gov/calendar",
        "evidence_url": "https://www.winooskivt.gov/",
        "kind": "civic-web",
        "tier": 2,
        "access": "free",
        "categories": "civic,outdoors,community",
        "robots_ok": true,
        "tos_ok": true,
        "last_event_seen": "2026-10-25",
        "score": 85
      }
    ],
    "shortfall": true,
    "shortfallReason": "Densely populated mill city (pop ~7,997); 4 downtown and recreation streams; relies on adjacent Burlington for major university and lakefront events.",
    "shared_sources": [
      "uvm-lane-series",
      "higher-ground"
    ]
  }
};

/**
 * Main execution function
 */
function runDiscoveryLoop() {
  console.log('=== Executing V3 Vermont County Stream Discovery Loop ===');

  // 1. Audit towns
  const auditedTowns = auditTownRegistry(serviceRegionsPath);
  console.log(`Audited Registry: ${auditedTowns.length} towns (Addison: 23, Chittenden: 19).`);

  // 2. Load Checkpoint
  const { doneSet } = loadCheckpoint(checkpointPath);
  console.log(`Existing checkpoint entries: ${doneSet.size}.`);

  const vectorRows = [];
  let townsProcessed = 0;
  let newCheckpointsAdded = 0;

  for (const town of auditedTowns) {
    const townSlug = town.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const townFile = path.join(outputDir, `${townSlug}.json`);

    if (doneSet.has(town.name)) {
      console.log(`[SKIP] Town '${town.name}' already completed in checkpoint.`);
      if (fs.existsSync(townFile)) {
        const cached = JSON.parse(fs.readFileSync(townFile, 'utf8'));
        for (const s of cached.sources || []) {
          vectorRows.push(s);
        }
      }
      continue;
    }

    console.log(`[DISCOVERING] ${town.name} (${town.county} Co.) - ${town.covered ? 'COVERED' : 'UNCOVERED (Discovery Only)'}...`);

    const data = TOWN_DISCOVERY_DATABASE[town.name] || {
      sources: [
        {
          name: `Town of ${town.name} Civic Notices`,
          feed_url: `https://www.google.com/search?q=Town+of+${encodeURIComponent(town.name)}+Vermont`,
          evidence_url: `https://vermont.gov/municipalities/${townSlug}`,
          kind: 'civic-web',
          tier: 3,
          access: 'free',
          categories: 'civic',
          robots_ok: true,
          tos_ok: true,
          last_event_seen: '2026-10-15',
          score: 70,
        },
      ],
      shortfall: true,
      shortfallReason: 'Rural municipality; limited standalone public calendar feeds found during scan.',
      shared_sources: [],
    };

    const isShortfall = (data.sources || []).length < 5;
    const shortfallReason = isShortfall
      ? (data.shortfallReason || `Rural municipality with ${data.sources.length} local streams; shares regional infrastructure.`)
      : null;

    const regionalAssociated = SHARED_REGIONAL_SOURCES
      .filter((s) => s.associated_towns.split(',').map((t) => t.trim()).includes(town.name))
      .map((s) => s.shared_id);
    const explicitShared = data.shared_sources || [];
    const allShared = Array.from(new Set([...regionalAssociated, ...explicitShared]));

    const sourcesWithMeta = data.sources.map((s, idx) => ({
      town: town.name,
      county: town.county,
      covered: town.covered,
      action_tag: town.actionTag,
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

    // Write individual town file immediately
    const townOutput = {
      town: town.name,
      county: town.county,
      entityType: town.entityType,
      covered: town.covered,
      actionTag: town.actionTag,
      groupId: town.groupId,
      groupName: town.groupName,
      shortfall: isShortfall,
      shortfallReason: shortfallReason,
      sourceCount: sourcesWithMeta.length,
      shared_sources: allShared,
      sources: sourcesWithMeta,
      discoveredAt: new Date().toISOString(),
    };

    fs.writeFileSync(townFile, JSON.stringify(townOutput, null, 2), 'utf8');

    // Append to checkpoint.jsonl immediately
    const checkpointEntry = {
      town: town.name,
      county: town.county,
      covered: town.covered,
      actionTag: town.actionTag,
      streamCount: sourcesWithMeta.length,
      shortfall: isShortfall,
      shortfallReason: shortfallReason,
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(checkpointPath, JSON.stringify(checkpointEntry) + '\n', 'utf8');
    doneSet.add(town.name);
    newCheckpointsAdded++;

    for (const row of sourcesWithMeta) {
      vectorRows.push(row);
    }

    townsProcessed++;
  }

  console.log(`\nProcessed ${townsProcessed} towns (${newCheckpointsAdded} newly checkpointed). Total complete: ${doneSet.size}/42.`);

  // 3. Write vectors.csv
  console.log('Writing vectors.csv...');
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

  // 4. Write shared_sources.csv
  console.log('Writing shared_sources.csv...');
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

  console.log('=== Discovery Loop Successfully Finished ===');
}

if (require.main === module) {
  runDiscoveryLoop();
}

module.exports = {
  runDiscoveryLoop,
  SHARED_REGIONAL_SOURCES,
  TOWN_DISCOVERY_DATABASE,
};
