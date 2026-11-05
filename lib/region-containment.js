const boundaries = require('../data/service-region-boundaries.json');

// Shared by the app and the CommonJS pipeline. County polygons are bundled
// public geography, so checking a device/pin never makes a network request.
function inRing({ lat, lng }, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [px, py] = ring[j];
    const cross = (lng - x) * (py - y) - (lat - y) * (px - x);
    if (Math.abs(cross) < 1e-10 && lng >= Math.min(x, px) && lng <= Math.max(x, px)
      && lat >= Math.min(y, py) && lat <= Math.max(y, py)) return true;
    if ((y > lat) !== (py > lat) && lng < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}

/**
 * @param {{bounds: {latMin: number, latMax: number, lngMin: number, lngMax: number}, boundaryId?: string}} region
 * @param {{lat: number, lng: number}} point
 * @returns {boolean}
 */
function regionContainsSpot(region, point) {
  const b = region.bounds;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)
    || point.lat < b.latMin || point.lat > b.latMax || point.lng < b.lngMin || point.lng > b.lngMax) return false;
  if (!region.boundaryId) return true;
  const geometry = boundaries[region.boundaryId];
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}

module.exports = { regionContainsSpot };
