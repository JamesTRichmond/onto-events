const fs = require('node:fs');
const path = require('node:path');

const { calendarRecord, displayDescription } = require('../calendar-record');
const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');

const clark = feeds.find((feed) => feed.id === 'clark-planetarium');

const trumba = [
  'Event Location/Address: 110 South 400 West',
  'Ages: All ages',
  'Neighborhood: Salt Lake City',
  'Department Phone: 385-555-0100',
  'Department Email: staff@example.gov',
  'Contact Name: Pat Example',
  'Contact phone: 385-555-0101',
  'Event Type: Activities',
  'Register Link: example.eventbrite.com',
  'Join us for a sensory friendly morning under the dome.',
].join('<br>');

describe('Trumba county descriptions', () => {
  it('keeps the prose and drops the listing fields and staff contacts', () => {
    expect(displayDescription(trumba)).toBe('Join us for a sensory friendly morning under the dome.');
  });

  it('drops a field label cut short by a fixture capture', () => {
    expect(displayDescription('Department Phone: [phone redacted]<br>Departm [trimmed]')).toBe('');
    expect(displayDescription('Event Location/Address: x<br>Sensory Friendly Program [trimmed]')).toBe('');
  });

  it('leaves no metadata fragment in any county fixture description', () => {
    for (const id of ['clark-planetarium', 'slco-events', 'slco-parks-recreation']) {
      const ics = fs.readFileSync(path.join(__dirname, '../fixtures/ics', `${id}.ics`), 'utf8')
        .replace(/\r?\n[ \t]/g, '');
      const descriptions = [...ics.matchAll(/^DESCRIPTION[^:]*:(.*)$/gm)]
        .map(([, value]) => value.replace(/\\n/g, '\n').replace(/\\([,;])/g, '$1').trim());
      expect(descriptions.length).toBeGreaterThan(0);
      for (const description of descriptions) expect(displayDescription(description)).toBe('');
    }
  });

  it('drops the Buncombe County library fields and the blank lines they leave', () => {
    const library = [
      'Location: Pack Memorial Library - 67 Haywood St. - Asheville', 'Phone: (828) 555-0100',
      'Email: library@example.gov', 'Event Type: Story Time for Kids', 'Age Group: Preschool - (ages 3-5)',
      'Library: Pack Memorial', 'Link: https://example.gov/pack-memorial.aspx', '',
      'Join us for a story time designed for children ages 3 to 5 years.',
    ].join('<br>');
    expect(displayDescription(library)).toBe('Join us for a story time designed for children ages 3 to 5 years.');
    const offsite = 'Phone: (828) 555-0100<br>Event Type: Book Club<br>Age Group: Adult<br><br>Join other book lovers.';
    expect(displayDescription(offsite)).toBe('Join other book lovers.');
    const prose = 'Location: meet at the trailhead<br>Phone: bring yours<br>Bring water.';
    expect(displayDescription(prose)).toBe(prose);
  });

  it('leaves descriptions without a Trumba marker untouched', () => {
    const other = 'Ages: 5-12<br>Bring water and a hat.';
    expect(displayDescription(other)).toBe(other);
  });

  it('rates on the full source text while the card shows only the prose', () => {
    const record = calendarRecord({
      uid: 'trumba-1', title: 'Late show', location: 'Clark Planetarium',
      description: `Department Phone: 385-555-0100<br>Ages: 21+ only<br>Laser show after dark.`,
      start: '2026-10-03T03:00:00.000Z',
    }, { feed: clark, venues });

    expect(record.description).toBe('Laser show after dark.');
    expect(record.rating).toBe('mature');
  });

  it('falls back to the title when a listing carries no prose at all', () => {
    const record = calendarRecord({
      uid: 'trumba-2', title: 'Sensory Friendly Saturday', location: 'Clark Planetarium',
      description: 'Event Location/Address: 110 South 400 West<br>Department Email: staff@example.gov',
      start: '2026-10-03T17:30:00.000Z',
    }, { feed: clark, venues });

    expect(record.description).toBe('Sensory Friendly Saturday');
    expect(record.description).not.toMatch(/staff@|Department|Event Location/);
  });
});
