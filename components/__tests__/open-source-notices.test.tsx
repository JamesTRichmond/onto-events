import { fireEvent, render, screen } from '@testing-library/react-native';

import { FONT_LICENSE } from '@/assets/fonts/license';
import { ASTRONOMY_LICENSE } from '@/lib/sky/astronomy';
import { OpenSourceNotices } from '../open-source-notices';

it('includes readable complete licenses offline without a website request', () => {
  render(<OpenSourceNotices />);
  expect(screen.queryByText(FONT_LICENSE)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Read app licenses' }));
  expect(screen.getByText(FONT_LICENSE)).toBeTruthy();
  expect(screen.getByText(`SunCalc approximate astronomy\n\n${ASTRONOMY_LICENSE}`)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Hide licenses' }));
  expect(screen.queryByText(FONT_LICENSE)).toBeNull();
});
