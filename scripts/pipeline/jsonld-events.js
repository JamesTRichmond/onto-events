const { addDays, localDate, localMidnight, localTime } = require('./adapters/ics');
const { safeHtmlText } = require('./feed-text');

// schema.org Event and its subtypes, as publishers mark up event pages.
const EVENT_TYPE = /^(?:https?:\/\/schema\.org\/)?(?:Event|BusinessEvent|ChildrensEvent|ComedyEvent|DanceEvent|EducationEvent|ExhibitionEvent|Festival|FoodEvent|LiteraryEvent|MusicEvent|SaleEvent|ScreeningEvent|SocialEvent|SportsEvent|TheaterEvent|VisualArtsEvent)$/;
const MAX_BLOCKS = 20;
const MAX_BLOCK_CHARS = 200000;

// Every application/ld+json block on a page, parsed. A malformed or oversized
// block is skipped; the page's other blocks still count.
function jsonLdBlocks(html) {
  const blocks = [];
  for (const match of String(html ?? '').matchAll(/<script\b[^>]{0,300}?type\s*=\s*["']application\/ld\+json["'][^>]{0,300}>([\s\S]*?)<\/script\s*>/gi)) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (match[1].length > MAX_BLOCK_CHARS) continue;
    try { blocks.push(JSON.parse(match[1])); } catch { /* not JSON; ignore this block */ }
  }
  return blocks;
}

// Event nodes may sit in a block, an array, a @graph, or under a venue's own
// `event` list (DICE's venue pages) or an event's `subEvent`s.
function nodes(value, out = [], depth = 0) {
  if (depth > 5 || out.length > 500) return out;
  if (Array.isArray(value)) for (const item of value) nodes(item, out, depth + 1);
  else if (value && typeof value === 'object') {
    out.push(value);
    for (const key of ['@graph', 'event', 'events', 'subEvent']) if (value[key] && typeof value[key] === 'object') nodes(value[key], out, depth + 1);
  }
  return out;
}

const isEventNode = (node) => [node['@type']].flat().some((type) => typeof type === 'string' && EVENT_TYPE.test(type));

function jsonLdEvents(html) {
  return jsonLdBlocks(html).flatMap((block) => nodes(block)).filter(isEventNode);
}

// An ISO date-time with an offset ("2026-10-10T19:30:00-0400" or "-04:00"),
// a wall time in the feed's zone, or a date alone (an all-day listing). A
// field out of range (WordPress writes "0000-00-00") is no date at all: the
// event is reported, never the whole page.
function validFields(year, month, day, hour = 0, minute = 0, second = 0) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= days
    && hour <= 23 && minute <= 59 && second <= 59;
}

function wallInstant(date, time, timezone) {
  try {
    const instant = +localTime(date, time, timezone);
    return Number.isFinite(instant) ? instant : null;
  } catch { return null; }
}

function jsonLdInstant(value, timezone) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (day) {
    if (!validFields(+day[1], +day[2], +day[3])) return null;
    const instant = wallInstant(`${day[1]}${day[2]}${day[3]}`, '000000', timezone);
    return instant === null ? null : { instant, allDay: true };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!match) return null;
  const [, year, month, date, hour, minute, second = '00', zone] = match;
  if (!validFields(+year, +month, +date, +hour, +minute, +second)) return null;
  if (!zone) {
    const instant = wallInstant(`${year}${month}${date}`, `${hour}${minute}${second}`, timezone);
    return instant === null ? null : { instant, allDay: false };
  }
  const offset = zone === 'Z' ? 'Z' : `${zone.slice(0, 3)}:${zone.slice(-2)}`;
  const instant = Date.parse(`${year}-${month}-${date}T${hour}:${minute}:${second}${offset}`);
  return Number.isFinite(instant) ? { instant, allDay: false } : null;
}

// Where an event ends. A date names a whole local day, so a date-only end
// runs to the next local midnight after it (whatever the DST change); a
// timed end after the start is kept even when the start is a date.
function jsonLdEnd(start, ending, timezone) {
  const afterDay = (instant) => +localMidnight(addDays(localDate(instant, timezone), 1), timezone);
  if (ending?.allDay) {
    const through = afterDay(ending.instant);
    if (through > start.instant) return through;
  } else if (ending && ending.instant > start.instant) return ending.instant;
  return start.allDay ? afterDay(start.instant) : undefined;
}

// Publishers entity-encode names in JSON-LD ("Shakey&#39;s"); read them as text.
const plain = (value) => typeof value === 'string' ? safeHtmlText(value).replace(/\s+/g, ' ').trim() : '';

function addressText(address) {
  if (typeof address === 'string') return address.split(/\s*\n\s*/).map(plain).filter(Boolean).join(', ');
  if (!address || typeof address !== 'object') return '';
  return [address.streetAddress, address.addressLocality, [address.addressRegion, address.postalCode].map(plain).filter(Boolean).join(' ')]
    .map(plain).filter(Boolean).join(', ');
}

// The place an event names: its own name when it gives one, else its address.
function jsonLdPlace(location) {
  const place = [location].flat().find((item) => item && (typeof item === 'string' || typeof item === 'object'));
  if (typeof place === 'string') return { name: plain(place), address: '' };
  if (!place) return { name: '', address: '' };
  if (/VirtualLocation$/.test(String(place['@type'] ?? ''))) return { name: '', address: '', online: true };
  return { name: plain(place.name), address: addressText(place.address) };
}

const isCancelledStatus = (status) => /EventCancelled$/.test(String(status?.['@id'] ?? status ?? ''));

module.exports = { jsonLdBlocks, jsonLdEvents, jsonLdInstant, jsonLdEnd, jsonLdPlace, isCancelledStatus };
