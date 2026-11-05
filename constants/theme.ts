/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// onto brand: night indigo ground, coral accent (see assets/brand/onto-mark.svg).
// The light-mode accent is darkened for text/icon contrast on white; the
// dark-mode accent is lifted for contrast on near-black.
export const Brand = {
  indigo: '#171A34',
  coral: '#FF6B4A',
  coralOnLight: '#C74323',
  coralOnDark: '#FF8A6B',
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: Brand.coralOnLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: Brand.coralOnLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: Brand.coralOnDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: Brand.coralOnDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'System',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Each bundled face has its own runtime alias. Keep fontWeight normal when
// using an alias so native platforms do not synthesize a second bold face.
export const JakartaFonts = {
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;

// Surfaces shared by cards, chips, and buttons. Kept next to Colors so the
// screens stop carrying their own copies of these hexes.
export const Surface = {
  element: { light: '#F0F0F3', dark: '#212225' },
  elementSelected: { light: '#E0E1E6', dark: '#2E3135' },
  textSecondary: { light: '#60646C', dark: '#B0B4BA' },
};
