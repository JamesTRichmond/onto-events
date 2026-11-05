import regions from '@/data/service-regions.json';
import type { Spot } from '@/lib/pinned-spot';
import { regionContainsSpot } from '@/lib/region-containment';
export type ServiceRegionId =
  | 'utah'
  | 'vermont-corridor'
  | 'asheville'
  | 'tallahassee'
  | 'jacksonville'
  | 'hoboken'
  | 'nyc'
  | 'miami'
  | 'tampa-bay'
  | 'orlando'
  | 'key-west'
  | 'gainesville'
  | 'pensacola'
  | 'flagstaff'
  | 'austin'
  | 'chicago'
  | 'westchester'
  | 'montreal'
  | 'los-angeles'
  | 'tucson'
  | 'philadelphia'
  | 'san-francisco'
  | 'park-city'
  | 'saratoga-springs'
  | 'boston'
  | 'tokyo'
  | 'atlanta';
export const VERMONT = regions.find(
  (region) => region.id === 'vermont-corridor',
)!;
export const ASHEVILLE = regions.find(region => region.id === 'asheville')!;
export const TALLAHASSEE = regions.find(region => region.id === 'tallahassee')!;
export const JACKSONVILLE = regions.find(region => region.id === 'jacksonville')!;
export const MIAMI = regions.find(region => region.id === 'miami')!;
export const TAMPA_BAY = regions.find(region => region.id === 'tampa-bay')!;
export const ORLANDO = regions.find(region => region.id === 'orlando')!;
export const KEY_WEST = regions.find(region => region.id === 'key-west')!;
export const GAINESVILLE = regions.find(region => region.id === 'gainesville')!;
export const NYC = regions.find(region => region.id === 'nyc')!;
export const PENSACOLA = regions.find(region => region.id === 'pensacola')!;
export const AUSTIN = regions.find(region => region.id === 'austin')!;
export const FLAGSTAFF = regions.find(region => region.id === 'flagstaff')!;
export const CHICAGO = regions.find(region => region.id === 'chicago')!;
export const WESTCHESTER = regions.find(region => region.id === 'westchester')!;
export const HOBOKEN = regions.find(region => region.id === 'hoboken')!;
export const MONTREAL = regions.find(region => region.id === 'montreal')!;
export const LOS_ANGELES = regions.find(region => region.id === 'los-angeles')!;
export const TUCSON = regions.find(region => region.id === 'tucson')!;
export const PHILADELPHIA = regions.find(region => region.id === 'philadelphia')!;
export const SAN_FRANCISCO = regions.find(region => region.id === 'san-francisco')!;
export const PARK_CITY = regions.find(region => region.id === 'park-city')!;
export const SARATOGA_SPRINGS = regions.find(region => region.id === 'saratoga-springs')!;
export const BOSTON = regions.find(region => region.id === 'boston')!;
export const TOKYO = regions.find(region => region.id === 'tokyo')!;
export const ATLANTA = regions.find(region => region.id === 'atlanta')!;
export function getServiceRegion(id: ServiceRegionId) {
  return regions.find(region => region.id === id);
}

export function regionForSpot(spot: Spot & { serviceRegion?: ServiceRegionId }): ServiceRegionId | null {
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return null;
  if (spot.serviceRegion === 'utah') return 'utah';
  // Specific regions take precedence over the broad legacy Utah bounding box
  const specific = regions.filter(region => region.id !== 'utah');
  const matched = specific.find(
    region => !region.preparationOnly && regionContainsSpot(region, spot),
  );
  if (matched) return matched.id as ServiceRegionId;
  const legacy = regions.find(region => region.id === 'utah');
  if (legacy && !legacy.preparationOnly && regionContainsSpot(legacy, spot)) {
    return 'utah';
  }
  return null;
}

export function vermontLocalities(): string[] {
  return regionLocalities('vermont-corridor');
}

export function regionLocalities(id: ServiceRegionId): string[] {
  const region = getServiceRegion(id);
  if (!region) return [];
  return [
    ...new Set([
      ...(region.groups ?? []).flatMap((group) => group.municipalities),
      ...Object.keys(region.localityAliases ?? {}).map((name) =>
        name.replace(/\b\w/g, (char) => char.toUpperCase()),
      ),
    ]),
  ];
}
