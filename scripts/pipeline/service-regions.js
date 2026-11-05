const SERVICE_REGIONS = require('../../data/service-regions.json');
const { regionContainsSpot } = require('../../lib/region-containment');

// The legacy region (Utah and its road-trip towns) is a coordinate box with
// no state. Every other region names its state and a municipal allowlist.
const LEGACY_REGION_ID = SERVICE_REGIONS.find((region) => !region.region && !region.regions).id;
const STATE_SCOPED = new Set(SERVICE_REGIONS.flatMap((region) => region.regions ?? (region.region ? [region.region] : [])));

const localityKey = (value) => typeof value === 'string' ? value.toLowerCase().replace(/\s+/g, ' ').trim() : '';
const getServiceRegion = (id) => SERVICE_REGIONS.find((region) => region.id === id);

function municipalityForLocality(serviceRegion, locality) {
  const key = localityKey(locality);
  const canonical = serviceRegion.localityAliases?.[key] ?? locality;
  return serviceRegion.groups?.flatMap((group) => group.municipalities)
    .find((municipality) => localityKey(municipality) === localityKey(canonical)) ?? null;
}

function serviceRegionForLocation(location) {
  // Check state-scoped specific regions first
  const specific = SERVICE_REGIONS.filter((region) => region.region);
  const match = specific.find((serviceRegion) => {
    if (!regionContainsSpot(serviceRegion, location)) return false;
    // Preserve the original Utah/road-trip coordinate policy. A state-scoped
    // region uses an explicit state and covered municipality, never a box,
    // and the legacy box never claims a location in one of those states.
    if (!serviceRegion.region && !serviceRegion.regions) return !STATE_SCOPED.has(location.region);
    const regionMatches = serviceRegion.regions
      ? serviceRegion.regions.includes(location.region)
      : location.region === serviceRegion.region;
    return regionMatches
      && location.countryCode === serviceRegion.countryCode
      && municipalityForLocality(serviceRegion, location.locality) !== null;
  });
  if (match) return match;

  // Fall back to legacy region (Utah / road-trip box)
  const legacy = SERVICE_REGIONS.find((region) => !region.region);
  if (legacy && regionContainsSpot(legacy, location)) {
    if (location.region === 'UT' || !STATE_SCOPED.has(location.region)) {
      return legacy;
    }
  }
  return null;
}

function coverageGroupForLocation(location) {
  const serviceRegion = serviceRegionForLocation(location);
  if (!serviceRegion) return null;
  const municipality = municipalityForLocality(serviceRegion, location.locality);
  return serviceRegion.groups?.find((group) => group.municipalities.includes(municipality))?.id ?? serviceRegion.id;
}

module.exports = { SERVICE_REGIONS, LEGACY_REGION_ID, getServiceRegion, serviceRegionForLocation, municipalityForLocality, coverageGroupForLocation };
