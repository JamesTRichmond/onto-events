// Restricted XML reader for public RSS/Atom. Reject DTDs, external entities,
// malformed nesting and unbound namespaces; never repair a broken feed into a
// partial successful snapshot. No network or entity expansion is possible here.
function decode(value) {
  return value.replace(/&([^;\s]*);?/g, (entity, name) => {
    if (!entity.endsWith(';')) throw new Error('Unterminated XML entity');
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, name)) return named[name];
    const number = /^#x[\da-f]+$/i.test(name) ? parseInt(name.slice(2), 16) : /^#\d+$/.test(name) ? +name.slice(1) : NaN;
    if (!Number.isInteger(number) || number > 0x10ffff || number < 32 && ![9, 10, 13].includes(number) || number >= 0xd800 && number <= 0xdfff) throw new Error('Unsupported XML entity');
    return String.fromCodePoint(number);
  });
}

function parseXml(xml) {
  const document = { children: [], namespaces: Object.create(null), parts: [] };
  const stack = [document];
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?(?:"[^"]*"|'[^']*'|[^'"<>])*>|[^<]+/g;
  let cursor = 0;
  let count = 0;
  for (const match of xml.matchAll(tokens)) {
    if (match.index !== cursor) throw new Error('Malformed feed XML');
    cursor += match[0].length;
    const token = match[0];
    const parent = stack[stack.length - 1];
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) { parent.parts.push(token.slice(9, -3)); continue; }
    if (token.startsWith('<!')) throw new Error('XML declarations and entities are forbidden');
    if (token.startsWith('</')) {
      const name = token.match(/^<\/([\w.:-]+)\s*>$/)?.[1];
      if (stack.length === 1 || name !== parent.name) throw new Error('Unbalanced feed XML');
      stack.pop();
      continue;
    }
    if (!token.startsWith('<')) { parent.parts.push(decode(token)); continue; }
    const tag = token.match(/^<([A-Za-z_][\w.:-]*)([\s\S]*?)(\/?)>$/);
    if (!tag || ++count > 100000 || stack.length > 50) throw new Error('Invalid or excessive feed XML');
    const attrs = Object.create(null);
    let rest = tag[2];
    while (rest.trim()) {
      const attr = rest.match(/^\s+([A-Za-z_][\w.:-]*)\s*=\s*("[^"]*"|'[^']*')/);
      if (!attr || Object.hasOwn(attrs, attr[1])) throw new Error('Invalid XML attributes');
      attrs[attr[1]] = decode(attr[2].slice(1, -1));
      rest = rest.slice(attr[0].length);
    }
    const namespaces = Object.assign(Object.create(null), parent.namespaces);
    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'xmlns') namespaces[''] = value;
      else if (name.startsWith('xmlns:')) namespaces[name.slice(6)] = value;
    }
    const pieces = tag[1].split(':');
    const prefix = pieces.length === 2 ? pieces[0] : '';
    if (pieces.length > 2 || prefix && !namespaces[prefix]) throw new Error('Unbound XML namespace');
    const node = { name: tag[1], local: pieces.at(-1), ns: namespaces[prefix] ?? '', attrs, namespaces, children: [], parts: [] };
    parent.children.push(node);
    parent.parts.push(node);
    if (!tag[3]) stack.push(node);
  }
  if (cursor !== xml.length || stack.length !== 1 || document.children.length !== 1 || document.parts.some((p) => typeof p === 'string' && p.trim())) throw new Error('Incomplete feed XML');
  return document.children[0];
}

const child = (node, name, ns = '') => node.children.find((item) => item.local === name && item.ns === ns);
const content = (node) => node ? node.parts.map((part) => typeof part === 'string' ? part : content(part)).join('') : '';

module.exports = { parseXml, child, content };
