import { LOCAL_ACTIVITIES, LOCAL_GENERATED_AT } from '../park-city-events';

describe('Park City publisher listings', () => {
  it('drops the October pack titles that were not on a publisher page', () => {
    const titles = LOCAL_ACTIVITIES.map((item) => item.title);
    expect(titles).toContain('The Way Out');
    expect(titles).toContain('Between the Lines');
    expect(titles).not.toContain('Wasatch Back Sunset Chamber Music Series');
    expect(titles).not.toContain('Wasatch Mountain Family Storytime & Craft Hour');
    expect(LOCAL_GENERATED_AT).toBe('2026-11-15T02:17:00.000Z');
  });

  it('stays inside the Park City bounds and credits the publisher', () => {
    const kimball = LOCAL_ACTIVITIES.find((item) => item.sourceName === 'Kimball Art Center');
    expect(kimball?.admission).toBe('free');
    expect(LOCAL_ACTIVITIES.some((item) => item.venue.includes('Egyptian'))).toBe(false);
    for (const item of LOCAL_ACTIVITIES) {
      expect(item.source).toBe('live');
      expect(item.sourceUrl).toMatch(/^https:\/\//);
      expect(Number.isFinite(Date.parse(item.startsAtIso ?? ''))).toBe(true);
      expect(item.lat).toBeGreaterThanOrEqual(40.35);
      expect(item.lat).toBeLessThanOrEqual(41.05);
      expect(item.lng).toBeGreaterThanOrEqual(-111.65);
      expect(item.lng).toBeLessThanOrEqual(-111);
      expect(item.sourceName?.toLowerCase()).not.toContain('ticketmaster');
    }
  });
});
