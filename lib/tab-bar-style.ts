import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Tab bar label room (#436). Each tab is 48px tall with 5px default padding
 * above and below, so a 28px icon leaves the 10px label a 10px box while
 * Plus Jakarta draws 12px; the overflow is hidden and "Things" read "Thinas".
 * A 13px line box plus 3px/4px padding fits icon and label exactly in the
 * same 48px, so the bar does not grow and the safe-area pad is untouched.
 */
export const TAB_ITEM_HEIGHT = 48;
export const TAB_ICON_SIZE = 28;
export const TAB_LABEL_FONT_SIZE = 10;
export const TAB_LABEL_LINE_HEIGHT = 13;
export const TAB_ITEM_STYLE: ViewStyle = { paddingTop: 3, paddingBottom: 4 };

export function tabLabelStyle(font: Pick<TextStyle, 'fontFamily' | 'fontWeight'>): TextStyle {
  return { ...font, fontSize: TAB_LABEL_FONT_SIZE, lineHeight: TAB_LABEL_LINE_HEIGHT };
}
