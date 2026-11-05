const USER_AGENT = 'onto-events-sync/1.0 (+https://onto-35j.pages.dev/support)';
const ACCEPT = 'text/calendar, application/json;q=0.9, text/plain;q=0.8, application/xml;q=0.8, */*;q=0.1';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableTransportError(error) {
  const name = String(error?.name ?? '');
  const message = String(error?.message ?? error ?? '');
  return name === 'AbortError' || /This operation was aborted|aborted|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|fetch failed/i.test(message);
}

// Buffer before releasing the host lock: fetch resolves at response headers,
// while the origin may still be sending the body. Cached bodies make 304 a
// complete snapshot, never an empty feed that could retire real listings.
function createPoliteFetch({
  fetchImpl = globalThis.fetch, sleep = defaultSleep, clock = Date.now,
  cache = new Map(), maxRetries = 3, retryCapMs = 10000, timeoutMs = 20000,
  maxBytes = 5 * 1024 * 1024,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required');
  const hosts = new Map();
  const seconds = (ms) => `${Math.round(ms / 100) / 10}s`;

  // Name our own timeout instead of surfacing undici's bare "This operation
  // was aborted": which phase stalled, on which host, and how many attempts
  // the job spent, so a slow origin reads differently from a silent block.
  function timeoutError(hostname, phase, limitMs, attempt, startedAt) {
    const stage = phase === 'body' ? 'reading the response body' : 'waiting for response headers';
    const error = new Error(`Timed out after ${seconds(limitMs)} ${stage} from ${hostname} (attempt ${attempt} of ${maxRetries + 1}, ${seconds(clock() - startedAt)} elapsed)`);
    error.name = 'TimeoutError';
    return error;
  }

  async function request(url, options, host) {
    const key = String(url);
    const cached = options.cache === 'no-store' ? null : cache.get(key);
    const parsedUrl = new URL(key);
    const headers = {
      Accept: ACCEPT,
      'Accept-Language': 'en-US,en;q=0.8',
      Referer: `${parsedUrl.origin}${parsedUrl.pathname}`,
      ...options.headers,
      'User-Agent': USER_AGENT,
    };
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    else if (cached?.modified) headers['If-Modified-Since'] = cached.modified;
    // A source may raise its own ceiling (a slow origin is not a blocked one);
    // the registry caps the value so one feed cannot spend the job's budget.
    const limitMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : timeoutMs;
    const startedAt = clock();
    for (let attempt = 0; ; attempt++) {
      if (host.lastCompleted !== null) {
        const requestedInterval = Number.isFinite(options.minIntervalMs) ? options.minIntervalMs : 500;
        await sleep(Math.max(0, Math.max(500, host.lastIntervalMs ?? 500, requestedInterval) - (clock() - host.lastCompleted)));
      }
      const controller = new AbortController();
      let timedOut = false;
      let phase = 'headers';
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, limitMs);
      let response;
      let body;
      let requestError = null;
      try {
        // Reject automatic redirects so the transport cannot silently bypass
        // a different host's queue or forward a provider's request headers.
        response = await fetchImpl(key, { ...options, headers, redirect: 'error', signal: controller.signal });
        phase = 'body';
        if (Number(response.headers?.get('content-length')) > maxBytes) {
          await response.body?.cancel();
          throw new Error('Source response exceeds size limit');
        }
        body = await response.text();
        if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error('Source response exceeds size limit');
      } catch (error) {
        requestError = timedOut ? timeoutError(parsedUrl.hostname, phase, limitMs, attempt + 1, startedAt) : error;
      } finally {
        clearTimeout(timer);
        host.lastCompleted = clock();
        host.lastIntervalMs = Number.isFinite(options.minIntervalMs) ? Math.max(500, options.minIntervalMs) : 500;
      }
      if (requestError) {
        if (isRetryableTransportError(requestError) && attempt < maxRetries) {
          await sleep(Math.min(retryCapMs, 1000 * 2 ** attempt));
          continue;
        }
        throw requestError;
      }
      if (response.status === 304) {
        if (!cached) throw new Error('Source returned 304 without a cached snapshot');
        return buffered(cached);
      }
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const after = response.headers?.get('retry-after');
        const requested = after == null ? 0 : /^\d+(\.\d+)?$/.test(after)
          ? Number(after) * 1000 : Math.max(0, Date.parse(after) - clock());
        // A very long server-requested delay cannot fit this job. Return the
        // error instead of retrying earlier than the server permits.
        if (requested <= retryCapMs || !Number.isFinite(requested)) {
          await sleep(Math.min(retryCapMs, Math.max(1000 * 2 ** attempt, requested || 0)));
          continue;
        }
      }
      const snapshot = {
        status: response.status, ok: response.ok, headers: response.headers, body,
        etag: response.headers?.get('etag'), modified: response.headers?.get('last-modified'),
      };
      if (response.ok && options.cache !== 'no-store' && (snapshot.etag || snapshot.modified)) {
        cache.delete(key);
        cache.set(key, snapshot);
        if (cache.size > 128) cache.delete(cache.keys().next().value);
      } else if (response.ok) cache.delete(key);
      return buffered(snapshot);
    }
  }

  return function politeFetch(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return Promise.reject(new Error('Sources require public HTTPS URLs without credentials'));
    }
    if (options.method && options.method !== 'GET') return Promise.reject(new Error('Sources use GET only'));
    const host = hosts.get(parsed.hostname) ?? { tail: Promise.resolve(), lastCompleted: null, lastIntervalMs: 500 };
    hosts.set(parsed.hostname, host);
    const pending = host.tail.then(() => request(url, options, host));
    host.tail = pending.catch(() => {});
    return pending;
  };
}

function buffered(snapshot) {
  return {
    ok: snapshot.ok, status: snapshot.status, headers: snapshot.headers,
    text: async () => snapshot.body, json: async () => JSON.parse(snapshot.body),
  };
}

module.exports = {
  createPoliteFetch, USER_AGENT, ACCEPT, defaultSleep, isRetryableTransportError,
};
