const fs = require('node:fs');
const path = require('node:path');
const { parseCalendar } = require('../adapters/ics');

const proposal = require('../proposed/indianapolis/ind004-john-boner.json');
const clock = Date.parse('2026-11-14T21:30:00-05:00');

describe("IND004 John Boner Neighborhood Centers review proposal", () => {
  it('stays unenrolled and parses the fetched calendar at a fixed clock', () => {
    expect(proposal).toMatchObject({
      ledgerId: "IND004",
      enrolled: false,
      serviceRegion: null,
      sourceKind: "community",
      outcome: "verified",
      suitability: "likely_suitable",
      format: 'ics',
      url: "https://jbncenters.org/events/?ical=1",
      fetchedOn: '2026-11-14',
    });
    expect(proposal.evidence).toContain("Computer Basics");
    expect(proposal.doesNot).toContain('edit data/cities.ts');
    const body = fs.readFileSync(path.join(__dirname, '../../..', proposal.fixturePath), 'utf8');
    expect(body).toContain('BEGIN:VCALENDAR');
    const snapshot = parseCalendar(body, {
      now: clock,
      timezone: 'America/Indiana/Indianapolis',
    });
    expect(snapshot.items).toHaveLength(7);
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Digital Literacy: Computer Basics",
        start: "2026-11-17T18:00:00.000Z",
      }),
    ]));
  });
});
