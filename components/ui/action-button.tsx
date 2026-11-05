import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Colors, Surface } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Red fill for erase and sign-out style actions. */
  destructive?: boolean;
  /** Surface-colored fill for secondary actions. */
  quiet?: boolean;
  /** Shows a spinner and blocks taps while work is in flight. */
  busy?: boolean;
};

export function ActionButton({
  label,
  onPress,
  disabled = false,
  destructive = false,
  quiet = false,
  busy = false,
}: ActionButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const backgroundColor = quiet
    ? Surface.element[scheme]
    : destructive
      ? scheme === 'dark'
        ? '#FF8A80'
        : '#B42318'
      : Colors[scheme].tint;
  const color = quiet ? Colors[scheme].text : scheme === 'dark' ? Brand.indigo : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor },
        (disabled || busy) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}>
      {busy ? <ActivityIndicator color={color} style={StyleSheet.absoluteFill} /> : null}
      <ThemedText
        lightColor={color}
        darkColor={color}
        style={[styles.buttonText, busy && styles.busyText]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  busyText: {
    opacity: 0,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
