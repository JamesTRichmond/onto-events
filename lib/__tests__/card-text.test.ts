import {
  CARD_TEXT_LIMITS,
  cardText,
  clipText,
  flattenWhitespace,
  placeLine,
  repeatsTitle,
} from '../card-text';

const cp = (text: string) => Array.from(text).length;

describe('clipText', () => {
  it('leaves text inside the cap alone, apart from flattening whitespace', () => {
    expect(clipText('Concert on the plaza', 60)).toBe('Concert on the plaza');
    expect(clipText('  Doors at nine.\n\n\tBring a chair.  ', 90)).toBe('Doors at nine. Bring a chair.');
  });

  it('cuts a long title at a word and drops the dangling comma', () => {
    const title = 'School of Biological Sciences RPT Faculty Seminar, Jody Reimer';
    expect(cp(title)).toBeGreaterThan(CARD_TEXT_LIMITS.title);
    expect(clipText(title, CARD_TEXT_LIMITS.title)).toBe(
      'School of Biological Sciences RPT Faculty Seminar, Jody…'
    );
  });

  it('hard-cuts one enormous word at exactly the cap', () => {
    const out = clipText('x'.repeat(200), 60);
    expect(cp(out)).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never ends on a joiner before the ellipsis', () => {
    expect(clipText('Trivia night — teams of four, prizes, and a late set', 20)).toBe('Trivia night…');
    expect(clipText('Sun & Moon & Stars & Planets & Comets', 12)).toBe('Sun & Moon…');
  });

  it('counts code points, so an emoji or an accent is never split', () => {
    const out = clipText('Café 🎷🎷🎷🎷🎷🎷 night', 8);
    expect(cp(out)).toBeLessThanOrEqual(8);
    expect(out).not.toMatch(/[\ud800-\udbff]…$/u);
    expect(Array.from(out).every((ch) => ch.length === 1 || /\p{Extended_Pictographic}/u.test(ch))).toBe(true);
  });

  it('handles degenerate caps without throwing', () => {
    expect(clipText('anything', 0)).toBe('');
    expect(clipText('anything', 1)).toBe('…');
    expect(clipText('', 10)).toBe('');
  });

  it('holds its contract over many inputs: short enough, honest prefix, ellipsis iff cut', () => {
    const words = ['onto', 'Salt', 'Lake', 'music', 'night,', '—', 'trail', '🎷', 'Café', 'x'.repeat(30)];
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let run = 0; run < 500; run++) {
      const n = next() % 40;
      const text = Array.from({ length: n }, () => words[next() % words.length]).join(next() % 3 ? ' ' : '\n ');
      const max = 2 + (next() % 100);
      const out = clipText(text, max);
      const flat = flattenWhitespace(text);
      expect(cp(out)).toBeLessThanOrEqual(max);
      if (cp(flat) <= max) {
        expect(out).toBe(flat);
      } else {
        expect(out.endsWith('…')).toBe(true);
        expect(flat.startsWith(out.slice(0, -1))).toBe(true);
      }
    }
  });
});

describe('placeLine', () => {
  it('keeps venue and area together when both fit', () => {
    expect(placeLine('Kilby Court', 'Salt Lake City, UT')).toBe('Kilby Court · Salt Lake City, UT');
  });

  it('gives up the area first when the pair is too long', () => {
    expect(placeLine('First Unitarian Church of Salt Lake City', 'Salt Lake City, UT')).toBe(
      'First Unitarian Church of Salt Lake City'
    );
    expect(placeLine('Aline Wilmot Skaggs Biology Building', 'Salt Lake City, UT')).toBe(
      'Aline Wilmot Skaggs Biology Building'
    );
  });

  it('clips a venue that is too long on its own', () => {
    const out = placeLine('The Very Long Official Name of a Community Recreation Center Annex', 'Murray, UT');
    expect(cp(out)).toBeLessThanOrEqual(CARD_TEXT_LIMITS.place);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('The Very Long Official Name')).toBe(true);
  });

  it('falls back to whichever part exists', () => {
    expect(placeLine('', 'Sugar House')).toBe('Sugar House');
    expect(placeLine('Liberty Park', '  ')).toBe('Liberty Park');
    expect(placeLine('', '')).toBe('');
  });
});

describe('cardText', () => {
  it('caps all three card fields with the one set of limits', () => {
    const long = 'Join us for an evening of sea-ice ecology, with coffee after. '.repeat(5);
    const text = cardText({
      title: 'School of Biological Sciences RPT Faculty Seminar, Jody Reimer',
      venue: 'Aline Wilmot Skaggs Biology Building',
      area: 'Salt Lake City, UT',
      description: long,
    });
    expect(cp(text.title)).toBeLessThanOrEqual(CARD_TEXT_LIMITS.title);
    expect(cp(text.place)).toBeLessThanOrEqual(CARD_TEXT_LIMITS.place);
    expect(cp(text.description)).toBeLessThanOrEqual(CARD_TEXT_LIMITS.description);
    expect(text.description.endsWith('…')).toBe(true);
  });

  it('changes nothing about a short listing', () => {
    expect(
      cardText({ title: 'Concert on the plaza', venue: 'Gallivan Center', area: 'Downtown',
        description: 'Outdoor stage downtown. Lawn chairs and food trucks.' })
    ).toEqual({
      title: 'Concert on the plaza',
      place: 'Gallivan Center · Downtown',
      description: 'Outdoor stage downtown. Lawn chairs and food trucks.',
    });
  });

  it('sanitizes residual markup/entities before clipping the description', () => {
    expect(
      cardText({
        title: 'AstroTots',
        venue: 'Clark Planetarium',
        area: 'Downtown',
        description: 'Join us!&lt;br&gt;&lt;strong&gt;Ages 2-5&lt;/strong&gt;&amp;nbsp;at the dome.',
      }).description,
    ).toBe('Join us! Ages 2-5 at the dome.');
  });
});

describe('a description that only repeats the title', () => {
  it('is left off the card face', () => {
    expect(repeatsTitle('Kitchen: KS', 'Kitchen: KS')).toBe(true);
    expect(repeatsTitle('Kitchen: KS', '  kitchen:\n KS ')).toBe(true);
    expect(repeatsTitle('Free Yoga in Liberty Park', 'free yoga')).toBe(true);
    expect(repeatsTitle('Party at the Museum', 'art')).toBe(false);
    expect(repeatsTitle('Art Party at the Museum', 'art')).toBe(true);
    expect(cardText({ title: 'Kitchen: KS', venue: 'First Unitarian Church of Salt Lake City',
      area: 'Salt Lake City, UT', description: 'Kitchen: KS' }).description).toBe('');
    expect(repeatsTitle('Kitchen: KS', '&lt;strong&gt;kitchen: ks&lt;/strong&gt;')).toBe(true);
    expect(cardText({ title: 'Kitchen: KS', venue: 'First Unitarian Church of Salt Lake City',
      area: 'Salt Lake City, UT', description: '&lt;strong&gt;Kitchen: KS&lt;/strong&gt;' }).description).toBe('');
  });

  it('stays when it says anything the title does not', () => {
    expect(repeatsTitle('Kitchen: KS', 'Kitchen: KS — community dinner, all welcome')).toBe(false);
    expect(repeatsTitle('Kitchen: KS', '')).toBe(false);
    expect(cardText({ title: 'Friko', venue: 'Kilby Court', area: 'Salt Lake City, UT',
      description: 'Alternative' }).description).toBe('Alternative');
  });
});
