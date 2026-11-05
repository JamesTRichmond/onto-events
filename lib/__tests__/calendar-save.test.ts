import { saveToCalendar } from '@/lib/calendar-share';

const item = { title: 'Publisher concert', venue: 'Publisher venue', whenLabel: '', startsAtIso: '2026-11-01T15:00:00Z' };
const originals = new Map<PropertyKey, PropertyDescriptor | undefined>();
function globalValue(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
let click: jest.Mock, remove: jest.Mock, share: jest.Mock, create: jest.Mock, revoke: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  click = jest.fn(); remove = jest.fn(); share = jest.fn().mockResolvedValue(undefined);
  create = jest.fn().mockReturnValue('blob:test-calendar'); revoke = jest.fn();
  globalValue('File', class { constructor(public parts: unknown[], public name: string, public options: unknown) {} });
  globalValue('document', { body: { appendChild: jest.fn() }, createElement: jest.fn(()=>({ click, remove })) });
  globalValue('navigator', { canShare: () => true, share });
  globalValue('URL', { createObjectURL: create, revokeObjectURL: revoke });
});
afterEach(() => {
  jest.runOnlyPendingTimers(); jest.useRealTimers();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  originals.clear();
});

it('hands a real calendar file to Web Share without claiming the calendar saved it', async () => {
  expect(await saveToCalendar(item)).toBe('handed-off');
  const file = share.mock.calls[0][0].files[0];
  expect(file.name).toBe('onto-event.ics');
  expect(file.options.type).toMatch(/^text\/calendar/);
  expect(file.parts[0]).toContain('DTSTART:20261101T150000Z');
  expect(file.parts[0]).not.toContain('DTEND:');
  expect(file.parts[0]).not.toMatch(/https?:/);
  expect(click).not.toHaveBeenCalled();
});
it('does not download again when the user cancels Web Share', async () => {
  share.mockRejectedValue({ name: 'AbortError' });
  expect(await saveToCalendar(item)).toBe('cancelled');
  expect(create).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
});
it('downloads the ICS file when file sharing is unavailable and revokes the temporary URL', async () => {
  globalValue('navigator', {});
  expect(await saveToCalendar(item)).toBe('handed-off');
  expect(click).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1);
  expect(document.createElement).toHaveBeenCalledWith('a');
  expect(revoke).not.toHaveBeenCalled(); jest.advanceTimersByTime(60_000);
  expect(revoke).toHaveBeenCalledWith('blob:test-calendar');
});
it('reports unavailable for missing start time or a failed handoff', async () => {
  expect(await saveToCalendar({ ...item, startsAtIso: undefined })).toBe('unavailable');
  expect(share).not.toHaveBeenCalled();
  share.mockRejectedValue(new Error('unsupported')); create.mockImplementation(()=>{throw new Error('unsupported');});
  expect(await saveToCalendar(item)).toBe('unavailable');
});
