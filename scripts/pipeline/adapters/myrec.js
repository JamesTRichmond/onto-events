const path = require('node:path');
const { URL } = require('node:url');
const { htmlText } = require('../feed-text');
const { calendarRecord, venueKey, isOnlineEvent } = require('../calendar-record');
const { localTime, HORIZON_DAYS } = require('./ics');

const MAX_PROGRAMS = 40;
const MAX_ACTIVITIES = 160;
const MAX_SESSIONS = 1000;
const NON_ACTIVITY = /\b(?:donations?|fund|project|membership|registration)\b/i;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function publicUrl(value, base, route, keys) {
  const registered = new URL(base);
  if (registered.protocol !== 'https:' || registered.username || registered.password || registered.port
      || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myrec\.com$/.test(registered.hostname)) throw new Error('Unsafe MyRec registered origin');
  const url = new URL(value.replaceAll('&amp;', '&'), base);
  if (url.origin !== registered.origin || url.pathname !== `/info/${route}.aspx` || url.username || url.password || url.hash
      || [...url.searchParams.keys()].some((key) => !keys.includes(key))
      || keys.some((key) => url.searchParams.getAll(key).length !== 1
        || (key === 'type' ? url.searchParams.get(key) !== 'activities' : !/^\d{1,10}$/.test(url.searchParams.get(key))))) throw new Error('Unsafe MyRec public listing link');
  return url.href;
}

function boundedHtml(html) {
  if (typeof html !== 'string' || html.length > 2 * 1024 * 1024) throw new Error('Invalid or oversized MyRec public page');
  return html;
}

function tableRows(html) {
  if ((boundedHtml(html).match(/id="no-more-tables"/g) ?? []).length !== 1) throw new Error('MyRec public activity table is ambiguous');
  const table = boundedHtml(html).match(/<table\b[^>]*id="no-more-tables"[^>]*>([\s\S]*?)<\/table>/);
  if (!table) throw new Error('MyRec public activity table is missing');
  const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)];
  if (rows.length !== (table[1].match(/<tr\b/g) ?? []).length) throw new Error('MyRec activity rows are incomplete');
  return rows.map((match) => {
    const cells = {};
    for (const [, key, value] of match[1].matchAll(/<td\b[^>]*data-title="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)) {
      if (Object.hasOwn(cells, key)) throw new Error('Duplicate MyRec activity field');
      cells[key] = value;
    }
    Object.defineProperties(cells, {
      sourceText: { value: htmlText(match[1]) },
      isNotes: { value: /<tr\b[^>]*class="notes\b/.test(match[0]) },
    });
    return cells;
  });
}

function programDescription(html) {
  const open = /<div class="program-description">/.exec(html);
  if (!open || (html.match(/<div class="program-description">/g) ?? []).length !== 1) throw new Error('MyRec program description is missing or ambiguous');
  const start = open.index + open[0].length;
  let depth = 1;
  for (const tag of html.slice(start).matchAll(/<(\/?)[dD][iI][vV]\b[^>]{0,4096}>/g)) {
    depth += tag[1] ? -1 : 1;
    if (!depth) return htmlText(html.slice(start, start + tag.index));
  }
  throw new Error('MyRec program description is incomplete');
}

function parseDirectory(html, feed) {
  const programs = new Map();
  const categories = new Set();
  const blocks = [...boundedHtml(html).matchAll(/<div class="category">([\s\S]*?)<\/ul>/g)];
  if (!blocks.length || blocks.length !== (html.match(/<div class="category">/g) ?? []).length) throw new Error('MyRec program directory is incomplete');
  for (const [, block] of blocks) {
    const heading = block.match(/<div class="category-name">\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!heading) throw new Error('MyRec program category is missing');
    publicUrl(heading[1], feed.url, 'activities/default', ['CategoryID', 'type']);
    const category = htmlText(heading[2]);
    if (!Object.hasOwn(feed.programCategories, category)) continue;
    if (categories.has(category)) throw new Error('Duplicate MyRec program category');
    categories.add(category);
    const links = [...block.matchAll(/<li>\s*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/g)];
    if (links.length !== (block.match(/<li>/g) ?? []).length) throw new Error('MyRec public program links are incomplete');
    for (const [, href, titleHtml] of links) {
      const url = publicUrl(href, feed.url, 'activities/program_details', ['ProgramID']);
      const title = htmlText(titleHtml);
      if (NON_ACTIVITY.test(title)) continue;
      const id = new URL(url).searchParams.get('ProgramID');
      const existing = programs.get(id);
      if (existing && (existing.title !== title || existing.category !== feed.programCategories[category])) throw new Error('Conflicting MyRec program identity');
      programs.set(id, { id, url, title, category: feed.programCategories[category] });
    }
  }
  if (categories.size !== Object.keys(feed.programCategories).length || !programs.size || programs.size > MAX_PROGRAMS) throw new Error('MyRec reviewed directory scope is missing or exceeds its limit');
  if (feed.allowedWeekdaysByProgram !== undefined && (!feed.allowedWeekdaysByProgram || typeof feed.allowedWeekdaysByProgram !== 'object'
      || Array.isArray(feed.allowedWeekdaysByProgram) || !Object.keys(feed.allowedWeekdaysByProgram).length
      || Object.keys(feed.allowedWeekdaysByProgram).length > MAX_PROGRAMS
      || Object.entries(feed.allowedWeekdaysByProgram).some(([id, weekdays]) => !programs.has(id) || !feed.programIds?.includes(id)
        || !Array.isArray(weekdays) || !weekdays.length || weekdays.length > 7 || new Set(weekdays).size !== weekdays.length
        || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6)))) throw new Error('MyRec reviewed program weekdays are invalid');
  if (feed.programIds !== undefined) {
    if (!Array.isArray(feed.programIds) || !feed.programIds.length || feed.programIds.length > MAX_PROGRAMS
        || new Set(feed.programIds).size !== feed.programIds.length
        || feed.programIds.some((id) => typeof id !== 'string' || !/^\d{1,10}$/.test(id) || !programs.has(id))) throw new Error('MyRec reviewed program scope is missing or invalid');
    return [...programs.values()].filter((program) => feed.programIds.includes(program.id));
  }
  return [...programs.values()];
}

function parseProgram(html, program) {
  const origin = new URL(publicUrl(program.url, program.url, 'activities/program_details', ['ProgramID'])).origin;
  const title = boundedHtml(html).match(/<span id="Content_lblProgramName">([\s\S]*?)<\/span>/);
  const description = programDescription(html);
  if (!title || htmlText(title[1]) !== program.title) throw new Error('MyRec program identity changed');
  const activities = [];
  const seen = new Set();
  for (const row of tableRows(html)) {
    if (row.isNotes) {
      if (!activities.length) throw new Error('MyRec activity notes lost their owner');
      activities.at(-1).description += ` ${row.sourceText}`;
      continue;
    }
    if (!Object.keys(row).length) continue;
    if (!row.Activity) throw new Error('MyRec activity row lost its title field');
    const title = row.Activity.match(/<b\b[^>]*>([\s\S]*?)<\/b>/);
    const dates = row['Date/Time']?.match(/href="javascript:\s*EventDates\((\d{1,10}),(\d{1,10}),(\d{1,10})\)"/);
    const location = row['Date/Time']?.match(/<a\b[^>]*href="\/info\/facilities\/details\.aspx\?ActivityID=(\d{1,10})"[^>]*>([\s\S]*?)<\/a>/);
    const locations = row['Date/Time']?.match(/href="javascript:\s*EventLocations\((\d{1,10}),(\d{1,10}),(\d{1,10})\);?"/);
    if (!title || !dates || dates[1] !== program.id || location && locations
        || (location ? location[1] !== dates[3] : !locations || locations.slice(1).some((id, index) => id !== dates[index + 1]))
        || typeof row.Ages !== 'string' || typeof row.Fees !== 'string' || seen.has(dates[3])) throw new Error('MyRec activity identity or public venue is missing');
    seen.add(dates[3]);
    const url = `${origin}/info/popups/activity_dates.aspx?ProgramID=${dates[1]}&EventID=${dates[2]}&ActivityID=${dates[3]}`;
    activities.push({ id: dates[3], program, title: htmlText(title[1]), url,
      location: location ? htmlText(location[2]) : null, locationsFromSchedule: !!locations,
      age: htmlText(row.Ages), fees: htmlText(row.Fees),
      // Complete publisher prose remains rating/access evidence, never copied
      // to the public card as instructor biographies or contact details.
      description: `${description} ${row.sourceText}`,
      cancelled: /\b(?:canceled|cancelled)\b/i.test(htmlText(row.Activity + (row.Register ?? ''))) });
  }
  if (!activities.length) throw new Error('MyRec program has no recognized activity rows');
  return activities;
}

function scheduleDate(value) {
  const match = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) ([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[2]) + 1 : 0;
  if (!match || !month) throw new Error('MyRec session date is missing');
  const day = `${match[4]}${String(month).padStart(2, '0')}${match[3].padStart(2, '0')}`;
  const parsed = new Date(Date.UTC(+match[4], month - 1, +match[3]));
  if (parsed.toISOString().slice(0, 10).replaceAll('-', '') !== day
      || new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(parsed) !== match[1]) throw new Error('Invalid MyRec session date');
  return day;
}

function clock(value) {
  const match = /^(\d{1,2}):([0-5]\d) (AM|PM)$/.exec(value);
  if (!match || +match[1] < 1 || +match[1] > 12) throw new Error('MyRec session needs explicit clock times');
  return `${String(+match[1] % 12 + (match[3] === 'PM' ? 12 : 0)).padStart(2, '0')}${match[2]}00`;
}

function instant(day, time, timezone) {
  const value = +localTime(day, time, timezone);
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const wall = (probe) => {
    const fields = Object.fromEntries(format.formatToParts(new Date(probe)).map(({ type, value }) => [type, value]));
    return `${fields.year}${fields.month}${fields.day}T${fields.hour}${fields.minute}${fields.second}`;
  };
  const expected = `${day}T${time}`;
  if (!Number.isFinite(value) || wall(value) !== expected || wall(value - 3600000) === expected || wall(value + 3600000) === expected) throw new Error('Ambiguous or nonexistent MyRec wall-clock time');
  return new Date(value).toISOString();
}

function parseSchedule(html, activity, feed, now) {
  const heading = boundedHtml(html).match(/<span id="Content_lblEventName">([\s\S]*?)<\/span>/);
  const headingText = heading && htmlText(heading[1]);
  const headingTitle = headingText === activity.title ? headingText : headingText?.replace(/\s*\([^()]+\)$/, '');
  if (headingTitle !== activity.title) throw new Error('MyRec session heading disagrees with its activity');
  const cancelled = html.match(/<span id="Content_lblActivityCanceled">([\s\S]*?)<\/span>/);
  if (cancelled && htmlText(cancelled[1]) === 'This activity is canceled.') {
    // The publisher removes the dates on cancellation. A complete source
    // snapshot may retire previously stored sessions; no dates are invented.
    return { items: [], cancelledWithoutDates: true };
  }
  const items = [];
  let excludedDates = 0;
  let outsideWeekdays = 0;
  const seen = new Set();
  const horizon = now + HORIZON_DAYS * 86400000;
  for (const row of tableRows(html)) {
    if (!Object.keys(row).length) continue;
    if (Object.keys(row).length !== 3 || !row.Date || !row.Times || !row.Location) throw new Error('MyRec session table is incomplete');
    const day = scheduleDate(htmlText(row.Date));
    const times = htmlText(row.Times).split(/\s*-\s*/);
    if (times.length !== 2 || seen.has(day)) throw new Error('Ambiguous MyRec session slot');
    seen.add(day);
    const start = instant(day, clock(times[0]), feed.timezone);
    const end = instant(day, clock(times[1]), feed.timezone);
    const location = htmlText(row.Location);
    if (Date.parse(end) <= Date.parse(start)) throw new Error('MyRec session time or venue disagrees');
    if (location === 'Exclusion Date') { excludedDates++; continue; }
    if (!location || !activity.locationsFromSchedule && venueKey(location) !== venueKey(activity.location)) throw new Error('MyRec session time or venue disagrees');
    const weekdays = feed.allowedWeekdaysByProgram?.[activity.program.id];
    const weekday = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`).getUTCDay();
    if (weekdays && !weekdays.includes(weekday)) { outsideWeekdays++; continue; }
    if (Date.parse(start) < now || Date.parse(start) >= horizon) continue;
    const prices = /^\$(\d+(?:\.\d{2})?) Res, \$(\d+(?:\.\d{2})?) Non-Res$/.exec(activity.fees);
    // Memory Tree signup buys an honoree's name, not admission to the event.
    const positivePerVisitPrice = /\$\s*(?:\d*[1-9]\d*(?:\.\d{1,2})?|0?\.\d*[1-9]\d*)\s*(?:per\s+(?:person|visit|ticket)|\/\s*person|at\s+(?:the\s+)?door)\b/i.test(activity.description);
    const admission = prices && !/\b(?:honorees?|donations?|fundraising|per name)\b/i.test(activity.description)
      && !(+prices[1] === 0 && +prices[2] === 0 && positivePerVisitPrice)
      ? +prices[1] === 0 && +prices[2] === 0 ? 'free' : +prices[1] > 0 && +prices[2] > 0 ? 'paid' : null : null;
    const genericSession = /^(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+)?Sessions?\b/i.test(activity.title);
    const programLabel = genericSession && !activity.title.toLowerCase().includes(activity.program.title.toLowerCase()) ? `${activity.program.title}: ` : '';
    const displayDescription = `${programLabel}${activity.title}. ${activity.age !== 'N/A' ? `Ages ${activity.age}. ` : ''}See the publisher for registration, fees and current details. Map point is approximate.`;
    const minimumAge = /^(\d{1,3})y(?:\s*-\s*\d{1,3}y|\s+and up)$/.exec(activity.age);
    const ageNote = minimumAge && +minimumAge[1] >= 18 ? `Age restricted. Publisher ages: ${activity.age}.` : undefined;
    items.push({ uid: `activity-${activity.id}`, occurrence: day, title: activity.title, location,
      start, end, timezone: feed.timezone, url: `${activity.program.url}#${activity.id}`,
      category: activity.program.category, description: `${activity.description} ${activity.title} Ages: ${activity.age}`,
      displayDescription, ...(ageNote ? { ageNote } : {}), cancelled: activity.cancelled,
      ...(admission ? { eventFacts: { admission: { value: admission, sourceUrl: activity.program.url,
        excerpt: activity.fees, checkedOn: new Date(now).toISOString().slice(0, 10) } } } : {}) });
  }
  if (!seen.size || seen.size > MAX_SESSIONS) throw new Error('MyRec schedule is empty or exceeds its limit');
  return { items, cancelledWithoutDates: false, ...(excludedDates ? { excludedDates } : {}), ...(outsideWeekdays ? { outsideWeekdays } : {}) };
}

function* collectPages({ feed, now }) {
  const url = publicUrl(feed.url, feed.url, 'activities/default', ['type']);
  if (new URL(url).searchParams.get('type') !== 'activities') throw new Error('MyRec needs the public programs directory');
  const programs = parseDirectory((yield url), feed);
  const items = [];
  const diagnostics = {};
  const ids = new Set();
  for (const program of programs) {
    for (const activity of parseProgram((yield program.url), program)) {
      if (ids.has(activity.id) || ids.size >= MAX_ACTIVITIES) throw new Error('MyRec activity identity or request limit changed');
      ids.add(activity.id);
      const schedule = parseSchedule((yield activity.url), activity, feed, now);
      if (schedule.cancelledWithoutDates) diagnostics['cancelled activity without dates'] = (diagnostics['cancelled activity without dates'] ?? 0) + 1;
      if (schedule.excludedDates) diagnostics['excluded schedule dates'] = (diagnostics['excluded schedule dates'] ?? 0) + schedule.excludedDates;
      if (schedule.outsideWeekdays) diagnostics['outside reviewed program weekdays'] = (diagnostics['outside reviewed program weekdays'] ?? 0) + schedule.outsideWeekdays;
      items.push(...schedule.items);
      if (items.length > MAX_SESSIONS) throw new Error('MyRec source session limit reached');
    }
  }
  return { items, truncated: true, horizon: new Date(now + HORIZON_DAYS * 86400000).toISOString(), diagnostics };
}

function createMyrecAdapter(feed, venues) {
  return { sourceName: feed.name, sourceKind: feed.sourceKind, requiredSecrets: [],
    idPrefix: `myrec-${feed.id}-`, maxCardsPerTitle: Infinity, weakDedupe: false,
    fixturePath: path.resolve(__dirname, '../../..', feed.fixturePath),
    parseFixture: (content, { now }) => {
      const fixture = JSON.parse(content);
      const requests = collectPages({ feed, now });
      let step = requests.next();
      while (!step.done) {
        const html = fixture.pages?.[step.value];
        if (typeof html !== 'string') throw new Error('Missing MyRec fixture page');
        step = requests.next(html);
      }
      return step.value;
    },
    fetch: async ({ fetchImpl, now }) => {
      const requests = collectPages({ feed, now });
      let step = requests.next();
      while (!step.done) {
        const response = await fetchImpl(step.value, { minIntervalMs: Math.max(1000, feed.minIntervalMs ?? 1000), timeoutMs: feed.timeoutMs });
        if (!response.ok) throw new Error(`MyRec public program request failed (${response.status})`);
        step = requests.next(await response.text());
      }
      return step.value;
    },
    normalize: (event, context) => {
      if (isOnlineEvent(event.title, event.description)) { context.skip?.('online event'); return null; }
      const record = calendarRecord(event, { ...context, feed, venues });
      return record ? { ...record, ...(event.eventFacts ? { eventFacts: event.eventFacts } : {}) } : null;
    },
  };
}

module.exports = { createMyrecAdapter, parseDirectory, parseProgram, parseSchedule, publicUrl };
