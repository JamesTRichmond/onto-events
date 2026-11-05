import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppFontStyle } from '@/hooks/use-app-fonts';
import { TAB_ICON_SIZE, tabLabelStyle } from '@/lib/tab-bar-style';
import { TAB_TITLES } from '@/lib/tab-titles';

/** Expo Router uses this when it creates a fresh tab state. */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const labelFont = tabLabelStyle(useAppFontStyle('600'));

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarLabelStyle: labelFont,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: TAB_TITLES.index,
          tabBarIcon: ({ color }) => <IconSymbol size={TAB_ICON_SIZE} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="going" options={{ title: TAB_TITLES.going,
        tabBarIcon: ({ color }) => <IconSymbol size={TAB_ICON_SIZE} name="calendar" color={color} /> }} />
      <Tabs.Screen
        name="places"
        options={{
          title: TAB_TITLES.places,
          tabBarIcon: ({ color }) => <IconSymbol size={TAB_ICON_SIZE} name="mappin.and.ellipse" color={color} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: TAB_TITLES.account,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="person.crop.circle.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
