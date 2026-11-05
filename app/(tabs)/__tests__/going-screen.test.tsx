import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AppState, View, type AppStateStatus } from 'react-native';
import type { Activity } from '@/data/activities';
import { GoingProvider } from '@/hooks/use-going';
import { SelectedLocationProvider } from '@/hooks/use-selected-location';
import { eraseAllOntoData, goingForUser, joinedPendingForUser, STORAGE_KEYS } from '@/lib/storage';
import { saveToCalendar } from '@/lib/calendar-share';
import type { TierMode } from '@/lib/tiers';
import FeedScreen from '../index';
import GoingScreen from '../going';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockNow = Date.parse('2026-10-28T12:00:00Z');
let mockMode: TierMode = 'everyone';
let mockOwner: string | null = null;
let mockBackend: any = null;
let mockCatalog: any = null;
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => ({
  catalogBackend: mockCatalog, rsvpBackend: mockBackend, rsvpOwnerId: mockOwner,
}) }));
jest.mock('@/hooks/use-now', () => ({ useNow: () => mockNow }));
jest.mock('@/hooks/use-tier-mode', () => ({ useTierMode: () => ({ mode: mockMode }) }));
jest.mock('@/hooks/use-user-location', () => ({ useUserLocation: () => ({
  lat: 40.7608, lng: -111.891, source: 'gps', loading: false, fallbackReason: null, refresh: jest.fn(),
}) }));
jest.mock('@/lib/calendar-share', () => ({ ...jest.requireActual('@/lib/calendar-share'), saveToCalendar: jest.fn().mockResolvedValue('handed-off') }));
const event: Activity = { id: 'going-test', title: 'Plaza concert', category: 'music', venue: 'Gallivan Center',
  area: 'Downtown', lat: 40.76, lng: -111.89, whenLabel: '', startsInMinutes: 120,
  startsAtIso: '2026-10-28T14:00:00Z', endsAtIso: '2026-10-28T15:00:00Z', description: 'Community music.',
  rating: 'general', source: 'live', attendees: 0 };
let mockActivities: Activity[] = [event];
jest.mock('@/data/bundled-activities', () => ({ BUNDLED_ACTIVITIES: [] }));
jest.mock('@/hooks/use-event-catalog', () => ({ useEventCatalog: () => ({ activities: mockActivities,
  source: 'bundled', updatedAt: null, error: null, loading: false, refresh: jest.fn() }) }));
function Both() { return <GoingProvider><SelectedLocationProvider>
  <View testID="discover"><FeedScreen /></View><View testID="going"><GoingScreen /></View>
</SelectedLocationProvider></GoingProvider>; }

beforeEach(async () => {
  jest.clearAllMocks();
  mockNow = Date.parse('2026-10-28T12:00:00Z'); mockMode = 'everyone';
  mockOwner = null; mockBackend = null; mockCatalog = null; mockActivities = [event];
  await AsyncStorage.clear();
  await AsyncStorage.setItem(STORAGE_KEYS.firstRunLocationSeen, '1');
});

it('moves a marked card to Going; window, search, interests and distance never hide it there', async () => {
  render(<Both />);
  const discover = within(screen.getByTestId('discover')), going = within(screen.getByTestId('going'));
  await discover.findByText(event.title);
  fireEvent.press(discover.getByLabelText(`Save to calendar: ${event.title}`));
  await waitFor(() => expect(saveToCalendar).toHaveBeenCalled());
  expect(going.queryByText(event.title)).toBeNull();
  fireEvent.press(discover.getByLabelText(`Going: ${event.title}`));
  await going.findByText(event.title);
  expect(discover.queryByText(event.title)).toBeNull();
  fireEvent.press(discover.getByTestId('dash-toggle'));
  fireEvent.press(discover.getByText('Pick dates'));
  fireEvent.changeText(discover.getByLabelText('Start date (YYYY-MM-DD)'), '2026-11-01');
  fireEvent.press(discover.getByText('Apply dates'));
  await discover.findByText('No matches for these filters.');
  fireEvent.changeText(discover.getByLabelText('Search events'), 'not this concert');
  fireEvent.press(discover.getByLabelText('arts'));
  fireEvent.press(discover.getByLabelText('1 mile'));
  expect(going.getByText(event.title)).toBeTruthy();
  fireEvent.press(going.getByLabelText(`Save to calendar: ${event.title}`));
  await going.findByText('Calendar file handed to your device. Choose your calendar to finish.');
  fireEvent.press(going.getByLabelText(`Unmark Going: ${event.title}`));
  await waitFor(() => expect(going.queryByText(event.title)).toBeNull());
});

it('keeps a guest plan after expiry and catalog withdrawal, including unmarking past history and reopening', async () => {
  const view = render(<Both />);
  await screen.findByLabelText(`Going: ${event.title}`);
  fireEvent.press(screen.getByLabelText(`Going: ${event.title}`));
  await within(screen.getByTestId('going')).findByText(event.title);
  mockNow = Date.parse('2026-10-29T12:00:00Z'); mockActivities = [];
  view.rerender(<Both />);
  const going = within(screen.getByTestId('going'));
  await going.findByText('History');
  fireEvent.press(going.getByLabelText(`Unmark Going: ${event.title}`));
  expect(going.getByText(event.title)).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.going))!)[event.id].unmarkedAt).toBe(mockNow));
  view.unmount();
  render(<GoingScreen />);
  await screen.findByText(event.title);
  expect(screen.getByText('History')).toBeTruthy();
});

it('keeps a withdrawn saved listing’s duplicate out of Discover after reopening, until unmarked', async () => {
  const view = render(<Both />);
  await screen.findByLabelText(`Going: ${event.title}`);
  fireEvent.press(screen.getByLabelText(`Going: ${event.title}`));
  await within(screen.getByTestId('going')).findByText(event.title);
  await waitFor(async () => expect(await AsyncStorage.getItem(STORAGE_KEYS.going)).toContain(event.id));
  view.unmount();
  // Only the other publisher's listing remains; persisted snapshots lack coordinates.
  mockActivities = [{ ...event, id: 'other-publisher' }];
  render(<Both />);
  const discover = within(screen.getByTestId('discover')), going = within(screen.getByTestId('going'));
  await going.findByText(event.title);
  expect(discover.queryByText(event.title)).toBeNull();
  expect(discover.getByText('No matches for these filters.')).toBeTruthy();
  fireEvent.press(going.getByLabelText(`Unmark Going: ${event.title}`));
  await discover.findByText(event.title);
});

function accountBackend() {
  const server = new Map<string, any>();
  const backend = {
    listMyRsvps: jest.fn(async () => [...server.values()]),
    listMyRsvpHistory: jest.fn(async () => [...server.values()].map(r=>({ eventId:r.eventId, status:r.status,
      title:event.title, venueName:event.venue, startsAt:event.startsAtIso, endsAt:event.endsAtIso,
      sourceUrl:null, rsvpUpdatedAt:r.updatedAt }))),
    setRsvp: jest.fn(async (input: any) => { const r = { ...input, userId:'a', shareWithConnections:false,
      createdAt:new Date(mockNow).toISOString(), updatedAt:new Date(mockNow).toISOString() }; server.set(input.eventId,r); return r; }),
    removeRsvp: jest.fn(async (id:string) => { const r=server.get(id); if(r) server.set(id,{...r,status:'cancelled',updatedAt:new Date(mockNow).toISOString()}); }),
  };
  const catalog = { getEvent: jest.fn(async (id:string) => ({ id, title:event.title, venueName:event.venue,
    startsAt:event.startsAtIso, endsAt:event.endsAtIso, rating:'general', timezone:'UTC', isCancelled:false })), listEvents:jest.fn() };
  return { server, backend, catalog };
}

it('does not carry saved-snapshot suppression into another account', async () => {
  const first = accountBackend(), second = accountBackend();
  mockOwner = 'a'; mockBackend = first.backend;
  const view = render(<Both />);
  await screen.findByLabelText(`Going: ${event.title}`);
  fireEvent.press(screen.getByLabelText(`Going: ${event.title}`));
  await within(screen.getByTestId('going')).findByText(event.title);
  await waitFor(() => expect(first.backend.setRsvp).toHaveBeenCalled());
  mockActivities = [{ ...event, id: 'remaining-copy' }];
  view.rerender(<Both />);
  await waitFor(() => expect(within(screen.getByTestId('discover')).queryByText(event.title)).toBeNull());
  mockOwner = 'b'; mockBackend = second.backend;
  view.rerender(<Both />);
  await within(screen.getByTestId('discover')).findByText(event.title);
  expect(within(screen.getByTestId('going')).queryByText(event.title)).toBeNull();
});

it('claims guest plans on sign-in and reconstructs upcoming and past history on another device', async () => {
  const remote = accountBackend();
  const view = render(<Both />);
  await screen.findByLabelText(`Going: ${event.title}`);
  fireEvent.press(screen.getByLabelText(`Going: ${event.title}`));
  await within(screen.getByTestId('going')).findByText(event.title);
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  view.rerender(<Both />);
  await waitFor(()=>expect(remote.backend.setRsvp).toHaveBeenCalledWith({eventId:event.id,status:'going'}));
  await waitFor(async()=>expect(await AsyncStorage.getItem(goingForUser('a'))).toContain(event.title));
  view.unmount(); await AsyncStorage.clear();
  const second = render(<GoingScreen />);
  await screen.findByText(event.title);
  expect(remote.catalog.listEvents).not.toHaveBeenCalled();
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  second.rerender(<GoingScreen />);
  await screen.findByText('History');
  fireEvent.press(screen.getByLabelText(`Unmark Going: ${event.title}`));
  await waitFor(()=>expect(remote.backend.removeRsvp).toHaveBeenCalledWith(event.id));
  second.unmount(); await AsyncStorage.clear();
  render(<GoingScreen />);
  await screen.findByText(event.title);
  expect(screen.getByText('History')).toBeTruthy();
});

it('ignores old-account history responses after account switch and sign-out', async () => {
  let finish!: (rows: any[]) => void;
  const old = accountBackend(), next = accountBackend();
  old.backend.listMyRsvpHistory.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  mockOwner='a'; mockBackend=old.backend; mockCatalog=old.catalog;
  const view=render(<GoingScreen />);
  await waitFor(()=>expect(old.backend.listMyRsvpHistory).toHaveBeenCalled());
  mockOwner='b'; mockBackend=next.backend; mockCatalog=next.catalog;
  view.rerender(<GoingScreen />);
  await act(async()=>finish([{ eventId:event.id,status:'going', title:'Old private choice',startsAt:event.startsAtIso,endsAt:event.endsAtIso,rsvpUpdatedAt:new Date(mockNow).toISOString() }]));
  expect(screen.queryByText('Old private choice')).toBeNull();
  expect((await AsyncStorage.getItem(goingForUser('b'))) ?? '').not.toContain(event.id);
  mockOwner=null; mockBackend=null; mockCatalog=null; view.rerender(<GoingScreen />);
  await screen.findByText('No upcoming plans in this mode.');
  expect(screen.queryByText(event.title)).toBeNull();
});

it('syncs a guest past plan after its Going mark was removed, retrying a failed history import', async () => {
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  await AsyncStorage.setItem(STORAGE_KEYS.going, JSON.stringify({ [event.id]: {
    event, savedAt: Date.parse('2026-10-28T12:00:00Z'), unmarkedAt: mockNow,
  } }));
  const remote=accountBackend();
  remote.backend.setRsvp.mockRejectedValueOnce(new Error('offline'));
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  const view=render(<GoingScreen />);
  await screen.findByText(event.title);
  await waitFor(()=>expect(remote.backend.setRsvp).toHaveBeenCalledWith({ eventId:event.id,status:'cancelled' }));
  await waitFor(async()=>expect(await AsyncStorage.getItem(goingForUser('a'))).toContain('"needsHistorySync":true'));
  view.unmount();
  const retry=render(<GoingScreen />);
  await waitFor(()=>expect(remote.server.get(event.id)?.status).toBe('cancelled'));
  await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!)[event.id].needsHistorySync).not.toBe(true));
  retry.unmount(); await AsyncStorage.clear();
  render(<GoingScreen />);
  await screen.findByText(event.title); expect(screen.getByText('History')).toBeTruthy();
});

it('erases a mounted guest Going list and does not restore it when reopened', async () => {
  const view=render(<Both />);
  await screen.findByLabelText(`Going: ${event.title}`);
  fireEvent.press(screen.getByLabelText(`Going: ${event.title}`));
  await within(screen.getByTestId('going')).findByText(event.title);
  await act(async()=>{ await eraseAllOntoData(); });
  await waitFor(()=>expect(within(screen.getByTestId('going')).queryByText(event.title)).toBeNull());
  view.unmount(); render(<GoingScreen />);
  await screen.findByText('No upcoming plans in this mode.');
  expect(screen.queryByText(event.title)).toBeNull();
});

it('recovers legacy guest IDs from the public event reader without an account or active catalog', async () => {
  mockActivities=[]; mockNow=Date.parse('2026-10-29T12:00:00Z');
  mockCatalog=accountBackend().catalog;
  await AsyncStorage.setItem(STORAGE_KEYS.joined, JSON.stringify([event.id]));
  render(<GoingScreen />);
  await screen.findByText(event.title); expect(screen.getByText('History')).toBeTruthy();
  expect(mockCatalog.getEvent).toHaveBeenCalledWith(event.id);
  expect(mockCatalog.listEvents).not.toHaveBeenCalled();
});

it('refreshes guest history from the received catalog without losing local metadata or lowering its rating', async () => {
  mockNow = Date.parse('2026-10-29T12:00:00Z');
  const metadata = { savedAt: Date.parse('2026-10-28T12:00:00Z'), unmarkedAt: Date.parse('2026-10-29T10:00:00Z') };
  await AsyncStorage.setItem(STORAGE_KEYS.going, JSON.stringify({ [event.id]: { event, ...metadata } }));
  const view = render(<Both />), going = within(screen.getByTestId('going'));
  await going.findByText(event.title);
  const updated: Activity = { ...event, title: 'Renamed publisher concert', venue: 'New publisher venue',
    startsAtIso: '2026-10-28T16:00:00Z', endsAtIso: '2026-10-28T17:00:00Z', rating: 'family', isCancelled: true };
  mockActivities = [updated]; view.rerender(<Both />);

  await going.findByText('Renamed publisher concert');
  expect(going.queryByText(event.title)).toBeNull();
  expect(going.getByText(/New publisher venue/)).toBeTruthy();
  expect(going.getByText('Cancelled by the source.')).toBeTruthy();
  expect(going.getByText('History')).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.going))!)[event.id]).toMatchObject({
    ...metadata, event: { title: 'Renamed publisher concert', venue: 'New publisher venue',
      startsAtIso: '2026-10-28T16:00:00Z', endsAtIso: '2026-10-28T17:00:00Z', rating: 'general', isCancelled: true },
  }));
});

it('refreshes an already-rated guest plan through the public reader when Going opens without Discover', async () => {
  const metadata = { savedAt: mockNow - 1000 };
  await AsyncStorage.setItem(STORAGE_KEYS.going, JSON.stringify({ [event.id]: { event, ...metadata } }));
  await AsyncStorage.setItem(STORAGE_KEYS.joined, JSON.stringify([event.id]));
  const remote = accountBackend();
  remote.catalog.getEvent.mockResolvedValue({ ...(await remote.catalog.getEvent(event.id)),
    title: 'Rescheduled publisher concert', venueName: 'Replacement venue',
    startsAt: '2026-10-30T14:00:00Z', endsAt: '2026-10-30T16:00:00Z', rating: 'family', isCancelled: true });
  mockCatalog = remote.catalog;
  render(<GoingScreen />);

  await screen.findByText('Rescheduled publisher concert');
  expect(screen.getByText(/Replacement venue/)).toBeTruthy();
  expect(screen.getByText('Cancelled by the source.')).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.going))!)[event.id]).toMatchObject({
    ...metadata, event: { title: 'Rescheduled publisher concert', venue: 'Replacement venue',
      startsAtIso: '2026-10-30T14:00:00Z', endsAtIso: '2026-10-30T16:00:00Z', rating: 'general', isCancelled: true },
  }));
});

it('never lowers a saved restrictive rating when a single source refresh calls the listing Family', async () => {
  const remote=accountBackend();
  remote.catalog.getEvent.mockResolvedValue({ ...(await remote.catalog.getEvent(event.id)), rating:'family' });
  await remote.backend.setRsvp({eventId:event.id,status:'going'});
  await AsyncStorage.setItem(goingForUser('a'),JSON.stringify({ [event.id]:{event,savedAt:mockNow} }));
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  const view=render(<GoingScreen />);
  await screen.findByText(event.title);
  await waitFor(()=>expect(remote.catalog.getEvent).toHaveBeenCalled());
  await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!) [event.id].event.rating).toBe('general'));
  mockMode='family'; view.rerender(<GoingScreen />);
  expect(screen.queryByText(event.title)).toBeNull();
});

it('keeps the original offline unmark time when its cancelled RSVP arrives after the event ends', async () => {
  const remote=accountBackend(), unmarkedAt=mockNow;
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  await remote.backend.setRsvp({eventId:event.id,status:'cancelled'});
  await AsyncStorage.setItem(goingForUser('a'),JSON.stringify({ [event.id]:{event,savedAt:unmarkedAt-1000,unmarkedAt,unmarkPending:true} }));
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  render(<GoingScreen />);
  await waitFor(()=>expect(remote.catalog.getEvent).toHaveBeenCalled());
  await screen.findByText('No past plans in this mode.');
  await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!) [event.id].unmarkedAt).toBe(unmarkedAt));
  expect(screen.queryByText(event.title)).toBeNull();
});

it('accepts a newer remote cancellation after another device re-added and retained a past plan', async () => {
  const remote=accountBackend(), unmarkedAt=mockNow;
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  await remote.backend.setRsvp({eventId:event.id,status:'cancelled'});
  await AsyncStorage.setItem(goingForUser('a'),JSON.stringify({ [event.id]:{
    event,savedAt:unmarkedAt-1000,unmarkedAt,cancelledRevision:new Date(unmarkedAt).toISOString(),
  } }));
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  render(<GoingScreen />);
  await screen.findByText(event.title); expect(screen.getByText('History')).toBeTruthy();
  await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!)[event.id].unmarkedAt).toBe(mockNow));
});

it('applies stricter duplicate ratings received by Discover to existing Going snapshots', async () => {
  const family = { ...event, rating:'family' as const };
  await AsyncStorage.setItem(STORAGE_KEYS.going,JSON.stringify({ [event.id]:{event:family,savedAt:mockNow} }));
  await AsyncStorage.setItem(STORAGE_KEYS.joined,JSON.stringify([event.id]));
  mockMode='family'; mockActivities=[family];
  const view=render(<Both />), going=within(screen.getByTestId('going'));
  await going.findByText(event.title);
  mockActivities=[family,{...event,id:'other-source-copy'}]; view.rerender(<Both />);
  await waitFor(()=>expect(going.queryByText(event.title)).toBeNull());
  await waitFor(async()=>expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.going))!)[event.id].event.rating).toBe('general'));
});

it('does not cancel an existing cloud Going choice when importing unmarked guest history', async () => {
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  const remote=accountBackend();
  await remote.backend.setRsvp({eventId:event.id,status:'going'}); remote.backend.setRsvp.mockClear();
  await AsyncStorage.setItem(STORAGE_KEYS.going,JSON.stringify({ [event.id]:{event,savedAt:mockNow-86400000,unmarkedAt:mockNow} }));
  mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
  render(<GoingScreen />);
  await screen.findByText(event.title);
  await waitFor(()=>expect(remote.catalog.getEvent).toHaveBeenCalled());
  expect(remote.backend.setRsvp).not.toHaveBeenCalled();
  expect(remote.server.get(event.id).status).toBe('going');
});

it('preserves a cold offline removal during foreground refresh until its delayed queue acknowledgement', async () => {
  const remote=accountBackend(), unmarkedAt=mockNow;
  mockNow=Date.parse('2026-10-29T12:00:00Z');
  await remote.backend.setRsvp({eventId:event.id,status:'cancelled'});
  let finish!: ()=>void;
  remote.backend.removeRsvp.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  await AsyncStorage.setItem(goingForUser('a'),JSON.stringify({[event.id]:{event,savedAt:unmarkedAt-1000,unmarkedAt,unmarkPending:true}}));
  await AsyncStorage.setItem(joinedPendingForUser('a'),JSON.stringify({[event.id]:false}));
  const listeners: ((state:AppStateStatus)=>void)[]=[];
  const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((_,listener)=>{
    listeners.push(listener); return {remove:jest.fn()};
  });
  try {
    mockOwner='a'; mockBackend=remote.backend; mockCatalog=remote.catalog;
    render(<GoingScreen />);
    await waitFor(()=>expect(remote.backend.removeRsvp).toHaveBeenCalled());
    await act(async()=>{listeners.forEach(listener=>listener('active'));});
    await waitFor(()=>expect(remote.catalog.getEvent).toHaveBeenCalled());
    let saved=JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!)[event.id];
    expect(saved.unmarkedAt).toBe(unmarkedAt); expect(saved.unmarkPending).toBe(true);
    await act(async()=>finish());
    await waitFor(async()=>{
      saved=JSON.parse((await AsyncStorage.getItem(goingForUser('a')))!)[event.id];
      expect(saved.cancelledRevision).toBe(new Date(mockNow).toISOString());
      expect(saved.unmarkPending).not.toBe(true);
    });
    expect(saved.unmarkedAt).toBe(unmarkedAt); expect(screen.queryByText(event.title)).toBeNull();
  } finally {subscription.mockRestore();}
});
