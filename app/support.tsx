import { Link } from 'expo-router';
import { Linking, Pressable, StyleSheet } from 'react-native';

import {
  InformationPage,
  InformationSection,
  InformationText,
} from '@/components/information-page';
import { ThemedText } from '@/components/themed-text';
import { OpenSourceNotices } from '@/components/open-source-notices';
import { Brand, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LOOK_COPY } from '@/lib/pinned-spot';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || null;

export default function SupportScreen() {
  const scheme = useColorScheme() ?? 'light';

  return (
    <InformationPage
      title="Support"
      intro="Help with onto accounts, plans, event listings, and privacy.">
      <InformationSection title="Account and sign-in">
        <InformationText>
          Email codes expire. Request a new six-digit code, use only the newest email, and check
          spam if it does not arrive.
        </InformationText>
      </InformationSection>

      <InformationSection title="Events and location">
        <InformationText>
          The location row inside feed options on Things To Do chooses where onto looks. {LOOK_COPY.findMe} uses your
          location once to choose where the feed searches; it is never saved or sent to the event catalog.{' '}
          {LOOK_COPY.dropPin} lets you pick a spot on a map instead, and the pin is forgotten when
          onto closes. {LOOK_COPY.slc} opens the available cities. Choosing one changes the feed and is remembered
          when you reopen onto. You can return to your position with {LOOK_COPY.findMe}.
        </InformationText>
        <InformationText>
          If a location fix is unavailable or outside supported regions, choose a place on
          the map or an available city. Map providers receive the area you view; your pin
          stays in memory. You can allow location in system settings, then tap{' '}
          {LOOK_COPY.findMe} again.
        </InformationText>
        <InformationText>
          Pull down on Things To Do to retry the event catalog. When live updates are offline,
          Things To Do says so and shows only real, sourced listings it already has.
        </InformationText>
      </InformationSection>

      <InformationSection title="Data and deletion">
        <InformationText>
          Open Account to erase this iPhone’s local data, sign out, or permanently delete a
          signed-in account and its cloud RSVPs.
        </InformationText>
        <InformationText>
          Read the <Link href="/privacy">Privacy policy</Link> for the complete data summary.
        </InformationText>
      </InformationSection>

      <InformationSection title="Contact">
        {SUPPORT_EMAIL ? (
          <>
            <InformationText>
              Include the event name and a short description of the problem. Never email a
              sign-in code.
            </InformationText>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                Linking.openURL(
                  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('onto support')}`,
                )
              }
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: Colors[scheme].tint },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                lightColor="#FFFFFF"
                darkColor={Brand.indigo}
                style={styles.buttonText}>
                Email {SUPPORT_EMAIL}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <InformationText>
            The public support email is being configured before the App Store release.
          </InformationText>
        )}
      </InformationSection>
      <OpenSourceNotices />
    </InformationPage>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
