const { createPoliteFetch, USER_AGENT } = require('../polite-fetch');

const response = (status = 200, body = '[]', headers = {}) => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (key) => headers[key] ?? null }, text: async () => body,
});

function setup(fetchImpl, options = {}) {
  let time = 0;
  const sleep = jest.fn(async (ms) => { time += ms; });
  const fetch = createPoliteFetch({ fetchImpl, sleep, clock: () => time, ...options });
  return { fetch, sleep, clock: () => time };
}

it('holds the host queue until the body is consumed and lets another host proceed', async () => {
  let release;
  const body = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const fetchImpl = jest.fn(async (url) => {
    calls.push(url);
    return { ...response(), text: () => url.endsWith('/1') ? body : Promise.resolve('[]') };
  });
  const { fetch, sleep } = setup(fetchImpl);
  const first = fetch('https://feed.example/1');
  const second = fetch('https://feed.example/2');
  await fetch('https://other.example/3');
  expect(calls).toEqual(['https://feed.example/1', 'https://other.example/3']);
  release('[]');
  await Promise.all([first, second]);
  expect(sleep).toHaveBeenCalledWith(500);
  expect(fetchImpl.mock.calls[0][1].headers['User-Agent']).toBe(USER_AGENT);
});

it('honors the larger per-feed interval when requests share a host', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response());
  const { fetch, sleep } = setup(fetchImpl);
  await fetch('https://feed.example/first', { minIntervalMs: 2000 });
  await fetch('https://feed.example/second', { minIntervalMs: 1000 });
  expect(sleep).toHaveBeenCalledWith(2000);
});

it('retries 429 and 5xx with capped exponential delays and a finite attempt count', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response(503));
  const { fetch, sleep } = setup(fetchImpl, { retryCapMs: 2000 });
  expect((await fetch('https://feed.example/events')).status).toBe(503);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([ms]) => ms).filter((ms) => ms >= 1000)).toEqual([1000, 2000, 2000]);
});

it('retries aborted transport errors with capped exponential delays', async () => {
  const aborted = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
  const fetchImpl = jest.fn().mockRejectedValueOnce(aborted).mockResolvedValueOnce(response(200, '[1]'));
  const { fetch, sleep } = setup(fetchImpl, { retryCapMs: 1000 });
  expect(await (await fetch('https://feed.example/events')).json()).toEqual([1]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(sleep.mock.calls.map(([ms]) => ms).filter((ms) => ms >= 1000)).toEqual([1000]);
});

it.each(['3', 'Thu, 01 Jan 1970 00:00:03 GMT'])('honors Retry-After %s', async (after) => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response(429, '', { 'retry-after': after })).mockResolvedValue(response());
  const { fetch, sleep } = setup(fetchImpl);
  await fetch('https://feed.example/events');
  expect(sleep).toHaveBeenCalledWith(3000);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it('does not retry before an excessive Retry-After or retry permanent errors', async () => {
  for (const result of [response(429, '', { 'retry-after': '600' }), response(404)]) {
    const fetchImpl = jest.fn().mockResolvedValue(result);
    await setup(fetchImpl).fetch('https://feed.example/events');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  }
});

it('does not retry non-transient transport exceptions', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new Error('TLS certificate rejected'));
  await expect(setup(fetchImpl).fetch('https://feed.example/events')).rejects.toThrow('certificate');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([['etag', 'If-None-Match'], ['last-modified', 'If-Modified-Since']])('revalidates %s and replays the cached body on 304', async (validator, header) => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(response(200, '[1]', { [validator]: 'v1' })).mockResolvedValueOnce(response(304));
  const { fetch } = setup(fetchImpl);
  expect(await (await fetch('https://feed.example/events')).json()).toEqual([1]);
  expect(await (await fetch('https://feed.example/events')).json()).toEqual([1]);
  expect(fetchImpl.mock.calls[1][1].headers[header]).toBe('v1');
});

it('never interprets an uncached 304 as an empty successful snapshot', async () => {
  await expect(setup(async () => response(304)).fetch('https://feed.example/events')).rejects.toThrow('without a cached snapshot');
});

it('recovers the host queue after rejection and rejects oversized bodies', async () => {
  const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(response());
  const { fetch, sleep } = setup(fetchImpl);
  await expect(fetch('https://feed.example/1')).rejects.toThrow('network');
  await expect(fetch('https://feed.example/2')).resolves.toMatchObject({ ok: true });
  expect(sleep).toHaveBeenCalledWith(500);
  await expect(setup(async () => response(200, '1234'), { maxBytes: 3 }).fetch('https://feed.example')).rejects.toThrow('size limit');
});

it('aborts a stalled request, retries, and rejects unsafe transport inputs before fetch', async () => {
  const fetchImpl = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const { fetch } = setup(fetchImpl, { timeoutMs: 5 });
  await expect(fetch('http://feed.example')).rejects.toThrow('HTTPS');
  await expect(fetch('https://user:pass@feed.example')).rejects.toThrow('credentials');
  await expect(fetch('https://feed.example', { method: 'POST' })).rejects.toThrow('GET only');
  expect(fetchImpl).not.toHaveBeenCalled();
  await expect(fetch('https://feed.example')).rejects.toThrow(
    /^Timed out after 0s waiting for response headers from feed\.example \(attempt 4 of 4, 7s elapsed\)$/,
  );
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

it('names a body stall separately and lets a request raise its own timeout ceiling', async () => {
  const stalledBody = jest.fn((url, { signal }) => Promise.resolve({
    ...response(), text: () => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
    }),
  }));
  const { fetch } = setup(stalledBody, { timeoutMs: 5, maxRetries: 0 });
  await expect(fetch('https://slow.example/events?ical=1')).rejects.toThrow(
    'Timed out after 0s reading the response body from slow.example (attempt 1 of 1, 0s elapsed)',
  );
  const slowHeaders = jest.fn((url, { signal }) => new Promise((resolve, reject) => {
    const done = setTimeout(() => resolve(response(200, 'late')), 40);
    signal.addEventListener('abort', () => { clearTimeout(done); reject(new Error('aborted')); });
  }));
  const { fetch: fetchWithCeiling } = setup(slowHeaders, { timeoutMs: 5, maxRetries: 0 });
  await expect(fetchWithCeiling('https://slow.example/default')).rejects.toThrow('Timed out after 0s');
  await expect((await fetchWithCeiling('https://slow.example/raised', { timeoutMs: 400 })).text()).resolves.toBe('late');
  // A foreign abort that our timer did not fire keeps its original message.
  const foreignAbort = jest.fn().mockRejectedValue(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
  await expect(setup(foreignAbort, { maxRetries: 0 }).fetch('https://feed.example')).rejects.toThrow('This operation was aborted');
});
