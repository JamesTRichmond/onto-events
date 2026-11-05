import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/** The app header mark: splash icon beside the lowercase brand. */
export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={styles.markImage}
        accessibilityLabel="onto mark"
        contentFit="contain"
      />
      <ThemedText type="title" style={styles.name}>onto</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // 40pt so the figures and the word inside the mark read at a glance
  // (James, 2026-09-29); the badge art itself fills its tile edge to edge.
  markImage: {
    width: 40,
    height: 40,
    borderRadius: 9,
  },
  name: {
    fontWeight: '800',
  },
});
