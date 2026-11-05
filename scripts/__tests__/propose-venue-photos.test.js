const { PROPOSALS, renderLedger, assertReviewOnly } = require('../propose-venue-photos.js');
const venues = require('../../data/venues.json');

const names = new Set(venues.flatMap((venue) => [venue.name, ...venue.aliases]));

it('proposes only venues that already exist, each once', () => {
  const seen = new Set();
  for (const row of PROPOSALS) {
    expect(names.has(row.venue)).toBe(true);
    expect(seen.has(row.venue)).toBe(false);
    seen.add(row.venue);
  }
  expect(PROPOSALS.length).toBeGreaterThan(0);
});

it('keeps every proposal on a Commons file page with a recorded license and reason', () => {
  for (const row of PROPOSALS) {
    expect(row.sourcePage).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(row.license).toMatch(/CC BY-SA|Public domain/);
    expect(row.credit.length).toBeGreaterThan(0);
    expect(row.why.length).toBeGreaterThan(20);
    expect(row.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
});

it('renders a ledger a person can read and does not write the venue registry', () => {
  const ledger = renderLedger(PROPOSALS, { searched: 51 });
  expect(ledger).toContain('does not change `data/venues.json`');
  expect(ledger).toContain('Clark Planetarium');
  expect(ledger).toContain('https://commons.wikimedia.org/wiki/File:Clark_Planetarium_at_The_Gateway.JPG');
  expect(() => assertReviewOnly('data/venues.json')).toThrow(/refusing to write/);
  expect(() => assertReviewOnly('docs/sources/proposals/venue-photos.md')).not.toThrow();
});
