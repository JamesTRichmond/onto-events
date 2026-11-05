// Mirrors the public-evidence contract in lib/event-facts.ts. No text inference.
function readEventFacts(input) {
  const facts = {};
  if (!input || typeof input !== 'object') return facts;
  for (const [key, values] of [['admission', ['free', 'paid']], ['includesFood', [true, false]]]) {
    const fact = input[key];
    if (!fact || !values.includes(fact.value)) continue;
    try {
      const url = new URL(fact.sourceUrl);
      if (url.protocol !== 'https:' || url.username || url.password
          || typeof fact.excerpt !== 'string' || !fact.excerpt.trim() || fact.excerpt.length > 500
          || !/^\d{4}-\d{2}-\d{2}$/.test(fact.checkedOn)
          || !Number.isFinite(Date.parse(fact.checkedOn))
          || new Date(fact.checkedOn).toISOString().slice(0, 10) !== fact.checkedOn) continue;
      const { value, sourceUrl, excerpt, checkedOn } = fact;
      facts[key] = { value, sourceUrl, excerpt, checkedOn };
    } catch { /* Unknown is never true. */ }
  }
  return facts;
}
function confirmedFreeAdmission(record) {
  const raw = record.eventFacts;
  if (raw && typeof raw === 'object' && 'admission' in raw) {
    return readEventFacts(raw).admission?.value === 'free' && record.admission !== 'paid';
  }
  return record.admission === 'free';
}
module.exports = { readEventFacts, confirmedFreeAdmission };
