import { beginHandoff, markDownloadHandoff } from '@/lib/pwa-update';
import { Share } from 'react-native';

import { FeedText } from '@/lib/feed-text';

export type ShareableActivity = {
  title: string;
  venue: string;
  whenLabel: string;
  startsAtIso?: string | null;
  endsAtIso?: string | null;
  description?: string | null;
  timezone?: string;
};

/**
 * Plain-text share line (DECISIONS 2026-09-14 / W3 handoff):
 * `Day · time · title at venue` — no listing URL, no onto deep link, no coords.
 */
export function shareLine(item: ShareableActivity): string {
  const title = FeedText.display(item.title);
  const venue = FeedText.display(item.venue);
  let when = FeedText.display(item.whenLabel);
  if (item.startsAtIso && Number.isFinite(Date.parse(item.startsAtIso))) {
    const date = new Date(item.startsAtIso);
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    };
    try {
      when = date.toLocaleString('en-US', { ...options, timeZone: item.timezone });
    } catch {
      when = date.toLocaleString('en-US', { ...options, timeZone: 'UTC' });
    }
  }
  return `${when} · ${title} at ${venue}`;
}

/** Same as shareLine — W3: navigator.share / clipboard get plain text only. */
export function sharePlan(item: ShareableActivity): string {
  return shareLine(item);
}

type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

type NavigatorShare = {
  share?: (data: { text?: string; title?: string }) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};

function webNavigator(): NavigatorShare | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const nav = (globalThis as { navigator?: NavigatorShare }).navigator;
  return nav;
}

/**
 * Web Share API first, clipboard fallback, then RN Share.
 * Always sends sharePlan plain text — never URLs or coordinates.
 */
export async function shareActivity(item: ShareableActivity): Promise<ShareResult> {
  const text = sharePlan(item);
  const nav = webNavigator();

  if (typeof nav?.share === 'function') {
    try {
      await nav.share({ text });
      return 'shared';
    } catch (error) {
      // AbortError = user cancelled; fall through only for other failures.
      const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: string }).name) : '';
      if (name === 'AbortError') return 'cancelled';
    }
  }

  const clipboard = nav?.clipboard;
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text); // method call keeps `this` bound
      return 'copied';
    } catch {
      // fall through to RN Share
    }
  }

  try {
    const result = await Share.share({ message: text });
    if (result.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

function foldIcs(line: string): string {
  const parts: string[] = [];
  let part = '', bytes = 0;
  for (const char of line) {
    const point = char.codePointAt(0)!;
    const size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + size > 75) { parts.push(part); part = ' '; bytes = 1; }
    part += char; bytes += size;
  }
  parts.push(part);
  return parts.join('\r\n');
}

function escapeIcsText(value: string): string {
  return FeedText.display(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function utcStamp(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function contentUid(item: ShareableActivity, start: string): string {
  const seed = `${item.title}|${item.venue}|${start}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `onto-${(hash >>> 0).toString(16)}@local`;
}

/**
 * One VEVENT for the card. Returns null when there is no parseable start
 * (a label like "Tonight 9:00 PM" is not a calendar instant).
 * UID is a content hash, not the listing id. Never embeds device coordinates.
 */
export function icsForItem(item: ShareableActivity, nowMs = Date.now()): string | null {
  const start = item.startsAtIso ? utcStamp(item.startsAtIso) : null;
  if (!start) return null;
  const end = item.endsAtIso ? utcStamp(item.endsAtIso) : null;
  const stamp = utcStamp(new Date(nowMs).toISOString()) ?? start;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//onto//calendar-share//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldIcs(`UID:${contentUid(item, start)}`),
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    ...(end && end > start ? [`DTEND:${end}`] : []),
    foldIcs(`SUMMARY:${escapeIcsText(item.title)}`),
    foldIcs(`LOCATION:${escapeIcsText(item.venue)}`),
  ];
  const description = FeedText.display(item.description);
  if (description) lines.push(foldIcs(`DESCRIPTION:${escapeIcsText(description)}`));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** Standard calendar-file handoff for the PWA. Success is not confirmation of saving. */
export async function saveToCalendar(item: ShareableActivity): Promise<'handed-off' | 'cancelled' | 'unavailable'> {
  const finish = beginHandoff();
  try { return await handoffCalendar(item); } finally { finish(); }
}

async function handoffCalendar(item: ShareableActivity): Promise<'handed-off' | 'cancelled' | 'unavailable'> {
  const ics = icsForItem(item);
  if (!ics || typeof document === 'undefined' || typeof File === 'undefined') return 'unavailable';
  const file = new File([ics], 'onto-event.ics', { type: 'text/calendar;charset=utf-8' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  try {
    if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function') {
      await nav.share({ files: [file], title: item.title });
      return 'handed-off';
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled';
  }
  let url: string | undefined;
  try {
    url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'onto-event.ics';
    document.body.appendChild(link);
    markDownloadHandoff();
    link.click();
    link.remove();
    const handedUrl = url;
    setTimeout(() => URL.revokeObjectURL(handedUrl), 60_000);
    return 'handed-off';
  } catch {
    if (url) URL.revokeObjectURL(url);
    return 'unavailable';
  }
}
