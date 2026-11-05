import { orderStops, routeUrl, type RouteStop } from '../route';

const here = { lat: 40.76, lng: -111.89 };

function stop(partial: Partial<RouteStop> & Pick<RouteStop, 'id' | 'lat' | 'lng'>): RouteStop {
  return { label: partial.id, startsAtMs: null, ...partial };
}

describe('orderStops', () => {
  it('does the earlier event before the later one, even if the later one is closer', () => {
    const ordered = orderStops(here, [
      stop({ id: 'later-close', lat: 40.761, lng: -111.891, startsAtMs: 7 * 60 * 60_000 }),
      stop({ id: 'sooner-far', lat: 40.9, lng: -111.89, startsAtMs: 2 * 60 * 60_000 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['sooner-far', 'later-close']);
  });

  it('orders one errand window by distance so the route does not double back', () => {
    const ordered = orderStops(here, [
      stop({ id: 'far', lat: 40.85, lng: -111.89, startsAtMs: 60_000 }),
      stop({ id: 'near', lat: 40.762, lng: -111.89, startsAtMs: 20 * 60_000 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['near', 'far']);
  });

  it('appends untimed stops after the timed ones, nearest first', () => {
    const ordered = orderStops(here, [
      stop({ id: 'open-far', lat: 40.9, lng: -111.89 }),
      stop({ id: 'show', lat: 40.8, lng: -111.89, startsAtMs: 3 * 60 * 60_000 }),
      stop({ id: 'open-near', lat: 40.801, lng: -111.891 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['show', 'open-near', 'open-far']);
  });
});

describe('routeUrl', () => {
  const stops = [
    stop({ id: 'a', lat: 40.77, lng: -111.88, label: 'A' }),
    stop({ id: 'b', lat: 40.78, lng: -111.87, label: 'B' }),
  ];

  it('hands Apple Maps one destination chain, not repeated daddr parameters', () => {
    const url = routeUrl('system', stops, 'ios')!;
    expect(url.startsWith('https://maps.apple.com/?saddr=Current%20Location&daddr=')).toBe(true);
    expect(url).toContain(encodeURIComponent('40.77,-111.88+to:40.78,-111.87'));
    expect(url.match(/daddr=/g)).toHaveLength(1);
    expect(url).not.toContain('40.76');
  });

  it('starts Apple and Google from a chosen pin when one is passed', () => {
    const pin = { lat: 40.75, lng: -111.9 };
    expect(routeUrl('system', stops, 'ios', pin)).toContain('saddr=40.75,-111.9&');
    expect(routeUrl('google', stops, 'ios', pin)).toContain('origin=40.75,-111.9');
  });

  it('keeps a web system route on Google Maps', () => {
    const url = routeUrl('system', stops, 'web')!;
    expect(url.startsWith('https://www.google.com/maps/dir/')).toBe(true);
    expect(url).not.toContain('maps.apple.com');
  });

  it('keeps a Google route inside three waypoints', () => {
    const many = [40.71, 40.72, 40.73, 40.74, 40.75].map((lat, n) =>
      stop({ id: String(n), lat, lng: -111.8, label: String(n) }),
    );
    const url = routeUrl('google', many, 'web')!;
    const waypoints = decodeURIComponent(url.split('waypoints=')[1].split('&')[0]);
    expect(waypoints.split('|')).toHaveLength(3);
    expect(url).toContain('destination=40.74,-111.8');
    expect(url).not.toContain('40.75');
  });

  it('gives Google Maps waypoints without an origin coordinate', () => {
    const url = routeUrl('google', stops, 'ios')!;
    expect(url).toContain('destination=40.78,-111.87');
    expect(url).toContain('waypoints=');
    expect(url).toContain('40.77%2C-111.88');
    expect(url).not.toMatch(/origin=/);
  });

  it('sends Waze only the first stop', () => {
    expect(routeUrl('waze', stops, 'ios')).toBe('https://waze.com/ul?ll=40.77,-111.88&navigate=yes');
  });

  it('keeps a single stop on the existing directions link', () => {
    expect(routeUrl('system', [stops[0]], 'ios')).toBe(
      'https://maps.apple.com/?daddr=40.77,-111.88&q=A',
    );
  });
});
