import { useState } from 'react';
import { Platform } from 'react-native';
import { LEAFLET_LICENSE } from '@/lib/leaflet-license';

import { FONT_LICENSE } from '@/assets/fonts/license';
import { InformationSection, InformationText } from '@/components/information-page';
import { ActionButton } from '@/components/ui/action-button';
import { ASTRONOMY_LICENSE } from '@/lib/sky/astronomy';

/** Notices travel with native/offline builds, not only a private source repository. */
export function OpenSourceNotices() {
  const [expanded, setExpanded] = useState(false);
  return (
    <InformationSection title="Open-source acknowledgments">
      <ActionButton
        label={expanded ? 'Hide licenses' : 'Read app licenses'}
        quiet
        onPress={() => setExpanded((value) => !value)}
      />
      {expanded ? (
        <>
          <InformationText>{FONT_LICENSE}</InformationText>
          {Platform.OS === 'web' ? <InformationText>{`Leaflet browser maps\n\n${LEAFLET_LICENSE}`}</InformationText> : null}
          <InformationText>{`SunCalc approximate astronomy\n\n${ASTRONOMY_LICENSE}`}</InformationText>
        </>
      ) : null}
    </InformationSection>
  );
}
