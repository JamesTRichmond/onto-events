import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { type PropsWithChildren, useEffect } from 'react';
import { Platform } from 'react-native';

import { JakartaFonts } from '@/constants/theme';
import { AppFontsLoadedContext } from '@/hooks/use-app-fonts';

const FONT_ASSETS = {
  [JakartaFonts[500]]: require('@/assets/fonts/PlusJakartaSans_500Medium.ttf'),
  [JakartaFonts[600]]: require('@/assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
  [JakartaFonts[700]]: require('@/assets/fonts/PlusJakartaSans_700Bold.ttf'),
  [JakartaFonts[800]]: require('@/assets/fonts/PlusJakartaSans_800ExtraBold.ttf'),
};

if (Platform.OS !== 'web') {
  // Hold the native splash before the first render, as required by Expo.
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

export function AppFontProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts(FONT_ASSETS);

  useEffect(() => {
    if (Platform.OS !== 'web' && (loaded || error)) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  // Render the tree during loading: native is covered by its splash, while
  // web static export must still render its title and content. Keeping this
  // provider outside the crash boundary also lets a font failure release the
  // splash when the app below it is showing its recovery screen.
  return (
    <AppFontsLoadedContext.Provider value={loaded && !error}>
      {children}
    </AppFontsLoadedContext.Provider>
  );
}
