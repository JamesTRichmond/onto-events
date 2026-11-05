/**
 * What Discover shows before, or without, the cloud catalog: the local
 * calendar snapshot first (free and local first, offline too — James,
 * 2026-10-07), then the generated Ticketmaster snapshot (hidden unless ticket
 * sellers are turned on) and the curated family and road-trip listings. Every
 * item is a real event with its source. The demo seed in activities.ts never
 * ships here: its times are made up, and the store listing promises onto
 * never invents events to fill the screen (Codex review on #137).
 */
import type { Activity } from './activities';
import { FAMILY_ACTIVITIES } from './family-events';
import { LIVE_ACTIVITIES } from './live-events';
import { LOCAL_ACTIVITIES, LOCAL_GENERATED_AT } from './local-events';
import { LOCAL_ACTIVITIES as JACKSONVILLE_ACTIVITIES, LOCAL_GENERATED_AT as JACKSONVILLE_GENERATED_AT } from './jacksonville-events';
import { LOCAL_ACTIVITIES as MIAMI_ACTIVITIES, LOCAL_GENERATED_AT as MIAMI_GENERATED_AT } from './miami-events';
import { LOCAL_ACTIVITIES as TAMPA_ACTIVITIES, LOCAL_GENERATED_AT as TAMPA_GENERATED_AT } from './tampa-bay-events';
import { LOCAL_ACTIVITIES as ORLANDO_ACTIVITIES, LOCAL_GENERATED_AT as ORLANDO_GENERATED_AT } from './orlando-events';
import { LOCAL_ACTIVITIES as KEY_WEST_ACTIVITIES, LOCAL_GENERATED_AT as KEY_WEST_GENERATED_AT } from './key-west-events';
import { LOCAL_ACTIVITIES as GAINESVILLE_ACTIVITIES, LOCAL_GENERATED_AT as GAINESVILLE_GENERATED_AT } from './gainesville-events';
import { LOCAL_ACTIVITIES as PENSACOLA_ACTIVITIES, LOCAL_GENERATED_AT as PENSACOLA_GENERATED_AT } from './pensacola-events';
import { LOCAL_ACTIVITIES as AUSTIN_ACTIVITIES, LOCAL_GENERATED_AT as AUSTIN_GENERATED_AT } from './austin-events';
import { LOCAL_ACTIVITIES as FLAGSTAFF_ACTIVITIES, LOCAL_GENERATED_AT as FLAGSTAFF_GENERATED_AT } from './flagstaff-events';
import { LOCAL_ACTIVITIES as CHICAGO_ACTIVITIES, LOCAL_GENERATED_AT as CHICAGO_GENERATED_AT } from './chicago-events';
import { LOCAL_ACTIVITIES as TOKYO_ACTIVITIES, LOCAL_GENERATED_AT as TOKYO_GENERATED_AT } from './tokyo-events';
import { LOCAL_ACTIVITIES as BROOKLYN_ACTIVITIES, LOCAL_GENERATED_AT as BROOKLYN_GENERATED_AT } from './brooklyn-events';
import { LOCAL_ACTIVITIES as MONTREAL_ACTIVITIES, LOCAL_GENERATED_AT as MONTREAL_GENERATED_AT } from './montreal-events';
import { LOCAL_ACTIVITIES as LOS_ANGELES_ACTIVITIES, LOCAL_GENERATED_AT as LOS_ANGELES_GENERATED_AT } from './los-angeles-events';
import { LOCAL_ACTIVITIES as TUCSON_ACTIVITIES, LOCAL_GENERATED_AT as TUCSON_GENERATED_AT } from './tucson-events';
import { LOCAL_ACTIVITIES as PHILADELPHIA_ACTIVITIES, LOCAL_GENERATED_AT as PHILADELPHIA_GENERATED_AT } from './philadelphia-events';
import { LOCAL_ACTIVITIES as SAN_FRANCISCO_ACTIVITIES, LOCAL_GENERATED_AT as SAN_FRANCISCO_GENERATED_AT } from './san-francisco-events';
import { LOCAL_ACTIVITIES as PARK_CITY_ACTIVITIES, LOCAL_GENERATED_AT as PARK_CITY_GENERATED_AT } from './park-city-events';
import { LOCAL_ACTIVITIES as SARATOGA_SPRINGS_ACTIVITIES, LOCAL_GENERATED_AT as SARATOGA_SPRINGS_GENERATED_AT } from './saratoga-springs-events';
import { LOCAL_ACTIVITIES as ROYALTON_WOODSTOCK_ACTIVITIES, LOCAL_GENERATED_AT as ROYALTON_WOODSTOCK_GENERATED_AT } from './royalton-woodstock-events';
import { LOCAL_ACTIVITIES as BOSTON_ACTIVITIES, LOCAL_GENERATED_AT as BOSTON_GENERATED_AT } from './boston-events';
import { ROADTRIP_ACTIVITIES } from './roadtrip-events';
import { regionForSpot } from '@/lib/service-region';

export const BUNDLED_ACTIVITIES: Activity[] = [
  ...LOCAL_ACTIVITIES.filter(activity => {
    const region = regionForSpot(activity);
    return (
      region !== 'jacksonville' &&
      region !== 'miami' &&
      region !== 'tampa-bay' &&
      region !== 'orlando' &&
      region !== 'key-west' &&
      region !== 'gainesville' &&
      region !== 'pensacola' &&
      region !== 'austin' &&
      region !== 'flagstaff' &&
      region !== 'chicago' &&
      region !== 'nyc' &&
      region !== 'montreal' &&
      region !== 'los-angeles' &&
      region !== 'tucson' &&
      region !== 'philadelphia' &&
      region !== 'san-francisco' &&
      region !== 'park-city' &&
      region !== 'saratoga-springs' &&
      region !== 'boston' &&
      region !== 'tokyo'
    );
  }),
  ...JACKSONVILLE_ACTIVITIES,
  ...MIAMI_ACTIVITIES,
  ...TAMPA_ACTIVITIES,
  ...ORLANDO_ACTIVITIES,
  ...KEY_WEST_ACTIVITIES,
  ...GAINESVILLE_ACTIVITIES,
  ...PENSACOLA_ACTIVITIES,
  ...AUSTIN_ACTIVITIES,
  ...FLAGSTAFF_ACTIVITIES,
  ...CHICAGO_ACTIVITIES,
  ...TOKYO_ACTIVITIES,
  ...BROOKLYN_ACTIVITIES,
  ...MONTREAL_ACTIVITIES,
  ...LOS_ANGELES_ACTIVITIES,
  ...TUCSON_ACTIVITIES,
  ...PHILADELPHIA_ACTIVITIES,
  ...SAN_FRANCISCO_ACTIVITIES,
  ...PARK_CITY_ACTIVITIES,
  ...SARATOGA_SPRINGS_ACTIVITIES,
  ...ROYALTON_WOODSTOCK_ACTIVITIES,
  ...BOSTON_ACTIVITIES,
  ...LIVE_ACTIVITIES,
  ...FAMILY_ACTIVITIES,
  ...ROADTRIP_ACTIVITIES,
].filter((activity) => activity.source === 'live');

/** Separately refreshed city packs retain their own honest offline capture time. */
export const BUNDLED_REGION_GENERATED_AT: Partial<Record<import('@/lib/service-region').ServiceRegionId, string>> = {
  jacksonville: JACKSONVILLE_GENERATED_AT,
  miami: MIAMI_GENERATED_AT,
  'tampa-bay': TAMPA_GENERATED_AT,
  orlando: ORLANDO_GENERATED_AT,
  'key-west': KEY_WEST_GENERATED_AT,
  gainesville: GAINESVILLE_GENERATED_AT,
  pensacola: PENSACOLA_GENERATED_AT,
  austin: AUSTIN_GENERATED_AT,
  flagstaff: FLAGSTAFF_GENERATED_AT,
  chicago: CHICAGO_GENERATED_AT,
  tokyo: TOKYO_GENERATED_AT,
  nyc: BROOKLYN_GENERATED_AT,
  'vermont-corridor': LOCAL_GENERATED_AT,
  montreal: MONTREAL_GENERATED_AT,
  'los-angeles': LOS_ANGELES_GENERATED_AT,
  tucson: TUCSON_GENERATED_AT,
  philadelphia: PHILADELPHIA_GENERATED_AT,
  'san-francisco': SAN_FRANCISCO_GENERATED_AT,
  'park-city': PARK_CITY_GENERATED_AT,
  'saratoga-springs': SARATOGA_SPRINGS_GENERATED_AT,
  boston: BOSTON_GENERATED_AT,
};
