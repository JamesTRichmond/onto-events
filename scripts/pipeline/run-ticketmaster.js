// Compatibility entrypoint for the Ticketmaster-only offline bake.
const tm = require('./adapters/ticketmaster');
const runner = require('./run-source');

// The frozen offline Activity contract does not include catalog-only metadata.
// Keep it out of the next bake without touching the bake script or output file.
function forOfflineBundle(result) {
  return { ...result, records: result.records.map(({ sourceKind, venueKind, ...record }) => record) };
}

function processTicketmasterPages(pages, overrides) {
  return forOfflineBundle(runner.processSourceItems(tm, tm.snapshotFromPages(pages), { overrides }));
}

async function fetchTicketmasterRecords({ key, ...options } = {}) {
  return forOfflineBundle(await runner.fetchSourceRecords(tm, { ...options, secrets: { TM_KEY: key } }));
}

module.exports = {
  SLC: tm.SLC, RADIUS_MILES: tm.RADIUS_MILES,
  processTicketmasterPages, fetchTicketmasterRecords,
};
