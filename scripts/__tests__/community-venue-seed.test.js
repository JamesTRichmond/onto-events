const fs = require('node:fs');
const path = require('node:path');
const { serviceRegionForLocation } = require('../pipeline/service-regions');

const root = path.resolve(__dirname, '../..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/venues.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/seeds/community-venues-vermont-pilot.sql'), 'utf8');
const rows = JSON.parse(sql.match(/\$places\$([\s\S]+?)\$places\$/)[1]);

describe('reviewed Vermont hosting venue candidate', () => {
  test('contains only the four explicitly selected library identities', () => {
    expect(rows.map(v => v.id)).toEqual([
      'vt-bixby-library', 'vt-kellogg-hubbard-library', 'vt-fletcher-main', 'vt-fletcher-north',
    ]);
  });

  test.each(rows.map(v => [v.id, v]))('%s matches an existing public publisher venue', (_id, candidate) => {
    const matches = registry.filter(v => v.name === candidate.name);
    expect(matches).toHaveLength(1);
    const original = matches[0];
    expect(original.kind).toBe('library');
    expect(original.address).toBeTruthy();
    expect(original.verifiedOn).toBe('2026-10-08');
    expect(candidate).toMatchObject({
      name: original.name, locality: original.locality, region: original.region,
      country_code: original.countryCode, latitude: original.lat, longitude: original.lng,
      evidence_url: original.sourceUrl, active: true,
    });
    // Public-place identity is the source check; independent map precision is not a gate.
    expect(serviceRegionForLocation({
      lat: candidate.latitude, lng: candidate.longitude, locality: candidate.locality,
      region: candidate.region, countryCode: candidate.country_code,
    })?.id).toBe(candidate.service_region);
    expect(candidate.service_region).toBe('vermont-corridor');
    expect(candidate.timezone).toBe('America/New_York');
    expect(candidate.country_code).toBe('US');
    expect(candidate.region).toBe('VT');
    expect(candidate.evidence_url).toMatch(/^https:\/\//);
  });
});
