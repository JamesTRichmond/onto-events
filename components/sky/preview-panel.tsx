import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui/chip';
import type { SkyPreview } from '@/hooks/use-sky';

const PRESETS: Record<string, SkyPreview> = {
  Dawn: { sunAltitude: -4, rising: true, moonIllumination: 0.02 },
  Day: { sunAltitude: 45, rising: true, moonIllumination: 0.02 },
  Golden: { sunAltitude: 6, rising: false, moonIllumination: 0.02 },
  Dusk: { sunAltitude: -2, rising: false, moonIllumination: 0.02, weather: 'overcast' },
  'New moon': { sunAltitude: -30, rising: false, moonIllumination: 0.02, moonAltitude: 45 },
  'Full moon': { sunAltitude: -30, rising: false, moonIllumination: 0.98, moonAltitude: 45, moonAzimuth: 180 },
  Snow: { sunAltitude: -30, rising: false, moonIllumination: 0.5, weather: 'snow' },
  Smog: { sunAltitude: 35, rising: false, moonIllumination: 0.5, weather: 'smog' },
};

export function SkyPreviewPanel({ value, onChange, seed }: {
  value: SkyPreview | null;
  onChange: (value: SkyPreview | null) => void;
  seed: string;
}) {
  if (!__DEV__) return null;
  return (
    <View style={{ gap: 8 }}>
      <ThemedText>Development preview — not current weather</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Real sun and moon" selected={!value} onPress={() => onChange(null)} />
        {Object.entries(PRESETS).map(([label, preset]) => (
          <Chip key={label} label={label} selected={value === preset} onPress={() => onChange(preset)} />
        ))}
      </View>
      <ThemedText style={{ fontSize: 12, lineHeight: 18 }}>
        {value ? JSON.stringify(value) : 'Astronomical clock'}{'\n'}Seed: {seed}
      </ThemedText>
    </View>
  );
}
