const path = require('node:path');
const ical = require('node-ical');
const { calendarRecord, text } = require('../calendar-record');
const { htmlText } = require('../feed-text');

const DAY = 86400000;
const HORIZON_DAYS = 60;
const MAX_INSTANCES = 60;
const ERROR_HEADERS = ['server', 'retry-after', 'x-cache', 'cf-ray', 'x-sucuri-id', 'x-sucuri-cache', 'via', 'content-type'];

function validTimezone(timezone) {
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0);
  return timezone;
}

function localDate(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  return ['year', 'month', 'day'].map((key) => parts.find((p) => p.type === key).value).join('');
}

function addDays(date, count) {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8) + count));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// A wall-clock time (yyyymmdd, hhmmss) in a zone, as an instant.
function localTime(date, time, timezone) {
  return ical.sync.parseICS(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:clock\nDTSTART;TZID=${timezone}:${date}T${time}\nEND:VEVENT\nEND:VCALENDAR`).clock.start;
}

function localMidnight(date, timezone) {
  return localTime(date, '000000', timezone);
}

// The wall-clock reading of an instant in a zone, as the UTC milliseconds of those same fields.
const wallFormats = new Map();
function zoneWall(instant, zone) {
  if (!wallFormats.has(zone)) wallFormats.set(zone, new Intl.DateTimeFormat('en', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }));
  const parts = Object.fromEntries(wallFormats.get(zone).formatToParts(instant).map(({ type, value }) => [type, +value]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

// RFC 5545 §3.3.5: a local time that a fall-back transition repeats means its
// first occurrence. The pinned parser resolves zoned values to the second one,
// while its RRULE expansion already uses the first, so on that night an EXDATE
// or RECURRENCE-ID would miss the occurrence it names. Returns the first
// instant, or undefined when the time occurs once (or, in a spring gap, never).
function firstOfRepeatedTime(value, zone) {
  const wall = Date.UTC(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8), +value.slice(9, 11), +value.slice(11, 13), +value.slice(13, 15));
  const offsets = new Set([wall - DAY, wall + DAY].map((probe) => zoneWall(probe, zone) - probe));
  const instants = [...offsets].map((offset) => wall - offset).filter((instant) => zoneWall(instant, zone) === wall);
  return instants.length > 1 ? Math.min(...instants) : undefined;
}

// Give floating/all-day dates an explicit source timezone before parsing.
// Otherwise their meaning depends on the sync machine's local timezone.
function prepareCalendar(content, timezone) {
  const unfolded = content.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  if (!/^BEGIN:VCALENDAR\s*$/m.test(unfolded) || !/^END:VCALENDAR\s*$/m.test(unfolded)) throw new Error('Invalid iCalendar envelope');
  if ((unfolded.match(/^BEGIN:VEVENT$/gm) ?? []).length !== (unfolded.match(/^END:VEVENT$/gm) ?? []).length) throw new Error('Incomplete calendar event');
  const aliases = new Map();
  for (const [, definition] of unfolded.matchAll(/BEGIN:VTIMEZONE\n([\s\S]*?)\nEND:VTIMEZONE/g)) {
    const id = definition.match(/^TZID:(.+)$/m)?.[1]?.trim();
    const location = definition.match(/^X-LIC-LOCATION:(.+)$/m)?.[1]?.trim();
    if (id && location) aliases.set(id, validTimezone(location));
  }
  const zones = new Map();
  const resolveZone = (zone) => {
    if (zones.has(zone)) return zones.get(zone);
    let resolved = aliases.get(zone) ?? zone;
    try { validTimezone(resolved); } catch {
      // The pinned parser supports Windows/legacy labels. Resolve their name
      // before parsing dates so no host-local timestamp fallback can escape.
      // Arbitrary custom observance rules need a reliable IANA location first.
      if (/customized|tzone:|no TZ description/i.test(resolved)) throw new Error('Unsupported custom timezone; source requires review');
      const probe = ical.sync.parseICS(`BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:zone-probe\nDTSTART;TZID="${resolved}":20260101T120000\nEND:VEVENT\nEND:VCALENDAR`);
      resolved = validTimezone(probe['zone-probe']?.start?.tz || resolved);
    }
    zones.set(zone, resolved);
    return resolved;
  };
  timezone = resolveZone(unfolded.match(/^X-WR-TIMEZONE:(.+)$/m)?.[1]?.trim() || timezone);
  return unfolded.replace(/BEGIN:VEVENT\n([\s\S]*?)\nEND:VEVENT/g, (block, fields) => {
    let lines = fields.split('\n');
    if (!lines.some((line) => /^DTSTART[:;]/.test(line))) {
      const recurrence = lines.find((line) => /^RECURRENCE-ID[:;]/.test(line));
      if (recurrence && lines.some((line) => /^STATUS(?:;[^:]*)?:CANCELLED$/i.test(line.trim()))) lines.push(recurrence.replace('RECURRENCE-ID', 'DTSTART'));
    }
    if (lines.some((line) => /^(DTEND|DURATION)[:;]/.test(line))) lines.push('X-ONTO-END-KNOWN:1');
    const dayStart = lines.find((line) => /^DTSTART;(?:[^:;]+;)*VALUE=DATE(?:;[^:;]+)*:/i.test(line))?.split(':')[1];
    const dayEnd = lines.find((line) => /^DTEND;(?:[^:;]+;)*VALUE=DATE(?:;[^:;]+)*:/i.test(line))?.split(':')[1];
    if (dayStart) {
      const duration = lines.find((line) => /^DURATION:/.test(line))?.slice(9);
      const parts = duration?.match(/^\+?P(\d+)([DW])$/);
      if (duration && !parts) throw new Error('Unsupported all-day duration');
      const dayDiff = dayEnd ? (Date.parse(`${dayEnd.slice(0, 4)}-${dayEnd.slice(4, 6)}-${dayEnd.slice(6, 8)}`)
        - Date.parse(`${dayStart.slice(0, 4)}-${dayStart.slice(4, 6)}-${dayStart.slice(6, 8)}`)) / DAY : NaN;
      // CivicPlus city calendars (South Salt Lake, Murray, Millcreek, West Valley)
      // publish a same-day DTEND for one-day all-day events, treating the end as
      // inclusive where RFC 5545 makes it exclusive. Read that as one day; an end
      // before the start is still a broken record.
      const span = dayEnd ? (dayDiff === 0 ? 1 : dayDiff) : parts ? +parts[1] * (parts[2] === 'W' ? 7 : 1) : 1;
      if (!Number.isInteger(span) || span < 1) throw new Error('Invalid all-day duration');
      lines.push(`X-ONTO-ALLDAY-SPAN:${span}`);
    }
    const recurring = lines.some((line) => line.startsWith('RRULE:'));
    lines = lines.flatMap((line) => {
      if (line.startsWith('RRULE:')) return line.replace(/UNTIL=(\d{8})(?=;|$)/, (_, day) => `UNTIL=${new Date(+localMidnight(addDays(day, 1), timezone) - 1).toISOString().replace(/[-:]/g, '').replace('.999', '')}`);
      const match = line.match(/^(DTSTART|DTEND|EXDATE|RECURRENCE-ID)((?:[^:"]|"[^"]*")*):(.*)$/);
      if (!match) return line;
      const [, property, params, values] = match;
      const zoneParts = params.match(/TZID=(?:"([^"]+)"|([^;]+))/i);
      const zone = zoneParts?.[1] ?? zoneParts?.[2];
      const resolvedZone = zone ? resolveZone(zone) : undefined;
      if (/^\d{8}(,\d{8})*$/.test(values)) {
        return `${property};TZID=${timezone}:${values.split(',').map((value) => `${value}T000000`).join(',')}`;
      }
      const zonedProperty = zone ? `${property}${params.replace(/TZID=(?:"[^"]*"|[^;:]+)/i, `TZID=${resolvedZone}`)}` : `${property};TZID=${timezone}`;
      if (!/^\d{8}T\d{6}(,\d{8}T\d{6})*$/.test(values)) return zone ? `${zonedProperty}:${values}` : line;
      const localZone = resolvedZone ?? timezone;
      const zoned = [];
      const explicit = [];
      for (const value of values.split(',')) {
        const first = firstOfRepeatedTime(value, localZone);
        if (first === undefined) zoned.push(value);
        else explicit.push(new Date(first).toISOString().replace(/[-:]/g, '').replace('.000', ''));
      }
      if (!explicit.length) return `${zonedProperty}:${values}`;
      // A series must be seeded with its zone to expand across DST, and the
      // parser cannot seed one at the first of two identical local times.
      if (property === 'DTSTART' && recurring) throw new Error('Recurring event starts at a repeated local time; source requires review');
      // Name the first instant in UTC; a start keeps its zone for the record.
      return [
        ...(zoned.length ? [`${zonedProperty}:${zoned.join(',')}`] : []),
        `${property}${params.replace(/;TZID=(?:"[^"]*"|[^;:]+)/i, '')}:${explicit.join(',')}`,
        ...(property === 'DTSTART' ? [`X-ONTO-TZID:${localZone}`] : []),
      ];
    });
    return `BEGIN:VEVENT\n${lines.join('\n')}\nEND:VEVENT`;
  });
}

// CivicPlus and Trumba wrap venue names in markup (<p>Name</p>, <br>, &amp;).
// Venue aliases are plain text, so decode before matching; an unknown entity
// fails the source for review exactly as it does for feed descriptions.
const locationText = (value) => /<[a-z!/]|&#?[a-z0-9]+;/i.test(value) ? htmlText(value) : value;

const privateClass = (value) => ['PRIVATE', 'CONFIDENTIAL'].includes(text(value).trim().toUpperCase());

function formatResponseError(response) {
  const details = ERROR_HEADERS.flatMap((name) => {
    const value = response?.headers?.get?.(name);
    if (typeof value !== 'string' || !value.trim()) return [];
    const compact = value.replace(/\s+/g, ' ').trim().slice(0, 120);
    return `${name}=${compact}`;
  });
  return details.length
    ? `Calendar request failed (${response.status}; ${details.join(', ')})`
    : `Calendar request failed (${response.status})`;
}

function occurrenceData(instance, event, timezone) {
  const data = { ...event, ...instance.event };
  const owner = instance.isOverride ? instance.event : event;
  const zone = instance.start.tz && !['Etc/UTC', 'UTC'].includes(instance.start.tz) ? instance.start.tz : text(owner['ONTO-TZID']) || timezone;
  const span = Number(instance.isOverride ? instance.event['ONTO-ALLDAY-SPAN'] : event['ONTO-ALLDAY-SPAN']);
  const end = span ? localMidnight(addDays(localDate(instance.start, zone), span), zone)
    : instance.isOverride && !instance.event['ONTO-END-KNOWN'] && event['ONTO-END-KNOWN']
      ? new Date(+instance.start + (+event.end - +event.start)) : instance.end;
  return { data, zone, end: data['ONTO-END-KNOWN'] || span ? end : undefined };
}

function parseCalendar(content, { now, timezone, exportLimit }) {
  const events = ical.sync.parseICS(prepareCalendar(content, timezone));
  const horizon = now + HORIZON_DAYS * DAY;
  const items = [];
  let safeHorizon = horizon;
  const diagnostics = {};
  // Some plugins export a fixed number of upcoming events (Events Manager 50,
  // The Events Calendar 30). A full export says nothing past its last start,
  // so rows beyond it must not be retired.
  const masters = Object.values(events).filter((event) => event.type === 'VEVENT' && event.start instanceof Date);
  if (exportLimit && masters.length >= exportLimit) {
    diagnostics['export limit reached'] = masters.length;
    safeHorizon = Math.min(safeHorizon, Math.max(...masters.map((event) => +event.start)));
  }
  for (const event of Object.values(events)) {
    if (event.type !== 'VEVENT') continue;
    if (privateClass(event.class)) { diagnostics['private event'] = (diagnostics['private event'] ?? 0) + 1; continue; }
    if (!event.uid || !(event.start instanceof Date) || !Number.isFinite(+event.start)) throw new Error('Calendar event missing UID or DTSTART');
    if (event.rrule) {
      const rule = event.rrule.toString().split('\n').find((line) => line.startsWith('RRULE:'))?.slice(6);
      // Public Google, Joomla and congregation calendars carry WKST on every rule,
      // monthly services by BYMONTHDAY or BYSETPOS, and yearly observances by
      // BYMONTH; the pinned parser expands all of them deterministically.
      if (!rule || !/(?:^|;)FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;|$)/.test(rule)
          || rule.split(';').some((part) => !/^(FREQ|INTERVAL|BYDAY|BYMONTH|BYMONTHDAY|BYSETPOS|COUNT|UNTIL|WKST)=/.test(part))) throw new Error('Unsupported recurrence rule; source requires review');
    }
    const instances = ical.expandRecurringEvent(event, { from: new Date(now - DAY), to: new Date(horizon), expandOngoing: true });
    const inRange = instances.filter((item) => {
      const { end } = occurrenceData(item, event, timezone);
      return +item.start < horizon && (end ? +end : +item.start + 3 * 3600000) > now;
    });
    if (inRange.length > MAX_INSTANCES) {
      diagnostics['recurrence cap'] = (diagnostics['recurrence cap'] ?? 0) + inRange.length - MAX_INSTANCES;
      safeHorizon = Math.min(safeHorizon, +inRange[MAX_INSTANCES - 1].start);
    }
    for (const instance of inRange.slice(0, MAX_INSTANCES)) {
      const { data, zone, end } = occurrenceData(instance, event, timezone);
      if (privateClass(data.class)) { diagnostics['private event'] = (diagnostics['private event'] ?? 0) + 1; continue; }
      items.push({
        uid: event.uid, title: text(data.summary), description: text(data.description),
        location: locationText(text(data.location)), geo: data.geo, url: text(data.url), timezone: zone,
        start: instance.start.toISOString(),
        ...(end ? { end: end.toISOString() } : {}),
        occurrence: instance.isRecurring ? (data.recurrenceid ?? instance.start).toISOString() : undefined,
        cancelled: text(data.status).toUpperCase() === 'CANCELLED',
      });
    }
  }
  return { items, truncated: true, horizon: new Date(safeHorizon).toISOString(), diagnostics };
}

function createIcsAdapter(feed, venues) {
  const parse = (content, context) => {
    const snapshot = parseCalendar(content, { ...context, timezone: feed.timezone, exportLimit: feed.exportLimit });
    // A rolling/capped subscription cannot prove that an absent event vanished.
    return feed.retireMissing === false ? { ...snapshot, retireMissing: false } : snapshot;
  };
  return {
    sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [], maxCardsPerTitle: Infinity, weakDedupe: false,
    idPrefix: `ics-${feed.id}-`,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: parse,
    fetch: async ({ fetchImpl, now }) => {
      const response = await fetchImpl(feed.url, { minIntervalMs: feed.minIntervalMs, timeoutMs: feed.timeoutMs });
      if (!response.ok) throw new Error(formatResponseError(response));
      return parse(await response.text(), { now });
    },
    normalize: (event, context) => calendarRecord(event, { ...context, feed, venues }),
  };
}

module.exports = { createIcsAdapter, parseCalendar, prepareCalendar, addDays, localDate, localMidnight, localTime, HORIZON_DAYS, MAX_INSTANCES };
