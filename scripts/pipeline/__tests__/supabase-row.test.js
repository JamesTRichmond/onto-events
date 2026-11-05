const fs = require('node:fs');
const path = require('node:path');

const runner = require('../run-ticketmaster');
const { toSupabaseRow } = require('../to-supabase-row');

const page = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tm-page.json'), 'utf8'),
);

describe('production event sync', () => {
  it('normalizes fixtures into database rows without losing provenance', () => {
    const result = runner.processTicketmasterPages([page], {});
    const record = result.records.find((item) => item.id === 'tm-killers-1');
    const row = toSupabaseRow(record, '2026-09-02T23:00:00.000Z');

    expect(row).toMatchObject({
      id: 'tm-killers-1',
      source_name: 'Ticketmaster',
      source_event_id: 'killers-1',
      source_url:
        'https://www.ticketmaster.com/the-killers-salt-lake-city/event/killers-1',
      locality: 'Salt Lake City',
      region: 'UT',
      country_code: 'US',
      timezone: 'America/Denver',
      category: 'music',
      rating: 'general',
      is_cancelled: false,
      ingested_at: '2026-09-02T23:00:00.000Z',
    });
    expect(row.provenance).toEqual({
      source: 'Ticketmaster',
      ingested_by: 'onto-events-sync',
      kind: 'ticketing',
      trust: 1,
    });
  });

  it('redacts the Ticketmaster key from provider failures', async () => {
    const secret = 'super-secret-key';
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue(`quota exceeded for ${secret}`),
    });

    await expect(
      runner.fetchTicketmasterRecords({ key: secret, fetchImpl, sleep: async () => {} }),
    ).rejects.toThrow('quota exceeded for [TM_KEY]');
  });

  it('requires a key before making a network request', async () => {
    const fetchImpl = jest.fn();

    await expect(
      runner.fetchTicketmasterRecords({ key: '', fetchImpl }),
    ).rejects.toThrow('TM_KEY is required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
