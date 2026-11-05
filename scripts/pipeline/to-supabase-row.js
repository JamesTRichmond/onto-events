const { sourceProfile } = require('./source-trust');
const { readEventFacts } = require('./event-facts');

function httpsOrNull(value) {
  return typeof value === 'string' && /^https:\/\//.test(value) ? value : null;
}

function toSupabaseRow(record, ingestedAt = new Date().toISOString()) {
  if (!record || typeof record !== 'object') throw new Error('event record is required');
  if (typeof record.id !== 'string' || record.id === '') throw new Error('event id is required');

  const eventFacts = readEventFacts(record.eventFacts);
  if (['free', 'paid'].includes(record.admission) && eventFacts.admission?.value !== record.admission) {
    delete eventFacts.admission;
  }

  return {
    id: record.id,
    source_name: record.sourceName ?? 'Unknown',
    source_event_id: record.sourceEventId ?? record.id.replace(/^tm-/, ''),
    source_url: httpsOrNull(record.sourceUrl),
    title: record.title,
    description: record.description ?? null,
    venue_name: record.venue ?? null,
    locality: record.locality ?? null,
    region: record.region ?? null,
    country_code: record.countryCode ?? 'US',
    latitude: Number.isFinite(record.lat) ? record.lat : null,
    longitude: Number.isFinite(record.lng) ? record.lng : null,
    category: record.category,
    rating: record.rating,
    starts_at: record.startsAtIso,
    ends_at: record.endsAtIso ?? null,
    timezone: record.timezone ?? null,
    image_url: httpsOrNull(record.imageUrl),
    is_cancelled: record.isCancelled === true,
    is_roadtrip: record.category === 'roadtrip',
    provenance: {
      source: record.sourceName ?? 'Unknown',
      ingested_by: 'onto-events-sync',
      ...sourceProfile(record),
      ...(Object.keys(eventFacts).length ? { eventFacts } : {}),
    },
    ingested_at: ingestedAt,
    updated_at: ingestedAt,
  };
}

module.exports = { toSupabaseRow };
