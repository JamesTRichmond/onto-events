const { safeHtmlText } = require('../feed-text');
const { localTime } = require('./ics');

// Publisher-specific opt-in: Paramount marks shows all-day but begins the
// description with a stand-alone clock. Read that bounded first paragraph,
// never a later doors/seating time or an arbitrary time in a show biography.
function leadingClock(description) {
  if (typeof description !== 'string') return null;
  const paragraph = /^\s{0,128}<p>([\s\S]{1,1024}?)<\/p>/i.exec(description.slice(0, 1160));
  if (!paragraph) return null;
  const lines = paragraph[1].split(/<br\s*\/?>/i).map((line) => {
    const allowed = line.replace(/<\/?(?:strong|b|em)>/gi, '');
    return /[<>]/.test(allowed) ? null : safeHtmlText(allowed);
  });
  if (lines.some((line) => line === null)) return null;
  const clock = /^(1[0-2]|[1-9])(?::([0-5]\d))?\s*([AP])M$/i.exec(lines[0]);
  if (!clock) return null;
  // Other clocks in the bounded opening header must be labeled logistics.
  // A second stand-alone show time or contradictory show-start field fails,
  // whether separated by a line break or a later header paragraph. Stop at
  // the publisher's horizontal rule, before the unrelated show biography.
  const logistics = (line) => !/\d\s*(?:[AP]M)\b/i.test(line)
    || /^(?:Lobby(?: doors)? (?:open|opens)|Seating begins|Check-in begins)\b/i.test(line);
  if (!lines.slice(1).every(logistics)) return null;
  const rest = description.slice(paragraph[0].length, 4096).split(/<hr\b/i)[0];
  for (const match of rest.matchAll(/<p>([\s\S]{1,1024}?)<\/p>/gi)) {
    if (!match[1].split(/<br\s*\/?>/i).map(safeHtmlText).every(logistics)) return null;
  }
  const hour = (+clock[1] % 12) + (clock[3].toUpperCase() === 'P' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}${clock[2] ?? '00'}00`;
}

function wallClock(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map((key) => parts.find((part) => part.type === key).value).join('');
}

function explicitFilmRating(description) {
  // The named HTML field is evidence; an artist called R, PG/PG-13 or a
  // discussion of ratings is not. Keep this private normalization signal
  // separate from the public content tier and never infer a Family rating.
  for (const match of description.slice(0, 8192).matchAll(/<p>([\s\S]{1,1024}?)<\/p>/gi)) {
    const rating = /^Rating:\s*(R|NC-17)\s*$/i.exec(safeHtmlText(match[1]));
    if (rating) return rating[1].toUpperCase();
  }
  return undefined;
}

function recoverLeadingTime(event, timezone) {
  if (event.all_day !== true || event.timezone !== timezone) return null;
  const date = /^(\d{4}-\d{2}-\d{2}) 00:00:00$/.exec(event.start_date)?.[1];
  if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return null;
  const time = leadingClock(event.description);
  if (!time || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(event.utc_start_date ?? '')) return null;
  try {
    const day = date.replace(/-/g, '');
    // Date-only UTC metadata must agree with the publisher's own local
    // midnight, including Eastern DST, before its date can anchor a clock.
    const published = Date.parse(`${event.utc_start_date.replace(' ', 'T')}Z`);
    if (published !== +localTime(day, '000000', timezone)) return null;
    const start = +localTime(day, time, timezone);
    const expected = `${day}${time}`;
    if (!Number.isFinite(start) || wallClock(start, timezone) !== expected) return null;
    // Repeated fall-back clocks have two possible instants. Do not guess
    // which show the publisher meant when no offset was published.
    for (const minutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
      if (wallClock(start + minutes * 60000, timezone) === expected) return null;
    }
    return { start };
  } catch {
    return null;
  }
}

module.exports = { recoverLeadingTime, explicitFilmRating };
