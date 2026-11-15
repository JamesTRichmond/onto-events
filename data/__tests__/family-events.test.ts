import { FAMILY_ACTIVITIES } from '../family-events';

const PARK_CITY = { latMin: 40.35, latMax: 41.05, lngMin: -111.65, lngMax: -111 };

describe('Salt Lake City publisher listings', () => {
  it('replaces the expired September family pack with fetched November dates', () => {
    const titles = FAMILY_ACTIVITIES.map((item) => item.title);
    expect(titles).toContain('Native American Heritage Month Celebration');
    expect(titles).toContain('Feast with the Beast');
    expect(titles).not.toContain('Labor Day Free Admission');
    expect(FAMILY_ACTIVITIES.length).toBeGreaterThanOrEqual(20);
  });

  it('keeps a publisher link, a real start, and a Salt Lake pin', () => {
    for (const item of FAMILY_ACTIVITIES) {
      expect(item.source).toBe('live');
      expect(item.sourceUrl).toMatch(/^https:\/\//);
      expect(Number.isFinite(Date.parse(item.startsAtIso ?? ''))).toBe(true);
      expect(Date.parse(item.endsAtIso ?? item.startsAtIso ?? '')).toBeGreaterThanOrEqual(
        Date.parse('2026-11-14T00:00:00-07:00'),
      );
      expect(item.lat).toBeGreaterThan(40.7);
      expect(item.lat).toBeLessThan(40.8);
      expect(item.lng).toBeLessThan(PARK_CITY.lngMax);
      expect(item.sourceName?.toLowerCase()).not.toContain('ticketmaster');
      expect(item.admission).not.toBe('free');
    }
  });
});
