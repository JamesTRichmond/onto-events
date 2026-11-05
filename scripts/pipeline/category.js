// Genre-level category mapping. The old segment-level map rated Jazz games
// as 'fitness' (spectator sports are not workouts) and buried arts/film/misc
// — 36-41 of the first 53 real events — in one 'community' bucket, corrupting
// for-you scoring. Sports got their own category; comedy plays as nightlife.

const SEGMENT_MAP = {
  music: 'music',
  sport: 'sports',
  sports: 'sports',
  film: 'community',
  miscellaneous: 'community',
  'arts & theatre': 'community',
};

const GENRE_MAP = {
  comedy: 'nightlife',
  'casino/gaming': 'nightlife',
};

/** Map Ticketmaster classification names to an onto category. */
function categoryFor(segmentName, genreName) {
  const genre = (genreName ?? '').toLowerCase();
  if (GENRE_MAP[genre]) return GENRE_MAP[genre];
  const segment = (segmentName ?? '').toLowerCase();
  return SEGMENT_MAP[segment] ?? 'community';
}

module.exports = { categoryFor };
