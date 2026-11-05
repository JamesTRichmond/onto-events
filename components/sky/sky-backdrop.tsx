import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import type { Astronomy } from '@/lib/sky/astronomy';
import type { SkyRamp, SkyState } from '@/lib/sky/palette';

export type SkyBackdropProps = {
  sky: SkyState;
  moon: Astronomy['moon'] | null;
  seed: string;
  reduceMotion: boolean;
  active: boolean;
};

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Decorative positions, not a star chart; no clock, randomness or device data reads. */
function starField(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  }
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 80 }, () => ({
    left: `${2 + next() * 96}%` as `${number}%`,
    top: `${2 + next() * 76}%` as `${number}%`,
    size: 1 + next() * 1.2,
    opacity: 0.25 + next() * 0.5,
  }));
}

function Ramp({ colors }: { colors: SkyRamp }) {
  return <LinearGradient testID="sky-gradient" colors={colors} style={StyleSheet.absoluteFill} />;
}

export function SkyBackdrop({ sky, moon, seed, reduceMotion, active }: SkyBackdropProps) {
  // Equal ramps have a stable dependency even if the caller rebuilt its object.
  const rampKey = JSON.stringify(sky.colors);
  const ramp = useMemo(() => JSON.parse(rampKey) as SkyRamp, [rampKey]);
  const [layers, setLayers] = useState({ key: rampKey, from: ramp, to: ramp });
  const latest = useRef({ key: rampKey, ramp });
  const fade = useRef(new Animated.Value(1)).current;
  const canAnimate = active && !reduceMotion && sky.animate;

  useEffect(() => {
    const previous = latest.current;
    latest.current = { key: rampKey, ramp };
    if (!canAnimate) {
      fade.stopAnimation();
      fade.setValue(1);
      setLayers((current) => current.key === rampKey ? current : { key: rampKey, from: ramp, to: ramp });
      return;
    }
    if (previous.key === rampKey) return;
    fade.setValue(0);
    setLayers({ key: rampKey, from: previous.ramp, to: ramp });
    const animation = Animated.timing(fade, {
      toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [rampKey, ramp, canAnimate, fade]);

  const stars = useMemo(() => starField(seed), [seed]);
  const starCount = Math.round(80 * unit(sky.starDensity));
  const glow = unit(sky.moonGlow);
  const showMoon = moon !== null && Number.isFinite(moon.altitude)
    && Number.isFinite(moon.azimuth) && moon.altitude > 0 && glow > 0;
  // A flat decorative panorama: north at the left edge, azimuth clockwise.
  // Height follows altitude. It is not aligned with the phone's camera.
  const moonPosition = showMoon ? {
    left: `${8 + (((moon.azimuth % 360) + 360) % 360) / 360 * 84}%` as `${number}%`,
    top: `${5 + (1 - unit(moon.altitude / 90)) * 65}%` as `${number}%`,
  } : undefined;

  return (
    <View
      testID="sky-backdrop"
      style={styles.fill}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden>
      {canAnimate ? (
        <>
          <Ramp colors={layers.key === rampKey ? layers.from : layers.to} />
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: layers.key === rampKey ? fade : 0 }]}>
            <Ramp colors={ramp} />
          </Animated.View>
        </>
      ) : <Ramp colors={ramp} />}
      {stars.slice(0, starCount).map((star, index) => (
        <View key={index} testID={`sky-star-${index}`} style={[styles.star, {
          left: star.left, top: star.top, width: star.size, height: star.size, opacity: star.opacity,
        }]} />
      ))}
      {showMoon ? (
        <View testID="sky-moon-glow" style={[styles.moon, moonPosition, { opacity: glow }]}>
          {[1, 0.7, 0.4].map((scale) => (
            <View key={scale} style={[styles.halo, { width: 112 * scale, height: 112 * scale }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#F7F5F0' },
  moon: {
    position: 'absolute', width: 112, height: 112, marginLeft: -56, marginTop: -56,
    alignItems: 'center', justifyContent: 'center',
  },
  halo: { position: 'absolute', borderRadius: 56, backgroundColor: 'rgba(247,245,240,0.035)' },
});
