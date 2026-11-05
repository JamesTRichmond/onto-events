// Shared primitives for the ingestion pipeline (scripts/pipeline/*) and the
// refresh runner: coordinate/date parsing, label formatting, log redaction,
// and the generated-file emit/parse pair. CommonJS on purpose: the ESM
// scripts default-import it, and jest requires it with no extra transform
// configuration. Source normalization itself lives in the adapters.

// Number('') and Number(null) coerce to 0 — a fake null-island coordinate that
// slips past Number.isFinite. Require the whole string to be numeric so trailing
// API junk cannot be silently discarded.
function parseCoord(value) {
  if (typeof value === 'number') return value;
  if (
    typeof value === 'string' &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  ) {
    return Number(value);
  }
  return NaN;
}

const LABEL_OPTS = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function whenLabelFor(iso, tz) {
  if (!iso) return 'Date TBA';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date TBA';
  try {
    return d.toLocaleString('en-US', { ...LABEL_OPTS, timeZone: tz || 'America/Denver' });
  } catch {
    // Ticketmaster occasionally ships a bogus venue timezone; fall back to SLC's.
    return d.toLocaleString('en-US', { ...LABEL_OPTS, timeZone: 'America/Denver' });
  }
}

// Stable pseudo-count so demo interest numbers don't jump between refreshes.
function pseudoCount(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 15 + (h % 220);
}

/** Strip a secret from any text that might be logged (429 bodies echo it). */
function redactSecret(text, secret, label = '[TM_KEY]') {
  const s = String(text);
  return secret ? s.split(secret).join(label) : s;
}

/** Prefer the most informative strings from an error-like value instead of [object Object]. */
function formatError(error) {
  function scalar(value) {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'string') return value.trim();
    return '';
  }
  function objectBody(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return '';
  }
  function diagnosticPairs(value) {
    if (!value || typeof value !== 'object') return [];
    const pairs = [];
    for (const key of ['status', 'statusCode', 'httpStatus', 'code', 'errorCode', 'url', 'method']) {
      const text = scalar(value[key]);
      if (text) pairs.push(`${key}=${text}`);
    }
    const body = objectBody(value.body ?? value.responseBody ?? value.rawBody ?? value.data);
    if (body) pairs.push(`body=${body}`);
    if (value.response && typeof value.response === 'object') {
      for (const key of ['status', 'statusCode', 'url']) {
        const text = scalar(value.response[key]);
        if (text) pairs.push(`response.${key}=${text}`);
      }
      const responseBody = objectBody(value.response.body ?? value.response.data ?? value.response.text);
      if (responseBody) pairs.push(`response.body=${responseBody}`);
    }
    return [...new Set(pairs)];
  }

  if (error == null) return String(error);
  if (error instanceof Error) {
    const message = scalar(error.message);
    if (message) return message;
    const diagnostics = diagnosticPairs(error);
    return diagnostics.length > 0 ? diagnostics.join(' | ') : error.toString();
  }
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const messages = [error.message, error.details, error.hint, error.cause]
      .map((value) => scalar(value))
      .filter(Boolean);
    const diagnostics = diagnosticPairs(error);
    if (messages.length > 0 || diagnostics.length > 0) {
      return [...messages, ...diagnostics].join(' | ');
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}' && json !== '""' && json !== '{"message":""}') return json;
    } catch {
      return 'Unknown error (empty provider response)';
    }
    return 'Unknown error (empty provider response)';
  }
  return String(error);
}

/**
 * A refresh that would wipe out a healthy dataset is more likely a bad API
 * response than a quiet week in Salt Lake City.
 */
function shouldRefuseWrite(prevCount, nextCount, force, { ratio = true } = {}) {
  if (force) return false;
  // Nothing to protect: an already-empty catalog staying empty is a no-op, not
  // a wipe. Sources whose listings all skip legitimately sit at zero for weeks
  // (the run-club calendars describe meeting spots in prose, so none map).
  if (prevCount === 0 && nextCount === 0) return false;
  if (nextCount === 0) return true;
  if (ratio && prevCount >= 20 && nextCount < prevCount * 0.3) return true;
  return false;
}

function buildGenerated(records, generatedAtIso) {
  return `/**
 * GENERATED FILE - do not edit by hand.
 * Live Salt Lake City events from the Ticketmaster Discovery API.
 * Refresh: node --env-file=.env scripts/refresh-events.mjs (then redeploy).
 * Generated: ${generatedAtIso} - ${records.length} events.
 */
import { Activity } from './activities';

export const GENERATED_AT = '${generatedAtIso}';

export const LIVE_ACTIVITIES: Activity[] = ${JSON.stringify(records, null, 2)};
`;
}

/** The local-calendar counterpart of buildGenerated, with the same banner format. */
function buildLocalGenerated(records, generatedAtIso, regionId) {
  return `/**
 * GENERATED FILE - do not edit by hand.
 * Regional local listings from the public venue, organizer, city and
 * county calendars the event sync reads. No ticket sellers.
 * Refresh: npm run events:refresh:local${regionId ? ` -- --region ${regionId}` : ''} (then rebuild).
 * Generated: ${generatedAtIso} - ${records.length} events.
 */
import { Activity } from './activities';

export const LOCAL_GENERATED_AT = '${generatedAtIso}';

export const LOCAL_ACTIVITIES: Activity[] = ${JSON.stringify(records, null, 2)};
`;
}

/** Read the banner of a previously generated file: {generatedAt, count}. */
function parseGenerated(source) {
  const m = /Generated: (\S+) - (\d+) events\./.exec(source ?? '');
  return m ? { generatedAt: m[1], count: Number(m[2]) } : { generatedAt: null, count: 0 };
}

/** Recover the record array from a previously generated file, or null. */
function extractRecords(source) {
  const marker = 'LIVE_ACTIVITIES: Activity[] = ';
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const json = source.slice(start + marker.length).replace(/;\s*$/, '');
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

module.exports = {
  parseCoord,
  whenLabelFor,
  pseudoCount,
  redactSecret,
  formatError,
  shouldRefuseWrite,
  buildGenerated,
  buildLocalGenerated,
  parseGenerated,
  extractRecords,
};
