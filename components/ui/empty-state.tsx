import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Muted } from '@/components/ui/muted';
import { useUiPalette } from '@/hooks/use-ui-palette';

export type EmptyStateProps = {
  title: string;
  hint: string;
  /** Optional one-tap remedies under the hint (#434); omitted, nothing changes. */
  children?: ReactNode;
};

export function EmptyState({ title, hint, children }: EmptyStateProps) {
  const palette = useUiPalette();
  return (
    <ThemedView
      lightColor={palette.element}
      darkColor={palette.element}
      style={styles.emptyState}>
      <ThemedText>{title}</ThemedText>
      <Muted>{hint}</Muted>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    borderRadius: 16,
    padding: 24,
    gap: 4,
    alignItems: 'center',
  },
});
