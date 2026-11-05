import { createConfiguredModules } from '../configured-modules';
import { SupabaseOntoBackend } from '../supabase-backend';
import { createAccountTokenVerifier } from '../account-token-verifier';
import { getSupabaseClient, installSupabaseAuthRefresh, readSupabaseConfig } from '../supabase-client';

jest.mock('../supabase-backend', () => ({ SupabaseOntoBackend: jest.fn() }));
jest.mock('../account-token-verifier', () => ({ createAccountTokenVerifier: jest.fn() }));
jest.mock('../supabase-client', () => ({
  getSupabaseClient: jest.fn(),
  installSupabaseAuthRefresh: jest.fn(),
  readSupabaseConfig: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
  (createAccountTokenVerifier as jest.Mock).mockReturnValue(jest.fn());
});

it('leaves every module off without backend configuration', () => {
  (readSupabaseConfig as jest.Mock).mockReturnValue(null);
  expect(createConfiguredModules()).toEqual({});
  expect(getSupabaseClient).not.toHaveBeenCalled();
  expect(SupabaseOntoBackend).not.toHaveBeenCalled();
  expect(createAccountTokenVerifier).not.toHaveBeenCalled();
});

it.each(['config', 'client', 'adapter'])('contains %s initialization failure', (stage) => {
  (readSupabaseConfig as jest.Mock).mockReturnValue({});
  const operation = { config: readSupabaseConfig, client: getSupabaseClient, adapter: SupabaseOntoBackend }[stage];
  (operation as jest.Mock).mockImplementation(() => { throw new Error('unavailable'); });
  expect(createConfiguredModules()).toEqual({});
  expect(installSupabaseAuthRefresh).not.toHaveBeenCalled();
  expect(createAccountTokenVerifier).not.toHaveBeenCalled();
});

it('composes the same production transport with lazy, reversible account startup', () => {
  const client = {};
  const backend = {};
  const stop = jest.fn();
  (readSupabaseConfig as jest.Mock).mockReturnValue({});
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  (SupabaseOntoBackend as jest.Mock).mockImplementation(() => backend);
  (installSupabaseAuthRefresh as jest.Mock).mockReturnValue(stop);
  const modules = createConfiguredModules();
  expect(Object.keys(modules).sort()).toEqual(['account', 'catalog', 'publicReviews']);
  expect(Object.keys(modules.account!).sort()).toEqual(['auth', 'communityForAccount', 'privateForAccount', 'start']);
  expect(modules.catalog).toBe(backend);
  expect(modules.account?.auth).toBe(backend);
  expect(modules.account?.profile).toBeUndefined();
  expect(modules.account?.rsvp).toBeUndefined();
  expect(installSupabaseAuthRefresh).not.toHaveBeenCalled();
  modules.account?.start?.()();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(installSupabaseAuthRefresh).toHaveBeenCalledWith(client);
});

it('creates separate owner-bound community ports and keeps public reviews independent', () => {
  (readSupabaseConfig as jest.Mock).mockReturnValue({});
  (getSupabaseClient as jest.Mock).mockReturnValue({});
  (SupabaseOntoBackend as jest.Mock).mockImplementation(() => ({}));
  const modules = createConfiguredModules();
  const a = modules.account!.communityForAccount!('account-a');
  const b = modules.account!.communityForAccount!('account-b');
  expect(a.hosting).toBe(a.reviews);
  expect(a.reviewer).toBe(a.reviews);
  expect(b.hosting).toBe(b.reviews);
  expect(b.hosting).not.toBe(a.hosting);
  expect(modules.publicReviews).not.toBe(a.reviews);
  expect(modules.publicReviews).not.toBe(b.reviews);
  expect(modules.account!.hosting).toBeUndefined();
  expect(modules.account!.reviews).toBeUndefined();
  expect(modules.account!.reviewer).toBeUndefined();
  expect(createAccountTokenVerifier).toHaveBeenCalledTimes(1);
});

it('creates owner-bound profile and plan transports without exposing unbound private ports', () => {
  const client = {}, publicBackend = {}, a = {}, b = {};
  const verifier = jest.fn();
  (createAccountTokenVerifier as jest.Mock).mockReturnValue(verifier);
  (readSupabaseConfig as jest.Mock).mockReturnValue({});
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  (SupabaseOntoBackend as jest.Mock).mockImplementationOnce(() => publicBackend)
    .mockImplementationOnce(() => a).mockImplementationOnce(() => b);
  const modules = createConfiguredModules();
  const first = modules.account!.privateForAccount!('account-a');
  const second = modules.account!.privateForAccount!('account-b');
  expect(first.profile).toBe(a);
  expect(first.rsvp).toBe(a);
  expect(second.profile).toBe(b);
  expect(second.rsvp).toBe(b);
  expect(modules.account!.profile).toBeUndefined();
  expect(modules.account!.rsvp).toBeUndefined();
  expect(SupabaseOntoBackend).toHaveBeenNthCalledWith(2, client, undefined, 'account-a', verifier);
  expect(SupabaseOntoBackend).toHaveBeenNthCalledWith(3, client, undefined, 'account-b', verifier);
  expect(createAccountTokenVerifier).toHaveBeenCalledTimes(1);
  expect(modules.account!.auth).toBe(publicBackend);
  expect(modules.catalog).toBe(publicBackend);
});

it('defers verifier setup failure to the optional account factories without disabling public modules', () => {
  const backend = {};
  (readSupabaseConfig as jest.Mock).mockReturnValue({});
  (getSupabaseClient as jest.Mock).mockReturnValue({});
  (SupabaseOntoBackend as jest.Mock).mockImplementation(() => backend);
  (createAccountTokenVerifier as jest.Mock).mockImplementation(() => { throw new Error('verifier unavailable'); });
  const modules = createConfiguredModules();
  expect(modules.catalog).toBe(backend);
  expect(modules.account!.auth).toBe(backend);
  expect(modules.publicReviews).toBeDefined();
  expect(createAccountTokenVerifier).not.toHaveBeenCalled();
  expect(() => modules.account!.privateForAccount!('account-a')).toThrow('verifier unavailable');
  expect(() => modules.account!.communityForAccount!('account-a')).toThrow('verifier unavailable');
  expect(modules.catalog).toBe(backend);
  expect(modules.account!.auth).toBe(backend);
});
