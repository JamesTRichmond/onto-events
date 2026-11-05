import { useState } from 'react';
import { Pressable, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Muted } from '@/components/ui/muted';
import { useUiPalette } from '@/hooks/use-ui-palette';
import { saveToCalendar, type ShareableActivity } from '@/lib/calendar-share';

export function SaveToCalendar({ item, compact = false, onFeedback }: {
  item: ShareableActivity; compact?: boolean; onFeedback?: (message: string) => void;
}) {
  const palette = useUiPalette();
  const [notice, setNotice] = useState('');
  const handoff = async () => {
    const result = await saveToCalendar(item);
    const message = result === 'handed-off' ? 'Calendar file handed to your device. Choose your calendar to finish.'
      : result === 'cancelled' ? 'Calendar handoff cancelled.' : 'Calendar handoff unavailable. A source start time and a supported browser are required.';
    if (onFeedback) onFeedback(message); else setNotice(message);
  };
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Save to calendar: ${item.title}`}
      onPress={() => { void handoff(); }} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
      {compact ? <MaterialIcons name="event" size={22} color={palette.text} /> : <Muted>Save to calendar</Muted>}
    </Pressable>
    {notice ? <Muted accessibilityLiveRegion="polite">{notice}</Muted> : null}
  </View>;
}
