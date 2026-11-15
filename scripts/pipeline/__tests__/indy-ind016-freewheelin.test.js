const proposal = require('../proposed/indianapolis/ind016-freewheelin.json');

describe("IND016 Freewheelin' Community Bikes review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND016",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "reported",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://www.freewheelinbikes.org/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Bicycle Mechanics Classes");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
