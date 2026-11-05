import { InstallAppCard } from '@/components/ui/install-app-card';
import { PwaUpdateBanner } from '@/components/ui/pwa-update';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { DocumentTitle } from '@/components/document-title';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppFontProvider } from '@/components/app-font-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { registerOntoServiceWorker, useOfflineCatalog } from '@/hooks/use-offline-catalog';
import { useAppFontStyle } from '@/hooks/use-app-fonts';
import { useStandaloneViewportGap } from '@/hooks/use-standalone-viewport-gap';
import { TicketSellersProvider } from '@/hooks/use-ticket-sellers';
import { GoingProvider } from '@/hooks/use-going';
import { TierModeProvider } from '@/hooks/use-tier-mode';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { OntoBackendProvider } from '@/lib/backend/context';
import { createConfiguredModules } from '@/lib/backend/configured-modules';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <AppFontProvider>
      <ErrorBoundary>
        <TierModeProvider>
          <TicketSellersProvider>
            <RootNavigator />
          </TicketSellersProvider>
        </TierModeProvider>
      </ErrorBoundary>
    </AppFontProvider>
  );
}

function RootNavigator() {
  useEffect(() => {
    registerOntoServiceWorker();
  }, []);
  useOfflineCatalog();
  useStandaloneViewportGap();
  const segments = useSegments();
  const showingSky = segments.join('/') === '(tabs)' || segments.join('/') === '(tabs)/index';
  const colorScheme = useColorScheme();
  const [modules] = useState(createConfiguredModules);
  const regular = useAppFontStyle('500');
  const medium = useAppFontStyle('600');
  const bold = useAppFontStyle('700');
  const heavy = useAppFontStyle('800');
  const theme = {
    ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    fonts: { regular, medium, bold, heavy },
  };

  return (
    <OntoBackendProvider modules={modules}>
      <GoingProvider>
      <SelectedLocationProvider>
      <ThemeProvider value={theme}>
        <DocumentTitle title="onto" />
        <PwaUpdateBanner />
        <InstallAppCard firstVisit />
        <Stack screenOptions={{ headerBackTitle: 'Back' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
          <Stack.Screen name="support" options={{ title: 'Support' }} />
        </Stack>
        <StatusBar style={showingSky ? 'light' : 'auto'} />
      </ThemeProvider>
      </SelectedLocationProvider>
      </GoingProvider>
    </OntoBackendProvider>
  );
}
