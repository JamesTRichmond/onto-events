const proposal = require('../proposed/indianapolis/ind019-indy-runners.json');

describe("IND019 Indy Runners and Walkers review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND019",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "reported",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://indyrunners.org/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Weekly Runs and Walks");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
