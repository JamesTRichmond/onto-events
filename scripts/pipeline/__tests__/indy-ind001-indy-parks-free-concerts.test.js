const proposal = require('../proposed/indianapolis/ind001-indy-parks-free-concerts.json');

describe("IND001 Indy Parks free concert series review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND001",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://parks.indy.gov/free-concert-series/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("ShooBeeLoo");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
