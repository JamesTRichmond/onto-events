const { upsertRows, isRetryableUpsertError } = require('../sync-sources');

function client(sequence) {
  const calls = [];
  let index = 0;
  return {
    calls,
    from: () => ({
      upsert: async (rows) => {
        calls.push(rows.map((row) => row.id));
        const next = sequence[index++];
        if (typeof next === 'function') return { error: next(rows) };
        return { error: next ?? null };
      },
    }),
  };
}

it.each([
  [{ message: 'Gateway Timeout' }, true],
  [{ message: 'upstream gateway timeout from CDN' }, true],
  [{ message: 'Service Unavailable', code: '503' }, true],
  [{ message: 'request failed with 504' }, true],
  [{ message: 'fetch failed', code: 'ECONNRESET' }, true],
  [{ message: 'new row violates check constraint "events_end_after_start"' }, false],
  [{ message: 'permission denied', code: '42501' }, false],
  [{ message: 'JWT expired' }, false],
])('classifies %j as retryable=%s', (error, expected) => {
  expect(isRetryableUpsertError(error)).toBe(expected);
});

it('retries a Gateway Timeout batch, then succeeds without row fallback', async () => {
  const sleep = jest.fn(async () => {});
  const supabase = client([
    { message: 'Gateway Timeout' },
    null,
  ]);
  const failures = await upsertRows(supabase, [{ id: 'a' }, { id: 'b' }], {
    sleep, maxWriteRetries: 3, retryCapMs: 10000,
  });
  expect(failures).toEqual([]);
  expect(supabase.calls).toEqual([['a', 'b'], ['a', 'b']]);
  expect(sleep).toHaveBeenCalledTimes(1);
  expect(sleep).toHaveBeenCalledWith(1000);
});

it('retries row-level Gateway Timeout after a permanent batch failure', async () => {
  const sleep = jest.fn(async () => {});
  const supabase = client([
    { message: 'new row violates check constraint "events_end_after_start"' },
    { message: 'Gateway Timeout' },
    null,
    null,
  ]);
  const failures = await upsertRows(supabase, [{ id: 'bad' }, { id: 'ok' }], {
    sleep, maxWriteRetries: 3,
  });
  expect(failures).toEqual([]);
  expect(supabase.calls).toEqual([['bad', 'ok'], ['bad'], ['bad'], ['ok']]);
  expect(sleep).toHaveBeenCalledTimes(1);
});

it('exhausts retries and still reports the row failure', async () => {
  const sleep = jest.fn(async () => {});
  const timeout = { message: 'Gateway Timeout' };
  const supabase = client([
    timeout, timeout, timeout, timeout, // batch: initial + 3 retries
    timeout, timeout, timeout, timeout, // row a
    timeout, timeout, timeout, timeout, // row b
  ]);
  const failures = await upsertRows(supabase, [{ id: 'a' }, { id: 'b' }], {
    sleep, maxWriteRetries: 3, retryCapMs: 50,
  });
  expect(failures).toEqual([
    { id: 'a', message: 'Gateway Timeout' },
    { id: 'b', message: 'Gateway Timeout' },
  ]);
  expect(supabase.calls).toHaveLength(1 + 3 + (1 + 3) * 2);
  expect(sleep.mock.calls.every(([ms]) => ms <= 50)).toBe(true);
});

it('does not retry permanent constraint errors on the single-row path', async () => {
  const sleep = jest.fn(async () => {});
  const permanent = { message: 'new row violates check constraint "events_end_after_start"' };
  const supabase = client([permanent, permanent, null]);
  const failures = await upsertRows(supabase, [{ id: 'bad' }, { id: 'ok' }], { sleep });
  expect(failures).toEqual([{ id: 'bad', message: permanent.message }]);
  expect(supabase.calls).toEqual([['bad', 'ok'], ['bad'], ['ok']]);
  expect(sleep).not.toHaveBeenCalled();
});
