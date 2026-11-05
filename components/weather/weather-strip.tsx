import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Muted } from '@/components/ui/muted';
import { WeatherMap } from '@/components/weather/weather-map';
import type { WeatherState } from '@/hooks/use-weather';
import { SKY_SURFACE } from '@/lib/sky/palette';
import { clockLabel, detailsLine, hourLabel, weatherSummary } from '@/lib/weather/format';
import { RADAR_CREDIT, RADAR_SCALE, WEATHER_CREDIT } from '@/lib/weather/radar';

/** A downward drag past this opens the weather; an upward one folds it. */
export const PULL_DISTANCE = 24;

export type WeatherStripProps = {
  weather: WeatherState;
  now: number | null;
  timeZone: string;
  /** The feed's point and radius, for the map's ring. In memory only. */
  lat: number;
  lng: number;
  radiusMi: number;
};

/**
 * Weather at the top of Discover, for the place the feed is looking at (the
 * sky behind it already shows the same weather as color). One line folded;
 * pull it down — or tap — and it opens onto the details, the next hours, and
 * an aerial radar map of the area. Pull up or tap to fold it again. Folded on
 * every launch; memory only.
 */
export function WeatherStrip({ weather, now, timeZone, lat, lng, radiusMi }: WeatherStripProps) {
  const [open, setOpen] = useState(false);
  const summary = now === null ? null : weatherSummary(weather.report, now);

  const pull = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationY > PULL_DISTANCE) setOpen(true);
      else if (event.translationY < -PULL_DISTANCE) setOpen(false);
    })
    .withTestId('weather-pull');

  if (!summary || !weather.cell || now === null) {
    // Quiet while the first answer is on its way; silent when there is none.
    return weather.loading ? (
      <Muted testID="weather-loading">Checking the sky…</Muted>
    ) : null;
  }

  const details = summary.now ? detailsLine(summary.now) : '';
  const spoken = `Weather: ${summary.temp}, ${summary.text}${summary.sub ? `, ${summary.sub}` : ''}.`;

  return (
    <View testID="weather-strip" style={styles.wrap}>
      <GestureDetector gesture={pull}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint={open ? 'Folds the weather away.' : 'Opens the hourly forecast and the radar map.'}
          accessibilityState={{ expanded: open }}
          style={styles.row}>
          <ThemedText style={styles.temp}>{summary.temp}</ThemedText>
          <View style={styles.words}>
            <ThemedText type="defaultSemiBold" numberOfLines={1}>{summary.text}</ThemedText>
            {summary.sub ? <Muted numberOfLines={1}>{summary.sub}</Muted> : null}
          </View>
          <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={24} color={SKY_SURFACE.secondary} />
        </Pressable>
      </GestureDetector>

      {open ? (
        <View style={styles.panel} testID="weather-panel">
          {details ? <Muted>{details}</Muted> : null}
          {summary.hours.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}
              accessibilityLabel="Next hours">
              {summary.hours.map((hour) => (
                <View key={hour.startsAt} style={styles.hour}
                  accessible
                  accessibilityLabel={`${hourLabel(hour.startsAt, timeZone)}: ${hour.tempF ?? 'unknown'} degrees, ${hour.description}${hour.rainPct !== null && hour.rainPct >= 20 ? `, ${hour.rainPct}% chance of rain` : ''}`}>
                  <Muted>{hourLabel(hour.startsAt, timeZone)}</Muted>
                  <ThemedText type="defaultSemiBold">{hour.tempF === null ? '—' : `${hour.tempF}°`}</ThemedText>
                  <Muted style={styles.rain}>{hour.rainPct !== null && hour.rainPct >= 20 ? `${hour.rainPct}%` : ' '}</Muted>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <WeatherMap cell={weather.cell} lat={lat} lng={lng} radiusMi={radiusMi} />
          <View style={styles.legend} accessible accessibilityLabel="Radar colors run from light rain in blue and green to heavy in red.">
            <Muted>Light</Muted>
            <LinearGradient colors={[...RADAR_SCALE]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.scale} />
            <Muted>Heavy</Muted>
          </View>
          <Muted style={styles.credit}>
            {summary.now
              ? `${WEATHER_CREDIT}, observed ${clockLabel(summary.now.observedAt, timeZone)} at ${summary.now.station}. `
              : `${WEATHER_CREDIT} forecast. `}
            {RADAR_CREDIT}.
          </Muted>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  temp: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  words: {
    flex: 1,
    gap: 0,
  },
  panel: {
    gap: 10,
  },
  hours: {
    gap: 16,
    paddingVertical: 2,
  },
  hour: {
    alignItems: 'center',
    minWidth: 40,
  },
  rain: {
    fontSize: 12,
    lineHeight: 16,
    color: '#8FC8FF',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scale: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  credit: {
    fontSize: 12,
    lineHeight: 16,
  },
});
