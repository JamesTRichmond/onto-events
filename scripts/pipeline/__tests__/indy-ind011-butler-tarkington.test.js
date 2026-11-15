const proposal = require('../proposed/indianapolis/ind011-butler-tarkington.json');

describe("IND011 Butler-Tarkington Neighborhood Association review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND011",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://www.butlertarkington.org/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("BTNA Board Meeting");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
