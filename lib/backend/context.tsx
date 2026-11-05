import type { PropsWithChildren } from 'react';
import { Fragment, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth, type UseAuthResult } from '@/hooks/use-auth';

import { onOntoDataErased } from '@/lib/storage';

import type { BackendModules, EventCatalogBackend, RsvpBackend } from './contracts';

type OntoBackendContextValue = {
  profileBackend: Pick<import('./contracts').ProfileBackend, 'getMyProfile' | 'updateMyProfile'> | null;
  auth: UseAuthResult;
  hostingBackend: import('@/lib/community').HostingBackend | null;
  reviewsBackend: import('@/lib/community').ReviewsBackend | null;
  reviewerBackend: import('@/lib/community').ReviewerBackend | null;
  publicReviewsBackend: import('@/lib/community').PublicReviewsBackend | null;
  catalogBackend: EventCatalogBackend | null;
  rsvpBackend: RsvpBackend | null;
  rsvpOwnerId: string | null;
};

const OntoBackendContext = createContext<OntoBackendContextValue | null>(null);

export function OntoBackendProvider({
  children,
  modules,
}: PropsWithChildren<{ modules: BackendModules }>) {
  const [storageEpoch, setStorageEpoch] = useState(0);
  useEffect(
    () => onOntoDataErased(() => setStorageEpoch((current) => current + 1)),
    [],
  );

  const auth = useAuth(modules.account?.auth ?? null, modules.account?.start);
  const ownerId = auth.state.kind === 'signed-in' ? auth.state.user.id : null;
  const account = modules.account;
  const privateBackends = useMemo(() => {
    if (!ownerId || !account) return null;
    try {
      return account.privateForAccount ? account.privateForAccount(ownerId) : account;
    } catch {
      // Optional private setup cannot disable discovery or account actions.
      return null;
    }
  }, [ownerId, account]);
  const community = useMemo(() => {
    if (!ownerId || !account) return null;
    // Keep simple injected account modules compatible; production supplies
    // owner-bound ports that remain stable across same-owner auth updates.
    try {
      return account.communityForAccount ? account.communityForAccount(ownerId) : account;
    } catch {
      // Optional community setup cannot disable discovery or account actions.
      return null;
    }
  }, [ownerId, account]);
  const value = useMemo<OntoBackendContextValue>(
    () => ({
      auth,
      profileBackend: privateBackends?.profile ?? null,
      hostingBackend: community?.hosting ?? null,
      reviewsBackend: community?.reviews ?? null,
      reviewerBackend: community?.reviewer ?? null,
      publicReviewsBackend: modules.publicReviews ?? null,
      catalogBackend: modules.catalog ?? null,
      rsvpBackend: privateBackends?.rsvp ?? null,
      rsvpOwnerId: ownerId,
    }),
    [auth, modules, community, privateBackends, ownerId],
  );

  return (
    <OntoBackendContext.Provider value={value}>
      <Fragment key={storageEpoch}>{children}</Fragment>
    </OntoBackendContext.Provider>
  );
}

export function useOntoBackend(): OntoBackendContextValue {
  const value = useContext(OntoBackendContext);
  if (!value) {
    throw new Error('useOntoBackend must be used inside OntoBackendProvider');
  }
  return value;
}

/** Presentation components may be used without optional backend capabilities. */
export function useOptionalOntoBackend(): OntoBackendContextValue | null { return useContext(OntoBackendContext); }
