/**
 * Render-side HTML defense for feed strings.
 *
 * Ingest already sanitizes at write (see PR #117 / scripts/pipeline/feed-text.js).
 * This mirrors that safe path so any leftover entities or tags never paint.
 */
export class FeedText {
  private static readonly NAMED: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ensp: ' ',
    emsp: ' ',
    thinsp: ' ',
    Tab: '\t',
    NewLine: '\n',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    copy: '©',
    reg: '®',
    trade: '™',
    bull: '•',
    AMP: '&',
    LT: '<',
    GT: '>',
    QUOT: '"',
  };

  /**
   * Strip tags, decode entities, collapse whitespace for card/details display.
   * Loops until stable so double-encoded markup (`&lt;br&gt;`, `&amp;nbsp;`) never
   * paints as literal tags or entities after one pass (COM-7 / TF AstroTots).
   */
  static display(value: string | null | undefined): string {
    if (!value) return '';
    let out = String(value);
    for (let i = 0; i < 5; i += 1) {
      const next = FeedText.decode(out.replace(/<[^>]*>/g, ' '));
      if (next === out) break;
      out = next;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  private static decode(value: string): string {
    // One pass: known legacy names may omit the semicolon; unknown tokens stay.
    return value.replace(
      /&(#(?:[xX][\da-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z0-9]+;|amp|AMP|lt|LT|gt|GT|quot|QUOT|nbsp|copy|reg)/g,
      (_, token: string) => {
        const entity = token.replace(/;$/, '');
        if (Object.prototype.hasOwnProperty.call(FeedText.NAMED, entity)) {
          return FeedText.NAMED[entity];
        }
        const code = /^#x[\da-f]+$/i.test(entity)
          ? parseInt(entity.slice(2), 16)
          : /^#\d+$/.test(entity)
            ? Number(entity.slice(1))
            : NaN;
        if (
          !Number.isInteger(code) ||
          (code < 32 && ![9, 10, 13].includes(code)) ||
          code > 0x10ffff ||
          (code >= 0xd800 && code <= 0xdfff)
        ) {
          return `&${token}`;
        }
        return String.fromCodePoint(code);
      },
    );
  }
}
