import { StyleSheet, View } from 'react-native';

import { Muted } from '@/components/ui/muted';
import { SKY_SURFACE } from '@/lib/sky/palette';

/**
 * Where a build has no inline map (the web app, or an Android build without
 * a Google Maps key), say plainly where the map is: Directions, a few lines
 * down in the same sheet, opens the venue in the viewer's maps app.
 */
export function MapFallback({ title, testID }: { title: string; testID: string }) {
  return (
    <View style={styles.box} testID={testID}>
      <Muted>Tap Directions to see {title} in your maps app.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 96,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKY_SURFACE.chip,
  },
});
