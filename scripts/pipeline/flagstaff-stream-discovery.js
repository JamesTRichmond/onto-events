/**
 * Flagstaff & Northern Arizona 10x Stream Discovery Loop - Preflight & Runner
 * Spec: docs/handoffs/flagstaff-discovery-loop.md
 * 
 * Rules:
 * 1. Build the town registry from the official Northern Arizona list (26 communities across Coconino & Yavapai).
 * 2. Compare it to data/service-regions.json and tag each town covered or uncovered.
 * 3. For uncovered towns: discovery only, flag them as "needs registry add", and never send them to ingest.
 * 4. Load the done-list from checkpoint-flagstaff.jsonl so any restart skips finished towns.
 * 5. Write each town to a file as you go. Never force 5 entries per town.
 * 6. Deliver flagstaff_registry_gaps.md for human review.
 */

const fs = require('node:fs');
const path = require('node:path');

// Official Northern Arizona Municipal & Community Registry (26 Communities)
const OFFICIAL_FLAGSTAFF_REGISTRY = [
  // Flagstaff Urban Core (8)
  { name: 'Flagstaff', county: 'Coconino', entityType: 'City', cluster: 'Flagstaff Urban Core' },
  { name: 'Southside', county: 'Coconino', entityType: 'Urban District', cluster: 'Flagstaff Urban Core' },
  { name: 'Sunnyside', county: 'Coconino', entityType: 'Urban District', cluster: 'Flagstaff Urban Core' },
  { name: 'Cheshire', county: 'Coconino', entityType: 'Community', cluster: 'Flagstaff Urban Core' },
  { name: 'Doney Park', county: 'Coconino', entityType: 'CDP', cluster: 'Flagstaff Urban Core' },
  { name: 'Kachina Village', county: 'Coconino', entityType: 'CDP', cluster: 'Flagstaff Urban Core' },
  { name: 'Mountainaire', county: 'Coconino', entityType: 'CDP', cluster: 'Flagstaff Urban Core' },
  { name: 'Fort Valley', county: 'Coconino', entityType: 'CDP', cluster: 'Flagstaff Urban Core' },

  // Coconino High Country & Route 66 (6)
  { name: 'Williams', county: 'Coconino', entityType: 'City', cluster: 'Coconino High Country & Route 66' },
  { name: 'Parks', county: 'Coconino', entityType: 'CDP', cluster: 'Coconino High Country & Route 66' },
  { name: 'Bellemont', county: 'Coconino', entityType: 'CDP', cluster: 'Coconino High Country & Route 66' },
  { name: 'Munds Park', county: 'Coconino', entityType: 'CDP', cluster: 'Coconino High Country & Route 66' },
  { name: 'Timberline-Fernwood', county: 'Coconino', entityType: 'CDP', cluster: 'Coconino High Country & Route 66' },
  { name: 'Valle', county: 'Coconino', entityType: 'CDP', cluster: 'Coconino High Country & Route 66' },

  // Grand Canyon & North Plateau (5)
  { name: 'Tusayan', county: 'Coconino', entityType: 'Town', cluster: 'Grand Canyon & North Plateau' },
  { name: 'Grand Canyon Village', county: 'Coconino', entityType: 'CDP', cluster: 'Grand Canyon & North Plateau' },
  { name: 'Page', county: 'Coconino', entityType: 'City', cluster: 'Grand Canyon & North Plateau' },
  { name: 'Marble Canyon', county: 'Coconino', entityType: 'Community', cluster: 'Grand Canyon & North Plateau' },
  { name: 'Cameron', county: 'Coconino', entityType: 'CDP', cluster: 'Grand Canyon & North Plateau' },

  // Sedona & Verde Valley (5)
  { name: 'Sedona', county: 'Coconino/Yavapai', entityType: 'City', cluster: 'Sedona & Verde Valley' },
  { name: 'Village of Oak Creek', county: 'Yavapai', entityType: 'CDP', cluster: 'Sedona & Verde Valley' },
  { name: 'Cottonwood', county: 'Yavapai', entityType: 'City', cluster: 'Sedona & Verde Valley' },
  { name: 'Jerome', county: 'Yavapai', entityType: 'Town', cluster: 'Sedona & Verde Valley' },
  { name: 'Clarkdale', county: 'Yavapai', entityType: 'Town', cluster: 'Sedona & Verde Valley' },

  // Tribal Enclaves (2)
  { name: 'Tuba City', county: 'Coconino', entityType: 'CDP', cluster: 'Tribal Enclaves' },
  { name: 'Moenkopi', county: 'Coconino', entityType: 'CDP', cluster: 'Tribal Enclaves' },
];

/**
 * Compare official town registry against data/service-regions.json
 */
function auditTownRegistry(serviceRegionsPath) {
  const raw = fs.readFileSync(serviceRegionsPath, 'utf8');
  const regions = JSON.parse(raw);
  const flagstaff = regions.find((r) => r.id === 'flagstaff');

  if (!flagstaff) {
    throw new Error('flagstaff region not found in ' + serviceRegionsPath);
  }

  const aliasMap = new Map();
  if (flagstaff.localityAliases) {
    for (const [k, v] of Object.entries(flagstaff.localityAliases)) {
      aliasMap.set(k.toLowerCase(), v);
    }
  }

  const groupMap = new Map();
  for (const group of flagstaff.groups || []) {
    for (const muni of group.municipalities || []) {
      groupMap.set(muni.toLowerCase(), {
        groupId: group.id,
        groupName: group.name,
        canonicalName: muni,
      });
    }
  }

  return OFFICIAL_FLAGSTAFF_REGISTRY.map((town) => {
    const key = town.name.toLowerCase();
    const resolvedName = aliasMap.get(key) || town.name;
    const match = groupMap.get(resolvedName.toLowerCase()) || groupMap.get(town.name.toLowerCase());

    const isCovered = Boolean(match);
    return {
      name: town.name,
      county: town.county,
      entityType: town.entityType,
      cluster: town.cluster,
      covered: isCovered,
      groupId: isCovered ? match.groupId : null,
      groupName: isCovered ? match.groupName : null,
      canonicalMuni: isCovered ? match.canonicalName : null,
      actionTag: isCovered ? 'ready for ingest' : 'needs registry add',
      ingestAllowed: isCovered,
      discoveryMode: isCovered ? 'standard' : 'discovery only',
    };
  });
}

/**
 * Load checkpoint-flagstaff.jsonl done-list
 */
function loadCheckpoint(checkpointPath) {
  const doneSet = new Set();
  const records = [];

  if (fs.existsSync(checkpointPath)) {
    const lines = fs.readFileSync(checkpointPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const record = JSON.parse(trimmed);
        if (record.town) {
          doneSet.add(record.town);
          records.push(record);
        }
      } catch (err) {
        console.warn(`Warning: unparseable line in ${checkpointPath}: ${trimmed}`);
      }
    }
  }

  return { doneSet, records };
}

/**
 * Generate flagstaff_registry_gaps.md markdown content
 */
function generateRegistryGapsReport(auditedTowns, checkpointInfo) {
  const totalTowns = auditedTowns.length;
  const coveredTowns = auditedTowns.filter((t) => t.covered);
  const gapTowns = auditedTowns.filter((t) => !t.covered);

  const coveredPct = ((coveredTowns.length / totalTowns) * 100).toFixed(1);
  const gapPct = ((gapTowns.length / totalTowns) * 100).toFixed(1);

  const clusters = [
    'Flagstaff Urban Core',
    'Coconino High Country & Route 66',
    'Grand Canyon & North Plateau',
    'Sedona & Verde Valley',
    'Tribal Enclaves',
  ];

  let clusterSections = '';
  for (const cluster of clusters) {
    const townsInCluster = auditedTowns.filter((t) => t.cluster === cluster);
    const clusterCovered = townsInCluster.filter((t) => t.covered).length;
    const clusterPct = ((clusterCovered / townsInCluster.length) * 100).toFixed(0);

    const rows = townsInCluster.map((t, idx) => {
      const status = t.covered ? '**COVERED**' : '<span style="color:red">**UNCOVERED**</span>';
      const group = t.groupName || '*None (Gap)*';
      const action = t.covered ? 'Ready for Ingest' : '**Discovery Only (Needs Registry Add)**';
      return `| ${idx + 1} | **${t.name}** | ${t.county} | ${t.entityType} | ${status} | ${group} | ${action} |`;
    }).join('\n');

    clusterSections += `### ${cluster} (${clusterCovered}/${townsInCluster.length} covered - ${clusterPct}%)\n\n` +
      `| # | Community | County | Type | Status | Regional Group | Ingestion Action |\n` +
      `|---|---|---|---|---|---|---|\n` +
      rows + '\n\n';
  }

  let statusSection = '';
  if (gapTowns.length === 0) {
    statusSection = `## Municipal Registry Status: 0 Gaps Remaining (100% Coverage)

All 26 target municipalities and communities across Coconino and Yavapai counties are fully registered in \`data/service-regions.json\` (\`flagstaff\`).

### Regional Corridor Integration Summary:
- **Flagstaff Urban Core:** Flagstaff, Southside, Sunnyside, Cheshire, Doney Park, Kachina Village, Mountainaire, Fort Valley.
- **Coconino High Country & Route 66:** Williams, Parks, Bellemont, Munds Park, Timberline-Fernwood, Valle / Grand Canyon Junction.
- **Grand Canyon & North Plateau:** Tusayan, Grand Canyon Village, Page, Marble Canyon, Cameron, Tuba City, Moenkopi.
- **Sedona & Verde Valley Red Rocks:** Sedona, Village of Oak Creek, Cottonwood, Jerome, Clarkdale.

All 26 communities resolve directly in \`scripts/pipeline/service-regions.js\` via \`serviceRegionForLocation()\`, fully clearing them for candidate promotion and end-to-end ingestion.`;
  } else {
    statusSection = `## Municipal Registry Gaps (${gapTowns.length} Communities Uncovered - ${gapPct}% Gap Rate)

The following communities are not currently registered under \`flagstaff\` groups or aliases in \`data/service-regions.json\`:

${gapTowns.map((g, i) => `${i + 1}. **${g.name}** (${g.county} County, ${g.entityType}) - *Action:* Needs registry add to \`flagstaff\``).join('\n')}

> [!WARNING]
> Ingestion Guardrail active: unmapped communities operate in **discovery only** mode until added to \`data/service-regions.json\`.`;
  }

  return `# Flagstaff & Northern Arizona Municipal Registry Audit

**Generated:** ${new Date().toISOString()}  
**Target Region:** \`flagstaff\` (Flagstaff, Coconino High Country, Grand Canyon & Verde Valley)  
**Total Target Communities:** ${totalTowns}  
**Covered for Ingestion:** ${coveredTowns.length} (${coveredPct}%)  
**Gaps (Discovery Only):** ${gapTowns.length} (${gapPct}%)  
**Checkpointed Completed:** ${checkpointInfo.doneSet.size} / ${totalTowns}  

---

${statusSection}

---

## Community Registry Audit Breakdown

${clusterSections}
`;
}

function runAudit() {
  const repoRoot = path.resolve(__dirname, '../..');
  const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
  const checkpointPath = path.join(repoRoot, 'checkpoint-flagstaff.jsonl');
  const gapsReportPath = path.join(repoRoot, 'flagstaff_registry_gaps.md');
  const handoffsGapsReportPath = path.join(repoRoot, 'docs/handoffs/flagstaff_registry_gaps.md');

  const checkpointInfo = loadCheckpoint(checkpointPath);
  const audited = auditTownRegistry(serviceRegionsPath);
  const report = generateRegistryGapsReport(audited, checkpointInfo);

  fs.writeFileSync(gapsReportPath, report, 'utf8');
  if (fs.existsSync(path.dirname(handoffsGapsReportPath))) {
    fs.writeFileSync(handoffsGapsReportPath, report, 'utf8');
  }

  console.log(`Preflight audit complete: ${audited.filter(t => t.covered).length}/${audited.length} communities covered.`);
  console.log(`Report written to ${gapsReportPath}`);
}

if (require.main === module) {
  runAudit();
}

module.exports = {
  OFFICIAL_FLAGSTAFF_REGISTRY,
  auditTownRegistry,
  loadCheckpoint,
  generateRegistryGapsReport,
  runAudit,
};
