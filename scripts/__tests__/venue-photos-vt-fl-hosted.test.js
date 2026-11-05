const { readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const sizeOf = require('image-size');
const { PROPOSALS } = require('../propose-venue-photos-vt-fl.js');
const { PROPOSALS: northCarolina } = require('../propose-venue-photos-nc.js');

const root = join(__dirname, '../..');
const registryPath = join(root, 'data/venue-photos.ts');
const photoDir = join(root, 'assets/venue-photos');

it('hosts the 69 Vermont and Florida pictures next to the 14 Salt Lake ones', () => {
  const registry = readFileSync(registryPath, 'utf8');
  const slugs = [...registry.matchAll(/@\/assets\/venue-photos\/([a-z0-9-]+)\.webp/g)].map((match) => match[1]);
  expect(new Set(slugs).size).toBe(14 + PROPOSALS.length + northCarolina.length);
  expect(PROPOSALS).toHaveLength(69);
  expect(registry).not.toContain('Pierson Library');
  expect(registry).not.toContain('Young Actors Theatre');
  expect(registry).not.toContain("venue: 'Tallahassee Museum'");

  for (const slug of slugs) {
    const file = join(photoDir, `${slug}.webp`);
    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(400);
    expect(bytes).toBeLessThanOrEqual(30_000);
    expect(sizeOf(file)).toMatchObject({ width: 320, height: 200, type: 'webp' });
  }

  for (const row of PROPOSALS) {
    const venue = row.venue.replace(/'/g, "\\'");
    expect(registry).toContain(`venue: '${venue}'`);
    expect(registry).toContain(row.sourcePage.replace(/'/g, "\\'"));
    expect(row.license).toMatch(/CC BY|CC0|Public domain/);
    expect(row.license).not.toMatch(/NC|ND/);
  }
});
