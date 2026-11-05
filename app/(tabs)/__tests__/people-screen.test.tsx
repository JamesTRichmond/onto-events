import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, waitFor } from '@testing-library/react-native';

import PeopleScreen from '../people';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockUseOntoBackend = jest.fn(() => ({ auth: { state: { kind: 'signed-out' } } }));
jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => mockUseOntoBackend(),
}));

describe('People To See tab (James, 2026-10-07)', () => {
  beforeEach(async () => { await AsyncStorage.clear(); mockUseOntoBackend.mockClear(); });

  it('opens the community pilot, which asks a signed-out viewer to sign in from Account', async () => {
    render(<PeopleScreen />);
    expect(await screen.findByText(/Sign in from Account to host or manage your reviews/)).toBeTruthy();
  });

  it('keeps Family mode free of hosting and reviews (SAFETY.md)', async () => {
    await AsyncStorage.setItem('onto.mode.v1', 'family');
    render(<PeopleScreen />);
    await waitFor(() => expect(screen.getByText(/Family mode keeps to public listings and private Going/)).toBeTruthy());
    expect(screen.queryByText(/Sign in from Account to host/)).toBeNull();
    // Fail closed: the community screen never mounted while the saved mode loaded.
    expect(mockUseOntoBackend).not.toHaveBeenCalled();
  });
});
