const proposal = require('../proposed/indianapolis/ind009-mass-ave.json');

describe("IND009 Mass Ave Cultural Arts District review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND009",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://massaveindy.org/events/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Merry Mile");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
