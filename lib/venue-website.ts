import venues from '@/data/venues.json';
import { VENUE_PHOTOS, type VenuePhoto } from '@/data/venue-photos';
import { httpsOnlyUrl } from '@/lib/card-actions';

/**
 * A venue onto will name, and the public page that belongs to it.
 * Coordinates stay in the registry; this is only the website the card links.
 */
export type VenueWebsite = Readonly<{
  name: string;
  url: string;
}>;

type VenueRow = {
  name?: string;
  aliases?: readonly string[];
  sourceUrl?: string;
};

// Same key the calendar pipeline uses (scripts/pipeline/calendar-record.js):
// lowercase, collapsed whitespace, nothing else. An alias must match exactly.
const venueKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

let byName: ReadonlyMap<string, VenueWebsite> | null = null;
let photoByName: ReadonlyMap<string, VenuePhoto> | null = null;

function index(): ReadonlyMap<string, VenueWebsite> {
  if (byName) return byName;
  const next = new Map<string, VenueWebsite>();
  for (const row of venues as readonly VenueRow[]) {
    const url = httpsOnlyUrl(row.sourceUrl);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!url || !name) continue;
    const site: VenueWebsite = { name, url };
    for (const label of [name, ...(Array.isArray(row.aliases) ? row.aliases : [])]) {
      if (typeof label !== 'string') continue;
      const key = venueKey(label);
      // A registry that passed validation has one owner per name. If two
      // somehow share a key, neither wins: a wrong website is worse than none.
      if (!key || next.has(key)) {
        if (key) next.delete(key);
        continue;
      }
      next.set(key, site);
    }
  }
  byName = next;
  return next;
}

function photos(): ReadonlyMap<string, VenuePhoto> {
  if (photoByName) return photoByName;
  const next = new Map<string, VenuePhoto>();
  for (const photo of VENUE_PHOTOS) {
    const key = venueKey(photo.venue);
    if (!key || next.has(key)) {
      if (key) next.delete(key);
      continue;
    }
    next.set(key, photo);
  }
  photoByName = next;
  return next;
}

/**
 * The venue's own website for a card that already names the venue.
 * Exact name or alias only, the same match venues.json uses for coordinates.
 * No match, or a sourceUrl that is not plain https, means no link.
 */
export function venueWebsiteFor(venueName: string | null | undefined): VenueWebsite | null {
  if (!venueName) return null;
  const key = venueKey(venueName);
  if (!key) return null;
  return index().get(key) ?? null;
}

/**
 * The reviewed picture of a venue, or nothing. Exact registered name only.
 * An alias, a longer phrase, or a venue James has not accepted gets no photo.
 */
export function venuePhotoFor(
  venueName: string | null | undefined,
  fallbackWebsiteUrl?: string | null,
): VenuePhoto | null {
  if (!venueName) return null;
  const key = venueKey(venueName);
  if (!key) return null;
  const photo = photos().get(key);
  if (!photo) return null;
  // A picture with no website has nowhere honest to go. Leave it off.
  return index().get(key) || httpsOnlyUrl(fallbackWebsiteUrl ?? undefined) ? photo : null;
}
