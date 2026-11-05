import { StyleSheet, View } from 'react-native';

import { Muted } from '@/components/ui/muted';
import { SKY_SURFACE } from '@/lib/sky/palette';
import type { WeatherMapProps } from './weather-map';

/** The native map has no web build; the web preview says so plainly. */
export function WeatherMap(_props: WeatherMapProps) {
  return (
    <View style={styles.box} testID="weather-map">
      <Muted>The radar map opens in the onto app on iPhone.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 96,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SKY_SURFACE.chip,
  },
});
