import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { SEED_ACTIVITIES as activities } from '@/data/activities';
import { useEventCatalog } from '@/hooks/use-event-catalog';
import { useJoined } from '@/hooks/use-joined';
import { eraseAllOntoData } from '@/lib/storage';

import { OntoBackendProvider, useOntoBackend } from '../context';
import type { AccountCommunityBackends, AuthState, BackendModules, EventCatalogBackend, RsvpBackend } from '../contracts';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const signedIn: AuthState = {
  kind: 'signed-in',
  user: { id: 'test-user', email: null, createdAt: '2026-09-01T00:00:00Z' },
  session: { userId: 'test-user', accessToken: 'test-token', expiresAt: null },
};

function account() {
  return {
    auth: {
      getState: jest.fn().mockResolvedValue(signedIn),
      onStateChange: jest.fn((_listener: (state: AuthState) => void) => jest.fn()),
      signInWithEmail: jest.fn().mockResolvedValue(undefined),
      verifyEmailOtp: jest.fn().mockResolvedValue(undefined),
      signOut: jest.fn().mockResolvedValue(undefined),
      deleteAccount: jest.fn().mockResolvedValue(undefined),
    },
    start: jest.fn(() => jest.fn()),
  };
}

function communityPorts(): AccountCommunityBackends {
  const port = {
    getPilotState: jest.fn(), listVenues: jest.fn(), listMyHosted: jest.fn(),
    saveHosted: jest.fn(), cancelHosted: jest.fn(), listPublicReviews: jest.fn(),
    listMyReviews: jest.fn(), saveReview: jest.fn(), deleteReview: jest.fn(), reportContent: jest.fn(),
    listPendingHosts: jest.fn(), listPendingReviews: jest.fn(), listReports: jest.fn(),
    resolveReport: jest.fn(), moderate: jest.fn(),
  };
  return { hosting: port, reviews: port, reviewer: port };
}

function catalog(): EventCatalogBackend {
  return {
    listEvents: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getEvent: jest.fn().mockResolvedValue(null),
    getCatalogFreshness: jest.fn().mockResolvedValue(null),
  };
}

function rsvp(): RsvpBackend {
  return {
    listMyRsvps: jest.fn().mockResolvedValue([]),
    listMyRsvpHistory: jest.fn().mockResolvedValue([]),
    setRsvp: jest.fn().mockResolvedValue(undefined),
    removeRsvp: jest.fn().mockResolvedValue(undefined),
  };
}

function useDiscovery() {
  const services = useOntoBackend();
  return {
    ...services,
    feed: useEventCatalog(services.catalogBackend, activities),
    plans: useJoined(services.rsvpBackend, services.rsvpOwnerId),
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('runs bundled discovery and local plans with every backend module detached', async () => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{}}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(result.current.plans.loaded).toBe(true));
  expect(result.current.auth.available).toBe(false);
  expect(result.current.feed.activities).toEqual(activities);
  expect(result.current.feed.source).toBe('bundled');
  act(() => result.current.plans.toggleJoin(activities[0].id));
  expect(result.current.plans.joinedIds.has(activities[0].id)).toBe(true);
  await act(async () => { await eraseAllOntoData(); });
  await waitFor(() => expect(result.current.plans.loaded).toBe(true));
  expect(result.current.plans.joinedIds.size).toBe(0);
});

it('runs a catalog alone without any account implementation', async () => {
  const remote = catalog();
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{ catalog: remote }}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(remote.listEvents).toHaveBeenCalled());
  expect(result.current.auth.available).toBe(false);
  expect(result.current.rsvpBackend).toBeNull();
  expect(result.current.feed.activities).toEqual(activities);
});

it('keeps account actions available when the independent catalog fails', async () => {
  const remote = catalog();
  (remote.listEvents as jest.Mock).mockRejectedValue(new Error('catalog offline'));
  const accounts = account();
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{ catalog: remote, account: accounts }}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(result.current.feed.error?.message).toBe('catalog offline'));
  await act(async () => {
    expect(await result.current.auth.requestCode('person@example.com')).toBe(true);
  });
  expect(accounts.auth.signInWithEmail).toHaveBeenCalledWith('person@example.com');
  expect(result.current.feed.activities).toEqual(activities);
  expect(result.current.rsvpBackend).toBeNull();
});

it('contains account startup failure without disabling catalog discovery', async () => {
  const remote = catalog();
  const accounts = account();
  accounts.start.mockImplementation(() => { throw new Error('account offline'); });
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{ catalog: remote, account: accounts }}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(remote.listEvents).toHaveBeenCalled());
  expect(result.current.auth.error?.message).toBe('Something went wrong');
  expect(result.current.auth.state.kind).toBe('signed-out');
  expect(result.current.rsvpBackend).toBeNull();
  expect(result.current.feed.activities).toEqual(activities);
});

it('attaches and removes account/RSVP capabilities without restarting the catalog', async () => {
  const remote = catalog();
  const accounts = { ...account(), rsvp: rsvp() };
  let modules: BackendModules = { catalog: remote };
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>
  );
  const { result, rerender } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(result.current.feed.loading).toBe(false));
  modules = { catalog: remote, account: accounts };
  rerender(undefined);
  await waitFor(() => expect(result.current.rsvpBackend).toBe(accounts.rsvp));
  expect(result.current.rsvpOwnerId).toBe('test-user');
  const unsubscribe = accounts.auth.onStateChange.mock.results[0].value;
  const stop = accounts.start.mock.results[0].value;
  modules = { catalog: remote };
  rerender(undefined);
  await waitFor(() => expect(result.current.plans.loaded).toBe(true));
  expect(result.current.auth.available).toBe(false);
  expect(result.current.rsvpBackend).toBeNull();
  expect(result.current.rsvpOwnerId).toBeNull();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(remote.listEvents).toHaveBeenCalledTimes(1);
});

it('detaches the catalog without restarting accounts and cleans up on unmount', async () => {
  const accounts = account();
  let modules: BackendModules = { catalog: catalog(), account: accounts };
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>
  );
  const { result, rerender, unmount } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(result.current.auth.state.kind).toBe('signed-in'));
  modules = { account: accounts };
  rerender(undefined);
  await waitFor(() => expect(result.current.feed.loading).toBe(false));
  expect(result.current.catalogBackend).toBeNull();
  expect(result.current.auth.state.kind).toBe('signed-in');
  expect(accounts.start).toHaveBeenCalledTimes(1);
  const stop = accounts.start.mock.results[0].value;
  unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('keeps community ports stable for the same owner, replaces them on account switch and hides them on detach', async () => {
  const a = communityPorts(), b = communityPorts();
  const communityForAccount = jest.fn((id: string) => id === 'test-user' ? a : b);
  const accounts = { ...account(), communityForAccount };
  const publicReviews = { listPublicReviews: jest.fn().mockResolvedValue([]) };
  const remote = catalog();
  let modules: BackendModules = { account: accounts, catalog: remote, publicReviews };
  const wrapper = ({ children }: PropsWithChildren) => <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>;
  const { result, rerender } = renderHook(useOntoBackend, { wrapper });
  expect(result.current.hostingBackend).toBeNull();
  await waitFor(() => expect(result.current.hostingBackend).toBe(a.hosting));
  const publishState = accounts.auth.onStateChange.mock.calls[0][0];
  act(() => publishState({ ...signedIn, session: { userId: 'test-user', accessToken: 'refreshed', expiresAt: null } }));
  expect(result.current.hostingBackend).toBe(a.hosting);
  expect(communityForAccount).toHaveBeenCalledTimes(1);
  act(() => publishState({ kind: 'signed-in', user: { id: 'second-user', email: null, createdAt: '2026-09-01T00:00:00Z' },
    session: { userId: 'second-user', accessToken: 'second-token', expiresAt: null } }));
  expect(result.current.hostingBackend).toBe(b.hosting);
  expect(result.current.reviewsBackend).toBe(b.reviews);
  expect(result.current.reviewerBackend).toBe(b.reviewer);
  expect(communityForAccount.mock.calls.map(([id]) => id)).toEqual(['test-user', 'second-user']);
  modules = { catalog: remote, publicReviews };
  rerender(undefined);
  expect(result.current.hostingBackend).toBeNull();
  expect(result.current.reviewsBackend).toBeNull();
  expect(result.current.reviewerBackend).toBeNull();
  expect(result.current.publicReviewsBackend).toBe(publicReviews);
  expect(result.current.catalogBackend).toBe(remote);
});

it('hides old community ports immediately when the account module changes while the new module loads', async () => {
  const a = communityPorts(), replacement = communityPorts();
  const first = { ...account(), communityForAccount: jest.fn(() => a) };
  const second = { ...account(), communityForAccount: jest.fn(() => replacement) };
  let resolveState!: (state: AuthState) => void;
  second.auth.getState.mockReturnValue(new Promise((resolve) => { resolveState = resolve; }));
  let modules: BackendModules = { account: first };
  const wrapper = ({ children }: PropsWithChildren) => <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>;
  const { result, rerender } = renderHook(useOntoBackend, { wrapper });
  await waitFor(() => expect(result.current.hostingBackend).toBe(a.hosting));
  modules = { account: second };
  rerender(undefined);
  expect(result.current.auth.state.kind).toBe('loading');
  expect(result.current.hostingBackend).toBeNull();
  expect(second.communityForAccount).not.toHaveBeenCalled();
  await act(async () => { resolveState(signedIn); });
  expect(result.current.hostingBackend).toBe(replacement.hosting);
  expect(second.communityForAccount).toHaveBeenCalledWith('test-user');
});

it('contains a failing community factory while preserving independent discovery and account actions', async () => {
  const accounts = { ...account(), communityForAccount: jest.fn(() => { throw new Error('community unavailable'); }) };
  const publicReviews = { listPublicReviews: jest.fn().mockResolvedValue([]) };
  const remote = catalog();
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{ account: accounts, catalog: remote, publicReviews }}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useOntoBackend, { wrapper });
  await waitFor(() => expect(result.current.auth.state.kind).toBe('signed-in'));
  expect(result.current.hostingBackend).toBeNull();
  expect(result.current.reviewsBackend).toBeNull();
  expect(result.current.reviewerBackend).toBeNull();
  expect(result.current.catalogBackend).toBe(remote);
  expect(result.current.publicReviewsBackend).toBe(publicReviews);
  await act(async () => { expect(await result.current.auth.requestCode('person@example.com')).toBe(true); });
  expect(accounts.auth.signInWithEmail).toHaveBeenCalledWith('person@example.com');
});

it('retains simple injected community ports only while that module is signed in', async () => {
  const ports = communityPorts();
  const accounts = { ...account(), ...ports };
  const wrapper = ({ children }: PropsWithChildren) => <OntoBackendProvider modules={{ account: accounts }}>{children}</OntoBackendProvider>;
  const { result } = renderHook(useOntoBackend, { wrapper });
  await waitFor(() => expect(result.current.reviewsBackend).toBe(ports.reviews));
  act(() => accounts.auth.onStateChange.mock.calls[0][0]({ kind: 'signed-out' }));
  expect(result.current.hostingBackend).toBeNull();
  expect(result.current.reviewsBackend).toBeNull();
  expect(result.current.reviewerBackend).toBeNull();
});

it('keeps private profile/plan ports with their owner across refreshes, account switches and detach', async () => {
  const first = { profile: { getMyProfile: jest.fn(), updateMyProfile: jest.fn() }, rsvp: rsvp() };
  const second = { profile: { getMyProfile: jest.fn(), updateMyProfile: jest.fn() }, rsvp: rsvp() };
  const privateForAccount = jest.fn((id: string) => id === 'test-user' ? first : second);
  const accounts = { ...account(), privateForAccount };
  const remote = catalog();
  let modules: BackendModules = { account: accounts, catalog: remote };
  const wrapper = ({ children }: PropsWithChildren) => <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>;
  const { result, rerender } = renderHook(useOntoBackend, { wrapper });
  expect(result.current.profileBackend).toBeNull();
  expect(result.current.rsvpBackend).toBeNull();
  await waitFor(() => expect(result.current.rsvpBackend).toBe(first.rsvp));
  const publishState = accounts.auth.onStateChange.mock.calls[0][0];
  act(() => publishState({ ...signedIn, session: { userId: 'test-user', accessToken: 'refreshed', expiresAt: null } }));
  expect(result.current.profileBackend).toBe(first.profile);
  expect(privateForAccount).toHaveBeenCalledTimes(1);
  act(() => publishState({ kind: 'signed-in', user: { id: 'second-user', email: null, createdAt: '2026-09-01T00:00:00Z' },
    session: { userId: 'second-user', accessToken: 'second-token', expiresAt: null } }));
  expect(result.current.profileBackend).toBe(second.profile);
  expect(result.current.rsvpBackend).toBe(second.rsvp);
  expect(result.current.rsvpOwnerId).toBe('second-user');
  expect(privateForAccount.mock.calls.map(([id]) => id)).toEqual(['test-user', 'second-user']);
  modules = { catalog: remote };
  rerender(undefined);
  expect(result.current.profileBackend).toBeNull();
  expect(result.current.rsvpBackend).toBeNull();
  expect(result.current.rsvpOwnerId).toBeNull();
  expect(result.current.catalogBackend).toBe(remote);
});

it('hides private ports from the previous module while its replacement loads', async () => {
  const owned = { profile: { getMyProfile: jest.fn(), updateMyProfile: jest.fn() }, rsvp: rsvp() };
  const first = { ...account(), privateForAccount: jest.fn(() => owned) };
  const second = { ...account(), privateForAccount: jest.fn(() => owned) };
  let resolveState!: (state: AuthState) => void;
  second.auth.getState.mockReturnValue(new Promise((resolve) => { resolveState = resolve; }));
  let modules: BackendModules = { account: first };
  const wrapper = ({ children }: PropsWithChildren) => <OntoBackendProvider modules={modules}>{children}</OntoBackendProvider>;
  const { result, rerender } = renderHook(useOntoBackend, { wrapper });
  await waitFor(() => expect(result.current.profileBackend).toBe(owned.profile));
  modules = { account: second };
  rerender(undefined);
  expect(result.current.auth.state.kind).toBe('loading');
  expect(result.current.profileBackend).toBeNull();
  expect(result.current.rsvpBackend).toBeNull();
  expect(second.privateForAccount).not.toHaveBeenCalled();
  await act(async () => { resolveState(signedIn); });
  expect(result.current.profileBackend).toBe(owned.profile);
  expect(second.privateForAccount).toHaveBeenCalledWith('test-user');
});

it('contains private factory failure without losing local plans, community, discovery or auth actions', async () => {
  const community = communityPorts();
  const accounts = { ...account(), privateForAccount: jest.fn(() => { throw new Error('private unavailable'); }),
    communityForAccount: jest.fn(() => community) };
  const remote = catalog();
  const wrapper = ({ children }: PropsWithChildren) => (
    <OntoBackendProvider modules={{ account: accounts, catalog: remote }}>{children}</OntoBackendProvider>
  );
  const { result } = renderHook(useDiscovery, { wrapper });
  await waitFor(() => expect(result.current.auth.state.kind).toBe('signed-in'));
  await waitFor(() => expect(result.current.plans.loaded).toBe(true));
  expect(result.current.profileBackend).toBeNull();
  expect(result.current.rsvpBackend).toBeNull();
  expect(result.current.rsvpOwnerId).toBe('test-user');
  expect(result.current.hostingBackend).toBe(community.hosting);
  expect(result.current.catalogBackend).toBe(remote);
  act(() => result.current.plans.toggleJoin(activities[0].id));
  expect(result.current.plans.joinedIds.has(activities[0].id)).toBe(true);
  await act(async () => { expect(await result.current.auth.requestCode('person@example.com')).toBe(true); });
});
