import { StyleSheet, type TextProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useUiPalette } from '@/hooks/use-ui-palette';

export type MutedProps = TextProps & {
  children: React.ReactNode;
  /** `small` is the feed's 14/20 secondary line; `body` is the account screen's 15/22. */
  variant?: 'small' | 'body';
  /** Compact category/time label; retained API, now uses the one brand family. */
  mono?: boolean;
  /** Line clamp for one-line secondary text (the card's place line). */
  numberOfLines?: number;
};

export function Muted({ children, variant = 'small', mono, style, ...rest }: MutedProps) {
  const palette = useUiPalette();
  return (
    <ThemedText
      lightColor={palette.secondary}
      darkColor={palette.secondary}
      style={[variant === 'body' ? styles.body : styles.small, mono && styles.mono, style]}
      {...rest}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  mono: {
    fontSize: 12,
    fontWeight: '600',
  },
});
