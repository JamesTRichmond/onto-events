const { PROPOSALS, renderLedger, assertReviewOnly } = require('../propose-venue-photos-nc.js');
const venues = require('../../data/venues.json');

const names = new Set(venues.map((venue) => venue.name));

it('proposes only North Carolina venues that already exist, each once', () => {
  const seen = new Set();
  const cities = new Set();
  for (const row of PROPOSALS) {
    expect(names.has(row.venue)).toBe(true);
    const venue = venues.find((item) => item.name === row.venue);
    expect(venue.region).toBe('NC');
    expect(seen.has(row.venue)).toBe(false);
    seen.add(row.venue);
    cities.add(venue.locality);
  }
  expect(PROPOSALS).toHaveLength(22);
  expect(cities).toEqual(new Set(['Asheville', 'Black Mountain']));
});

it('keeps a free license and skips the places that were the wrong picture', () => {
  const named = PROPOSALS.map((row) => row.venue);
  expect(named).not.toContain('First Baptist Church Weaverville');
  expect(named).not.toContain('Asheville Yacht Club');
  expect(named).not.toContain('Black Mountain Library');
  expect(named).toContain('Biltmore Estate');
  expect(named).toContain('White Horse Black Mountain');
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
  expect(ledger).toContain('Weaverville was searched');
  expect(ledger).toContain('Asheville Art Museum');
  expect(() => assertReviewOnly('data/venues.json')).toThrow(/refusing to write/);
  expect(() => assertReviewOnly('docs/sources/proposals/venue-photos-nc.md')).not.toThrow();
});
