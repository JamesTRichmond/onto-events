import {
  TAB_ICON_SIZE,
  TAB_ITEM_HEIGHT,
  TAB_ITEM_STYLE,
  TAB_LABEL_FONT_SIZE,
  TAB_LABEL_LINE_HEIGHT,
  tabLabelStyle,
} from '@/lib/tab-bar-style';

describe('tab bar label room (#436)', () => {
  it('gives the label a line box tall enough for its letters', () => {
    const style = tabLabelStyle({ fontFamily: 'PlusJakartaSans_600SemiBold', fontWeight: 'normal' });
    expect(style.fontSize).toBe(TAB_LABEL_FONT_SIZE);
    // Measured at 390×844: Plus Jakarta at 10px draws 12px; a 10px box cut "g" and "n".
    expect(style.lineHeight).toBeGreaterThanOrEqual(Math.ceil(TAB_LABEL_FONT_SIZE * 1.3));
  });

  it('fits icon, label and padding inside the 48px tab, so the label is never squeezed', () => {
    const vertical = Number(TAB_ITEM_STYLE.paddingTop) + Number(TAB_ITEM_STYLE.paddingBottom);
    expect(vertical + TAB_ICON_SIZE + TAB_LABEL_LINE_HEIGHT).toBeLessThanOrEqual(TAB_ITEM_HEIGHT);
  });

  it('keeps the app font', () => {
    expect(tabLabelStyle({ fontFamily: 'X', fontWeight: 'normal' }).fontFamily).toBe('X');
  });
});
