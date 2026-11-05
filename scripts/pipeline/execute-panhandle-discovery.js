/**
 * Florida Panhandle & Emerald Coast 10x Stream Discovery Loop Execution Engine
 * Target: 350+ candidate streams across Escambia, Santa Rosa, Okaloosa, Walton, and Bay counties
 * 10 Cultural Diversity Verticals
 * Spec: docs/handoffs/pensacola-panhandle-discovery-loop.md
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
const streamIndexPath = path.join(repoRoot, 'docs/sources/2026-10-31-panhandle-stream-index.json');
const checkpointPath = path.join(repoRoot, 'checkpoint-panhandle.jsonl');
const outputDir = path.join(repoRoot, 'data/discovery/panhandle');
const vectorsCsvPath = path.join(repoRoot, 'vectors-panhandle.csv');
const sharedSourcesCsvPath = path.join(repoRoot, 'shared_sources_panhandle.csv');
const gapsReportPath = path.join(repoRoot, 'panhandle_registry_gaps.md');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Shared Regional Sources (Deduplicated across multiple municipalities / counties)
const SHARED_REGIONAL_SOURCES = [
  {
    shared_id: 'wfpl-system',
    name: 'West Florida Public Libraries System',
    feed_url: 'https://mywfpl.com/events?format=ical',
    evidence_url: 'https://mywfpl.com/events',
    kind: 'ics',
    tier: 1,
    access: 'free',
    categories: 'learning,community,culture',
    service_region: 'pensacola',
    scope: 'county',
    associated_towns: 'Pensacola,Century,Molino,Bellview,Ensley,Warrington,Ferry Pass,Brent,Goulding,Beulah,Cantonment',
    notes: 'Official public library system serving Escambia County with 7 community branches.'
  },
  {
    shared_id: 'srcls-system',
    name: 'Santa Rosa County Library System',
    feed_url: 'https://www.santarosa.fl.gov/events/?ical=1',
    evidence_url: 'https://www.santarosa.fl.gov/calendar/',
    kind: 'ics',
    tier: 1,
    access: 'free',
    categories: 'learning,community,culture',
    service_region: 'pensacola',
    scope: 'county',
    associated_towns: 'Milton,Gulf Breeze,Pace,Navarre,Jay,Bagdad,Chumuckla,Midway',
    notes: 'Countywide public library system serving Santa Rosa County across 5 active branches.'
  },
  {
    shared_id: 'okaloosa-library-coop',
    name: 'Okaloosa County Public Library Cooperative',
    feed_url: 'https://readokaloosa.org/events/feed',
    evidence_url: 'https://readokaloosa.org/events.php',
    kind: 'web-calendar',
    tier: 2,
    access: 'free',
    categories: 'learning,community,culture',
    service_region: 'pensacola',
    scope: 'county',
    associated_towns: 'Fort Walton Beach,Destin,Niceville,Crestview,Mary Esther,Valparaiso,Shalimar',
    notes: 'Cooperative sharing resources across 6 municipal public libraries in Okaloosa County.'
  },
  {
    shared_id: 'walton-county-library-system',
    name: 'Walton County Public Library System',
    feed_url: 'https://www.co.walton.fl.us/Calendar.aspx?CID=23',
    evidence_url: 'https://www.co.walton.fl.us/127/Library',
    kind: 'civic-web',
    tier: 2,
    access: 'free',
    categories: 'learning,community,culture',
    service_region: 'pensacola',
    scope: 'county',
    associated_towns: 'DeFuniak Springs,Santa Rosa Beach,Freeport,Miramar Beach,Paxton,Seaside,Rosemary Beach',
    notes: 'Four-branch county library system serving North Walton, Central, and South Walton (30A).'
  },
  {
    shared_id: 'nwrls-bay-county',
    name: 'Northwest Regional Library System (Bay County)',
    feed_url: 'https://www.nwrls.lib.fl.us/events/calendar?format=ical',
    evidence_url: 'https://www.nwrls.lib.fl.us/',
    kind: 'ics',
    tier: 1,
    access: 'free',
    categories: 'learning,community,culture',
    service_region: 'pensacola',
    scope: 'regional-district',
    associated_towns: 'Panama City,Panama City Beach,Lynn Haven,Callaway,Parker,Springfield,Mexico Beach',
    notes: 'Regional library district headquartered at Bay County Public Library with branches in PCB and Lynn Haven.'
  },
  {
    shared_id: 'gulf-islands-national-seashore',
    name: 'Gulf Islands National Seashore NPS',
    feed_url: 'https://www.nps.gov/guis/planyourvisit/calendar.htm',
    evidence_url: 'https://www.nps.gov/guis/',
    kind: 'state-portal',
    tier: 1,
    access: 'public',
    categories: 'outdoors,heritage,learning',
    service_region: 'pensacola',
    scope: 'federal-district',
    associated_towns: 'Pensacola,Pensacola Beach,Gulf Breeze,Perdido Key',
    notes: 'National Park Service unit spanning Fort Pickens, Fort Barrancas, and Naval Live Oaks.'
  },
  {
    shared_id: 'florida-state-parks-panhandle',
    name: 'Florida State Parks - Northwest District',
    feed_url: 'https://www.floridastateparks.org/events/rss',
    evidence_url: 'https://www.floridastateparks.org/',
    kind: 'state-portal',
    tier: 1,
    access: 'public',
    categories: 'outdoors,trail,water',
    service_region: 'pensacola',
    scope: 'district',
    associated_towns: 'Pensacola,Perdido Key,Milton,Niceville,Destin,Santa Rosa Beach,Panama City Beach',
    notes: 'Administers Big Lagoon, Tarkiln Bayou, Blackwater River, Rocky Bayou, Henderson Beach, Grayton Beach, Topsail Hill, and St. Andrews.'
  },
  {
    shared_id: 'cultural-arts-alliance-walton',
    name: 'Cultural Arts Alliance of Walton County (CAA)',
    feed_url: 'https://www.culturalartsalliance.com/events?format=ical',
    evidence_url: 'https://www.culturalartsalliance.com/',
    kind: 'ics',
    tier: 1,
    access: 'public',
    categories: 'arts,culture,music',
    service_region: 'pensacola',
    scope: 'county',
    associated_towns: 'Santa Rosa Beach,Miramar Beach,Seaside,Rosemary Beach,Alys Beach,WaterColor,Grayton Beach',
    notes: 'Primary arts agency for South Walton/30A, Bayou Arts Center, Foster Gallery, Under the Sea Museum.'
  },
  {
    shared_id: 'uwf-cultural-network',
    name: 'University of West Florida Cultural Network',
    feed_url: 'https://events.uwf.edu/calendar.ics',
    evidence_url: 'https://events.uwf.edu/',
    kind: 'ics',
    tier: 1,
    access: 'free',
    categories: 'learning,arts,community',
    service_region: 'pensacola',
    scope: 'regional-university',
    associated_towns: 'Pensacola,Ferry Pass,Brent,Milton,Fort Walton Beach',
    notes: 'Major regional university providing arts, lectures, archaeology, and performances across Pensacola and Emerald Coast.'
  },
  {
    shared_id: 'nwfsc-arts-center',
    name: 'Mattie Kelly Arts Center & NWFSC Cultural Programs',
    feed_url: 'https://mattiekellyartscenter.org/events/feed',
    evidence_url: 'https://mattiekellyartscenter.org/',
    kind: 'web-calendar',
    tier: 2,
    access: 'public',
    categories: 'theatre,music,arts',
    service_region: 'pensacola',
    scope: 'multi-county',
    associated_towns: 'Niceville,Fort Walton Beach,Destin,Crestview,Valparaiso,DeFuniak Springs',
    notes: 'Premier 1,650-seat performing arts center and galleries serving Okaloosa and Walton counties.'
  }
];

console.log('Panhandle 10x Stream Discovery Loop initializing...');
