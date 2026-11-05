import { StyleSheet, View } from 'react-native';

/**
 * The two sorting icons, drawn from rounded strokes on a 24-point grid so they
 * stay crisp at any size and share one line weight (no icon font, no new
 * dependency). Colors are Apple's dark-mode system red and green: they read on
 * the night-indigo card and match what iPhone users already know.
 */
export const SORT_COLORS = {
  pass: '#FF453A',
  maybe: '#30D158',
} as const;

type Point = readonly [number, number];
type Stroke = readonly [Point, Point];

const GRID = 24;

/** Trash can: lid, handle, tapered body, two ribs. Stroke 2. */
const TRASH: readonly Stroke[] = [
  [[4, 6.5], [20, 6.5]],
  [[9.5, 6.5], [9.5, 4]],
  [[9.5, 4], [14.5, 4]],
  [[14.5, 4], [14.5, 6.5]],
  [[6, 9], [7, 20.5]],
  [[18, 9], [17, 20.5]],
  [[7, 20.5], [17, 20.5]],
  [[10, 11], [10.3, 17.8]],
  [[14, 11], [13.7, 17.8]],
];

/**
 * A walking stick figure, mid-stride to the right: the crosswalk "walk" pose,
 * drawn in lines instead of blocks. Head is a dot; knees and elbows bend.
 */
const WALKER: readonly Stroke[] = [
  [[13.3, 7.6], [11.6, 13.6]], // torso
  [[12.9, 8.9], [15.1, 11.3]], // front upper arm
  [[15.1, 11.3], [17.3, 11.9]], // front forearm
  [[12.9, 8.9], [10.3, 11.2]], // back upper arm
  [[10.3, 11.2], [8.7, 13.5]], // back forearm
  [[11.6, 13.6], [14.1, 17.3]], // front thigh
  [[14.1, 17.3], [15.6, 21.2]], // front shin
  [[11.6, 13.6], [10.3, 17.6]], // back thigh
  [[10.3, 17.6], [7.3, 20.8]], // back shin
];
const WALKER_HEAD = { cx: 14.3, cy: 3.8, r: 2.2 };

function Strokes({
  strokes,
  weight,
  size,
  color,
}: {
  strokes: readonly Stroke[];
  weight: number;
  size: number;
  color: string;
}) {
  const s = size / GRID;
  return (
    <>
      {strokes.map(([[x1, y1], [x2, y2]], index) => {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        // Round caps reach half a stroke past each end, like SVG
        // stroke-linecap="round", so joints meet without gaps.
        const width = (length + weight) * s;
        const height = weight * s;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: ((x1 + x2) / 2) * s - width / 2,
              top: ((y1 + y2) / 2) * s - height / 2,
              width,
              height,
              borderRadius: height / 2,
              backgroundColor: color,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
    </>
  );
}

export type SortIconProps = {
  size?: number;
  color?: string;
  testID?: string;
};

/** Left: not for me. */
export function TrashIcon({ size = 28, color = SORT_COLORS.pass, testID = 'icon-trash' }: SortIconProps) {
  return (
    <View
      testID={testID}
      style={[styles.box, { width: size, height: size }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <Strokes strokes={TRASH} weight={2} size={size} color={color} />
    </View>
  );
}

/** Right: maybe, I'd walk over for this. */
export function WalkerIcon({ size = 28, color = SORT_COLORS.maybe, testID = 'icon-walker' }: SortIconProps) {
  const s = size / GRID;
  const r = WALKER_HEAD.r * s;
  return (
    <View
      testID={testID}
      style={[styles.box, { width: size, height: size }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <View
        style={{
          position: 'absolute',
          left: WALKER_HEAD.cx * s - r,
          top: WALKER_HEAD.cy * s - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: color,
        }}
      />
      <Strokes strokes={WALKER} weight={2.2} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'relative',
  },
});
