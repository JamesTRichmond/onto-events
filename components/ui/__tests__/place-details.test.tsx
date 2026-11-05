import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { EvergreenSpot } from '@/data/spots';
import { useBackToClose } from '@/hooks/use-back-to-close';
import type { RankedPlace } from '@/lib/spot-feed';

import { PlaceDetails } from '../place-details';

jest.mock('@/hooks/use-back-to-close', () => ({
  useBackToClose: jest.fn(),
}));

const SPOT: EvergreenSpot = {
  id: 'spot-pie',
  serviceRegion: 'utah',
  title: 'The Pie Pizzeria',
  placeKind: 'late',
  category: 'food',
  venue: 'The Pie on 200 South',
  area: 'Downtown',
  lat: 40.7647,
  lng: -111.8828,
  short: 'Pizza after the show.',
  description: 'A downtown Pie.',
  stewardship: 'Tip the late shift.',
  rating: 'general',
  setting: 'indoor',
  hours: 'Kitchen late.',
  dayparts: ['late'],
  goodSky: ['clear'],
  badSky: [],
  sourceName: 'The Pie Pizzeria',
  sourceUrl: 'https://www.thepie.com/',
};

function ranked(over: Partial<EvergreenSpot> = {}): RankedPlace {
  return { spot: { ...SPOT, ...over }, miles: 1, fit: 'now', line: 'This hour', score: 1 };
}

describe('PlaceDetails venue website', () => {
  it('handles browser Back while the extracted place sheet is open', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <PlaceDetails item={ranked()} onClose={onClose} onDirections={() => {}} />,
    );
    expect(useBackToClose).toHaveBeenCalledWith(true, onClose);
    rerender(<PlaceDetails item={null} onClose={onClose} onDirections={() => {}} />);
    expect(useBackToClose).toHaveBeenCalledWith(false, onClose);
  });

  it('opens the place source page and names the venue', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<PlaceDetails item={ranked()} onClose={() => {}} onDirections={() => {}} />);
    fireEvent.press(screen.getByRole('button', { name: 'Venue website for The Pie on 200 South' }));
    expect(openUrl).toHaveBeenCalledWith('https://www.thepie.com/');
    openUrl.mockRestore();
  });

  it('hides the website when the place has no https source', () => {
    const { rerender } = render(
      <PlaceDetails item={ranked({ sourceUrl: undefined })} onClose={() => {}} onDirections={() => {}} />,
    );
    expect(screen.queryByText('Venue website')).toBeNull();
    rerender(
      <PlaceDetails item={ranked({ sourceUrl: 'http://example.com/place' })} onClose={() => {}} onDirections={() => {}} />,
    );
    expect(screen.queryByText('Venue website')).toBeNull();
  });

  it('shows an accepted photo of the named venue, opens a larger viewable photo modal on tap, and links both photo source and venue website', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <PlaceDetails
        item={ranked({ venue: 'Liberty Park', sourceUrl: 'https://www.slc.gov/parks/parks-division/liberty-park/' })}
        onClose={() => {}}
        onDirections={() => {}}
      />,
    );
    expect(screen.getByTestId('venue-photo')).toBeTruthy();
    expect(screen.queryByTestId('venue-photo-modal')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'View larger photo of Liberty Park' }));
    expect(screen.getByTestId('venue-photo-modal')).toBeTruthy();
    expect(screen.getByLabelText('Enlarged photo of Liberty Park')).toBeTruthy();
    expect(screen.getByTestId('venue-photo-modal-credit')).toHaveTextContent(
      'Photo credit: Argyleist · CC BY-SA 3.0',
    );

    fireEvent.press(screen.getByRole('button', { name: 'Photo source for Liberty Park' }));
    expect(openUrl).toHaveBeenCalledWith('https://commons.wikimedia.org/wiki/File:Liberty_Park.jpg');

    fireEvent.press(screen.getByRole('button', { name: 'Photo of Liberty Park. Opens the venue website.' }));
    expect(openUrl).toHaveBeenCalledWith('https://www.slc.gov/parks/parks-division/liberty-park/');

    fireEvent.press(screen.getByRole('button', { name: 'Close enlarged photo' }));
    expect(screen.queryByTestId('venue-photo-modal')).toBeNull();
    openUrl.mockRestore();
  });

  it('matches an accepted place photo when the spot title names the registered venue', () => {
    render(
      <PlaceDetails
        item={ranked({
          title: 'Natural History Museum of Utah',
          venue: 'Rio Tinto Center',
          sourceUrl: 'https://nhmu.utah.edu/',
        })}
        onClose={() => {}}
        onDirections={() => {}}
      />,
    );
    expect(screen.getByTestId('venue-photo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View larger photo of Natural History Museum of Utah' })).toBeTruthy();
  });

  it('renders a non-blocking fallback when a place photo fails to load', () => {
    render(
      <PlaceDetails
        item={ranked({ venue: 'Liberty Park', sourceUrl: 'https://www.slc.gov/parks/parks-division/liberty-park/' })}
        onClose={() => {}}
        onDirections={() => {}}
      />,
    );
    fireEvent(screen.getByLabelText('Photo of Liberty Park'), 'error', {
      nativeEvent: { error: 'Failed to load' },
    });
    expect(screen.getByTestId('venue-photo-fallback')).toHaveTextContent('Photo unavailable for Liberty Park.');
    expect(screen.getByText('A downtown Pie.')).toBeTruthy();
  });

  it('shows no photo when the place has no accepted picture', () => {
    render(<PlaceDetails item={ranked()} onClose={() => {}} onDirections={() => {}} />);
    expect(screen.queryByTestId('venue-photo')).toBeNull();
  });
});
