import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type AuthBackend,
  type AuthState,
  BackendError,
} from '@/lib/backend/contracts';
import { eraseAccountPlanData } from '@/lib/storage';

type AuthAction = 'apple' | 'request-code' | 'verify-code' | 'sign-out' | 'delete-account';

type BackendSetup = {
  backend: AuthBackend | null;
  startRefresh?: () => () => void;
};

type AuthSnapshot = {
  setup: BackendSetup;
  state: AuthState;
  pendingAction: AuthAction | null;
  error: BackendError | null;
};

export interface UseAuthResult {
  state: AuthState;
  available: boolean;
  appleAvailable: boolean;
  acceptAppleCredential(input: {token: string; nonce: string; authorizationCode?: string}): Promise<boolean>;
  pendingAction: AuthAction | null;
  error: BackendError | null;
  requestCode(email: string): Promise<boolean>;
  verifyCode(email: string, token: string): Promise<boolean>;
  signOut(): Promise<boolean>;
  deleteAccount(expectedUserId: string): Promise<boolean>;
  clearError(): void;
}

function asBackendError(error: unknown): BackendError {
  return error instanceof BackendError
    ? error
    : new BackendError('unknown', 'Something went wrong', error);
}

function initialSnapshot(setup: BackendSetup): AuthSnapshot {
  return {
    setup,
    state: { kind: setup.backend ? 'loading' : 'signed-out' },
    pendingAction: null,
    error: null,
  };
}

/**
 * Passwordless auth state with an explicit offline mode. The public feed never
 * waits for a transport or a user account. The composition root owns setup.
 */
export function useAuth(
  backend: AuthBackend | null = null,
  startRefresh?: () => () => void,
): UseAuthResult {
  const setup = useMemo(
    () => ({ backend, startRefresh }),
    [backend, startRefresh],
  );
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(setup));
  const active = useRef<BackendSetup | null>(null);
  const actionVersion = useRef(0);
  // Never expose the previous module's identity, even before effects run.
  const { state, pendingAction, error } =
    snapshot.setup === setup ? snapshot : initialSnapshot(setup);
  const latestState = useRef(state);
  latestState.current = state;

  useEffect(() => {
    let cancelled = false;
    let stateChanged = false;
    let stopRefresh: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    active.current = setup;
    setSnapshot(initialSnapshot(setup));
    const fail = (reason: unknown) => {
      if (!cancelled) {
        setSnapshot({
          ...initialSnapshot(setup),
          state: { kind: 'signed-out' },
          error: asBackendError(reason),
        });
      }
    };
    try {
      if (setup.backend) {
        stopRefresh = setup.startRefresh?.();
        unsubscribe = setup.backend.onStateChange((next) => {
          stateChanged = true;
          if (!cancelled) {
            latestState.current = next;
            setSnapshot((current) => ({ ...current, state: next }));
          }
        });
        setup.backend.getState().then((next) => {
          if (!cancelled && !stateChanged) {
            latestState.current = next;
            setSnapshot((current) => ({ ...current, state: next }));
          }
        }, (reason) => {
          if (!stateChanged) fail(reason);
        });
      }
    } catch (reason) {
      fail(reason);
    }

    return () => {
      cancelled = true;
      active.current = null;
      for (const stop of [unsubscribe, stopRefresh]) {
        try {
          stop?.();
        } catch {
          // A failed transport cleanup must not prevent the other cleanup.
        }
      }
    };
  }, [setup]);

  const run = useCallback(
    async (action: AuthAction, operation: (backend: AuthBackend) => Promise<void>, expectedUserId?: string) => {
      if (active.current !== setup) return false;
      if (!setup.backend) {
        setSnapshot((current) => ({
          ...current,
          error: new BackendError(
            'server',
            'Accounts are not available yet; nearby discovery still works',
          ),
        }));
        return false;
      }

      const version = ++actionVersion.current;
      setSnapshot((current) => ({ ...current, pendingAction: action, error: null }));
      try {
        await operation(setup.backend);
        if (active.current !== setup || version !== actionVersion.current) return false;
        return true;
      } catch (reason) {
        if (active.current === setup && version === actionVersion.current &&
            (!expectedUserId || (latestState.current.kind === 'signed-in' && latestState.current.user.id === expectedUserId))) {
          setSnapshot((current) => ({ ...current, error: asBackendError(reason) }));
        }
        return false;
      } finally {
        if (active.current === setup && version === actionVersion.current) {
          setSnapshot((current) => ({ ...current, pendingAction: null }));
        }
      }
    },
    [setup],
  );

  const requestCode = useCallback(
    (email: string) =>
      run('request-code', (backend) => backend.signInWithEmail(email)),
    [run],
  );

  const verifyCode = useCallback(
    (email: string, token: string) =>
      run('verify-code', (backend) => backend.verifyEmailOtp(email, token)),
    [run],
  );

  const signOut = useCallback(
    () => run('sign-out', (backend) => backend.signOut()),
    [run],
  );

  const deleteAccount = useCallback(
    async (expectedUserId: string) => {
      if (latestState.current.kind !== 'signed-in' || latestState.current.user.id !== expectedUserId)
        return false;
      let serverDeleted = false;
      const deleted = await run('delete-account', async backend => {
        await backend.deleteAccount(expectedUserId);
        serverDeleted = true;
      }, expectedUserId);
      if (!serverDeleted) return false;
      // Remove only the deleted account's local plans. Guest preferences and a
      // newly selected account's buckets belong to separate owners.
      await eraseAccountPlanData(expectedUserId);
      if (!deleted) return false;
      // Auth callbacks can change this ref while the asynchronous action runs.
      const completedState = latestState.current as AuthState;
      if (active.current !== setup || completedState.kind === 'loading' ||
          (completedState.kind === 'signed-in' && completedState.user.id !== expectedUserId))
        return false;
      latestState.current = { kind: 'signed-out' };
      setSnapshot(current => ({ ...current, state: { kind: 'signed-out' } }));
      return true;
    },
    [run, setup],
  );

  const clearError = useCallback(() => {
    if (active.current === setup) {
      setSnapshot((current) => ({ ...current, error: null }));
    }
  }, [setup]);

  return {
    state,
    available: setup.backend !== null,
    appleAvailable: !!setup.backend?.signInWithApple && process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN === 'true',
    acceptAppleCredential: input => run('apple', backend => {
      if (!backend.signInWithApple) throw new BackendError('server', 'Apple sign-in unavailable');
      return backend.signInWithApple(input);
    }),
    pendingAction,
    error,
    requestCode,
    verifyCode,
    signOut,
    deleteAccount,
    clearError,
  };
}
