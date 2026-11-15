const proposal = require('../proposed/indianapolis/ind012-svdp-indy.json');

describe("IND012 St. Vincent de Paul Indianapolis review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND012",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://www.svdpindy.org/calendar/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Discovery Days");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
