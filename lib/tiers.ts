import { ActivityRating } from '@/data/activities';

export type TierMode = 'family' | 'everyone' | 'mature';

export const DEFAULT_MODE: TierMode = 'everyone';
export const ALL_MODES: TierMode[] = ['family', 'everyone', 'mature'];

export const MODE_LABEL: Record<TierMode, string> = {
  family: 'Family',
  everyone: 'Everyone',
  mature: '21+',
};

export const MATURE_MODE_INCLUDES_GENERAL = true;

/** Mature supply is fail-closed unless the production flag is exactly true. */
export function matureContentEnabled(
  value: string | undefined = process.env.EXPO_PUBLIC_ENABLE_MATURE,
): boolean {
  return value === 'true';
}

export function enabledModes(
  matureEnabled: boolean = matureContentEnabled(),
): TierMode[] {
  return matureEnabled ? ALL_MODES : ['family', 'everyone'];
}

/** The ratings a mode shows. A forged mature mode still fails closed in v1. */
export function ratingsFor(
  mode: TierMode,
  matureEnabled: boolean = matureContentEnabled(),
): ReadonlySet<ActivityRating> {
  switch (mode) {
    case 'family':
      return new Set<ActivityRating>(['family']);
    case 'everyone':
      return new Set<ActivityRating>(['general']);
    case 'mature':
      if (!matureEnabled) return new Set<ActivityRating>(['general']);
      return MATURE_MODE_INCLUDES_GENERAL
        ? new Set<ActivityRating>(['mature', 'general'])
        : new Set<ActivityRating>(['mature']);
  }
}

export function allowsPairing(mode: TierMode): boolean {
  return mode !== 'family';
}

export function joinLabel(mode: TierMode, joined: boolean): string {
  if (mode === 'family') return joined ? "You're going" : 'RSVP';
  return joined ? "You're in" : "I'm in";
}
