import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share, StyleSheet } from 'react-native';

import { ActionButton } from '../action-button';
import { ACTIVITY_CARD_MAX_HEIGHT, ActivityCard } from '../activity-card';
import { ActivityDetails } from '../activity-details';
import { Chip } from '../chip';
import { EmptyState } from '../empty-state';
import { Muted } from '../muted';
import type { FeedItem } from '@/lib/feed';

// Directions reads the viewer's maps app; tests pick it per case.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockMapsApp = { current: 'system' as 'system' | 'google' | 'waze' };
jest.mock('@/hooks/use-maps-app', () => ({
  useMapsApp: () => ({ app: mockMapsApp.current, loaded: true, choose: jest.fn() }),
}));

const ITEM: FeedItem = {
  id: 'evt-1',
  title: 'Late set at Urban Lounge',
  description: 'Doors at nine. A long bill that used to stretch the card.',
  category: 'music',
  venue: 'Urban Lounge',
  area: 'Central City',
  lat: 40.76,
  lng: -111.88,
  miles: 1.2,
  whenLabel: 'Tonight 9:00 PM',
  rating: 'mature',
  source: 'seed',
  sourceName: 'SeatGeek',
  sourceUrl: 'https://example.com/tickets',
} as unknown as FeedItem;

const PLAN_INVITE =
  'Tonight 9:00 PM · Late set at Urban Lounge at Urban Lounge';

describe('ui kit', () => {
  it('Chip exposes its selected state and fires onPress', () => {
    const onPress = jest.fn();
    render(<Chip label="Nearest" selected onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'Nearest' });
    expect(chip.props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ActionButton blocks busy taps but retains its name and label width', () => {
    const onPress = jest.fn();
    render(<ActionButton label="Sign in" busy onPress={onPress} />);
    expect(screen.getByText('Sign in')).toHaveStyle({ opacity: 0 });
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(button).toHaveStyle({ flexGrow: 1 });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('EmptyState renders title and hint', () => {
    render(<EmptyState title="Nothing in range." hint="Widen the radius." />);
    expect(screen.getByText('Nothing in range.')).toBeTruthy();
    expect(screen.getByText('Widen the radius.')).toBeTruthy();
  });

  it('Muted renders children in either variant', () => {
    render(
      <>
        <Muted>small</Muted>
        <Muted variant="body">body</Muted>
      </>
    );
    expect(screen.getByText('small')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('ActivityCard shows the 21+ badge, source credit, and toggles join', () => {
    const onToggleJoin = jest.fn();
    render(
      <ActivityCard
        item={ITEM}
        mode="everyone"
        joined={false}
        onToggleJoin={onToggleJoin}
        onAction={() => {}}
      />
    );
    expect(screen.getByText(/MUSIC · 21\+/)).toBeTruthy();
    expect(screen.getByText('via SeatGeek')).toBeTruthy();
    expect(screen.queryByText('Tickets & details')).toBeNull();
    expect(screen.getByLabelText('Details: Late set at Urban Lounge')).toBeTruthy();
    expect(screen.queryByLabelText('Share Late set at Urban Lounge')).toBeNull();
    fireEvent.press(screen.getByLabelText('Going: Late set at Urban Lounge'));
    expect(onToggleJoin).toHaveBeenCalledTimes(1);
  });

  it('ActivityCard caps Discover card height (COM-6)', () => {
    render(
      <ActivityCard
        item={ITEM}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    const card = screen.getByTestId('activity-card');
    const flat = StyleSheet.flatten(card.props.style);
    expect(flat.maxHeight).toBe(ACTIVITY_CARD_MAX_HEIGHT);
    expect(flat.overflow).toBe('hidden');
  });

  it('ActivityDetails renders source actions from the validated source link', () => {
    const onAction = jest.fn();
    const onClose = jest.fn();
    const onToggleJoin = jest.fn();
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    render(
      <ActivityDetails
        item={ITEM}
        mode="everyone"
        joined={false}
        onToggleJoin={onToggleJoin}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(screen.getByText('via SeatGeek')).toBeTruthy();
    fireEvent.press(screen.getByRole('link', { name: 'Source for Late set at Urban Lounge' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith('https://example.com/tickets');
    // Share is reserved for Going ✓ — absent before join.
    expect(screen.queryByRole('button', { name: 'Share Late set at Urban Lounge' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Going: Late set at Urban Lounge' }));
    expect(onToggleJoin).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    share.mockRestore();
    openUrl.mockRestore();
  });

  it('ActivityCard caps visible text on the face; the details sheet keeps every word', () => {
    const description =
      'Join us for an evening of sea-ice ecology, with coffee after. '.repeat(4).trim();
    const long = {
      ...ITEM,
      rating: 'general',
      title: 'School of Biological Sciences RPT Faculty Seminar, Jody Reimer',
      venue: 'Aline Wilmot Skaggs Biology Building',
      area: 'Salt Lake City, UT',
      description,
    } as FeedItem;
    render(
      <ActivityCard item={long} mode="everyone" joined={false} onToggleJoin={() => {}} onAction={() => {}} />
    );

    const title = screen.getByText('School of Biological Sciences RPT Faculty Seminar, Jody…');
    expect(title.props.numberOfLines).toBe(2);
    const place = screen.getByText('Aline Wilmot Skaggs Biology Building');
    expect(place.props.numberOfLines).toBe(1);
    expect(screen.queryByText(description)).toBeNull();
    expect(screen.getByText(/^Join us for an evening of sea-ice ecology.*…$/).props.numberOfLines).toBe(2);
    // The spoken name is the full title, not the preview.
    fireEvent.press(screen.getByLabelText(`Details: ${long.title}`));
    expect(screen.getByText(long.title)).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
  });

  it('ActivityCard leaves a title-repeating description off the face, not out of details', () => {
    const echo = { ...ITEM, rating: 'general', title: 'Kitchen: KS', description: 'Kitchen: KS' } as FeedItem;
    render(
      <ActivityCard item={echo} mode="everyone" joined={false} onToggleJoin={() => {}} onAction={() => {}} />
    );
    const description = screen.getByTestId('activity-card-description');
    expect(description.props.children).toBe('');
    expect(StyleSheet.flatten(description.props.style).height).toBe(48);
    expect(screen.getAllByText('Kitchen: KS')).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Details: Kitchen: KS'));
    expect(screen.getAllByText('Kitchen: KS').length).toBeGreaterThanOrEqual(2);
  });

  it('opens details from the card and sends Source only over https', () => {
    const onAction = jest.fn();
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <ActivityCard
        item={ITEM}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={onAction}
      />
    );

    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    expect(screen.getByTestId('activity-details')).toBeTruthy();
    expect(
      screen.getAllByText('Doors at nine. A long bill that used to stretch the card.').length,
    ).toBeGreaterThan(0);
    fireEvent.press(screen.getByRole('link', { name: 'Source for Late set at Urban Lounge' }));
    expect(onAction).toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith('https://example.com/tickets');
    fireEvent.press(screen.getByRole('link', { name: 'Directions to Urban Lounge' }));
    expect(openUrl.mock.calls.some(([url]) => typeof url === 'string' && /maps|geo:/.test(url))).toBe(
      true,
    );
    // Urban Lounge is not a registered venue, so no website is invented.
    expect(screen.queryByTestId('venue-website')).toBeNull();
    openUrl.mockRestore();
  });

  it('opens the venue website when the event names a registered venue', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <ActivityCard
        item={{ ...ITEM, venue: 'Kilby Court' }}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    fireEvent.press(screen.getByRole('link', { name: 'Venue website for Kilby Court' }));
    expect(openUrl).toHaveBeenCalledWith('https://www.kilbycourt.com/');
    openUrl.mockRestore();
  });

  it('opens the venue website from a registered alias', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <ActivityCard
        item={{ ...ITEM, venue: 'Commonwealth Room' }}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    fireEvent.press(screen.getByRole('link', { name: 'Venue website for The Commonwealth Room' }));
    expect(openUrl).toHaveBeenCalledWith(
      'https://thestateroompresents.com/the-commonwealth-room/ticket-and-venue-info',
    );
    expect(screen.queryByTestId('venue-photo')).toBeNull();
    openUrl.mockRestore();
  });

  it('shows the accepted venue photo and opens the venue website from it', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <ActivityCard
        item={{ ...ITEM, venue: 'Clark Planetarium', rating: 'general' }}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    expect(screen.getByTestId('venue-photo')).toBeTruthy();
    expect(screen.getByTestId('venue-photo-credit')).toHaveTextContent('An Errant Knight · CC BY-SA 4.0');
    fireEvent.press(screen.getByRole('link', { name: 'Photo of Clark Planetarium. Opens the venue website.' }));
    expect(openUrl).toHaveBeenCalledWith('https://www.saltlakecounty.gov/clark-planetarium/');
    openUrl.mockRestore();
  });

  it('opens Directions in the maps app the viewer picked', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockMapsApp.current = 'waze';
    render(
      <ActivityCard
        item={ITEM}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    fireEvent.press(screen.getByRole('link', { name: 'Directions to Urban Lounge' }));
    expect(openUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/waze\.com\/ul\?ll=/));
    mockMapsApp.current = 'system';
    openUrl.mockRestore();
  });

  it('hides Source when the listing is not https', () => {
    render(
      <ActivityCard
        item={{ ...ITEM, sourceUrl: 'http://example.com/tickets' }}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    expect(screen.queryByText('Source')).toBeNull();
    expect(screen.getByText('Directions')).toBeTruthy();
  });

  it('shares a plan invite only after Going, and hides calendar when there is no start instant', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    render(
      <ActivityCard
        item={ITEM}
        mode="everyone"
        joined
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    expect(screen.queryByText('Add to calendar')).toBeNull();
    // Card face and details sheet both expose Share after Going.
    const shares = screen.getAllByRole('button', { name: 'Share Late set at Urban Lounge' });
    expect(shares).toHaveLength(2);
    fireEvent.press(shares[1]);
    expect(share).toHaveBeenCalledWith({ message: PLAN_INVITE });
    const sent = String(share.mock.calls[0][0].message);
    expect(sent).not.toMatch(/https?:/i);
    expect(sent).not.toContain('evt-1');
    share.mockRestore();
  });

  it('offers a calendar handoff on the card before Going', () => {
    render(
      <ActivityCard
        item={{ ...ITEM, startsAtIso: '2026-09-26T03:00:00.000Z' } as FeedItem}
        mode="everyone"
        joined={false}
        onToggleJoin={() => {}}
        onAction={() => {}}
      />
    );
    fireEvent.press(screen.getByLabelText('Details: Late set at Urban Lounge'));
    expect(screen.getByLabelText('Save to calendar: Late set at Urban Lounge')).toBeTruthy();
    // Share stays hidden until Going ✓ (card + details).
    expect(screen.queryByRole('button', { name: 'Share Late set at Urban Lounge' })).toBeNull();
  });

  it('hides Share on details until Going ✓; cancelling share after Going does not toggle join', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
    const onToggleJoin = jest.fn();
    const onAction = jest.fn();
    const { rerender } = render(
      <ActivityDetails item={ITEM} mode="everyone" joined={false} onToggleJoin={onToggleJoin} onAction={onAction} onClose={() => {}} />,
    );
    expect(screen.queryByLabelText('Share Late set at Urban Lounge')).toBeNull();

    rerender(
      <ActivityDetails item={ITEM} mode="everyone" joined onToggleJoin={onToggleJoin} onAction={onAction} onClose={() => {}} />,
    );
    fireEvent.press(screen.getByLabelText('Share Late set at Urban Lounge'));
    expect(share).toHaveBeenCalledWith({ message: PLAN_INVITE });
    expect(onToggleJoin).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    share.mockRestore();
  });
});

test('newcomers signal describes the event without exposing attendance',()=>{
 render(<ActivityCard item={{...ITEM,rating:'general',sourceName:'onto community',hosted:{meetingInstructions:'Public foyer',newcomersWelcome:true}}} mode="everyone" joined={false} onToggleJoin={jest.fn()} onAction={jest.fn()}/>);
 expect(screen.getByText('Newcomers welcome')).toBeTruthy();expect(screen.queryByText(/attending|interested|people nearby/i)).toBeNull();
});
