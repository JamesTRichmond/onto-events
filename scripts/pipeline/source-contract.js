// Registration is the only composition point. Names own retirement scopes;
// prefixes own row ids, whose primary key is shared across every source.
function createSourceRegistry(adapters) {
  const names = new Set();
  const prefixes = [];
  const sources = adapters.map((adapter) => {
    if (!adapter || typeof adapter.sourceName !== 'string' || !adapter.sourceName.trim()
        || adapter.sourceName !== adapter.sourceName.trim()
        || typeof adapter.idPrefix !== 'string' || !/^[a-z0-9-]+-$/.test(adapter.idPrefix)
        || typeof adapter.fetch !== 'function' || typeof adapter.normalize !== 'function'
        || !Array.isArray(adapter.requiredSecrets)
        || adapter.requiredSecrets.some((name) => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(name))) {
      throw new Error('Invalid source adapter contract');
    }
    const name = adapter.sourceName.toLowerCase();
    if (names.has(name)) throw new Error(`Duplicate source name: ${adapter.sourceName}`);
    if (prefixes.some((prefix) => prefix.startsWith(adapter.idPrefix) || adapter.idPrefix.startsWith(prefix))) {
      throw new Error(`Overlapping source id prefix: ${adapter.idPrefix}`);
    }
    names.add(name);
    prefixes.push(adapter.idPrefix);
    return Object.freeze({
      ...adapter,
      requiredSecrets: Object.freeze([...adapter.requiredSecrets]),
    });
  });
  return Object.freeze(sources);
}

module.exports = { createSourceRegistry };
