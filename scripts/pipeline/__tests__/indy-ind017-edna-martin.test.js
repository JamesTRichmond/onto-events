const proposal = require('../proposed/indianapolis/ind017-edna-martin.json');

describe("IND017 Edna Martin Christian Center review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND017",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "reported",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://ednamartincc.org/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("Senior Programs");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
