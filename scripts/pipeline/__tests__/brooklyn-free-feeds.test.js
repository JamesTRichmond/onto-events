const feeds = require('../../../data/feeds.json');
const venues = require('../../../data/venues.json');
const { serviceRegionForLocation } = require('../service-regions');

const NEW = {
  'maple-street-community-garden': 'Maple Street Community Garden',
  'brooklyn-poets': 'Brooklyn Poets',
};

describe('brooklyn free feeds (#309)', () => {
  test('feed ids are unique', () => {
    const ids = feeds.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(Object.entries(NEW))('%s is registered in nyc and its venue resolves to nyc', (id, venueName) => {
    const feed = feeds.find((f) => f.id === id);
    expect(feed).toBeDefined();
    expect(feed.serviceRegion).toBe('nyc');
    const venue = venues.find((v) => v.name === venueName);
    expect(venue).toBeDefined();
    expect(serviceRegionForLocation({ ...venue, latitude: venue.lat, longitude: venue.lng })?.id).toBe('nyc');
  });

});
