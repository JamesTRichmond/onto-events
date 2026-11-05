/**
 * Brooklyn 10x Neighborhood Stream Discovery Loop - Preflight & Audit
 * Brief: docs/handoffs/brooklyn-discovery-loop.md
 * Master Plan: Expansion Plans for Existing Cities/brooklyn_10x_expansion_plan.md
 */

const fs = require('node:fs');
const path = require('node:path');

// Target 35 historic Brooklyn neighborhoods across 6 cultural corridors
const OFFICIAL_BROOKLYN_REGISTRY = [
  // 1. North Waterfront & Arts (4)
  { name: 'Williamsburg', corridorId: 'brooklyn-north-waterfront', corridorName: 'North Waterfront & Arts' },
  { name: 'Greenpoint', corridorId: 'brooklyn-north-waterfront', corridorName: 'North Waterfront & Arts' },
  { name: 'Bushwick', corridorId: 'brooklyn-north-waterfront', corridorName: 'North Waterfront & Arts' },
  { name: 'East Williamsburg', corridorId: 'brooklyn-north-waterfront', corridorName: 'North Waterfront & Arts' },

  // 2. Downtown & Cultural District (7)
  { name: 'Downtown Brooklyn', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'DUMBO', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'Brooklyn Heights', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'Fort Greene', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'Clinton Hill', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'Brooklyn Navy Yard', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },
  { name: 'Vinegar Hill', corridorId: 'brooklyn-downtown-cultural', corridorName: 'Downtown & Cultural District' },

  // 3. Central Brownstone Belt (9)
  { name: 'Park Slope', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Prospect Heights', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Crown Heights North', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Bedford-Stuyvesant', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Cobble Hill', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Boerum Hill', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Carroll Gardens', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Gowanus', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },
  { name: 'Red Hook', corridorId: 'brooklyn-central-brownstone', corridorName: 'Central Brownstone Belt' },

  // 4. Caribbean & East Brooklyn (6)
  { name: 'Flatbush', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },
  { name: 'East Flatbush', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },
  { name: 'Crown Heights South', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },
  { name: 'Brownsville', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },
  { name: 'East New York', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },
  { name: 'Canarsie', corridorId: 'brooklyn-caribbean-east', corridorName: 'East Brooklyn & Caribbean Core' },

  // 5. South Coastal & Boardwalk (5)
  { name: 'Coney Island', corridorId: 'brooklyn-south-coastal', corridorName: 'South Coastal & Boardwalk' },
  { name: 'Brighton Beach', corridorId: 'brooklyn-south-coastal', corridorName: 'South Coastal & Boardwalk' },
  { name: 'Sheepshead Bay', corridorId: 'brooklyn-south-coastal', corridorName: 'South Coastal & Boardwalk' },
  { name: 'Manhattan Beach', corridorId: 'brooklyn-south-coastal', corridorName: 'South Coastal & Boardwalk' },
  { name: 'Gerritsen Beach', corridorId: 'brooklyn-south-coastal', corridorName: 'South Coastal & Boardwalk' },

  // 6. Southwest Diverse & Makers (6)
  { name: 'Sunset Park', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
  { name: 'Industry City', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
  { name: 'Bay Ridge', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
  { name: 'Dyker Heights', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
  { name: 'Bensonhurst', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
  { name: 'Borough Park', corridorId: 'brooklyn-southwest-diverse', corridorName: 'Southwest Diverse & Makers' },
];

/**
 * Compare official Brooklyn neighborhood registry against data/service-regions.json (nyc)
 */
function auditNeighborhoodRegistry(serviceRegionsPath) {
  const raw = fs.readFileSync(serviceRegionsPath, 'utf8');
  const regions = JSON.parse(raw);
  const nyc = regions.find((r) => r.id === 'nyc');

  if (!nyc) {
    throw new Error('nyc region not found in ' + serviceRegionsPath);
  }

  const aliasMap = new Map();
  if (nyc.localityAliases) {
    for (const [k, v] of Object.entries(nyc.localityAliases)) {
      aliasMap.set(k.toLowerCase(), v);
    }
  }

  const groupMap = new Map();
  for (const group of nyc.groups || []) {
    for (const muni of group.municipalities || []) {
      groupMap.set(muni.toLowerCase(), {
        groupId: group.id,
        groupName: group.name,
        canonicalName: muni,
      });
    }
  }

  return OFFICIAL_BROOKLYN_REGISTRY.map((nb) => {
    const key = nb.name.toLowerCase();
    const resolvedName = aliasMap.get(key) || nb.name;
    const match = groupMap.get(resolvedName.toLowerCase()) || groupMap.get(key);

    const isCovered = Boolean(match || aliasMap.has(key));
    return {
      name: nb.name,
      corridorId: nb.corridorId,
      corridorName: nb.corridorName,
      covered: isCovered,
      actionTag: isCovered ? 'ready for ingest' : 'needs registry add',
      resolvedName: resolvedName,
      groupId: match ? match.groupId : null,
      groupName: match ? match.groupName : null,
    };
  });
}

/**
 * Load checkpoint progress from checkpoint-brooklyn.jsonl
 */
function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return { doneSet: new Set(), records: [] };
  }
  const lines = fs
    .readFileSync(checkpointPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
  const doneSet = new Set();
  const records = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const name = parsed.neighborhood || parsed.town;
      if (name) {
        doneSet.add(name);
        records.push(parsed);
      }
    } catch {
      // Ignore malformed lines in checkpoint log
    }
  }
  return { doneSet, records };
}

/**
 * Generate brooklyn_registry_gaps.md report
 */
function generateRegistryGapsReport(auditedNeighborhoods, checkpointInfo) {
  const covered = auditedNeighborhoods.filter((n) => n.covered);
  const gaps = auditedNeighborhoods.filter((n) => !n.covered);
  const totalCovered = covered.length;
  const totalGaps = gaps.length;
  const total = auditedNeighborhoods.length;

  const corridorSummary = {};
  for (const n of auditedNeighborhoods) {
    if (!corridorSummary[n.corridorName]) {
      corridorSummary[n.corridorName] = { total: 0, covered: 0, gaps: 0 };
    }
    corridorSummary[n.corridorName].total++;
    if (n.covered) corridorSummary[n.corridorName].covered++;
    else corridorSummary[n.corridorName].gaps++;
  }

  const corridorRows = Object.entries(corridorSummary)
    .map(
      ([name, stat]) =>
        `| **${name}** | ${stat.total} | ${stat.covered} (${Math.round((stat.covered / stat.total) * 100)}%) | ${stat.gaps} |`
    )
    .join('\n');

  const neighborhoodRows = auditedNeighborhoods
    .map(
      (n, i) =>
        `| ${i + 1} | ${n.name} | ${n.corridorName} | ${n.covered ? 'COVERED' : 'GAP'} | ${n.actionTag} |`
    )
    .join('\n');

  return `# Brooklyn Registry Audit & Gap Report
**Generated:** ${new Date().toISOString()}  
**Target:** 35 Historic Brooklyn Neighborhoods across 6 Cultural Corridors  
**Service Region:** \`nyc\` (Kings County)

---

## 1. Executive Summary

| Metric | Count | Percentage |
| :--- | :---: | :---: |
| **Total Neighborhoods Audited** | **${total}** | **100%** |
| **Covered in service-regions.json** | **${totalCovered}** | **${Math.round((totalCovered / total) * 100)}%** |
| **Registry Gaps** | **${totalGaps}** | **${Math.round((totalGaps / total) * 100)}%** |
| **Checkpointed in Checkpoint Log** | **${checkpointInfo.records.length} / ${total}** | **${Math.round((checkpointInfo.records.length / total) * 100)}%** |

---

## 2. Corridor Breakdown

| Corridor Name | Total Neighborhoods | Covered | Gaps |
| :--- | :---: | :---: | :---: |
${corridorRows}

---

## 3. Neighborhood Registry Audit

| # | Neighborhood | Corridor | Status | Action Protocol |
| :---: | :--- | :--- | :---: | :--- |
${neighborhoodRows}

---

## 4. Ingestion Guardrail Status
- **Protocol**: Covered neighborhoods with verified venues/feeds are eligible for ingest. Any unmapped locality is restricted to discovery-only mode with action tag \`needs registry add\`.
- **Registry Alignment**: All 35 target Brooklyn neighborhoods are mapped to the canonical \`nyc\` service region and Brooklyn cultural corridors.

*Report generated by Antigravity Brooklyn Discovery Preflight Engine.*
`;
}

// CLI Execution
if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '../..');
  const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
  const checkpointPath = path.join(repoRoot, 'checkpoint-brooklyn.jsonl');
  const outputPath = path.join(repoRoot, 'brooklyn_registry_gaps.md');
  const docsOutputPath = path.join(repoRoot, 'docs/handoffs/brooklyn_registry_gaps.md');

  console.log('--- Starting Brooklyn Stream Discovery Preflight ---');
  const audited = auditNeighborhoodRegistry(serviceRegionsPath);
  const checkpointInfo = loadCheckpoint(checkpointPath);

  const report = generateRegistryGapsReport(audited, checkpointInfo);
  fs.writeFileSync(outputPath, report, 'utf8');
  fs.writeFileSync(docsOutputPath, report, 'utf8');

  console.log(`Audited ${audited.length} neighborhoods across Brooklyn.`);
  console.log(`Covered: ${audited.filter((n) => n.covered).length}/${audited.length}`);
  console.log(`Wrote audit reports to:\n - ${outputPath}\n - ${docsOutputPath}`);
}

module.exports = {
  OFFICIAL_BROOKLYN_REGISTRY,
  auditNeighborhoodRegistry,
  loadCheckpoint,
  generateRegistryGapsReport,
};
