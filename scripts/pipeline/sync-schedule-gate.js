const fs = require('node:fs');

const EASTERN_TIME_ZONE = 'America/New_York';
const ANCHOR_EASTERN_DATE = '2026-10-24';
const TARGET_EASTERN_HOUR = 2;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const easternFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parseTimestamp(now = Date.now()) {
  if (now instanceof Date) {
    const ms = now.getTime();
    if (!Number.isFinite(ms)) throw new Error('Invalid Date passed to sync schedule gate');
    return ms;
  }
  if (typeof now === 'number') {
    if (!Number.isFinite(now)) throw new Error(`Invalid numeric timestamp: ${now}`);
    return now;
  }
  if (typeof now === 'string') {
    const ms = Date.parse(now);
    if (!Number.isFinite(ms)) throw new Error(`Invalid ISO timestamp: ${now}`);
    return ms;
  }
  throw new Error(`Unsupported timestamp value: ${String(now)}`);
}

function parseDateKeyToUtcMs(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey ?? '').trim());
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD date key: ${dateKey}`);
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const ms = Date.UTC(year, month - 1, day);
  const verify = new Date(ms);
  if (
    verify.getUTCFullYear() !== year ||
    verify.getUTCMonth() + 1 !== month ||
    verify.getUTCDate() !== day
  ) {
    throw new Error(`Out-of-range calendar date key: ${dateKey}`);
  }
  return ms;
}

function getEasternDateTimeParts(now = Date.now()) {
  const ms = parseTimestamp(now);
  const parts = {};
  for (const part of easternFormatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }
  const year = Number.parseInt(parts.year, 10);
  const month = Number.parseInt(parts.month, 10);
  const day = Number.parseInt(parts.day, 10);
  const hour = Number.parseInt(parts.hour, 10);
  const minute = Number.parseInt(parts.minute, 10);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateKey,
    year,
    month,
    day,
    hour,
    minute,
  };
}

function calendarDaysBetween(startDateKey, endDateKey) {
  const startMs = parseDateKeyToUtcMs(startDateKey);
  const endMs = parseDateKeyToUtcMs(endDateKey);
  return Math.round((endMs - startMs) / DAY_MS);
}

function deriveScheduledSlotTimestamp(now = Date.now(), scheduledCron = null) {
  const ms = parseTimestamp(now);
  if (!scheduledCron || typeof scheduledCron !== 'string') return ms;
  const match = /^\s*(\d+)\s+(\d+)\s+/.exec(scheduledCron.trim());
  if (!match) return ms;
  const targetMinute = Number.parseInt(match[1], 10);
  const targetHour = Number.parseInt(match[2], 10);
  if (!Number.isFinite(targetMinute) || !Number.isFinite(targetHour)) return ms;

  const nowDate = new Date(ms);
  const slotToday = Date.UTC(
    nowDate.getUTCFullYear(),
    nowDate.getUTCMonth(),
    nowDate.getUTCDate(),
    targetHour,
    targetMinute,
    0,
    0,
  );

  const diffMs = ms - slotToday;
  if (diffMs >= -300_000 && diffMs <= 86_400_000) {
    return slotToday;
  }
  if (diffMs < -300_000) {
    return slotToday - DAY_MS;
  }
  return slotToday;
}

function isTargetEasternHour(now = Date.now()) {
  const ms = parseTimestamp(now);
  const eastern = getEasternDateTimeParts(ms);
  if (eastern.hour === TARGET_EASTERN_HOUR) {
    return {
      matchesHour: true,
      dstSpringForwardFallback: false,
      eastern,
    };
  }
  // On the spring-forward DST transition Sunday in America/New_York, clocks jump
  // from 01:59:59 EST (06:59:59 UTC) directly to 03:00:00 EDT (07:00:00 UTC), so
  // local hour 02 never occurs on that date. Treat 03:00 EDT as the 2 a.m. slot
  // when 1 hour earlier on the same Eastern calendar date was 01:00 EST.
  if (eastern.hour === TARGET_EASTERN_HOUR + 1) {
    const previousHourEastern = getEasternDateTimeParts(ms - HOUR_MS);
    if (
      previousHourEastern.dateKey === eastern.dateKey &&
      previousHourEastern.hour === TARGET_EASTERN_HOUR - 1
    ) {
      return {
        matchesHour: true,
        dstSpringForwardFallback: true,
        eastern,
      };
    }
  }
  return {
    matchesHour: false,
    dstSpringForwardFallback: false,
    eastern,
  };
}

function evaluateSyncScheduleGate({
  eventName = process.env.GITHUB_EVENT_NAME || 'schedule',
  now = Date.now(),
  scheduledCron = process.env.GITHUB_EVENT_SCHEDULE || process.env.ONTO_SYNC_SCHEDULE_CRON || null,
  anchorEasternDate = ANCHOR_EASTERN_DATE,
} = {}) {
  const normalizedEventName = String(eventName || 'schedule').trim();
  const rawMs = parseTimestamp(now);
  const slotMs = deriveScheduledSlotTimestamp(rawMs, scheduledCron);
  const hourCheck = isTargetEasternHour(slotMs);
  const daysSinceAnchor = calendarDaysBetween(anchorEasternDate, hourCheck.eastern.dateKey);
  const isAlternatingDay = Math.abs(daysSinceAnchor) % 2 === 0;

  if (normalizedEventName === 'workflow_dispatch') {
    return {
      shouldRun: true,
      reason: 'Manual workflow_dispatch trigger always runs.',
      eventName: normalizedEventName,
      anchorEasternDate,
      easternDate: hourCheck.eastern.dateKey,
      easternHour: hourCheck.eastern.hour,
      daysSinceAnchor,
      isAlternatingDay,
      matchesHour: hourCheck.matchesHour,
      dstSpringForwardFallback: hourCheck.dstSpringForwardFallback,
    };
  }

  if (!hourCheck.matchesHour) {
    return {
      shouldRun: false,
      reason: `Skipping scheduled run: America/New_York local hour is ${String(hourCheck.eastern.hour).padStart(2, '0')}:00 on ${hourCheck.eastern.dateKey} (requires 02:00 Eastern).`,
      eventName: normalizedEventName,
      anchorEasternDate,
      easternDate: hourCheck.eastern.dateKey,
      easternHour: hourCheck.eastern.hour,
      daysSinceAnchor,
      isAlternatingDay,
      matchesHour: false,
      dstSpringForwardFallback: false,
    };
  }

  if (!isAlternatingDay) {
    return {
      shouldRun: false,
      reason: `Skipping scheduled run: ${hourCheck.eastern.dateKey} is day offset ${daysSinceAnchor} from anchor ${anchorEasternDate} (odd offset on every-other-day schedule).`,
      eventName: normalizedEventName,
      anchorEasternDate,
      easternDate: hourCheck.eastern.dateKey,
      easternHour: hourCheck.eastern.hour,
      daysSinceAnchor,
      isAlternatingDay: false,
      matchesHour: true,
      dstSpringForwardFallback: hourCheck.dstSpringForwardFallback,
    };
  }

  return {
    shouldRun: true,
    reason: `Running scheduled sync: ${hourCheck.eastern.dateKey} at ${String(hourCheck.eastern.hour).padStart(2, '0')}:00 America/New_York (day offset ${daysSinceAnchor} from ${anchorEasternDate}${hourCheck.dstSpringForwardFallback ? ', spring-forward DST fallback for skipped 02:00 hour' : ''}).`,
    eventName: normalizedEventName,
    anchorEasternDate,
    easternDate: hourCheck.eastern.dateKey,
    easternHour: hourCheck.eastern.hour,
    daysSinceAnchor,
    isAlternatingDay: true,
    matchesHour: true,
    dstSpringForwardFallback: hourCheck.dstSpringForwardFallback,
  };
}

function parseCliArgs(argv) {
  const options = {
    eventName: process.env.GITHUB_EVENT_NAME || 'schedule',
    now: process.env.ONTO_SYNC_GATE_NOW || Date.now(),
    scheduledCron:
      process.env.GITHUB_EVENT_SCHEDULE ||
      process.env.ONTO_SYNC_SCHEDULE_CRON ||
      null,
    anchorEasternDate: process.env.ONTO_SYNC_ANCHOR_EASTERN_DATE || ANCHOR_EASTERN_DATE,
    githubOutputPath: process.env.GITHUB_OUTPUT || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--event-name' && next) {
      options.eventName = next;
      i += 1;
    } else if (arg === '--now' && next) {
      options.now = next;
      i += 1;
    } else if ((arg === '--cron' || arg === '--scheduled-cron') && next) {
      options.scheduledCron = next;
      i += 1;
    } else if (arg === '--anchor-date' && next) {
      options.anchorEasternDate = next;
      i += 1;
    } else if (arg === '--github-output' && next) {
      options.githubOutputPath = next;
      i += 1;
    } else {
      throw new Error(`Invalid argument: ${arg}`);
    }
  }
  return options;
}

if (require.main === module) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const decision = evaluateSyncScheduleGate(cliOptions);
  console.log(JSON.stringify(decision));
  if (cliOptions.githubOutputPath) {
    const lines = [
      `should_run=${decision.shouldRun ? 'true' : 'false'}`,
      `eastern_date=${decision.easternDate}`,
      `eastern_hour=${decision.easternHour}`,
      `days_since_anchor=${decision.daysSinceAnchor}`,
      `reason=${decision.reason.replace(/\r?\n/g, ' ')}`,
    ];
    fs.appendFileSync(cliOptions.githubOutputPath, `${lines.join('\n')}\n`, 'utf8');
  }
}

module.exports = {
  EASTERN_TIME_ZONE,
  ANCHOR_EASTERN_DATE,
  TARGET_EASTERN_HOUR,
  deriveScheduledSlotTimestamp,
  getEasternDateTimeParts,
  calendarDaysBetween,
  isTargetEasternHour,
  evaluateSyncScheduleGate,
};
