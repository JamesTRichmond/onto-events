import { directionsUrl } from '../links';

describe('directionsUrl', () => {
  it('builds an Apple Maps link on iOS', () => {
    const url = directionsUrl(40.76, -111.89, 'Delta Center', 'ios');
    expect(url).toContain('maps.apple.com');
    expect(url).toContain('daddr=40.76,-111.89');
    expect(url).toContain('Delta%20Center');
  });

  it('builds a geo intent on Android', () => {
    const url = directionsUrl(40.76, -111.89, 'Delta Center', 'android');
    expect(url).toMatch(/^geo:40.76,-111.89/);
    expect(url).toContain('Delta%20Center');
  });

  it('falls back to Google Maps directions on web', () => {
    const url = directionsUrl(40.76, -111.89, 'Delta Center', 'web');
    expect(url).toContain('google.com/maps/dir');
    expect(url).toContain('destination=40.76,-111.89');
  });
});

describe('venue names with parentheses (live data)', () => {
  it('escapes parens so an Android geo: label cannot close early', () => {
    const url = directionsUrl(40.7, -111.9, 'The Complex (Rockwell)', 'android');

    // Exactly one opening and one closing paren: the delimiters themselves.
    expect(url.match(/[()]/g)).toEqual(['(', ')']);
    expect(url).toContain('%28Rockwell%29');
  });

  it('leaves the iOS query parameter using standard encoding', () => {
    const url = directionsUrl(40.7, -111.9, 'The Complex (Rockwell)', 'ios');
    expect(url).toContain(encodeURIComponent('The Complex (Rockwell)'));
  });
});
