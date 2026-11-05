import { venuePhotoFor, venueWebsiteFor } from '../venue-website';

describe('venueWebsiteFor', () => {
  it('returns the venue site for an exact registered name', () => {
    expect(venueWebsiteFor('Kilby Court')).toEqual({
      name: 'Kilby Court',
      url: 'https://www.kilbycourt.com/',
    });
  });

  it('matches a registered alias the way coordinates do', () => {
    const site = venueWebsiteFor('Commonwealth Room');
    expect(site?.name).toBe('The Commonwealth Room');
    expect(site?.url).toMatch(/^https:\/\//);
  });

  it('ignores case and extra whitespace', () => {
    expect(venueWebsiteFor('  kilby   court ')).toEqual(venueWebsiteFor('Kilby Court'));
  });

  it('offers nothing when the name is not a registered venue', () => {
    expect(venueWebsiteFor('Urban Lounge')).toBeNull();
    expect(venueWebsiteFor('Liberty Park annex')).toBeNull();
    expect(venueWebsiteFor('')).toBeNull();
    expect(venueWebsiteFor(null)).toBeNull();
    expect(venueWebsiteFor(undefined)).toBeNull();
  });

  it('does not treat a longer phrase as the shorter venue', () => {
    expect(venueWebsiteFor('Kilby Court annex')).toBeNull();
  });
});

describe('venuePhotoFor', () => {
  it('returns the accepted picture only for that venue name', () => {
    const photo = venuePhotoFor('Clark Planetarium');
    expect(photo?.venue).toBe('Clark Planetarium');
    expect(photo?.credit).toBe('An Errant Knight');
    expect(photo?.license).toBe('CC BY-SA 4.0');
    expect(photo?.file).toBeTruthy();
  });

  it('does not lend a photo to an alias or a venue with no accepted picture', () => {
    expect(venuePhotoFor('Hogle Zoo')).toBeNull();
    expect(venuePhotoFor('Kilby Court')).toBeNull();
    expect(venuePhotoFor('Clark Planetarium annex')).toBeNull();
    expect(venuePhotoFor(null)).toBeNull();
  });

  it('returns a Vermont picture only for the registered name', () => {
    const photo = venuePhotoFor('Fletcher Free Library Main Library');
    expect(photo?.venue).toBe('Fletcher Free Library Main Library');
    expect(photo?.credit).toBe('Beyond My Ken');
    expect(photo?.license).toBe('CC BY-SA 4.0');
    expect(photo?.file).toBeTruthy();
    expect(venuePhotoFor('Fletcher Free Library')).toBeNull();
  });

  it('returns a Florida picture and withholds a venue whose file was the wrong place', () => {
    const photo = venuePhotoFor('The Dalí Museum');
    expect(photo?.venue).toBe('The Dalí Museum');
    expect(photo?.license).toBe('CC BY-SA 3.0');
    expect(venuePhotoFor('Pierson Library')).toBeNull();
    expect(venuePhotoFor('Young Actors Theatre')).toBeNull();
    expect(venuePhotoFor('Tallahassee Museum')).toBeNull();
  });

  it('returns an Asheville picture only for the registered name', () => {
    const photo = venuePhotoFor('Asheville Art Museum');
    expect(photo?.venue).toBe('Asheville Art Museum');
    expect(photo?.credit).toBe('DiscoA340');
    expect(photo?.license).toBe('CC BY-SA 4.0');
    expect(venuePhotoFor('First Baptist Church Weaverville')).toBeNull();
    expect(venuePhotoFor('Asheville Yacht Club')).toBeNull();
  });
});
