import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  eraseAccountPlanData,
  eraseAllOntoData,
  getItem,
  goingForUser,
  joinedForUser,
  joinedPendingForUser,
  onOntoDataErased,
  setItem,
  STORAGE_KEYS,
  STORAGE_PREFIXES,
} from '../storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('storage choke point', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips static and account-scoped values', async () => {
    await setItem(STORAGE_KEYS.mode, 'family');
    await setItem(joinedForUser('user-1'), '["event-1"]');

    expect(await getItem(STORAGE_KEYS.mode)).toBe('family');
    expect(await getItem(joinedForUser('user-1'))).toBe('["event-1"]');
    expect(joinedForUser('user-2')).not.toBe(joinedForUser('user-1'));
  });

  it('swallows storage failures instead of throwing', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('private mode'));
    await expect(getItem(STORAGE_KEYS.interests)).resolves.toBeNull();

    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('quota'));
    await expect(setItem(STORAGE_KEYS.interests, '[]')).resolves.toBeUndefined();
  });

  it('erase-my-data wipes static and dynamic onto keys and notifies mounted hooks', async () => {
    const listener = jest.fn();
    const unsubscribe = onOntoDataErased(listener);
    await AsyncStorage.setItem(STORAGE_KEYS.mode, 'family');
    await AsyncStorage.setItem(joinedForUser('user-1'), '["event-1"]');
    await AsyncStorage.setItem(joinedPendingForUser('user-1'), '{"event-2":true}');
    await AsyncStorage.setItem(goingForUser('user-1'), '{"event-1":{}}');
    await AsyncStorage.setItem(STORAGE_KEYS.going, '{"guest-event":{}}');
    await AsyncStorage.setItem('another-app.key', 'keep');

    await eraseAllOntoData();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.mode)).toBeNull();
    expect(await AsyncStorage.getItem(joinedForUser('user-1'))).toBeNull();
    expect(await AsyncStorage.getItem(joinedPendingForUser('user-1'))).toBeNull();
    expect(await AsyncStorage.getItem(goingForUser('user-1'))).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.going)).toBeNull();
    expect(await AsyncStorage.getItem('another-app.key')).toBe('keep');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not erase SDK auth storage: the account flow must sign out separately', async () => {
    const sessionKey = 'sb-example-auth-token';
    await AsyncStorage.setItem(sessionKey, 'sdk-session-fixture');
    await eraseAllOntoData();
    expect(await AsyncStorage.getItem(sessionKey)).toBe('sdk-session-fixture');
  });

  it('the static manifest covers every fixed key the hooks use (no rogue keys)', () => {
    expect(Object.values(STORAGE_KEYS).sort()).toEqual([
      'onto.adultConfirmed.v1',
      'onto.affinities.v1',
      'onto.arrivalFeedback.v1',
      'onto.catalog.v1',
      'onto.feedRadius.v1',
      'onto.feedSort.v1',
      'onto.firstRunLocationSeen.v1',
      'onto.going.events.v1',
      'onto.installTip.dismissed.v1',
      'onto.installTip.seen.v1',
      'onto.interests.v1',
      'onto.joined.v1',
      'onto.locationChoice.v1',
      'onto.locationChoice.v2',
      'onto.mapsApp.v1',
      'onto.maybes.v1',
      'onto.mode.v1',
      'onto.passed.v1',
      'onto.passedFromMaybes.v1',
      'onto.ticketSellers.v1',
    ]);
  });

  it('every static key and dynamic prefix is namespaced under onto.', () => {
    for (const key of [...Object.values(STORAGE_KEYS), ...Object.values(STORAGE_PREFIXES)]) {
      expect(key.startsWith('onto.')).toBe(true);
    }
  });

  it('cannot restore deleted-owner plans through a delayed or stale write', async () => {
    const owner = 'deleted-owner-with-inflight-write';
    const key = joinedForUser(owner);
    const realSet = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    let finish!: () => void;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce((name: string, value: string) =>
      new Promise<void>(resolve => { finish = () => { Promise.resolve(realSet(name, value)).then(resolve); }; }));
    const write = setItem(key, '["late-plan"]');
    await AsyncStorage.multiSet([
      [joinedPendingForUser(owner), '{"old-plan":true}'],
      [goingForUser(owner), '{"old-plan":{}}'],
      [joinedForUser('other-owner'), '["keep-plan"]'],
      [STORAGE_KEYS.joined, '["guest-plan"]'],
    ]);
    const erase = eraseAccountPlanData(owner);
    // Allow an unguarded removal to finish before the delayed write arrives.
    await Promise.resolve();
    await Promise.resolve();
    finish();
    await Promise.all([write, erase]);
    expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await AsyncStorage.getItem(joinedPendingForUser(owner))).toBeNull();
    await setItem(key, '["stale-plan"]');
    await setItem(joinedPendingForUser(owner), '{"stale-plan":true}');
    await setItem(goingForUser(owner), '{"stale-plan":{}}');
    expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await AsyncStorage.getItem(joinedPendingForUser(owner))).toBeNull();
    expect(await AsyncStorage.getItem(goingForUser(owner))).toBeNull();
    expect(await AsyncStorage.getItem(joinedForUser('other-owner'))).toBe('["keep-plan"]');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.joined)).toBe('["guest-plan"]');
  });
});
