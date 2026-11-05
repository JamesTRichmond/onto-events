export type EvidenceFact<T> = {
  value: T;
  sourceUrl: string;
  excerpt: string;
  checkedOn: string;
};
export type EventFacts = {
  admission?: EvidenceFact<'free' | 'paid'>;
  includesFood?: EvidenceFact<boolean>;
};

function validEvidence(value: unknown): value is EvidenceFact<unknown> {
  if (!value || typeof value !== 'object') return false;
  const fact = value as EvidenceFact<unknown>;
  try {
    const url = new URL(fact.sourceUrl);
    return url.protocol === 'https:' && !url.username && !url.password
      && typeof fact.excerpt === 'string' && fact.excerpt.trim().length > 0 && fact.excerpt.length <= 500
      && /^\d{4}-\d{2}-\d{2}$/.test(fact.checkedOn)
      && Number.isFinite(Date.parse(fact.checkedOn))
      && new Date(fact.checkedOn).toISOString().slice(0, 10) === fact.checkedOn;
  } catch { return false; }
}

/** Unknown or malformed facts remain unknown, including when read from cache. */
export function readEventFacts(value: unknown): EventFacts {
  if (!value || typeof value !== 'object') return {};
  const facts = value as EventFacts;
  const result: EventFacts = {};
  if (validEvidence(facts.admission) && ['free', 'paid'].includes(facts.admission.value)) {
    const { value, sourceUrl, excerpt, checkedOn } = facts.admission;
    result.admission = { value, sourceUrl, excerpt, checkedOn };
  }
  if (validEvidence(facts.includesFood) && typeof facts.includesFood.value === 'boolean') {
    const { value, sourceUrl, excerpt, checkedOn } = facts.includesFood;
    result.includesFood = { value, sourceUrl, excerpt, checkedOn };
  }
  return result;
}

/** Contradictory or malformed supplied evidence cannot establish free admission. */
export function confirmedFreeAdmission(record: { admission?: 'free' | 'paid'; eventFacts?: unknown }): boolean {
  const raw = record.eventFacts;
  if (raw && typeof raw === 'object' && 'admission' in raw) {
    return readEventFacts(raw).admission?.value === 'free' && record.admission !== 'paid';
  }
  return record.admission === 'free';
}
