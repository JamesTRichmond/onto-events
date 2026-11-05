import { FeedText } from './feed-text';

/**
 * Visible text caps for the compact feed card.
 *
 * Some feeds send a paragraph as a title, a building's full name plus the city
 * as a place, or a whole page as a description. One such listing then takes
 * the room of three and the feed stops reading as a list. The card shows at
 * most this many characters per field, cut at a word, ending in an ellipsis.
 * The details sheet still shows every character: the cap trims the preview,
 * never the supply. One place to tune.
 */
export const CARD_TEXT_LIMITS = {
  title: 60,
  place: 44,
  description: 90,
} as const;

const ELLIPSIS = '…';
const WORDS = /[\p{L}\p{N}]+/gu;
/** A preview that ends on a joiner reads as a stutter ("Seminar, Jody,…"). */
const TRAILING_JOINERS = /[\s,;:·•\-–—/&+|(]+$/u;
/** A zero-width joiner or variation selector left dangling breaks an emoji. */
const TRAILING_FORMAT = /[‍️]+$/u;
/** Cut at a word only when the word boundary keeps most of the budget. */
const WORD_CUT_FLOOR = 0.6;

type CardSource = { title: string; venue: string; area: string; description: string };
export type CardText = { title: string; place: string; description: string };

/** Every run of whitespace, line breaks included, becomes one space. */
export function flattenWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function length(text: string): number {
  return Array.from(text).length;
}

/**
 * At most `max` visible characters, ellipsis included. Counts code points,
 * not UTF-16 units, so an accented name or an emoji is never split in half.
 * Whitespace is flattened first: a line clamp counts line breaks, so a
 * description that opens with blank lines would otherwise show nothing.
 */
export function clipText(text: string, max: number): string {
  const flat = flattenWhitespace(text);
  if (length(flat) <= max) return flat;
  if (max < 1) return '';
  if (max === 1) return ELLIPSIS;
  const budget = Array.from(flat).slice(0, max - 1).join('');
  const lastSpace = budget.lastIndexOf(' ');
  const cut = lastSpace >= budget.length * WORD_CUT_FLOOR ? budget.slice(0, lastSpace) : budget;
  const tidy = cut.replace(TRAILING_JOINERS, '').replace(TRAILING_FORMAT, '');
  return (tidy || budget) + ELLIPSIS;
}

/**
 * Venue first: it is where the person is going. The area rides along only
 * when both fit — in a one-city app "Salt Lake City, UT" is the first thing
 * to give up. An area stands in only when there is no venue name at all.
 */
export function placeLine(venue: string, area: string, max: number = CARD_TEXT_LIMITS.place): string {
  const v = flattenWhitespace(venue);
  const a = flattenWhitespace(area);
  const both = v && a ? `${v} · ${a}` : v || a;
  if (length(both) <= max) return both;
  return clipText(v || a, max);
}

/**
 * A description that only repeats the title ("Kitchen: KS" twice) spends two
 * lines saying nothing. The face leaves it out; the details sheet keeps it.
 * Match contiguous word tokens so "art" does not collapse because it sits
 * inside "Party".
 */
export function repeatsTitle(title: string, description: string): boolean {
  const descriptionWords = FeedText.display(description).toLowerCase().match(WORDS) ?? [];
  if (descriptionWords.length === 0) return false;
  const titleWords = FeedText.display(title).toLowerCase().match(WORDS) ?? [];
  for (let i = 0; i <= titleWords.length - descriptionWords.length; i++) {
    if (descriptionWords.every((word, offset) => titleWords[i + offset] === word)) return true;
  }
  return false;
}

/** The three capped strings the card face renders; '' means render nothing. */
export function cardText(item: CardSource): CardText {
  const description = FeedText.display(item.description);
  return {
    title: clipText(item.title, CARD_TEXT_LIMITS.title),
    place: placeLine(item.venue, item.area),
    description: repeatsTitle(item.title, description)
      ? ''
      : clipText(description, CARD_TEXT_LIMITS.description),
  };
}
