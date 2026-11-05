import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppFontStyle } from '@/hooks/use-app-fonts';

export type RouteButtonProps = {
  href: '/privacy' | '/support' | '/community';
  label: string;
};

/** Outlined pill that navigates to an in-app route. */
export function RouteButton({ href, label }: RouteButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const fontStyle = useAppFontStyle('700');

  return (
    <Link
      href={href}
      accessibilityRole="link"
      style={[
        styles.routeButton,
        fontStyle,
        {
          backgroundColor: Colors[scheme].background,
          borderColor: Colors[scheme].icon,
          color: Colors[scheme].text,
        },
      ]}>
      {label}
    </Link>
  );
}

const styles = StyleSheet.create({
  routeButton: {
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 13,
    flexBasis: 160,
    flexGrow: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'none',
  },
});
