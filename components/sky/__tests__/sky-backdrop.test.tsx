import { render, screen } from '@testing-library/react-native';
import { Animated, Platform, StyleSheet } from 'react-native';

import { SkyBackdrop, type SkyBackdropProps } from '../sky-backdrop';
import { SKY_RAMPS } from '@/lib/sky/palette';

jest.mock('expo-linear-gradient', () => {
  // Keep gradient colors visible in the rendered tree, without a native module.
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});

const NIGHT: SkyBackdropProps = {
  sky: { phase: 'night', colors: SKY_RAMPS.night, starDensity: 1, moonGlow: 0.6, weather: 'unavailable', animate: true },
  moon: { azimuth: 180, altitude: 45, illumination: 0.9 },
  seed: 'slc-sky', reduceMotion: false, active: true,
};
const hidden = { includeHiddenElements: true };
const byId = (id: string) => screen.getByTestId(id, hidden);
const stars = () => screen.queryAllByTestId(/^sky-star-/, hidden).map((node) => StyleSheet.flatten(node.props.style));

describe('SkyBackdrop', () => {
  let timing: jest.SpyInstance;
  const start = jest.fn();
  const stop = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    timing = jest.spyOn(Animated, 'timing').mockReturnValue({ start, stop, reset: jest.fn() });
  });
  afterEach(() => timing.mockRestore());

  it('renders five-stop ramps while excluding all decoration from interaction and accessibility', () => {
    render(<SkyBackdrop {...NIGHT} />);
    expect(byId('sky-backdrop').props).toMatchObject({
      pointerEvents: 'none', accessible: false, accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true,
    });
    expect(screen.getAllByTestId('sky-gradient', hidden).every((node) => node.props.colors === SKY_RAMPS.night
      || JSON.stringify(node.props.colors) === JSON.stringify(SKY_RAMPS.night))).toBe(true);
    expect(timing).not.toHaveBeenCalled();
  });

  it('keeps seeded star positions stable across equal renders and scales their count with density', () => {
    const { rerender } = render(<SkyBackdrop {...NIGHT} />);
    const initial = stars();
    expect(initial).toHaveLength(80);
    rerender(<SkyBackdrop {...NIGHT} sky={{ ...NIGHT.sky }} />);
    expect(stars()).toEqual(initial);
    rerender(<SkyBackdrop {...NIGHT} sky={{ ...NIGHT.sky, starDensity: 0.25 }} />);
    expect(stars()).toEqual(initial.slice(0, 20));
    rerender(<SkyBackdrop {...NIGHT} seed="another-place" />);
    expect(stars()).not.toEqual(initial);
  });

  it('places glow using supplied lunar position and hides it below the horizon or without astronomy', () => {
    const { rerender } = render(<SkyBackdrop {...NIGHT} />);
    expect(StyleSheet.flatten(byId('sky-moon-glow').props.style)).toMatchObject({ left: '50%', top: '37.5%', opacity: 0.6 });
    rerender(<SkyBackdrop {...NIGHT} moon={{ ...NIGHT.moon!, altitude: -1 }} />);
    expect(screen.queryByTestId('sky-moon-glow', hidden)).toBeNull();
    rerender(<SkyBackdrop {...NIGHT} moon={null} />);
    expect(screen.queryByTestId('sky-moon-glow', hidden)).toBeNull();
  });

  it('crossfades a changed ramp once, uses native opacity, and cancels on unmount', () => {
    const { rerender, unmount } = render(<SkyBackdrop {...NIGHT} />);
    const day = { ...NIGHT.sky, phase: 'day' as const, colors: SKY_RAMPS.day };
    rerender(<SkyBackdrop {...NIGHT} sky={day} />);
    expect(timing).toHaveBeenCalledWith(expect.any(Animated.Value), { toValue: 1, duration: 1800, useNativeDriver: true });
    expect(start).toHaveBeenCalledTimes(1);
    rerender(<SkyBackdrop {...NIGHT} sky={{ ...day }} />);
    expect(start).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each([{ reduceMotion: true }, { active: false }])('immediately uses the static ramp for %p', (setting) => {
    const { rerender } = render(<SkyBackdrop {...NIGHT} />);
    rerender(<SkyBackdrop {...NIGHT} sky={{ ...NIGHT.sky, colors: SKY_RAMPS.day }} />);
    rerender(<SkyBackdrop {...NIGHT} {...setting} sky={{ ...NIGHT.sky, colors: SKY_RAMPS.morning }} />);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('sky-gradient', hidden)).toHaveLength(1);
    expect(byId('sky-gradient').props.colors).toEqual(SKY_RAMPS.morning);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('uses the web opacity driver without requesting an unavailable native module', () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const { rerender } = render(<SkyBackdrop {...NIGHT} />);
      rerender(<SkyBackdrop {...NIGHT} sky={{ ...NIGHT.sky, colors: SKY_RAMPS.day }} />);
      expect(timing).toHaveBeenCalledWith(expect.any(Animated.Value), {
        toValue: 1, duration: 1800, useNativeDriver: false,
      });
    } finally {
      platform.restore();
    }
  });

  it('derives decoration entirely from props without reading wall-clock time or global randomness', () => {
    const now = jest.spyOn(Date, 'now');
    const random = jest.spyOn(Math, 'random');
    try {
      render(<SkyBackdrop {...NIGHT} reduceMotion />);
      expect(now).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
      random.mockRestore();
    }
  });
});
