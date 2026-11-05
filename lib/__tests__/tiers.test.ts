import {
  allowsPairing,
  DEFAULT_MODE,
  enabledModes,
  joinLabel,
  matureContentEnabled,
  ratingsFor,
} from '../tiers';

describe('tier visibility matrix', () => {
  it('defaults to Everyone with only family and general modes exposed', () => {
    expect(DEFAULT_MODE).toBe('everyone');
    expect(matureContentEnabled(undefined)).toBe(false);
    expect(enabledModes(false)).toEqual(['family', 'everyone']);
  });

  it('everyone and family remain isolated', () => {
    expect([...ratingsFor('everyone', false)]).toEqual(['general']);
    expect([...ratingsFor('family', false)]).toEqual(['family']);
  });

  it('a forged mature mode fails closed to general content', () => {
    expect([...ratingsFor('mature', false)]).toEqual(['general']);
    expect(ratingsFor('mature', false).has('mature')).toBe(false);
  });

  it('the deferred mature implementation requires an explicit true flag', () => {
    expect(matureContentEnabled('TRUE')).toBe(false);
    expect(matureContentEnabled('true')).toBe(true);
    expect(enabledModes(true)).toEqual(['family', 'everyone', 'mature']);
    expect(ratingsFor('mature', true).has('mature')).toBe(true);
  });
});

describe('family containment', () => {
  it('family mode allows no stranger pairing', () => {
    expect(allowsPairing('family')).toBe(false);
    expect(allowsPairing('everyone')).toBe(true);
  });

  it('family join copy is RSVP-only', () => {
    expect(joinLabel('family', false)).toBe('RSVP');
    expect(joinLabel('family', true)).toBe("You're going");
    expect(joinLabel('everyone', false)).toBe("I'm in");
  });
});
