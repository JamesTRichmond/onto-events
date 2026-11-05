const path = require('node:path');

// Registration-only stub: no payload schema or event rows have been verified.
// Removing pausedReason must not turn this into a successful empty import.
function createSocrataAdapter(feed) {
  const snapshot = () => ({
    items: [], truncated: true, retireMissing: false,
    skipReason: 'Socrata reader not implemented; source evidence requires verification',
  });
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [],
    idPrefix: `socrata-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: snapshot,
    fetch: async () => snapshot(),
    normalize: () => null,
  };
}

module.exports = { createSocrataAdapter };
