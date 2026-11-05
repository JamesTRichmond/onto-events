/** Local invalidation carries no person, plan, coordinate or attendance data. */
const listeners = new Set<() => void>();
export function onPublicCatalogChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function invalidatePublicCatalog(): void {
  listeners.forEach(listener => listener());
}
