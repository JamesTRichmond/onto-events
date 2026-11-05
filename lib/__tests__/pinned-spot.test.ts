import { isValidSpot, LOOK_COPY, lookSource, PIN_PICKER_COPY, timeZoneForSpot } from '../pinned-spot';

describe('lookSource', () => {
  it('prefers a dropped pin over everything', () => {
    expect(lookSource({ lat: 40.7, lng: -111.9 }, true)).toBe('pin');
    expect(lookSource({ lat: 40.7, lng: -111.9 }, false)).toBe('pin');
  });

  it('falls back to the stored choice when no pin is set', () => {
    expect(lookSource(null, true)).toBe('slc');
    expect(lookSource(null, false)).toBe('device');
  });
});

describe('isValidSpot', () => {
  it('accepts a real coordinate', () => {
    expect(isValidSpot({ lat: 40.76, lng: -111.89 })).toBe(true);
  });

  it('rejects missing, non-finite and out-of-range values', () => {
    expect(isValidSpot(null)).toBe(false);
    expect(isValidSpot({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(isValidSpot({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidSpot({ lat: 0, lng: 181 })).toBe(false);
  });
});

describe('timeZoneForSpot', () => {
  it('uses the service-region timezone for a dropped pin', () => {
    expect(timeZoneForSpot({ lat: 44.0153, lng: -73.1673 })).toBe('America/New_York');
    expect(timeZoneForSpot({ lat: 40.7608, lng: -111.891 })).toBe('America/Denver');
    expect(timeZoneForSpot({ lat: 35.5951, lng: -82.5515 })).toBe('America/New_York');
  });

  it('does not claim a service timezone outside covered regions', () => {
    expect(timeZoneForSpot({ lat: 0, lng: 0 })).toBeNull();
  });
});

describe('location copy', () => {
  it('tells the viewer what happens to their location, in plain words', () => {
    expect(LOOK_COPY.deviceNote).toMatch(/never saved or sent/i);
    expect(LOOK_COPY.pinNote).toMatch(/forgotten when you close/i);
    expect(PIN_PICKER_COPY.prompt).toMatch(/not used/i);
  });

  it('never says the retired working name or anything but lowercase onto', () => {
    const all = [...Object.values(LOOK_COPY), ...Object.values(PIN_PICKER_COPY)].join(' ');
    expect(all).not.toMatch(/\bOnto\b/);
  });
});
