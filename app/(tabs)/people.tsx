import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Muted } from '@/components/ui';
import { useTierMode } from '@/hooks/use-tier-mode';

import CommunityScreen from '../community';

/**
 * People To See (James, 2026-10-07): the community pilot's hosting and
 * reviews, as a tab. Family mode keeps to publisher listings and private
 * Going, with no connect affordances (SAFETY.md), so it gets a note instead.
 * Fail closed: nothing renders until the saved mode is known, so a stored
 * Family choice never mounts the community screen under the default mode.
 */
export default function PeopleScreen() {
  const { mode, loaded } = useTierMode();
  if (!loaded) return null;
  if (mode === 'family') {
    return (
      <SafeAreaView style={styles.note}>
        <Muted>
          Family mode keeps to public listings and private Going, so hosting and reviews are off
          here. Switch to Everyone in Account to see them.
        </Muted>
      </SafeAreaView>
    );
  }
  return <CommunityScreen />;
}

const styles = StyleSheet.create({
  note: { padding: 16 },
});
