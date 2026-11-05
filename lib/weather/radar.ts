/**
 * Radar tiles: NOAA's NEXRAD base-reflectivity composite, cut into standard
 * web-map tiles and served free by Iowa State University's Environmental
 * Mesonet (refreshed about every five minutes; US coverage). A tile request
 * names a map square, never a person. Swapping providers is this one line.
 */
export const RADAR_TILE_URL =
  'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png';

export const RADAR_CREDIT = 'Radar: NOAA NEXRAD via Iowa Environmental Mesonet';
export const WEATHER_CREDIT = 'Weather: National Weather Service';

/** Light → heavy, the reflectivity colors NWS radar has always used. */
export const RADAR_SCALE = ['#04E9E7', '#019FF4', '#02FD02', '#FDF802', '#FD9500', '#FD0000', '#BC0000'] as const;
