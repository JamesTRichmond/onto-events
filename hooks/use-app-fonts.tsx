import { createContext, useContext } from 'react';
import { type TextStyle } from 'react-native';

import { Fonts, JakartaFonts } from '@/constants/theme';

export const AppFontsLoadedContext = createContext(false);

export function useAppFontsLoaded(): boolean {
  return useContext(AppFontsLoadedContext);
}

type AppFontStyle = {
  fontFamily: string;
  fontWeight: 'normal' | '500' | '600' | '700' | '800';
};

/** Select a real bundled weight; body copy starts at the agreed Medium face. */
export function useAppFontStyle(weight: TextStyle['fontWeight'] = '500'): AppFontStyle {
  const loaded = useAppFontsLoaded();
  const numericWeight = weight === 'bold' ? 700 : Number(weight) || 500;
  const face = numericWeight >= 800 ? 800 : numericWeight >= 700 ? 700 : numericWeight >= 600 ? 600 : 500;
  return loaded
    ? { fontFamily: JakartaFonts[face], fontWeight: 'normal' }
    : { fontFamily: Fonts.sans, fontWeight: String(face) as Exclude<AppFontStyle['fontWeight'], 'normal'> };
}
