import { createContext, useContext } from 'react';

// Appearance is scoped to the feed; account/privacy/system themes stay independent.
export const SkyAppearance = createContext(false);
export const useSkyAppearance = () => useContext(SkyAppearance);
