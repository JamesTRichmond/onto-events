function decodeHtmlText(value, { strict = true } = {}) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ensp: ' ', emsp: ' ', thinsp: ' ', Tab: '\t', NewLine: '\n',
    ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    copy: '©', reg: '®', trade: '™', bull: '•', AMP: '&', LT: '<', GT: '>', QUOT: '"' };
  // Only known legacy names may omit the semicolon. Ordinary ampersands in
  // prose (B&Bs, rock&roll) are not invalid entities. Decode in one pass so
  // a produced ampersand cannot start a second, unintended decoding layer.
  return value.replace(/<[^>]*>/g, ' ').replace(/&(#(?:[xX][\da-fA-F]+|\d+);?|[a-zA-Z][a-zA-Z0-9]+;|amp|AMP|lt|LT|gt|GT|quot|QUOT|nbsp|copy|reg)/g, (_, token) => {
    const entity = token.replace(/;$/, '');
    if (Object.hasOwn(named, entity)) return named[entity];
    const code = /^#x[\da-f]+$/i.test(entity) ? parseInt(entity.slice(2), 16) : /^#\d+$/.test(entity) ? +entity.slice(1) : NaN;
    if (!Number.isInteger(code) || code < 32 && ![9, 10, 13].includes(code) || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) {
      if (strict) throw new Error('Unsupported HTML entity; source requires review');
      return `&${token}`;
    }
    return String.fromCodePoint(code);
  }).replace(/\s+/g, ' ').trim();
}

// Decode the HTML layer only for fields declared to contain HTML. Unknown
// named entities fail the source for review, rather than hiding age restrictions
// behind unresolved text. Plain XML/Atom text retains its literal semantics.
function htmlText(value) {
  return decodeHtmlText(value, { strict: true });
}

function safeHtmlText(value) {
  return decodeHtmlText(value, { strict: false });
}

// Display publisher prose without embedded registration UI or code. Scan
// once, with bounded tags; raw script/style bodies only end at their own
// closing tag. The complete source text still drives eligibility and rating.
function safeDisplayHtmlText(value) {
  const parts = [];
  const hidden = [];
  let cursor = 0;
  for (const match of value.matchAll(/<(\/?)(script|style|form)\b[^>]{0,4096}>/gi)) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const current = hidden.at(-1);
    if (closing && !current) continue;
    if (current === 'script' || current === 'style') {
      if (closing && tag === current) hidden.pop();
    } else if (!closing) {
      if (!hidden.length) parts.push(value.slice(cursor, match.index));
      hidden.push(tag);
    } else if (tag === current) hidden.pop();
    if (!hidden.length) cursor = match.index + match[0].length;
  }
  if (!hidden.length) parts.push(value.slice(cursor));
  return safeHtmlText(parts.join(' '));
}

module.exports = { htmlText, safeHtmlText, safeDisplayHtmlText };
