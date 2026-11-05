import { Share } from 'react-native';

import { roundToGrid } from '@/hooks/use-user-location';
import {
  icsForItem,
  shareActivity,
  shareLine,
  sharePlan,
} from '@/lib/calendar-share';
import { canShare, friendNamesLabel, headcountLabel } from '@/lib/card-actions';

const EXACT = { lat: 40.760812, lng: -111.891047 };
const ITEM = {
  title: 'Pioneer Park market',
  venue: 'Pioneer Park',
  whenLabel: 'Sat 8:00 AM',
  startsAtIso: '2026-10-18T14:00:00.000Z',
  description: 'Open air.',
};

describe('W3 web APIs — location grid invariant', () => {
  it('roundToGrid snaps to a 0.1° cell and never echoes exact coords', () => {
    const grid = roundToGrid(EXACT.lat, EXACT.lng);
    expect(grid).toEqual({ lat: 40.8, lng: -111.9 });
    expect(grid.lat).not.toBe(EXACT.lat);
    expect(grid.lng).not.toBe(EXACT.lng);
    // One decimal place max.
    expect(String(grid.lat)).toMatch(/^-?\d+(\.\d)?$/);
    expect(String(grid.lng)).toMatch(/^-?\d+(\.\d)?$/);
  });

  it('share text and calendar export never emit device coords or deep links', () => {
    const withDevice = {
      ...ITEM,
      lat: EXACT.lat,
      lng: EXACT.lng,
    } as typeof ITEM & { lat: number; lng: number };
    const line = shareLine(withDevice);
    const plan = sharePlan(withDevice);
    const ics = icsForItem(withDevice);

    for (const blob of [line, plan, ics ?? '']) {
      expect(blob).not.toMatch(/https?:\/\//i);
      expect(blob).not.toMatch(/onto\.events/i);
      expect(blob).not.toMatch(/onto-35j\.pages\.dev/i);
      expect(blob).not.toContain(String(EXACT.lat));
      expect(blob).not.toContain(String(EXACT.lng));
      expect(blob).not.toMatch(/geo:/i);
    }
    expect(plan).toBe(line);
    expect(ics).toContain('LOCATION:Pioneer Park');
  });
});

describe('W3 web APIs — share after Going ✓', () => {
  it('canShare is true only after Going ✓', () => {
    expect(canShare(false)).toBe(false);
    expect(canShare(true)).toBe(true);
  });

  it('sharePlan is Day · time · title at venue with no URL', () => {
    const text = sharePlan({ ...ITEM, startsAtIso: undefined });
    expect(text).toBe('Sat 8:00 AM · Pioneer Park market at Pioneer Park');
    expect(text).not.toMatch(/https?:/i);
  });

  it('shareActivity prefers navigator.share, then clipboard, then RN Share', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    const writeText = jest.fn().mockResolvedValue(undefined);
    const rnShare = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { share, clipboard: { writeText } },
    });

    await expect(shareActivity(ITEM)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: sharePlan(ITEM) });
    expect(writeText).not.toHaveBeenCalled();
    expect(rnShare).not.toHaveBeenCalled();

    share.mockRejectedValueOnce(new Error('boom'));
    await expect(shareActivity(ITEM)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(sharePlan(ITEM));

    // Clipboard gone → RN Share.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    await expect(shareActivity(ITEM)).resolves.toBe('shared');
    expect(rnShare).toHaveBeenCalledWith({ message: sharePlan(ITEM) });
    const message = String(rnShare.mock.calls[0][0].message);
    expect(message).not.toMatch(/https?:/i);
    expect(message).not.toContain(String(EXACT.lat));

    rnShare.mockRestore();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
  });
});

describe('W3 web APIs — card details headcount', () => {
  it('formats headcount and permitted friend names', () => {
    expect(headcountLabel(0)).toBe('Nobody marked Going yet');
    expect(headcountLabel(1)).toBe('1 going');
    expect(headcountLabel(12)).toBe('12 going');
    expect(friendNamesLabel([])).toBeNull();
    expect(friendNamesLabel(['Ada'])).toBe('Ada is going');
    expect(friendNamesLabel(['Ada', 'Bea'])).toBe('Ada and Bea are going');
  });
});

describe('shareActivity edge paths', () => {
  const item = { title: 'Gallery walk', startsAt: '2026-10-16T18:00:00Z', venueName: 'Main St' } as any;
  const setNav = (value: unknown) =>
    Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });

  it('returns cancelled on AbortError and never falls through', async () => {
    const writeText = jest.fn();
    setNav({ share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), clipboard: { writeText } });
    await expect(shareActivity(item)).resolves.toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('clipboard fallback calls writeText with clipboard as this', async () => {
    const clipboard = {
      writeText: jest.fn(function (this: unknown) {
        if (this !== clipboard) throw new TypeError('Illegal invocation');
        return Promise.resolve();
      }),
    };
    setNav({ clipboard });
    await expect(shareActivity(item)).resolves.toBe('copied');
  });
});

describe('share without navigator.share', () => {
  it('uses clipboard directly when share is missing', async () => {
    const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard }, configurable: true, writable: true });
    await expect(shareActivity({ title: 'Walk', startsAt: '2026-10-16T18:00:00Z' } as any)).resolves.toBe('copied');
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});

describe('roundToGrid edges', () => {
  it('normalizes -0 and wraps lng into [-180, 180)', () => {
    expect(Object.is(roundToGrid(-0.04, -0.04).lat, 0)).toBe(true);
    expect(Object.is(roundToGrid(-0.04, -0.04).lng, 0)).toBe(true);
    expect(roundToGrid(0, 180).lng).toBe(-180);
    expect(roundToGrid(0, 181.23).lng).toBe(-178.8);
    expect(roundToGrid(0, -180.04).lng).toBe(-180);
    expect(roundToGrid(95, 0).lat).toBe(90);
  });
});
