// Why this test exists (James's iPhone, 2026-10-17): on the web the browser
// decides whether a drag scrolls from CSS touch-action before any gesture
// JavaScript runs. Failing the pan recognizer on vertical drags is not enough;
// without pan-y on the detector the card renders `touch-action: none` and a
// drag that starts on a card never scrolls the feed — only drags that start
// above the cards did.
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SwipeCard } from '@/components/ui/swipe-card';
import type { FeedItem } from '@/lib/feed';

const mockDetectorProps: Record<string, unknown>[] = [];

jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: (props: { children: ReactNode } & Record<string, unknown>) => {
      mockDetectorProps.push(props);
      return props.children;
    },
  };
});

// The card body is covered by the feed tests; this suite only reads the
// detector's props, so the body is a stub.
jest.mock('@/components/ui/activity-card', () => ({
  ActivityCard: () => null,
}));

const noop = () => {};

describe('SwipeCard touch handling', () => {
  beforeEach(() => {
    mockDetectorProps.length = 0;
  });

  it('lets a vertical drag that starts on a card scroll the feed (touch-action pan-y)', () => {
    render(
      <SwipeCard
        item={{ id: 'card-1' } as unknown as FeedItem}
        mode="everyone"
        joined={false}
        onToggleJoin={noop}
        onAction={noop}
        onPass={noop}
        onMaybe={noop}
        reduceMotion
      />,
    );

    expect(mockDetectorProps.length).toBeGreaterThan(0);
    expect(mockDetectorProps[mockDetectorProps.length - 1].touchAction).toBe('pan-y');
  });

  it('keeps pan-y on a Maybes card that can only go left', () => {
    render(
      <SwipeCard
        item={{ id: 'card-2' } as unknown as FeedItem}
        mode="everyone"
        joined={false}
        onToggleJoin={noop}
        onAction={noop}
        onPass={noop}
        reduceMotion={false}
      />,
    );

    expect(mockDetectorProps[mockDetectorProps.length - 1].touchAction).toBe('pan-y');
  });
});
