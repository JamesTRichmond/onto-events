import { isTicketSeller, sourceKindFor } from '../source-trust';

describe('ticket sellers (hidden from Discover by default, James 2026-10-07)', () => {
  it('names every seller James listed, whatever the credit casing', () => {
    for (const sourceName of ['Ticketmaster', 'SeatGeek', 'StubHub', 'AXS', 'Live Nation', 'LiveNation', 'TickPick']) {
      expect(sourceKindFor({ source: 'live', sourceName })).toBe('ticketing');
      expect(isTicketSeller({ source: 'live', sourceName: ` ${sourceName.toUpperCase()} ` })).toBe(true);
    }
  });

  it('keeps venue, organizer and curated listings', () => {
    expect(isTicketSeller({ source: 'live', sourceName: 'SLC Public Lands' })).toBe(false);
    expect(isTicketSeller({ source: 'live', sourceName: 'Now Playing Utah' })).toBe(false);
    expect(isTicketSeller({ source: 'seed', sourceName: 'Ticketmaster' })).toBe(false);
  });
});
