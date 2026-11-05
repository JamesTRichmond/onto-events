import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';
import { ActivityCard, Chip, Muted } from '@/components/ui';
import type { FeedItem } from '@/lib/feed';
import { SKY_SURFACE } from '@/lib/sky/palette';
import { SkyAppearance } from '../appearance';
import { SkyPreviewPanel } from '../preview-panel';

// Details reads the maps app choice from storage; this suite is about color.
jest.mock('@/hooks/use-maps-app', () => ({
  useMapsApp: () => ({ app: 'system', loaded: true, choose: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const item = { id: 'example', title: 'Example', description: 'A public event.',
  venue: 'Venue', area: 'Downtown', miles: 1, lat: 40.76, lng: -111.89,
  rating: 'family', category: 'community', whenLabel: 'Today', source: 'live',
  sourceName: 'Publisher', sourceUrl: 'https://example.com/event' } as FeedItem;

it('gives text, links and selected controls the contrast-tested feed palette', () => {
  render(<SkyAppearance.Provider value>
    <ThemedText>Heading</ThemedText><ThemedText type="link">Link</ThemedText>
    <Muted>Metadata</Muted><Chip selected label="Everyone" onPress={() => {}} />
  </SkyAppearance.Provider>);
  expect(screen.getByText('Heading')).toHaveStyle({ color: SKY_SURFACE.text });
  expect(screen.getByText('Link')).toHaveStyle({ color: SKY_SURFACE.link });
  expect(screen.getByText('Metadata')).toHaveStyle({ color: SKY_SURFACE.secondary });
  expect(screen.getByText('Everyone')).toHaveStyle({ color: SKY_SURFACE.onSelected });
});

it.each(['family', 'everyone'] as const)('preserves RSVP/provenance and the same card colors in %s', (mode) => {
  const onToggleJoin = jest.fn();
  render(<SkyAppearance.Provider value><ActivityCard item={item} mode={mode}
    joined={false} onToggleJoin={onToggleJoin} onAction={() => {}} /></SkyAppearance.Provider>);
  expect(screen.getByText('Example')).toHaveStyle({ color: SKY_SURFACE.text });
  expect(screen.getByText('via Publisher')).toHaveStyle({ color: SKY_SURFACE.secondary });
  const rsvp = screen.getByRole('button', { name: 'Going: Example' });
  expect(rsvp.props.accessibilityHint).toMatch(/^RSVP only:/);
  fireEvent.press(rsvp);
  expect(onToggleJoin).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByLabelText('Details: Example'));
  expect(screen.getByRole('link', { name: 'Directions to Venue' })).toHaveStyle({ minHeight: 44 });
});

it('keeps development preview controls out of production', () => {
  const previous = __DEV__;
  try {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    render(<SkyPreviewPanel value={null} onChange={() => {}} seed="test" />);
    expect(screen.queryByText('Development preview \u2014 not current weather')).toBeNull();
  } finally {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = previous;
  }
});
