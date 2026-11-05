/**
 * Tallahassee & Capital Region 10x Stream Discovery Loop - Preflight & Runner
 * Brief: docs/handoffs/tallahassee-discovery-loop.md
 */

const fs = require('node:fs');
const path = require('node:path');

// Official Big Bend Target Registry: 32 Communities across 4 Counties
const OFFICIAL_TLH_REGISTRY = [
  // Leon County (1 Incorporated City, 13 Unincorporated Communities = 14)
  { name: 'Tallahassee', county: 'Leon', entityType: 'City' },
  { name: 'Woodville', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Miccosukee', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Fort Braden', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Chaires', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Bradfordville', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Capitola', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Baum', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Ochlockonee', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Lake Iamonia', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Centerville', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Wadesboro', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Black Creek', county: 'Leon', entityType: 'Unincorporated Community' },
  { name: 'Silver Lake', county: 'Leon', entityType: 'Unincorporated Community' },

  // Wakulla County (6 Communities)
  { name: 'Crawfordville', county: 'Wakulla', entityType: 'Unincorporated Community' },
  { name: 'St. Marks', county: 'Wakulla', entityType: 'City' },
  { name: 'Panacea', county: 'Wakulla', entityType: 'Unincorporated Community' },
  { name: 'Sopchoppy', county: 'Wakulla', entityType: 'City' },
  { name: 'Shell Point Beach', county: 'Wakulla', entityType: 'Unincorporated Community' },
  { name: 'Medart', county: 'Wakulla', entityType: 'Unincorporated Community' },

  // Gadsden County (6 Communities)
  { name: 'Quincy', county: 'Gadsden', entityType: 'City' },
  { name: 'Havana', county: 'Gadsden', entityType: 'Town' },
  { name: 'Midway', county: 'Gadsden', entityType: 'City' },
  { name: 'Gretna', county: 'Gadsden', entityType: 'City' },
  { name: 'Chattahoochee', county: 'Gadsden', entityType: 'City' },
  { name: 'Greensboro', county: 'Gadsden', entityType: 'Town' },

  // Jefferson County (6 Communities)
  { name: 'Monticello', county: 'Jefferson', entityType: 'City' },
  { name: 'Lloyd', county: 'Jefferson', entityType: 'Unincorporated Community' },
  { name: 'Wacissa', county: 'Jefferson', entityType: 'Unincorporated Community' },
  { name: 'Lamont', county: 'Jefferson', entityType: 'Unincorporated Community' },
  { name: 'Waukeenah', county: 'Jefferson', entityType: 'Unincorporated Community' },
  { name: 'Drifton', county: 'Jefferson', entityType: 'Unincorporated Community' },
];

/**
 * Compare official community registry against data/service-regions.json (tallahassee)
 */
function auditCommunityRegistry(serviceRegionsPath) {
  const raw = fs.readFileSync(serviceRegionsPath, 'utf8');
  const regions = JSON.parse(raw);
  const tlh = regions.find((r) => r.id === 'tallahassee');

  if (!tlh) {
    throw new Error('tallahassee region not found in ' + serviceRegionsPath);
  }

  const aliasMap = new Map();
  if (tlh.localityAliases) {
    for (const [k, v] of Object.entries(tlh.localityAliases)) {
      aliasMap.set(k.toLowerCase().trim(), v.trim());
    }
  }

  const groupMap = new Map();
  if (tlh.groups) {
    for (const g of tlh.groups) {
      for (const m of g.municipalities) {
        groupMap.set(m.toLowerCase().trim(), { groupId: g.id, groupName: g.name });
      }
    }
  }

  return OFFICIAL_TLH_REGISTRY.map((community) => {
    const rawName = community.name.toLowerCase().trim();
    const resolvedName = aliasMap.get(rawName) || community.name;
    const groupInfo = groupMap.get(resolvedName.toLowerCase().trim()) || groupMap.get(rawName);

    const isCovered = Boolean(groupInfo);

    return {
      name: community.name,
      county: community.county,
      entityType: community.entityType,
      covered: isCovered,
      actionTag: isCovered ? 'ready for ingest' : 'needs registry add',
      groupId: groupInfo ? groupInfo.groupId : null,
      groupName: groupInfo ? groupInfo.groupName : null,
    };
  });
}

function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return { doneSet: new Set(), records: [] };
  }
  const lines = fs.readFileSync(checkpointPath, 'utf8').split('\n').filter(Boolean);
  const records = [];
  const doneSet = new Set();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      records.push(parsed);
      if (parsed.town) doneSet.add(parsed.town);
    } catch {
      // ignore corrupt lines
    }
  }
  return { doneSet, records };
}

function generateRegistryGapsReport(auditedCommunities, checkpointInfo) {
  const total = auditedCommunities.length;
  const covered = auditedCommunities.filter((c) => c.covered);
  const uncovered = auditedCommunities.filter((c) => !c.covered);

  const formatRows = (countyName) =>
    auditedCommunities
      .filter((c) => c.county === countyName)
      .map(
        (c, i) =>
          `| ${i + 1} | ${c.name} | ${c.entityType} | ${c.covered ? '✅ Covered' : '❌ Uncovered'} | ${
            c.groupName || 'None'
          } | \`${c.actionTag}\` |`
      )
      .join('\n');

  return `# Tallahassee & Capital Region Stream Discovery Preflight: Registry Gap Report

**Generated:** ${new Date().toISOString()}  
**Target Region:** Tallahassee & Big Bend Corridor (\`tallahassee\`)  
**Scope:** 32 Municipalities & Communities across 4 Counties (Leon, Wakulla, Gadsden, Jefferson)  

---

## 1. Executive Summary

| Metric | Target | Current Status | Notes |
| :--- | :---: | :---: | :--- |
| **Total Official Communities** | 32 | ${total} | Leon (14), Wakulla (6), Gadsden (6), Jefferson (6) |
| **Covered in Service Region** | 32 | **${covered.length}** | Fully mapped to active groups |
| **Registry Gaps (Uncovered)** | 0 | **${uncovered.length}** | Tagged \`needs registry add\` |
| **Checkpointed / Completed** | - | **${checkpointInfo.records.length}** | Loaded from \`checkpoint-tlh.jsonl\` |

---

## 2. Leon County Audit (14 Communities)

| # | Community | Type | Status in Registry | Group in tallahassee | Action Protocol |
| :---: | :--- | :---: | :---: | :--- | :--- |
${formatRows('Leon')}

---

## 3. Wakulla County Audit (6 Communities)

| # | Community | Type | Status in Registry | Group in tallahassee | Action Protocol |
| :---: | :--- | :---: | :---: | :--- | :--- |
${formatRows('Wakulla')}

---

## 4. Gadsden County Audit (6 Communities)

| # | Community | Type | Status in Registry | Group in tallahassee | Action Protocol |
| :---: | :--- | :---: | :---: | :--- | :--- |
${formatRows('Gadsden')}

---

## 5. Jefferson County Audit (6 Communities)

| # | Community | Type | Status in Registry | Group in tallahassee | Action Protocol |
| :---: | :--- | :---: | :---: | :--- | :--- |
${formatRows('Jefferson')}

---

## 6. Registry Gaps Detail (${uncovered.length} Gaps)

${
  uncovered.length === 0
    ? '✅ All 32 communities across Leon, Wakulla, Gadsden, and Jefferson counties are registered in `data/service-regions.json`!'
    : uncovered
        .map((c) => `- **${c.name}** (${c.county}): needs entry in \`data/service-regions.json\``)
        .join('\n')
}

---

## 7. Restart & Checkpoint Architecture

- Checkpoint file: \`checkpoint-tlh.jsonl\` located in repo root.
- **Finished Communities:** ${checkpointInfo.records.length}
- **Remaining Communities:** ${32 - checkpointInfo.records.length}

*Report generated by Autonomous Builder Agent Preflight Engine.*
`;
}

if (require.main === module) {
  const repoRoot = path.resolve(__dirname, '../..');
  const serviceRegionsPath = path.join(repoRoot, 'data/service-regions.json');
  const checkpointPath = path.join(repoRoot, 'checkpoint-tlh.jsonl');
  const outputPath = path.join(repoRoot, 'tallahassee_registry_gaps.md');

  console.log('--- Starting Tallahassee Stream Discovery Preflight ---');
  const audited = auditCommunityRegistry(serviceRegionsPath);
  const checkpointInfo = loadCheckpoint(checkpointPath);
  const report = generateRegistryGapsReport(audited, checkpointInfo);
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log('Audited 32 communities. Wrote', outputPath);
}

module.exports = {
  OFFICIAL_TLH_REGISTRY,
  auditCommunityRegistry,
  loadCheckpoint,
  generateRegistryGapsReport,
};
