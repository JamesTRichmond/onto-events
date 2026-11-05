import {
  BackendError,
  DEFAULT_EVENT_PAGE_SIZE,
  MAX_COARSE_AREA_LENGTH,
  MAX_EVENT_PAGE_SIZE,
  MAX_HOME_CITY_LENGTH,
  MAX_PROFILE_BIO_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_REPORT_DETAILS_LENGTH,
  MAX_STATUS_TEXT_LENGTH,
  assertNonEmptyId,
  normalizeEventPageSize,
  validatePresence,
  validateProfileUpdate,
  validateReport,
} from '../contracts';

function expectInvalidInput(run: () => unknown, message: string) {
  try {
    run();
    throw new Error('expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(BackendError);
    expect(error).toMatchObject({ code: 'invalid-input', message });
  }
}

describe('BackendError', () => {
  it('preserves the public error code and original cause', () => {
    const cause = new Error('transport failed');
    const error = new BackendError('network', 'Could not reach onto', cause);

    expect(error.name).toBe('BackendError');
    expect(error.code).toBe('network');
    expect(error.causeValue).toBe(cause);
  });
});

describe('normalizeEventPageSize', () => {
  it('uses the default when the requested size is missing or not finite', () => {
    expect(normalizeEventPageSize()).toBe(DEFAULT_EVENT_PAGE_SIZE);
    expect(normalizeEventPageSize(Number.NaN)).toBe(DEFAULT_EVENT_PAGE_SIZE);
    expect(normalizeEventPageSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_EVENT_PAGE_SIZE);
  });

  it('returns an integer clamped to the public bounds', () => {
    expect(normalizeEventPageSize(-4)).toBe(1);
    expect(normalizeEventPageSize(24.9)).toBe(24);
    expect(normalizeEventPageSize(MAX_EVENT_PAGE_SIZE + 1)).toBe(MAX_EVENT_PAGE_SIZE);
  });
});

describe('assertNonEmptyId', () => {
  it('trims valid identifiers before they cross a backend boundary', () => {
    expect(assertNonEmptyId('  event-123  ', 'eventId')).toBe('event-123');
  });

  it('rejects empty identifiers with a typed error', () => {
    expectInvalidInput(() => assertNonEmptyId('   ', 'eventId'), 'eventId is required');
  });
});

describe('validateProfileUpdate', () => {
  it('accepts a bounded partial profile update', () => {
    const input = {
      displayName: 'James',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Ready to get onto something.',
      homeCity: 'Salt Lake City',
      ageGateConfirmed: true,
      isDiscoverable: false,
    };

    expect(validateProfileUpdate(input)).toBe(input);
  });

  it('rejects blank and overlong display names', () => {
    expectInvalidInput(
      () => validateProfileUpdate({ displayName: '   ' }),
      `displayName must be 1-${MAX_PROFILE_NAME_LENGTH} characters`,
    );
    expectInvalidInput(
      () => validateProfileUpdate({ displayName: 'x'.repeat(MAX_PROFILE_NAME_LENGTH + 1) }),
      `displayName must be 1-${MAX_PROFILE_NAME_LENGTH} characters`,
    );
  });

  it('rejects unsafe avatar URLs and overlong bios', () => {
    expectInvalidInput(
      () => validateProfileUpdate({ avatarUrl: 'http://example.com/avatar.png' }),
      'avatarUrl must use https',
    );
    expectInvalidInput(
      () => validateProfileUpdate({ bio: 'x'.repeat(MAX_PROFILE_BIO_LENGTH + 1) }),
      `bio must be at most ${MAX_PROFILE_BIO_LENGTH} characters`,
    );
  });

  it('rejects a home city above the database limit', () => {
    expect(validateProfileUpdate({ homeCity: 'x'.repeat(MAX_HOME_CITY_LENGTH) })).toEqual({
      homeCity: 'x'.repeat(MAX_HOME_CITY_LENGTH),
    });
    expectInvalidInput(
      () => validateProfileUpdate({ homeCity: 'x'.repeat(MAX_HOME_CITY_LENGTH + 1) }),
      `homeCity must be at most ${MAX_HOME_CITY_LENGTH} characters`,
    );
  });
});

describe('validateReport', () => {
  it('requires at least one report target', () => {
    expectInvalidInput(
      () => validateReport({ reason: 'spam' }),
      'a report needs a user or event target',
    );
  });

  it('accepts either a user target or event target', () => {
    const userReport = { reportedUserId: 'user-1', reason: 'harassment' as const };
    const eventReport = { eventId: 'event-1', reason: 'spam' as const };

    expect(validateReport(userReport)).toBe(userReport);
    expect(validateReport(eventReport)).toBe(eventReport);
  });

  it('rejects report details above the storage contract', () => {
    expectInvalidInput(
      () =>
        validateReport({
          eventId: 'event-1',
          reason: 'other',
          details: 'x'.repeat(MAX_REPORT_DETAILS_LENGTH + 1),
        }),
      `report details must be at most ${MAX_REPORT_DETAILS_LENGTH} characters`,
    );
  });
});

describe('validatePresence', () => {
  it('accepts private, expiring, coarse presence', () => {
    const input = {
      statusText: 'Open to a hike',
      coarseArea: 'Sugar House',
      visibility: 'private' as const,
      expiresAt: '2026-09-02T22:00:00.000Z',
    };

    expect(validatePresence(input)).toBe(input);
  });

  it('rejects overlong status text and invalid expiry dates', () => {
    expectInvalidInput(
      () =>
        validatePresence({
          statusText: 'x'.repeat(MAX_STATUS_TEXT_LENGTH + 1),
          visibility: 'private',
        }),
      `statusText must be at most ${MAX_STATUS_TEXT_LENGTH} characters`,
    );
    expectInvalidInput(
      () => validatePresence({ visibility: 'private', expiresAt: 'not-a-date' }),
      'expiresAt must be an ISO date',
    );
  });

  it('rejects a coarse area above the database limit', () => {
    expect(
      validatePresence({
        coarseArea: 'x'.repeat(MAX_COARSE_AREA_LENGTH),
        visibility: 'private',
      }),
    ).toEqual({
      coarseArea: 'x'.repeat(MAX_COARSE_AREA_LENGTH),
      visibility: 'private',
    });
    expectInvalidInput(
      () =>
        validatePresence({
          coarseArea: 'x'.repeat(MAX_COARSE_AREA_LENGTH + 1),
          visibility: 'private',
        }),
      `coarseArea must be at most ${MAX_COARSE_AREA_LENGTH} characters`,
    );
  });
});
