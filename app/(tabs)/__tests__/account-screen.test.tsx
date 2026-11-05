import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Fragment, useEffect, useState } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';

import { DEVICE_NOUN } from '@/lib/device-noun';
import { stashEraseNotice, takeEraseNotice } from '@/lib/erase-notice';
import { MAPS_APP_LABEL } from '@/lib/maps-choice';

import AccountScreen from '../account';

const mockUseOntoBackend = jest.fn();
const mockEraseAllOntoData = jest.fn().mockResolvedValue(undefined);
let mockFocusEffect: (() => void | (() => void)) | null = null;
let mockEraseListener: (() => void) | null = null;

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    ...jest.requireActual('expo-router'),
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockFocusEffect = effect;
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock('@/lib/backend/context', () => ({
  useOntoBackend: () => mockUseOntoBackend(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/storage', () => {
  const actual = jest.requireActual('@/lib/storage');
  return {
    ...actual,
    eraseAllOntoData: () => mockEraseAllOntoData(),
  };
});

const mockChooseMapsApp = jest.fn();
jest.mock('@/hooks/use-maps-app', () => ({
  useMapsApp: () => ({ app: 'system', loaded: true, choose: mockChooseMapsApp }),
}));

/**
 * Mirrors OntoBackendProvider: an erase listener bumps an epoch that keys the
 * screen tree, so a completed erase unmounts the screen and mounts a new one.
 */
function EraseRemountHarness() {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    mockEraseListener = () => setEpoch((current) => current + 1);
    return () => {
      mockEraseListener = null;
    };
  }, []);

  return (
    <Fragment key={epoch}>
      <AccountScreen />
    </Fragment>
  );
}

function signedOutAuth(overrides: Record<string, unknown> = {}) {
  return {
    state: { kind: 'signed-out' as const },
    available: true,
    pendingAction: null,
    error: null,
    requestCode: jest.fn().mockResolvedValue(true),
    verifyCode: jest.fn().mockResolvedValue(true),
    signOut: jest.fn().mockResolvedValue(true),
    deleteAccount: jest.fn().mockResolvedValue(true),
    clearError: jest.fn(),
    ...overrides,
  };
}

describe('AccountScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFocusEffect = null;
    takeEraseNotice();
    await AsyncStorage.clear();
  });

  it('explains that browsing is free and completes the email-code form', async () => {
    const auth = signedOutAuth();
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: null });

    render(<AccountScreen />);
    expect(screen.getByText(/keep browsing without signing in/i)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Email address'), 'james@example.com');
    fireEvent.press(screen.getByText('Email me a code'));

    await waitFor(() =>
      expect(auth.requestCode).toHaveBeenCalledWith('james@example.com'),
    );
    expect(await screen.findByLabelText('Six-digit sign-in code')).toBeTruthy();
  });

  it('carries the Feed mode control the dashboard gave up (James, 2026-09-29)', async () => {
    const auth = signedOutAuth();
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: null });
    render(<AccountScreen />);

    const card = within(screen.getByTestId('feed-mode'));
    expect(card.getByText('Everyone')).toBeTruthy();
    expect(card.getByText('Family')).toBeTruthy();
    // Mature stays behind the fail-closed release flag: no 21+ chip in v1.
    expect(card.queryByText('21+')).toBeNull();

    fireEvent.press(card.getByText('Family'));
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('onto.mode.v1')).toBe('family');
    });
  });

  it('with mature enabled, 21+ asks for confirmation and Not now backs out', async () => {
    process.env.EXPO_PUBLIC_ENABLE_MATURE = 'true';
    try {
      const auth = signedOutAuth();
      mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: null });
      render(<AccountScreen />);
      // A 21+ request made before the stored acknowledgement is read is
      // deferred until the load settles, so let storage answer first.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const card = within(screen.getByTestId('feed-mode'));
      fireEvent.press(card.getByText('21+'));
      expect(card.getByText('Confirm you are 21 or older')).toBeTruthy();

      fireEvent.press(card.getByText('Not now'));
      expect(card.queryByText('Confirm you are 21 or older')).toBeNull();
      expect(await AsyncStorage.getItem('onto.mode.v1')).not.toBe('mature');

      fireEvent.press(card.getByText('21+'));
      fireEvent.press(card.getByText('I am 21 or older'));
      expect(card.queryByText('Confirm you are 21 or older')).toBeNull();
      await waitFor(async () => {
        expect(await AsyncStorage.getItem('onto.mode.v1')).toBe('mature');
      });
    } finally {
      delete process.env.EXPO_PUBLIC_ENABLE_MATURE;
    }
  });

  it('keeps ticket sellers off until the viewer confirms, and turns them off in one tap (James, 2026-10-07)', async () => {
    mockUseOntoBackend.mockReturnValue({ auth: signedOutAuth(), rsvpBackend: null });
    render(<AccountScreen />);
    const card = within(screen.getByTestId('ticket-sellers'));
    await waitFor(() => expect(card.getByLabelText('Ticket sellers off')).toBeSelected());
    expect(card.getByText(/free and local first/)).toBeTruthy();

    fireEvent.press(card.getByText('On'));
    expect(card.getByText('Show ticket sellers in Things To Do?')).toBeTruthy();
    expect(card.getByLabelText('Ticket sellers off')).toBeSelected();
    fireEvent.press(card.getByText('Not now'));
    expect(card.queryByText('Show ticket sellers in Things To Do?')).toBeNull();
    expect(card.getByLabelText('Ticket sellers off')).toBeSelected();
    expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBeNull();

    fireEvent.press(card.getByText('On'));
    fireEvent.press(card.getByText('Show ticket sellers'));
    expect(card.getByLabelText('Ticket sellers on')).toBeSelected();
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBe('on'));

    fireEvent.press(card.getByText('Off'));
    expect(card.getByLabelText('Ticket sellers off')).toBeSelected();
    await waitFor(async () => expect(await AsyncStorage.getItem('onto.ticketSellers.v1')).toBeNull());
  });

  it('lets the viewer pick which maps app Directions opens', () => {
    mockUseOntoBackend.mockReturnValue({ auth: signedOutAuth(), rsvpBackend: null });
    render(<AccountScreen />);

    expect(screen.getByText('Directions open in')).toBeTruthy();
    expect(screen.getByText(MAPS_APP_LABEL.system)).toBeTruthy();
    expect(screen.getByText('onto sends only the venue to your maps app, never where you are.')).toBeTruthy();
    fireEvent.press(screen.getByText('Waze'));
    expect(mockChooseMapsApp).toHaveBeenCalledWith('waze');
  });

  it('shows a signed-in user, cloud plans, privacy, and no unavailable social features', async () => {
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
    });
    const backend = {
      listMyRsvpHistory: jest.fn().mockResolvedValue([
        {
          eventId: 'event-1',
          status: 'going',
          title: 'Concert on the plaza',
          venueName: 'Gallivan Center',
          startsAt: '2026-09-03T01:00:00.000Z',
          endsAt: null,
          sourceUrl: null,
          rsvpUpdatedAt: '2026-09-02T20:00:00.000Z',
        },
      ]),
    };
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: backend });

    render(<AccountScreen />);

    expect(screen.getByText('james@example.com')).toBeTruthy();
    expect(await screen.findByText('Concert on the plaza')).toBeTruthy();
    expect(screen.queryByText(/Matching, groups, and chat/i)).toBeNull();
    expect(screen.getByText('Delete account permanently')).toBeTruthy();
  });

  it('refreshes RSVP history whenever the Account tab regains focus', async () => {
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
    });
    let resolveFocusedHistory!: (items: Record<string, unknown>[]) => void;
    const focusedHistory = new Promise<Record<string, unknown>[]>((resolve) => {
      resolveFocusedHistory = resolve;
    });
    const listMyRsvpHistory = jest.fn().mockResolvedValueOnce([
        {
          eventId: 'old-plan',
          status: 'going',
          title: 'Old plan',
          venueName: null,
          startsAt: '2026-09-03T01:00:00.000Z',
          endsAt: null,
          sourceUrl: null,
          rsvpUpdatedAt: '2026-09-02T20:00:00.000Z',
        },
      ]).mockReturnValueOnce(focusedHistory);
    const refreshedPlans = [
        {
          eventId: 'new-plan',
          status: 'interested',
          title: 'New plan from another device',
          venueName: null,
          startsAt: '2026-09-04T01:00:00.000Z',
          endsAt: null,
          sourceUrl: null,
          rsvpUpdatedAt: '2026-09-02T21:00:00.000Z',
        },
      ];
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: { listMyRsvpHistory } });

    render(<AccountScreen />);
    expect(await screen.findByText('Old plan')).toBeTruthy();

    act(() => {
      mockFocusEffect?.();
    });
    await act(async () => {
      resolveFocusedHistory(refreshedPlans);
      await focusedHistory;
    });

    expect(await screen.findByText('New plan from another device')).toBeTruthy();
    expect(screen.queryByText('Old plan')).toBeNull();
    expect(listMyRsvpHistory).toHaveBeenCalledTimes(2);
  });

  it('confirms a specific account for permanent deletion without erasing other local data', async () => {
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
    });
    mockUseOntoBackend.mockReturnValue({
      auth,
      rsvpBackend: { listMyRsvpHistory: jest.fn().mockResolvedValue([]) },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<AccountScreen />);
    await screen.findByText(/No RSVPs yet/i);
    fireEvent.press(screen.getByText('Delete account permanently'));

    const actions = alert.mock.calls[0][2] ?? [];
    const destructive = actions.find((action) => action.text === 'Delete account');
    await destructive?.onPress?.();

    expect(auth.deleteAccount).toHaveBeenCalledWith('user-1');
    expect(mockEraseAllOntoData).not.toHaveBeenCalled();
  });

  it('signs out before erasing data from a signed-in iPhone', async () => {
    const order: string[] = [];
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
      signOut: jest.fn().mockImplementation(async () => {
        order.push('sign-out');
        return true;
      }),
    });
    mockEraseAllOntoData.mockImplementationOnce(async () => {
      order.push('erase');
    });
    mockUseOntoBackend.mockReturnValue({
      auth,
      rsvpBackend: { listMyRsvpHistory: jest.fn().mockResolvedValue([]) },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<AccountScreen />);
    await screen.findByText(/No RSVPs yet/i);
    fireEvent.press(screen.getByText(`Erase data on this ${DEVICE_NOUN}`));

    const actions = alert.mock.calls.at(-1)?.[2] ?? [];
    const destructive = actions.find((action) => action.text === 'Erase');
    await destructive?.onPress?.();

    expect(order).toEqual(['sign-out', 'erase']);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('still erases local data when the remote sign-out fails and says the session was not revoked', async () => {
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
      signOut: jest.fn().mockResolvedValue(false),
    });
    // lib/storage fires its erase listeners before the erase promise settles,
    // and the provider answers by remounting the screen tree.
    mockEraseAllOntoData.mockImplementationOnce(async () => {
      await act(async () => {
        mockEraseListener?.();
      });
    });
    const backend = { listMyRsvpHistory: jest.fn().mockResolvedValue([]) };
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: backend });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});

    render(<EraseRemountHarness />);
    await screen.findByText(/No RSVPs yet/i);
    fireEvent.press(screen.getByText(`Erase data on this ${DEVICE_NOUN}`));

    const actions = alert.mock.calls.at(-1)?.[2] ?? [];
    const destructive = actions.find((action) => action.text === 'Erase');
    // A sync act covers the handler's own state update; the erase promise is
    // awaited outside it so the mocked erase can flush the remount on its own.
    let erased: unknown;
    act(() => {
      erased = destructive?.onPress?.();
    });
    await erased;

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockEraseAllOntoData).toHaveBeenCalledTimes(1);
    expect(auth.clearError).toHaveBeenCalledTimes(1);
    expect(backend.listMyRsvpHistory).toHaveBeenCalledTimes(2);
    expect(
      await screen.findByText(/could not be reached to end the session/i),
    ).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(/could not be reached to end the session/i),
    );
    expect(announce).not.toHaveBeenCalledWith('Local onto data erased');
  });

  it('confirms a plain erase when the remote sign-out succeeds', async () => {
    const auth = signedOutAuth({
      state: {
        kind: 'signed-in' as const,
        user: {
          id: 'user-1',
          email: 'james@example.com',
          createdAt: '2026-09-02T20:00:00.000Z',
        },
        session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
      },
    });
    mockUseOntoBackend.mockReturnValue({
      auth,
      rsvpBackend: { listMyRsvpHistory: jest.fn().mockResolvedValue([]) },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});

    render(<AccountScreen />);
    await screen.findByText(/No RSVPs yet/i);
    fireEvent.press(screen.getByText(`Erase data on this ${DEVICE_NOUN}`));

    const actions = alert.mock.calls.at(-1)?.[2] ?? [];
    const destructive = actions.find((action) => action.text === 'Erase');
    await act(async () => {
      await destructive?.onPress?.();
    });

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(mockEraseAllOntoData).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Local onto data erased');
    expect(screen.queryByText(/could not be reached to end the session/i)).toBeNull();
  });

  it('shows a stashed erase notice on mount and clears it when a new code is requested', async () => {
    const auth = signedOutAuth();
    mockUseOntoBackend.mockReturnValue({ auth, rsvpBackend: null });
    stashEraseNotice('stashed message');

    render(<AccountScreen />);
    expect(screen.getByText('stashed message')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Email address'), 'james@example.com');
    fireEvent.press(screen.getByText('Email me a code'));

    expect(await screen.findByText('Enter your code')).toBeTruthy();
    expect(screen.queryByText('stashed message')).toBeNull();
  });

  it('returns to the email entry form after signing in and back out without a remount', async () => {
    const signedOut = signedOutAuth();
    mockUseOntoBackend.mockReturnValue({ auth: signedOut, rsvpBackend: null });

    const view = render(<AccountScreen />);
    fireEvent.changeText(screen.getByLabelText('Email address'), 'james@example.com');
    fireEvent.press(screen.getByText('Email me a code'));
    expect(await screen.findByText('Enter your code')).toBeTruthy();

    mockUseOntoBackend.mockReturnValue({
      auth: signedOutAuth({
        state: {
          kind: 'signed-in' as const,
          user: {
            id: 'user-1',
            email: 'james@example.com',
            createdAt: '2026-09-02T20:00:00.000Z',
          },
          session: { userId: 'user-1', accessToken: 'token', expiresAt: null },
        },
      }),
      rsvpBackend: { listMyRsvpHistory: jest.fn().mockResolvedValue([]) },
    });
    view.rerender(<AccountScreen />);
    expect(await screen.findByText(/No RSVPs yet/i)).toBeTruthy();

    mockUseOntoBackend.mockReturnValue({ auth: signedOutAuth(), rsvpBackend: null });
    view.rerender(<AccountScreen />);

    expect(screen.getByText('Sign in without a password')).toBeTruthy();
    expect(screen.queryByText('Enter your code')).toBeNull();
    const emailInput = screen.getByLabelText('Email address');
    expect(emailInput.props.value).toBe('');
    expect(emailInput.props.editable).toBe(true);
  });
});
