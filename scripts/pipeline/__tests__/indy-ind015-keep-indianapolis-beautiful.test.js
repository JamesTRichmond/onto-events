const proposal = require('../proposed/indianapolis/ind015-keep-indianapolis-beautiful.json');

describe("IND015 Keep Indianapolis Beautiful review proposal", () => {
  it('records the fetched page and does not enroll Indianapolis', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND015",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "reported",
      suitability: "likely_suitable",
      format: 'html',
      url: "https://www.kibi.org/program/great-indy-cleanup/",
      fetchedOn: '2026-11-14',
      fixturePath: null,
    });
    expect(proposal.evidence).toContain("April through October");
    expect(proposal.evidence).toContain('No ICS was invented');
    expect(proposal.doesNot).toContain('edit data/cities.ts');
  });
});
