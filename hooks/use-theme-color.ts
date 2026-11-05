/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSkyAppearance } from '@/components/sky/appearance';
import { SKY_SURFACE } from '@/lib/sky/palette';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const sky = useSkyAppearance();
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else if (sky) {
    return colorName === 'background' ? SKY_SURFACE.background
      : colorName === 'text' ? SKY_SURFACE.text : SKY_SURFACE.link;
  } else {
    return Colors[theme][colorName];
  }
}
