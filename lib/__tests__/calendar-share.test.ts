import { icsForItem, shareLine } from '@/lib/calendar-share';

const ITEM = {
  title: 'Late set at Urban Lounge',
  venue: 'Urban Lounge',
  whenLabel: 'Tonight 9:00 PM',
  startsAtIso: '2026-09-26T03:00:00.000Z',
  description: 'Doors at nine.',
};

describe('calendar-share', () => {
  it('formats Day · time · title at venue without a url or listing id', () => {
    const line = shareLine({ ...ITEM, startsAtIso: undefined, title: 'Show <b>one</b>' });
    expect(line).toBe('Tonight 9:00 PM · Show one at Urban Lounge');
    expect(line).not.toMatch(/https?:/i);
    expect(line).not.toMatch(/evt-/);
  });

  it('builds a VEVENT from startsAtIso and hashes a uid instead of the listing id', () => {
    const ics = icsForItem(ITEM, Date.parse('2026-09-25T13:00:00.000Z'));
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260926T030000Z');
    expect(ics).not.toContain('DTEND:');
    expect(ics).toContain('SUMMARY:Late set at Urban Lounge');
    expect(ics).toContain('LOCATION:Urban Lounge');
    expect(ics).toMatch(/UID:onto-[0-9a-f]+@local/);
    expect(ics).not.toContain('evt-');
    expect(ics).not.toMatch(/https?:\/\//);
  });

  it('returns null when the card has no parseable start instant', () => {
    expect(icsForItem({ title: 'Walk', venue: 'Park', whenLabel: 'Sometime' })).toBeNull();
  });

  it('uses only a valid publisher end time and folds Unicode by UTF-8 octets', () => {
    const ics = icsForItem({ ...ITEM, endsAtIso: '2026-09-26T04:00:00Z', title: '🎶é'.repeat(40) })!;
    expect(ics).toContain('DTEND:20260926T040000Z');
    expect(ics.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${'🎶é'.repeat(40)}`);
    expect(icsForItem({ ...ITEM, endsAtIso: '2026-09-25T04:00:00Z' })).not.toContain('DTEND:');
  });
});
