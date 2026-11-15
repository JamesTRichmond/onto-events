const proposal = require('../proposed/indianapolis/ind006-broad-ripple-farmers-market.json');

describe("IND006 Broad Ripple Farmers Market review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND006",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://www.broadrippleindy.org/farmers-market/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("BRFM Winter Market");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
