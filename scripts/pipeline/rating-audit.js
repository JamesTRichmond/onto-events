const { partitionValid } = require('./schema');
const { venueKind } = require('./supply-report');
const { explicitAllAges } = require('./calendar-record');

function ratingAudit(records, venues = []) {
  const { valid, rejects } = partitionValid(records);
  const entry = (r) => ({ id: r.id, title: r.title, venue: r.venue, venueKind: venueKind(r, venues),
    sourceName: r.sourceName, sourceUrl: r.sourceUrl, startsAtIso: r.startsAtIso,
    isCancelled: r.isCancelled === true,
    explicitAllAges: explicitAllAges(`${r.title} ${r.description}`),
  });
  const general = valid.filter((r) => r.rating === 'general');
  const unknown = valid.filter((r) => venueKind(r, venues) === 'unknown');
  return {
    inputRecords: records.length, invalidRecords: rejects.length,
    generalAtBarOrClub: general.filter((r) => ['bar', 'club'].includes(venueKind(r, venues))).map(entry),
    // Name hints are review leads, not curation or evidence of venue policy.
    possibleUnmappedAdultVenues: general.filter((r) => venueKind(r, venues) === 'unknown'
      && /\b(?:bar|pub|tavern|nightclub|comedy club)\b/i.test(r.venue)).map(entry),
    unknownVenueKindRecords: unknown.length, venueMetadataComplete: unknown.length === 0,
    message: 'Review every listed general bar/club event, including explicit all-ages exceptions. Zero rows does not certify uncurated venues. This script changes no ratings.',
  };
}

module.exports = { ratingAudit };
