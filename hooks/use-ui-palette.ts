import { useSkyAppearance } from '@/components/sky/appearance';
import { Colors, Surface } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SKY_SURFACE } from '@/lib/sky/palette';

export function useUiPalette() {
  const sky = useSkyAppearance();
  const scheme = useColorScheme() ?? 'light';
  return {
    sky,
    element: sky ? SKY_SURFACE.card : Surface.element[scheme],
    selected: sky ? SKY_SURFACE.selected : Surface.elementSelected[scheme],
    text: sky ? SKY_SURFACE.text : Colors[scheme].text,
    onSelected: sky ? SKY_SURFACE.onSelected : Colors[scheme].text,
    secondary: sky ? SKY_SURFACE.secondary : Surface.textSecondary[scheme],
    border: sky ? SKY_SURFACE.border : 'transparent',
    chip: sky ? SKY_SURFACE.chip : Surface.element[scheme],
  };
}
