/**
 * The weather cell: where onto asks about weather, instead of where you are.
 *
 * The feed's point (your phone, a dropped pin, or downtown Salt Lake City) is
 * rounded to the nearest 0.1° grid point before anything leaves the phone.
 * Grid points are fixed and public — the same for everyone near them — and at
 * Salt Lake City's latitude they sit about 11 km apart north–south and 8 km
 * east–west, so a request says "somewhere within a few miles of this grid
 * point", never a position. Weather does not change inside that distance in a
 * way a person could feel, so nothing is lost by asking this coarsely.
 * For example, Los Angeles civic anchor (34.05, -118.25; NWS LOX 154, 44)
 * resolves to cell "34.1,-118.3".
 */

export const CELL_STEP_DEG = 0.1;

export type WeatherCell = {
  /** Grid latitude, one decimal. */
  lat: number;
  /** Grid longitude, one decimal. */
  lng: number;
  /** "40.8,-111.9": the only location text any weather request carries. */
  key: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Null for anything that is not a real point on Earth. */
export function weatherCell(lat: number, lng: number): WeatherCell | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // `+ 0` turns -0 into 0 so the key never reads "-0.0".
  const cellLat = round1(lat) + 0;
  const cellLng = round1(lng) + 0;
  return { lat: cellLat, lng: cellLng, key: `${cellLat.toFixed(1)},${cellLng.toFixed(1)}` };
}

/**
 * How much map the weather card shows: the feed's radius on both sides plus
 * room around it, never tighter than a neighborhood nor wider than a region.
 */
export function mapSpanDeg(radiusMi: number): number {
  const miles = Number.isFinite(radiusMi) && radiusMi > 0 ? radiusMi : 1;
  const span = (miles * 2 * 1.8) / 69;
  return Math.min(3, Math.max(0.15, span));
}
