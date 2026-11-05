import { render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet, Text } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { AppFontProvider } from '@/components/app-font-provider';
import { ThemedText } from '@/components/themed-text';
import { Fonts, JakartaFonts } from '@/constants/theme';
import { useAppFontStyle } from '../use-app-fonts';

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockUseFonts = jest.mocked(useFonts);

function FontSample() {
  const inputStyle = useAppFontStyle('600');
  return (
    <>
      <ThemedText>Body</ThemedText>
      <ThemedText type="title">Heading</ThemedText>
      <ThemedText type="title" style={[{ fontWeight: '800' }, { fontWeight: '600' }]}>
        Caller weight
      </ThemedText>
      <Text style={inputStyle}>Input style</Text>
    </>
  );
}

function textStyle(text: string) {
  return StyleSheet.flatten(screen.getByText(text).props.style);
}

describe('bundled app typography', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFonts.mockReturnValue([false, null]);
  });

  it('renders content while loading and keeps the native splash visible', () => {
    render(<AppFontProvider><FontSample /></AppFontProvider>);

    expect(screen.getByText('Body')).toBeTruthy();
    expect(textStyle('Body')).toMatchObject({ fontFamily: Fonts.sans, fontWeight: '500' });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    expect(Object.keys(mockUseFonts.mock.calls[0][0])).toEqual(Object.values(JakartaFonts));
  });

  it('switches to the exact bundled weights and releases the splash once loading finishes', () => {
    const { rerender } = render(<AppFontProvider><FontSample /></AppFontProvider>);
    mockUseFonts.mockReturnValue([true, null]);
    rerender(<AppFontProvider><FontSample /></AppFontProvider>);

    expect(textStyle('Body')).toMatchObject({ fontFamily: JakartaFonts[500], fontWeight: 'normal' });
    expect(textStyle('Heading')).toMatchObject({ fontFamily: JakartaFonts[700], fontWeight: 'normal' });
    expect(textStyle('Caller weight')).toMatchObject({ fontFamily: JakartaFonts[600], fontWeight: 'normal' });
    expect(textStyle('Input style')).toMatchObject({ fontFamily: JakartaFonts[600], fontWeight: 'normal' });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('continues with readable platform fonts and releases the splash after a load error', () => {
    mockUseFonts.mockReturnValue([false, new Error('Font unavailable')]);
    render(<AppFontProvider><FontSample /></AppFontProvider>);

    expect(textStyle('Heading')).toMatchObject({ fontFamily: Fonts.sans, fontWeight: '700' });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('does not clamp Dynamic Type or override an explicitly supplied font family', () => {
    mockUseFonts.mockReturnValue([true, null]);
    render(
      <AppFontProvider>
        <ThemedText accessibilityLabel="Code sample" style={{ fontFamily: Fonts.mono, fontWeight: '600' }}>
          Example
        </ThemedText>
      </AppFontProvider>
    );

    expect(textStyle('Example')).toMatchObject({ fontFamily: Fonts.mono, fontWeight: '600' });
    expect(screen.getByLabelText('Code sample').props.allowFontScaling).not.toBe(false);
    expect(screen.getByText('Example').props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('releases the splash even when a child is showing the crash recovery screen', () => {
    function BrokenChild(): never { throw new Error('A card crashed'); }
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { rerender } = render(
        <AppFontProvider><ErrorBoundary><BrokenChild /></ErrorBoundary></AppFontProvider>
      );
      expect(screen.getByText('Something broke.')).toBeTruthy();
      expect(SplashScreen.hideAsync).not.toHaveBeenCalled();

      mockUseFonts.mockReturnValue([false, new Error('Font unavailable')]);
      rerender(<AppFontProvider><ErrorBoundary><BrokenChild /></ErrorBoundary></AppFontProvider>);
      expect(screen.getByText('Something broke.')).toBeTruthy();
      expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
    }
  });
});
