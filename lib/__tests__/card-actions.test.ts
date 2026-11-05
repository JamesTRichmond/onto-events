import { httpsOnlyUrl, sourceActionFor, travelLabel } from '../card-actions';

describe('httpsOnlyUrl', () => {
  it('keeps https listings and drops everything else', () => {
    expect(httpsOnlyUrl('https://nhmu.utah.edu/visit/events')).toBe(
      'https://nhmu.utah.edu/visit/events',
    );
    expect(httpsOnlyUrl('HTTPS://example.com/x')).toBe('HTTPS://example.com/x');
    expect(httpsOnlyUrl('http://example.com/x')).toBeNull();
    expect(httpsOnlyUrl('javascript:alert(1)')).toBeNull();
    expect(httpsOnlyUrl('')).toBeNull();
    expect(httpsOnlyUrl(undefined)).toBeNull();
  });
});

describe('travelLabel', () => {
  it('walks short hops and drives the rest', () => {
    expect(travelLabel(0.3)).toMatch(/walk · 0\.3 mi$/);
    expect(travelLabel(2.4)).toMatch(/drive · 2\.4 mi$/);
  });
});

describe('sourceActionFor', () => {
  it('names Ticketmaster instead of linking out to it', () => {
    expect(
      sourceActionFor({ sourceName: 'Ticketmaster', sourceUrl: 'https://www.ticketmaster.com/event/1' }),
    ).toEqual({ kind: 'note', text: "Tickets are sold through Ticketmaster. We don't link out to them." });
  });

  it('matches the source name without regard to case or spacing', () => {
    expect(sourceActionFor({ sourceName: ' ticketmaster ', sourceUrl: 'https://x.test/1' })?.kind).toBe('note');
  });

  it('links other sources over https', () => {
    expect(sourceActionFor({ sourceName: 'Gallivan Center', sourceUrl: 'https://gallivan.example/e' })).toEqual({
      kind: 'link',
      url: 'https://gallivan.example/e',
    });
  });

  it('offers nothing for an insecure or missing link', () => {
    expect(sourceActionFor({ sourceName: 'Kilby Court', sourceUrl: 'http://kilby.example/e' })).toBeNull();
    expect(sourceActionFor({ sourceName: 'Kilby Court', sourceUrl: null })).toBeNull();
  });
});
