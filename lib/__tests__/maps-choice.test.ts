import { Platform } from 'react-native';

import { directionsFor, MAPS_APP_LABEL, MAPS_APPS, mapsAppLabels, parseMapsApp } from '../maps-choice';

describe('parseMapsApp', () => {
  it('keeps a known choice', () => {
    expect(parseMapsApp('google')).toBe('google');
    expect(parseMapsApp('waze')).toBe('waze');
    expect(parseMapsApp('system')).toBe('system');
  });

  it('falls back to the phone default for anything else', () => {
    expect(parseMapsApp(null)).toBe('system');
    expect(parseMapsApp('')).toBe('system');
    expect(parseMapsApp('{"lat":40.7}')).toBe('system');
  });
});

describe('directionsFor', () => {
  it('uses Apple Maps for the phone default on iOS', () => {
    expect(directionsFor('system', 40.76, -111.89, 'Kilby Court', 'ios')).toBe(
      'https://maps.apple.com/?daddr=40.76,-111.89&q=Kilby%20Court',
    );
  });

  it('opens Google Maps and Waze through links that work with or without the app', () => {
    expect(directionsFor('google', 40.76, -111.89, 'x', 'ios')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.76,-111.89',
    );
    expect(directionsFor('waze', 40.76, -111.89, 'x', 'ios')).toBe(
      'https://waze.com/ul?ll=40.76,-111.89&navigate=yes',
    );
  });

  it('sends only the venue point, never the viewer location', () => {
    for (const app of MAPS_APPS) {
      const url = directionsFor(app, 40.76, -111.89, 'Venue', 'ios');
      expect(url).not.toMatch(/saddr|origin=/);
    }
  });

  it('labels every choice', () => {
    expect(MAPS_APPS.map((app) => mapsAppLabels('ios')[app])).toEqual([
      'iPhone default',
      'Google Maps',
      'Waze',
    ]);
  });

  it('never calls an Android or web phone an iPhone', () => {
    for (const platform of ['android', 'web']) {
      expect(mapsAppLabels(platform).system).toBe('Phone default');
    }
    expect(MAPS_APP_LABEL).toEqual(mapsAppLabels(Platform.OS));
  });
});
