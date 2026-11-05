/** Explicit reloads only. A handoff keeps the old page until the user returns. */
let handoffs = 0;
let downloaded = false;
export function beginHandoff() { handoffs++; return () => { handoffs = Math.max(0, handoffs - 1); }; }
export function markDownloadHandoff() { downloaded = true; }
export function acknowledgeHandoff() { downloaded = false; }
export function reloadBlocked() {
  return handoffs > 0 || downloaded || (typeof document !== 'undefined' &&
    (document.visibilityState === 'hidden' || Boolean(document.querySelector('[role="dialog"], dialog[open], [aria-modal="true"]'))));
}
export function watchUpdates(sw: ServiceWorkerContainer, ready: () => void) {
  let previous = sw.controller;
  const change = () => {
    const next = sw.controller;
    if (previous && next && next !== previous) ready();
    previous = next;
  };
  sw.addEventListener('controllerchange', change);
  return () => sw.removeEventListener('controllerchange', change);
}
export function singleReload(reload: () => void) {
  let used = false;
  return () => { if (used || reloadBlocked()) return false; used = true; reload(); return true; };
}
