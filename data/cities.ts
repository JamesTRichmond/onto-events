import { SLC_ANCHOR } from '@/data/activities';
import type { Spot } from '@/lib/pinned-spot';
import type { ServiceRegionId } from '@/lib/service-region';

type LaunchedCity = {
  id: string;
  name: string;
  state:
    | 'Utah'
    | 'North Carolina'
    | 'Vermont'
    | 'Florida'
    | 'New York'
    | 'Texas'
    | 'Arizona'
    | 'Illinois'
    | 'New Jersey'
    | 'California'
    | 'Pennsylvania'
    | 'Massachusetts'
    | 'Quebec'
    | 'Tokyo'
    | 'Georgia';
  availability: 'available';
  serviceRegion: ServiceRegionId;
  timeZone:
    | 'America/Denver'
    | 'America/New_York'
    | 'America/Chicago'
    | 'America/Phoenix'
    | 'America/Los_Angeles'
    | 'America/Toronto'
    | 'Asia/Tokyo';
  anchor: Spot & { name: string; approximate: boolean };
};

/** Launched cities stay available even when their calendars have an empty week.
 * Anchors are existing public venues/declared city points, never device fixes.
 */
export const CITIES = [
  { id: 'atlanta', name: 'Atlanta', state: 'Georgia', availability: 'available', serviceRegion: 'atlanta', timeZone: 'America/New_York', anchor: { lat: 33.7573, lng: -84.3892, name: 'Atlanta Central Library (Marcel Breuer)', approximate: true } },
  { id: 'tokyo', name: 'Tokyo', state: 'Tokyo', availability: 'available', serviceRegion: 'tokyo', timeZone: 'Asia/Tokyo', anchor: { lat: 35.6528, lng: 139.7289, name: 'Tokyo Metropolitan Central Library (東京都立中央図書館)', approximate: true } },
  { id: 'los-angeles', name: 'Los Angeles', state: 'California', availability: 'available', serviceRegion: 'los-angeles', timeZone: 'America/Los_Angeles', anchor: { lat: 34.0505, lng: -118.2553, name: 'Los Angeles Public Library (Central Library)', approximate: true } },
  { id: 'san-francisco', name: 'San Francisco', state: 'California', availability: 'available', serviceRegion: 'san-francisco', timeZone: 'America/Los_Angeles', anchor: { lat: 37.7793, lng: -122.4161, name: 'San Francisco Public Library (Main Library)', approximate: true } },
  { id: 'boston', name: 'Boston', state: 'Massachusetts', availability: 'available', serviceRegion: 'boston', timeZone: 'America/New_York', anchor: { lat: 42.3493, lng: -71.0784, name: 'Boston Public Library (Central Library in Copley Square)', approximate: true } },
  { id: 'chicago', name: 'Chicago', state: 'Illinois', availability: 'available', serviceRegion: 'chicago', timeZone: 'America/Chicago', anchor: { lat: 41.8763, lng: -87.6281, name: 'Harold Washington Library city point', approximate: true } },
  { id: 'philadelphia', name: 'Philadelphia', state: 'Pennsylvania', availability: 'available', serviceRegion: 'philadelphia', timeZone: 'America/New_York', anchor: { lat: 39.9598, lng: -75.1710, name: 'Free Library of Philadelphia — Parkway Central Library', approximate: true } },
  { id: 'austin', name: 'Austin', state: 'Texas', availability: 'available', serviceRegion: 'austin', timeZone: 'America/Chicago', anchor: { lat: 30.2659, lng: -97.7516, name: 'Austin Central Library city point', approximate: true } },
  { id: 'flagstaff', name: 'Flagstaff', state: 'Arizona', availability: 'available', serviceRegion: 'flagstaff', timeZone: 'America/Phoenix', anchor: { lat: 35.1995, lng: -111.6534, name: 'Flagstaff Public Library city point', approximate: true } },
  { id: 'tucson', name: 'Tucson', state: 'Arizona', availability: 'available', serviceRegion: 'tucson', timeZone: 'America/Phoenix', anchor: { lat: 32.2229, lng: -110.9718, name: 'Joel D. Valdez Main Library city point', approximate: true } },
  { id: 'orlando', name: 'Orlando', state: 'Florida', availability: 'available', serviceRegion: 'orlando', timeZone: 'America/New_York', anchor: { lat: 28.5412, lng: -81.3789, name: 'Orlando Public Library Main Library', approximate: true } },
  { id: 'key-west', name: 'Key West', state: 'Florida', availability: 'available', serviceRegion: 'key-west', timeZone: 'America/New_York', anchor: { lat: 24.5574, lng: -81.7997, name: 'Key West Public Library', approximate: true } },
  { id: 'gainesville', name: 'Gainesville', state: 'Florida', availability: 'available', serviceRegion: 'gainesville', timeZone: 'America/New_York', anchor: { lat: 29.6515, lng: -82.3216, name: 'Alachua County Library District Headquarters Library', approximate: true } },
  { id: 'pensacola', name: 'Pensacola', state: 'Florida', availability: 'available', serviceRegion: 'pensacola', timeZone: 'America/Chicago', anchor: { lat: 30.4158, lng: -87.2189, name: 'Pensacola Library (WFPL Main Branch)', approximate: true } },
  { id: 'tampa-bay', name: 'Tampa Bay', state: 'Florida', availability: 'available', serviceRegion: 'tampa-bay', timeZone: 'America/New_York', anchor: { lat: 27.9510, lng: -82.4632, name: 'John F. Germany Library city point', approximate: true } },
  { id: 'miami', name: 'Miami', state: 'Florida', availability: 'available', serviceRegion: 'miami', timeZone: 'America/New_York', anchor: { lat: 25.7753, lng: -80.1963, name: 'Main Library city point', approximate: true } },
  { id: 'jacksonville', name: 'Jacksonville', state: 'Florida', availability: 'available', serviceRegion: 'jacksonville', timeZone: 'America/New_York', anchor: { lat: 30.3298, lng: -81.6589, name: 'Main Library city point', approximate: true } },
  { id: 'salt-lake-city', name: 'Salt Lake City', state: 'Utah', availability: 'available', serviceRegion: 'utah', timeZone: 'America/Denver', anchor: { ...SLC_ANCHOR, name: 'Downtown city point', approximate: true } },
  { id: 'park-city', name: 'Park City', state: 'Utah', availability: 'available', serviceRegion: 'park-city', timeZone: 'America/Denver', anchor: { lat: 40.6558, lng: -111.5036, name: 'Park City Library on Park Ave', approximate: true } },
  { id: 'asheville', name: 'Asheville', state: 'North Carolina', availability: 'available', serviceRegion: 'asheville', timeZone: 'America/New_York', anchor: { lat: 35.5956, lng: -82.5486, name: 'Asheville City Hall', approximate: true } },
  { id: 'black-mountain', name: 'Black Mountain', state: 'North Carolina', availability: 'available', serviceRegion: 'asheville', timeZone: 'America/New_York', anchor: { lat: 35.616162, lng: -82.322801, name: 'Black Mountain Library', approximate: true } },
  { id: 'weaverville', name: 'Weaverville', state: 'North Carolina', availability: 'available', serviceRegion: 'asheville', timeZone: 'America/New_York', anchor: { lat: 35.698224, lng: -82.560235, name: 'Blue Mountain Pizza, downtown', approximate: true } },
  { id: 'tallahassee', name: 'Tallahassee', state: 'Florida', availability: 'available', serviceRegion: 'tallahassee', timeZone: 'America/New_York', anchor: { lat: 30.4383, lng: -84.2807, name: 'Tallahassee City Hall', approximate: true } },
  { id: 'burlington', name: 'Burlington', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.477108053089, lng: -73.210961024167, name: 'Fletcher Free Library', approximate: true } },
  { id: 'south-burlington', name: 'South Burlington', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.4674, lng: -73.1709, name: 'Public library city point', approximate: true } },
  { id: 'williston', name: 'Williston', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.438, lng: -73.073, name: 'Island Ice Cream city point', approximate: true } },
  { id: 'bristol', name: 'Bristol', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.1335, lng: -73.0789, name: 'Bristol Town Green', approximate: true } },
  { id: 'middlebury', name: 'Middlebury', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.005319487507, lng: -73.173741481911, name: 'Mahaney Arts Center', approximate: true } },
  { id: 'vergennes', name: 'Vergennes', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.167131164069, lng: -73.253907929571, name: 'Bixby Memorial Library', approximate: true } },
  { id: 'rutland', name: 'Rutland', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 43.606470567744, lng: -72.978932617531, name: 'Paramount Theatre', approximate: true } },
  { id: 'montpelier', name: 'Montpelier', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 44.261758723719, lng: -72.573387278042, name: 'Kellogg-Hubbard Library', approximate: true } },
  { id: 'white-river-junction', name: 'White River Junction', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 43.648502650436, lng: -72.318747657406, name: 'Junction Arts & Media', approximate: true } },
  { id: 'woodstock', name: 'Woodstock', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 43.6239, lng: -72.5186, name: 'Norman Williams Public Library', approximate: true } },
  { id: 'royalton', name: 'Royalton', state: 'Vermont', availability: 'available', serviceRegion: 'vermont-corridor', timeZone: 'America/New_York', anchor: { lat: 43.8188, lng: -72.5189, name: 'Royalton Memorial Library', approximate: true } },
  { id: 'manhattan', name: 'Manhattan', state: 'New York', availability: 'available', serviceRegion: 'nyc', timeZone: 'America/New_York', anchor: { lat: 40.7531, lng: -73.9819, name: 'NYPL Stephen A. Schwarzman Building', approximate: true } },
  { id: 'brooklyn', name: 'Brooklyn', state: 'New York', availability: 'available', serviceRegion: 'nyc', timeZone: 'America/New_York', anchor: { lat: 40.6725, lng: -73.9683, name: 'Brooklyn Public Library Central', approximate: true } },
  { id: 'queens', name: 'Queens', state: 'New York', availability: 'available', serviceRegion: 'nyc', timeZone: 'America/New_York', anchor: { lat: 40.7079, lng: -73.7946, name: 'Queens Public Library Central', approximate: true } },
  { id: 'bronx', name: 'Bronx', state: 'New York', availability: 'available', serviceRegion: 'nyc', timeZone: 'America/New_York', anchor: { lat: 40.8630, lng: -73.8944, name: 'Bronx Library Center', approximate: true } },
  { id: 'staten-island', name: 'Staten Island', state: 'New York', availability: 'available', serviceRegion: 'nyc', timeZone: 'America/New_York', anchor: { lat: 40.6417, lng: -74.0767, name: 'St. George Library Center', approximate: true } },
  { id: 'yonkers', name: 'Yonkers', state: 'New York', availability: 'available', serviceRegion: 'westchester', timeZone: 'America/New_York', anchor: { lat: 40.93574, lng: -73.8994, name: 'Philipse Manor Hall city point', approximate: true } },
  { id: 'saratoga-springs', name: 'Saratoga Springs', state: 'New York', availability: 'available', serviceRegion: 'saratoga-springs', timeZone: 'America/New_York', anchor: { lat: 43.0825, lng: -73.7844, name: 'Saratoga Springs Public Library', approximate: true } },
  { id: 'hoboken', name: 'Hoboken', state: 'New Jersey', availability: 'available', serviceRegion: 'hoboken', timeZone: 'America/New_York', anchor: { lat: 40.73729239, lng: -74.03139353, name: 'Hoboken City Hall', approximate: true } },
  { id: 'montreal', name: 'Montreal', state: 'Quebec', availability: 'available', serviceRegion: 'montreal', timeZone: 'America/Toronto', anchor: { lat: 45.5154, lng: -73.5623, name: 'Grande Bibliothèque (BAnQ)', approximate: true } },
] as const satisfies readonly LaunchedCity[];

export type City = (typeof CITIES)[number];
export type CityId = City['id'];
export const CITY_STATES = [
  'Utah',
  'North Carolina',
  'Florida',
  'Vermont',
  'New York',
  'Texas',
  'Arizona',
  'Illinois',
  'New Jersey',
  'California',
  'Pennsylvania',
  'Massachusetts',
  'Quebec',
  'Tokyo',
  'Georgia',
] as const;
export const COMING_SOON_CITIES: readonly string[] = [];
export const DEFAULT_CITY_ID: CityId = 'salt-lake-city';

export function cityById(id: unknown): City | undefined {
  return CITIES.find(city => city.id === id);
}
