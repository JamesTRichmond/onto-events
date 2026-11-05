/**
 * One-shot stash for the erase notice. Erasing local data remounts the whole
 * screen tree, so a message set on the erasing screen never appears; it is
 * handed instead to the Account screen instance that mounts next.
 */
let stashedEraseNotice: string | null = null;

export function stashEraseNotice(message: string): void {
  stashedEraseNotice = message;
}

/** Returns the stashed message and clears it, or null when nothing is stashed. */
export function takeEraseNotice(): string | null {
  const message = stashedEraseNotice;
  stashedEraseNotice = null;
  return message;
}
