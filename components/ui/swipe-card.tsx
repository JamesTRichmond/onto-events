import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ActivityCard } from '@/components/ui/activity-card';
import { SORT_COLORS, TrashIcon, WalkerIcon } from '@/components/ui/sort-icons';
import type { FeedItem } from '@/lib/feed';
import type { TierMode } from '@/lib/tiers';

/** A drag past this many points decides the card; less springs back. */
export const DECIDE_DISTANCE = 96;
const FLY_MS = 180;
// A direction the card cannot go (Maybes has no "maybe") still gives under
// the thumb, a quarter as far, so the drag feels answered rather than stuck.
const RESIST = 0.25;

export type SortKind = 'pass' | 'maybe';
/** VoiceOver's two named actions on a sortable card. */
export const PASS_ACTION = 'Not for me';
export const MAYBE_ACTION = 'Maybe';

export type SwipeCardProps = {
  item: FeedItem;
  mode: TierMode;
  joined: boolean;
  onToggleJoin: () => void;
  onAction: () => void;
  /** Left, trash: not for me. Omit and the card will not go left. */
  onPass?: () => void;
  /** Right, walker: maybe. Omit and the card will not go right. */
  onMaybe?: () => void;
  reduceMotion: boolean;
  byDistance?: boolean;
};

function tick() {
  if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/**
 * A Discover card that sorts by swipe (James, 2026-09-28: "swipe is an action
 * the user performs to sort their cards", not a view). Left is trash, right is
 * the walker; a vertical drag still scrolls, a tap still opens details. The
 * card is the list's own ActivityCard, so Going, Share-after-Going and
 * Family's RSVP-only copy cannot drift. VoiceOver gets the same two choices
 * as named actions on the card.
 */
export function SwipeCard(props: SwipeCardProps) {
  const { item, onPass, onMaybe, reduceMotion } = props;
  const { width } = useWindowDimensions();
  const x = useSharedValue(0);
  const leaving = useRef(false);
  const armed = useRef<SortKind | null>(null);

  const decide = useCallback(
    (kind: SortKind) => {
      const act = kind === 'pass' ? onPass : onMaybe;
      if (!act || leaving.current) return;
      leaving.current = true;
      tick();
      if (reduceMotion) {
        act();
        return;
      }
      x.value = withTiming((kind === 'maybe' ? 1 : -1) * (width + 80), { duration: FLY_MS });
      setTimeout(act, FLY_MS);
    },
    [onMaybe, onPass, reduceMotion, width, x],
  );

  // Horizontal only: vertical drags fail this gesture. The detector's pan-y
  // also lets the browser scroll; failing the recognizer alone cannot do that.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      if (leaving.current) return;
      const dx = event.translationX;
      const allowed = dx < 0 ? Boolean(onPass) : Boolean(onMaybe);
      x.value = allowed ? dx : dx * RESIST;
      // One tick as the drag crosses the line, so the thumb knows it will stick.
      const nowArmed: SortKind | null =
        allowed && dx <= -DECIDE_DISTANCE ? 'pass' : allowed && dx >= DECIDE_DISTANCE ? 'maybe' : null;
      if (nowArmed && nowArmed !== armed.current) tick();
      armed.current = nowArmed;
    })
    .onEnd((event, success) => {
      armed.current = null;
      // A pan the OS cancelled (a call, a system gesture) ends unsuccessfully:
      // it never sorts, however far the card had travelled.
      if (!success) x.value = reduceMotion ? 0 : withTiming(0, { duration: FLY_MS });
      else if (event.translationX > DECIDE_DISTANCE && onMaybe) decide('maybe');
      else if (event.translationX < -DECIDE_DISTANCE && onPass) decide('pass');
      else x.value = reduceMotion ? 0 : withTiming(0, { duration: FLY_MS });
    })
    // A pan that never went active still finalizes: an undecided card
    // springs back instead of staying off-center.
    .onFinalize(() => {
      armed.current = null;
      if (!leaving.current) x.value = reduceMotion ? 0 : withTiming(0, { duration: FLY_MS });
    })
    .withTestId(`swipe-${item.id}`);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { rotate: reduceMotion ? '0deg' : `${x.value / 40}deg` },
    ],
  }));
  const passBadge = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-DECIDE_DISTANCE, -16], [1, 0], 'clamp'),
    transform: [{ scale: interpolate(x.value, [-DECIDE_DISTANCE, -16], [1, 0.6], 'clamp') }],
  }));
  const maybeBadge = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [16, DECIDE_DISTANCE], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(x.value, [16, DECIDE_DISTANCE], [0.6, 1], 'clamp') }],
  }));

  // The name is what VoiceOver speaks on iOS's new architecture (Fabric
  // builds the custom action from `name`, not `label`), so it is the words.
  const actions = [
    ...(onPass ? [{ name: PASS_ACTION, label: PASS_ACTION }] : []),
    ...(onMaybe ? [{ name: MAYBE_ACTION, label: MAYBE_ACTION }] : []),
  ];

  return (
    // Web only: the browser keeps vertical touch scrolling on the card, and
    // the pan above still gets the horizontal drag. Without this the gesture
    // handler sets touch-action: none, and Android Chrome cannot scroll the
    // feed from a card at all (the feed is almost all cards).
    <GestureDetector gesture={pan} touchAction="pan-y">
      <Animated.View style={cardStyle} testID="swipe-card">
        <ActivityCard
          item={item}
          mode={props.mode}
          joined={props.joined}
          onToggleJoin={props.onToggleJoin}
          onAction={props.onAction}
          byDistance={props.byDistance}
          accessibilityActions={actions}
          onAccessibilityAction={(name) => {
            if (name === PASS_ACTION) decide('pass');
            else if (name === MAYBE_ACTION) decide('maybe');
          }}
        />
        {/* The icon rides in the middle of the card, not an edge: an edge
            badge would leave the screen with the card it is naming. */}
        <View pointerEvents="none" style={styles.badges} accessible={false}
          importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {onPass ? (
            <Animated.View style={[styles.badge, { borderColor: SORT_COLORS.pass }, passBadge]}>
              <TrashIcon size={44} />
            </Animated.View>
          ) : null}
          {onMaybe ? (
            <Animated.View style={[styles.badge, { borderColor: SORT_COLORS.maybe }, maybeBadge]}>
              <WalkerIcon size={44} />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  badges: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 13, 30, 0.82)',
  },
});
