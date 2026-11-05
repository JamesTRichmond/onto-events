/**
 * Native implementation: a document title is a web concept. Rendering
 * expo-router's Head on iOS shows the "Expo Head: add the handoff origin"
 * alert that build 6 surfaced on every screen, so this is a deliberate no-op.
 * The web implementation lives in document-title.web.tsx.
 */
export function DocumentTitle(_props: { title: string }) {
  return null;
}
