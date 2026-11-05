import { createContext, useCallback, useContext, useMemo, type PropsWithChildren } from 'react';

import { useLocationChoice } from '@/hooks/use-location-choice';
import { useUserLocation } from '@/hooks/use-user-location';
import { resolveLocationOrigin } from '@/lib/location-choice';

type SelectedLocation = ReturnType<typeof useLocationChoice> & {
  resolved: ReturnType<typeof resolveLocationOrigin>;
  findMe: () => void;
};

const SelectedLocationContext = createContext<SelectedLocation | null>(null);

/** One launch preference and one memory-only fix/pin for every mounted tab. */
export function SelectedLocationProvider({ children }: PropsWithChildren) {
  const selection = useLocationChoice();
  const device = useUserLocation(selection.loaded && selection.choice === 'device');
  const { preference, pin, loaded, choice, followDevice } = selection;
  const resolved = useMemo(() => resolveLocationOrigin(preference, pin, device, loaded),
    [preference, pin, device, loaded]);
  const findMe = useCallback(() => {
    followDevice();
    // Enabling device mode asks once itself. Only an already enabled owner
    // needs a refresh; doing both duplicates the launch permission/fix.
    if (loaded && choice === 'device') device.refresh();
  }, [loaded, choice, followDevice, device]);
  return <SelectedLocationContext.Provider value={{ ...selection, resolved, findMe }}>{children}</SelectedLocationContext.Provider>;
}

export function useSelectedLocation(): SelectedLocation {
  const value = useContext(SelectedLocationContext);
  if (!value) throw new Error('SelectedLocationProvider is required for location consumers.');
  return value;
}
