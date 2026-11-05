import {
  SupabaseOntoBackend,
  mapBlock,
  mapCatalogEvent,
  mapCatalogFreshness,
  mapPresence,
  mapProfile,
  mapReport,
  mapRsvp,
  mapRsvpHistoryItem,
} from '../supabase-backend';

const timestamp = '2026-09-02T20:00:00.000Z';

describe('Supabase row mapping', () => {
  it('maps catalog freshness without leaking database field names', () => {
    expect(
      mapCatalogFreshness({
        source_name: 'Ticketmaster',
        completed_at: timestamp,
        record_count: 42,
        rejected_count: 2,
      }),
    ).toEqual({
      sourceName: 'Ticketmaster',
      completedAt: timestamp,
      recordCount: 42,
      rejectedCount: 2,
    });
  });

  it('maps a catalog row without leaking snake_case into app code', () => {
    expect(
      mapCatalogEvent({
        id: 'event-1',
        source_name: 'Ticketmaster',
        source_event_id: 'tm-1',
        source_url: 'https://example.com/event',
        title: 'Live music',
        description: null,
        venue_name: 'Kilby Court',
        locality: 'Salt Lake City',
        region: 'UT',
        country_code: 'US',
        latitude: 40.76,
        longitude: -111.89,
        category: 'music',
        rating: 'general',
        starts_at: timestamp,
        ends_at: null,
        timezone: 'America/Denver',
        image_url: null,
        is_cancelled: false,
        is_roadtrip: false,
        ingested_at: timestamp,
        updated_at: timestamp,
      }),
    ).toEqual({
      id: 'event-1',
      sourceName: 'Ticketmaster',
      sourceEventId: 'tm-1',
      sourceUrl: 'https://example.com/event',
      title: 'Live music',
      description: null,
      venueName: 'Kilby Court',
      locality: 'Salt Lake City',
      region: 'UT',
      countryCode: 'US',
      latitude: 40.76,
      longitude: -111.89,
      category: 'music',
      rating: 'general',
      startsAt: timestamp,
      endsAt: null,
      timezone: 'America/Denver',
      imageUrl: null,
      isCancelled: false,
      isRoadtrip: false,
      ingestedAt: timestamp,
      updatedAt: timestamp,
    });
  });

  it('rejects malformed server rows instead of poisoning UI state', () => {
    expect(() => mapCatalogEvent({ id: 'event-1' })).toThrow(
      'Backend returned an invalid source_name',
    );
  });

  it('maps profile and RSVP records', () => {
    expect(
      mapProfile({
        user_id: 'user-1',
        display_name: 'James',
        avatar_url: null,
        bio: null,
        home_city: 'Salt Lake City',
        age_gate_confirmed: false,
        is_discoverable: false,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toMatchObject({
      userId: 'user-1',
      displayName: 'James',
      homeCity: 'Salt Lake City',
      isDiscoverable: false,
    });

    expect(
      mapRsvp({
        user_id: 'user-1',
        event_id: 'event-1',
        status: 'going',
        share_with_connections: false,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toEqual({
      userId: 'user-1',
      eventId: 'event-1',
      status: 'going',
      shareWithConnections: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  it('maps the RSVP history projection', () => {
    expect(
      mapRsvpHistoryItem({
        event_id: 'event-1',
        status: 'interested',
        title: 'Live music',
        venue_name: null,
        starts_at: timestamp,
        ends_at: null,
        source_url: null,
        rsvp_updated_at: timestamp,
      }),
    ).toEqual({
      eventId: 'event-1',
      status: 'interested',
      title: 'Live music',
      venueName: null,
      startsAt: timestamp,
      endsAt: null,
      sourceUrl: null,
      rsvpUpdatedAt: timestamp,
    });
  });

  it('maps safety records without storing extra personal data', () => {
    expect(
      mapBlock({
        blocker_id: 'user-1',
        blocked_id: 'user-2',
        created_at: timestamp,
      }),
    ).toEqual({
      blockerId: 'user-1',
      blockedId: 'user-2',
      createdAt: timestamp,
    });

    expect(
      mapReport({
        id: 'report-1',
        reporter_id: 'user-1',
        reported_user_id: null,
        event_id: 'event-1',
        reason: 'spam',
        details: null,
        evidence: { source: 'event-card' },
        created_at: timestamp,
      }),
    ).toMatchObject({
      reporterId: 'user-1',
      eventId: 'event-1',
      reason: 'spam',
      evidence: { source: 'event-card' },
    });
  });

  it('maps coarse presence and never invents coordinates', () => {
    expect(
      mapPresence({
        user_id: 'user-1',
        status_text: 'Open to suggestions',
        coarse_area: 'Sugar House',
        visibility: 'connections',
        expires_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      }),
    ).toEqual({
      userId: 'user-1',
      statusText: 'Open to suggestions',
      coarseArea: 'Sugar House',
      visibility: 'connections',
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });
});

test('named Vermont scope filters before applying the stable page boundary', async () => {
 const chain:any={};for(const name of ['select','order','range','eq','in','gte','lte'])chain[name]=jest.fn(()=>chain);
 chain.then=(resolve:any)=>resolve({data:[],error:null});
 const client:any={from:jest.fn(()=>chain)};
 await new SupabaseOntoBackend(client).listEvents({serviceRegion:'vermont-corridor',cursor:'200',limit:200});
 expect(chain.eq).toHaveBeenCalledWith('region','VT');expect(chain.in).toHaveBeenCalledWith('locality',expect.arrayContaining(['Hartford','White River Junction','Middlebury']));expect(chain.range).toHaveBeenCalledWith(200,400);
});

 it('scopes Jacksonville pages with public FL/US/locality/bounds metadata, without a device coordinate', async () => {
  const request: any = {};
  for (const method of ['select', 'order', 'range', 'eq', 'in', 'gte', 'lte']) request[method] = jest.fn(() => request);
  request.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  await new SupabaseOntoBackend({ from: jest.fn(() => request) } as any).listEvents({ serviceRegion: 'jacksonville', limit: 200 });
  expect(request.eq.mock.calls).toEqual([['region', 'FL'], ['country_code', 'US']]);
  expect(request.in).toHaveBeenCalledWith('locality', expect.arrayContaining(['Jacksonville', 'Baldwin', 'Jacksonville Beach']));
  expect(request.gte.mock.calls).toEqual([['latitude', 30.10], ['longitude', -82.05]]);
  expect(request.lte.mock.calls).toEqual([['latitude', 30.59], ['longitude', -81.37]]);
 });

 it('scopes Asheville pages to NC, US, admitted localities and the existing bounds', async () => {
  const request: any = {};
  for (const method of ['select', 'order', 'range', 'eq', 'in', 'gte', 'lte']) request[method] = jest.fn(() => request);
  request.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
  const client: any = { from: jest.fn(() => request) };
  await new SupabaseOntoBackend(client).listEvents({ serviceRegion: 'asheville', cursor: '200', limit: 200 });
  expect(client.from).toHaveBeenCalledWith('active_events');
  expect(request.range).toHaveBeenCalledWith(200, 400);
  expect(request.eq.mock.calls).toEqual([['region', 'NC'], ['country_code', 'US']]);
  const localities = request.in.mock.calls.find(([key]: string[]) => key === 'locality')?.[1];
  expect(localities).toEqual(expect.arrayContaining(['Asheville', 'Black Mountain', 'Weaverville', 'Candler', 'Leicester', 'Town Of Black Mountain']));
  expect(localities).not.toContain('Arden');
  expect(request.gte.mock.calls).toEqual([['latitude', 35.39], ['longitude', -82.89]]);
  expect(request.lte.mock.calls).toEqual([['latitude', 35.83], ['longitude', -82.16]]);
 });
