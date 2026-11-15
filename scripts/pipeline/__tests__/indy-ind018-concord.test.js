const proposal = require('../proposed/indianapolis/ind018-concord.json');

describe("IND018 Concord Neighborhood Center review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND018",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "reported",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://concordindy.org/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Early Childhood");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
