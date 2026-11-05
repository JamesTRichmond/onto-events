import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useUiPalette } from '@/hooks/use-ui-palette';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * Spoken name when the visible label is a state readout rather than a verb
   * (the feed summary chip reads "5 mi · For you · Everyone" but is "Adjust
   * the feed"). Defaults to the label, so every existing chip is unchanged.
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** `compact` is the feed control: smaller type, shorter pill. Default stays the 44px chip. */
  size?: 'regular' | 'compact';
};

export function Chip({ label, selected, onPress, accessibilityLabel, accessibilityHint, size = 'regular' }: ChipProps) {
  const palette = useUiPalette();
  const background = selected ? palette.selected : palette.chip;
  const foreground = selected ? palette.onSelected : palette.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}>
      <ThemedView lightColor={background} darkColor={background} style={[styles.chip, size === 'compact' && styles.chipCompact]}>
        <ThemedText lightColor={foreground} darkColor={foreground} style={[styles.label, size === 'compact' && styles.labelCompact, selected && styles.labelSelected]}>{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  labelSelected: {
    fontWeight: '700',
  },
  chipCompact: {
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  labelCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
