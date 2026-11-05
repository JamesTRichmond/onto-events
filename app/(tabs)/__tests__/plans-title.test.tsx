import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';

import { GoingProvider } from '@/hooks/use-going';
import GoingScreen from '../going';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => ({
  catalogBackend: null, rsvpBackend: null, rsvpOwnerId: null,
}) }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => Date.parse('2026-10-28T12:00:00Z') }));

beforeEach(async () => { await AsyncStorage.clear(); });

it('titles the saved-plans screen Plans, matching its tab', async () => {
  render(<GoingProvider><GoingScreen /></GoingProvider>);
  expect(await screen.findByText('Plans')).toBeTruthy();
  expect(screen.queryByText('Going')).toBeNull();
});
