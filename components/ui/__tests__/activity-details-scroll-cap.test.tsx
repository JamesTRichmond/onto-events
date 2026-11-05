// Why this test exists (James's iPhone, 2026-10-17): scrolling a long event's
// page closed the browser. The sheet is capped at 88% of the screen, but its
// body and scroll area were not allowed to shrink, so on a long event the
// scroll area grew to its full content height: it ran past the bottom of the
// screen, had nothing to scroll, and pushed Going/Share out of reach. Measured
// on an iPhone-sized viewport: 6 of 30 live events overflowed by up to 436 px.
// Jest has no layout engine, so this pins the two style rules that make the cap
// hold; the browser measurement lives in the PR.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ActivityDetails } from '../activity-details';
import type { FeedItem } from '@/lib/feed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-maps-app', () => ({
  useMapsApp: () => ({ app: 'system', loaded: true, choose: jest.fn() }),
}));

const LONG_ITEM = {
  id: 'evt-long',
  title: 'Izzy Beauschesne: "Archive in The Wild" Exhibition',
  description: 'A long exhibition description. '.repeat(60),
  category: 'learning',
  venue: 'Gallery',
  area: 'Downtown',
  lat: 40.76,
  lng: -111.88,
  miles: 1.2,
  whenLabel: 'Today 6:00 PM',
  rating: 'general',
  source: 'seed',
  sourceName: 'Gallery',
  sourceUrl: 'https://example.com/event',
} as unknown as FeedItem;

function renderSheet() {
  render(
    <ActivityDetails
      item={LONG_ITEM}
      mode="everyone"
      joined={false}
      onToggleJoin={() => {}}
      onAction={() => {}}
      onClose={() => {}}
    />,
  );
}

describe('event sheet stays inside the screen', () => {
  it('lets the scroll area shrink to the sheet cap, so long events scroll instead of overflowing', () => {
    renderSheet();
    const scroll = StyleSheet.flatten(screen.getByTestId('activity-details-scroll').props.style);
    expect(scroll.flexShrink).toBe(1);
    expect(scroll.minHeight).toBe(0);
  });

  it('lets the sheet body shrink too, or the scroll area inherits an uncapped parent', () => {
    renderSheet();
    const body = StyleSheet.flatten(screen.getByTestId('activity-details-body').props.style);
    expect(body.flexShrink).toBe(1);
    expect(body.minHeight).toBe(0);
  });

  it('keeps Going reachable inside the sheet, below the scroll area', () => {
    renderSheet();
    expect(screen.getByLabelText(/^Going: /)).toBeTruthy();
  });
});
