const { PROPOSALS, renderLedger, assertReviewOnly } = require('../propose-venue-photos-vt-fl.js');
const venues = require('../../data/venues.json');
const { serviceRegionForLocation } = require('../pipeline/service-regions');

const names = new Set(venues.map((venue) => venue.name));
const vtfl = venues.filter((venue) => venue.region === 'VT' || venue.region === 'FL');

it('proposes only Vermont and Florida venues that already exist, each once', () => {
  const seen = new Set();
  for (const row of PROPOSALS) {
    expect(names.has(row.venue)).toBe(true);
    const venue = venues.find((item) => item.name === row.venue);
    expect(venue.region === 'VT' || venue.region === 'FL').toBe(true);
    expect(seen.has(row.venue)).toBe(false);
    seen.add(row.venue);
  }
  expect(PROPOSALS.length).toBe(69);
  // 215 was the VT+FL set covered by the 2026-10-17 photo search. City launches only add venues.
  // Cross-check the region tag against the pipeline's own lookup: VT = vermont-corridor,
  // FL = every other region whose venues sit in Florida. Independent of the filter above.
  const FL = new Set(['tallahassee', 'jacksonville', 'miami', 'tampa-bay', 'orlando', 'key-west', 'gainesville', 'pensacola']);
  const byLookup = venues.filter((v) => {
    const id = serviceRegionForLocation({ ...v, countryCode: v.countryCode ?? 'US' })?.id;
    return id === 'vermont-corridor' || FL.has(id);
  });
  expect(byLookup.length).toBeGreaterThan(0);
  expect(vtfl).toHaveLength(byLookup.length);
  // 215 is the set the 2026-10-17 search covered (ledger line); launches only add venues.
  expect(vtfl.length).toBeGreaterThanOrEqual(215);
});

it('keeps a free license, a credit, and a Commons page, and skips the known wrong files', () => {
  const venuesNamed = PROPOSALS.map((row) => row.venue);
  expect(venuesNamed).not.toContain('Pierson Library');
  expect(venuesNamed).not.toContain('Young Actors Theatre');
  expect(venuesNamed).toContain('Fletcher Free Library Main Library');
  expect(venuesNamed).toContain('Museum of Florida History at R.A. Gray Building');
  expect(venuesNamed).not.toContain('Tallahassee Museum');
  for (const row of PROPOSALS) {
    expect(row.sourcePage).toBe('https://commons.wikimedia.org/wiki/' + encodeURI(row.file.replace(/ /g, '_')));
    expect(row.license).toMatch(/CC BY|CC0|Public domain/);
    expect(row.license).not.toMatch(/NC|ND/);
    expect(row.credit.length).toBeGreaterThan(0);
    expect(row.why.length).toBeGreaterThan(20);
    expect(row.checkedOn).toBe('2026-10-17');
  }
});

it('renders a ledger a person can read and does not write the venue registry', () => {
  const ledger = renderLedger(PROPOSALS);
  expect(ledger).toContain('does not change `data/venues.json`');
  expect(ledger).toContain('215 in all');
  expect(ledger).toContain('Middlebury Chapel');
  expect(() => assertReviewOnly('data/venues.json')).toThrow(/refusing to write/);
  expect(() => assertReviewOnly('docs/sources/proposals/venue-photos-vt-fl.md')).not.toThrow();
});
