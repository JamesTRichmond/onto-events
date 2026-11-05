export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes('#access_token') || path.includes('#refresh_token')) {
    return path.replace('#', '?');
  }
  return path;
}
