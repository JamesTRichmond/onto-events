/**
 * Decorative, approximate ephemeris adapted from SunCalc v1.9.0:
 * https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js
 * Sun: geometric altitude. Moon: geocentric position with approximate refraction;
 * no lunar parallax, terrain, observer elevation, or precision-navigation claim.
 * All calculations stay local; inputs and outputs are never stored or transmitted.
 */
export const ASTRONOMY_LICENSE = `Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

export type SkyPlace = Readonly<{ latitude: number; longitude: number }>;
/** Degrees; azimuth clockwise from north (0=N, 90=E). */
type Position = { altitude: number; azimuth: number };
export type Astronomy = {
  sun: Position & { rising: boolean; riseWeight?: number };
  moon: Position & { illumination: number };
};

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const OBLIQUITY = 23.4397 * RAD;
const { sin, cos, tan, atan2, asin, acos } = Math;
const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));

function equatorial(longitude: number, latitude: number) {
  return {
    ra: atan2(sin(longitude) * cos(OBLIQUITY) - tan(latitude) * sin(OBLIQUITY), cos(longitude)),
    dec: asin(clampUnit(sin(latitude) * cos(OBLIQUITY)
      + cos(latitude) * sin(OBLIQUITY) * sin(longitude))),
  };
}

function sunCoordinates(days: number) {
  const anomaly = RAD * (357.5291 + 0.98560028 * days);
  const center = RAD * (1.9148 * sin(anomaly) + 0.02 * sin(2 * anomaly) + 0.0003 * sin(3 * anomaly));
  return equatorial(anomaly + center + RAD * 102.9372 + Math.PI, 0);
}

function moonCoordinates(days: number) {
  const longitude = RAD * (218.316 + 13.176396 * days);
  const anomaly = RAD * (134.963 + 13.064993 * days);
  const distanceArgument = RAD * (93.272 + 13.229350 * days);
  return {
    ...equatorial(longitude + RAD * 6.289 * sin(anomaly), RAD * 5.128 * sin(distanceArgument)),
    distance: 385001 - 20905 * cos(anomaly),
  };
}

function horizontal(days: number, place: SkyPlace, body: { ra: number; dec: number }): Position {
  const latitude = place.latitude * RAD;
  const hourAngle = RAD * (280.16 + 360.9856235 * days + place.longitude) - body.ra;
  const altitude = asin(clampUnit(sin(latitude) * sin(body.dec)
    + cos(latitude) * cos(body.dec) * cos(hourAngle)));
  const azimuth = atan2(sin(hourAngle), cos(hourAngle) * sin(latitude) - tan(body.dec) * cos(latitude));
  return { altitude: altitude / RAD, azimuth: (azimuth / RAD + 180 + 360) % 360 };
}

/** Explicit UTC instant; timezone affects civil labels, not celestial positions. */
export function astronomyAt(timestampMs: number, place: SkyPlace): Astronomy {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(new Date(timestampMs).getTime())
    || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90
    || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180) {
    throw new RangeError('Sky astronomy requires a valid instant and geographic coordinates.');
  }
  const days = timestampMs / DAY_MS - 0.5 + 2440588 - 2451545;
  const sun = sunCoordinates(days);
  const moon = moonCoordinates(days);
  const sunPosition = horizontal(days, place, sun);
  const moonPosition = horizontal(days, place, moon);
  const h = Math.max(0, moonPosition.altitude * RAD);
  const refraction = 0.0002967 / tan(h + 0.00312536 / (h + 0.08901179));
  const separation = acos(clampUnit(sin(sun.dec) * sin(moon.dec)
    + cos(sun.dec) * cos(moon.dec) * cos(sun.ra - moon.ra)));
  const incidence = atan2(149598000 * sin(separation), moon.distance - 149598000 * cos(separation));
  const before = days - 30_000 / DAY_MS;
  const after = days + 30_000 / DAY_MS;
  const altitudeChange = horizontal(after, place, sunCoordinates(after)).altitude
    - horizontal(before, place, sunCoordinates(before)).altitude;
  return {
    sun: {
      ...sunPosition,
      rising: altitudeChange >= 0,
      // Smooth direction through noon, including winter places whose sun never
      // reaches the shared >=20 degree day ramp. 0=setting, 1=rising.
      riseWeight: Math.max(0, Math.min(1, 0.5 + altitudeChange * 10)),
    },
    moon: {
      ...moonPosition,
      altitude: moonPosition.altitude + refraction / RAD,
      illumination: (1 + cos(incidence)) / 2,
    },
  };
}

function civilParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const read = (key: string) => Number(parts.find(part => part.type === key)!.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
}

function localMidnight(year: number, month: number, day: number, timeZone: string) {
  const wanted = Date.UTC(year, month - 1, day);
  let instant = wanted;
  for (let i = 0; i < 5; i++) {
    const p = civilParts(instant, timeZone);
    const difference = wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    if (!difference) return instant;
    instant += difference;
  }
  throw new RangeError('Could not resolve the local civil date');
}

/** Approximate sun crossings for this local date, including 23/25-hour DST days.
 * Uses the existing attributed ephemeris, entirely on-device. Unknown/polar
 * crossings stay null; no sample sun window or weather is substituted.
 */
export function localSunTimes(timestampMs: number, place: SkyPlace, timeZone: string): {
  sunriseAt: number | null; sunsetAt: number | null; nextSunriseAt: number | null;
} {
  const date = civilParts(timestampMs, timeZone);
  const start = localMidnight(date.year, date.month, date.day, timeZone);
  const tomorrow = localMidnight(date.year, date.month, date.day + 1, timeZone);
  const finish = localMidnight(date.year, date.month, date.day + 2, timeZone);
  const altitude = (at: number) => astronomyAt(at, place).sun.altitude + 0.833;
  const crossings = { sunriseAt: null as number | null, sunsetAt: null as number | null, nextSunriseAt: null as number | null };
  const step = 10 * 60_000;
  let previousAt = start;
  let previous = altitude(start);
  for (let at = start + step; previousAt < finish; at += step) {
    const upper = Math.min(at, finish);
    const current = altitude(upper);
    if ((previous <= 0) !== (current <= 0)) {
      let low = previousAt;
      let high = upper;
      for (let i = 0; i < 16; i++) {
        const middle = (low + high) / 2;
        if ((altitude(middle) <= 0) === (previous <= 0)) low = middle;
        else high = middle;
      }
      const crossing = Math.round((low + high) / 2);
      if (previous <= 0) {
        if (crossing < tomorrow) crossings.sunriseAt = crossing;
        else crossings.nextSunriseAt = crossing;
      } else if (crossing < tomorrow) crossings.sunsetAt = crossing;
    }
    previousAt = upper;
    previous = current;
  }
  return crossings;
}
