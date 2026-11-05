-- Prepared venue operation, NOT an automatic migration or publisher source upload.
-- Apply only after explicit production venue approval and the V2 migrations.
-- A single DO statement is atomic even through an editor's normal autocommit.
-- This creates four public-place choices; it does not book rooms or open hosting.
DO $venue_seed$
DECLARE
  desired jsonb := $places$[
  {
    "id": "vt-bixby-library",
    "name": "Bixby Memorial Free Library",
    "locality": "Vergennes",
    "region": "VT",
    "country_code": "US",
    "latitude": 44.167131164069,
    "longitude": -73.253907929571,
    "timezone": "America/New_York",
    "service_region": "vermont-corridor",
    "evidence_url": "https://bixbylibrary.org/visiting-the-library/",
    "active": true
  },
  {
    "id": "vt-kellogg-hubbard-library",
    "name": "Kellogg-Hubbard Library",
    "locality": "Montpelier",
    "region": "VT",
    "country_code": "US",
    "latitude": 44.261758723719,
    "longitude": -72.573387278042,
    "timezone": "America/New_York",
    "service_region": "vermont-corridor",
    "evidence_url": "https://kellogghubbard.org/use-the-library/plan-your-visit/",
    "active": true
  },
  {
    "id": "vt-fletcher-main",
    "name": "Fletcher Free Library Main Library",
    "locality": "Burlington",
    "region": "VT",
    "country_code": "US",
    "latitude": 44.477108053089,
    "longitude": -73.210961024167,
    "timezone": "America/New_York",
    "service_region": "vermont-corridor",
    "evidence_url": "https://fletcherfree.org/",
    "active": true
  },
  {
    "id": "vt-fletcher-north",
    "name": "Fletcher Free Library New North End Branch",
    "locality": "Burlington",
    "region": "VT",
    "country_code": "US",
    "latitude": 44.507169997605,
    "longitude": -73.245274978488,
    "timezone": "America/New_York",
    "service_region": "vermont-corridor",
    "evidence_url": "https://fletcherfree.org/",
    "active": true
  }
]$places$::jsonb;
  place record;
  existing onto.community_venues%rowtype;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Venue preparation requires a privileged deployment operator' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM onto.community_pilot WHERE id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V2 pilot state is missing' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM onto.community_pilot WHERE hosting OR reviews) THEN
    RAISE EXCEPTION 'Keep hosting and reviews closed during venue preparation' USING ERRCODE = '55000';
  END IF;

  FOR place IN SELECT * FROM jsonb_to_recordset(desired) AS p(
    id text, name text, locality text, region text, country_code text,
    latitude double precision, longitude double precision, timezone text,
    service_region text, evidence_url text, active boolean
  ) LOOP
    SELECT * INTO existing FROM onto.community_venues WHERE id = place.id FOR UPDATE;
    IF FOUND THEN
      IF ROW(existing.name, existing.locality, existing.region, existing.country_code,
        existing.latitude, existing.longitude, existing.timezone, existing.service_region,
        existing.evidence_url, existing.active) IS DISTINCT FROM
        ROW(place.name, place.locality, place.region, place.country_code,
        place.latitude, place.longitude, place.timezone, place.service_region,
        place.evidence_url, place.active) THEN
        RAISE EXCEPTION 'Venue % differs from the reviewed candidate; review the existing row', place.id USING ERRCODE = '23514';
      END IF;
    ELSE
      INSERT INTO onto.community_venues
        (id, name, locality, region, country_code, latitude, longitude, timezone,
        service_region, evidence_url, verified_at, active)
      VALUES
        (place.id, place.name, place.locality, place.region, place.country_code,
        place.latitude, place.longitude, place.timezone, place.service_region,
        place.evidence_url, statement_timestamp(), place.active);
    END IF;
  END LOOP;
END;
$venue_seed$;
