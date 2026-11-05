import { UpdateFallback } from '@/components/ui/pwa-update';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisplayName } from '@/components/ui/display-name';
import { InstallAppCard } from '@/components/ui/install-app-card';
import { AppleSignIn } from '@/components/ui/apple-sign-in';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ActionButton, Chip, Muted as MutedBase, RouteButton } from '@/components/ui';
import { Colors, Surface } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppFontStyle } from '@/hooks/use-app-fonts';
import { useMapsApp } from '@/hooks/use-maps-app';
import { useTicketSellers } from '@/hooks/use-ticket-sellers';
import { useTierMode } from '@/hooks/use-tier-mode';
import { enabledModes, MODE_LABEL } from '@/lib/tiers';
import { confirmThen } from '@/lib/confirm';
import { DEVICE_NOUN } from '@/lib/device-noun';
import { MAPS_APP_LABEL, MAPS_APPS } from '@/lib/maps-choice';
import { useOntoBackend } from '@/lib/backend/context';
import type { RsvpHistoryItem } from '@/lib/backend/contracts';
import { stashEraseNotice, takeEraseNotice } from '@/lib/erase-notice';
import { eraseAllOntoData } from '@/lib/storage';

const MAX_CONTENT_WIDTH = 800;

// Account copy runs at body size; the feed's Muted defaults to small.
function Muted({ children }: { children: React.ReactNode }) {
  return <MutedBase variant="body">{children}</MutedBase>;
}

function formatPlanDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date to be confirmed';
  return parsed.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AccountScreen() {
  const inputFont = useAppFontStyle('500');
  const { app: mapsApp, choose: chooseMapsApp } = useMapsApp();
  const ticketSellers = useTicketSellers();
  const {
    mode,
    matureEnabled,
    pendingAdultConfirm,
    requestMode,
    confirmAdult,
    cancelAdultConfirm,
  } = useTierMode();
  const scheme = useColorScheme() ?? 'light';
  const { auth, rsvpBackend: backend } = useOntoBackend();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [eraseNotice, setEraseNotice] = useState<string | null>(() => takeEraseNotice());
  const [plans, setPlans] = useState<RsvpHistoryItem[]>([]);
  const [plansStatus, setPlansStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [plansReloadVersion, setPlansReloadVersion] = useState(0);
  const signedInUserId = auth.state.kind === 'signed-in' ? auth.state.user.id : null;
  const authKind = auth.state.kind;

  useEffect(() => {
    if (authKind !== 'signed-out') return;
    setEmail('');
    setCode('');
    setCodeSent(false);
  }, [authKind]);

  useFocusEffect(
    useCallback(() => {
      void plansReloadVersion;
      if (!signedInUserId || !backend) {
        setPlans([]);
        setPlansStatus('idle');
        return;
      }

      let cancelled = false;
      setPlansStatus('loading');
      backend.listMyRsvpHistory().then(
        (items) => {
          if (cancelled) return;
          setPlans(items);
          setPlansStatus('idle');
        },
        () => {
          if (!cancelled) setPlansStatus('error');
        },
      );
      return () => {
        cancelled = true;
      };
    }, [backend, plansReloadVersion, signedInUserId]),
  );

  const requestCode = useCallback(async () => {
    setEraseNotice(null);
    const sent = await auth.requestCode(email);
    if (!sent) return;
    setCodeSent(true);
    AccessibilityInfo.announceForAccessibility('Sign-in code sent');
  }, [auth, email]);

  const verifyCode = useCallback(async () => {
    const verified = await auth.verifyCode(email, code);
    if (!verified) return;
    setCode('');
    AccessibilityInfo.announceForAccessibility('Signed in to onto');
  }, [auth, code, email]);

  const confirmErase = useCallback(() => {
    confirmThen({
      title: 'Erase local data?',
      message:
        auth.state.kind === 'signed-in'
          ? `This signs you out on this ${DEVICE_NOUN} and removes its interests, plans, preferences, and saved session. Your cloud account stays active.`
          : `This removes interests, plans, and preferences stored on this ${DEVICE_NOUN}.`,
      confirmLabel: 'Erase',
      onConfirm: async () => {
        setEraseNotice(null);
        const revoked = auth.state.kind === 'signed-in' ? await auth.signOut() : true;
        if (revoked) {
          await eraseAllOntoData();
          AccessibilityInfo.announceForAccessibility('Local onto data erased');
          return;
        }
        const message =
          `Local data on this ${DEVICE_NOUN} was erased and you are signed out on this device, but the server could not be reached to end the session. Sign in and sign out again when you are back online.`;
        auth.clearError();
        // The erase remounts this screen, so the notice goes to the next instance.
        stashEraseNotice(message);
        await eraseAllOntoData();
        AccessibilityInfo.announceForAccessibility(message);
      },
    });
  }, [auth]);

  const confirmDelete = useCallback(() => {
    const expectedUserId = auth.state.kind === 'signed-in' ? auth.state.user.id : null;
    if (!expectedUserId) return;
    confirmThen({
      title: 'Delete account?',
      message: `This permanently deletes this onto account, its cloud RSVPs, reviews, and hosted activities. Its saved plans on this ${DEVICE_NOUN} are removed. This cannot be undone. You can still browse without an account.`,
      confirmLabel: 'Delete account',
      onConfirm: async () => {
        const deleted = await auth.deleteAccount(expectedUserId);
        if (!deleted) return;
        AccessibilityInfo.announceForAccessibility('onto account deleted');
      },
    });
  }, [auth]);

  const signedIn = auth.state.kind === 'signed-in';
  const pending = auth.pendingAction !== null;
  const signedInUser = auth.state.kind === 'signed-in' ? auth.state.user : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <ThemedText type="title">Account</ThemedText>
            <Muted>Save your plans across devices. You can keep browsing without signing in.</Muted>
          </View>

          {auth.state.kind === 'loading' ? (
            <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
              <ActivityIndicator color={Colors[scheme].tint} />
              <Muted>Checking your account.</Muted>
            </ThemedView>
          ) : signedIn && signedInUser ? (
            <>
              <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
                <ThemedText type="subtitle">Signed in</ThemedText>
                <AppleSignIn repair />
        <DisplayName />
                <Muted>{signedInUser.email ?? 'Your onto account'}</Muted>
                <ActionButton
                  label="Sign out"
                  quiet
                  busy={auth.pendingAction === 'sign-out'}
                  disabled={pending && auth.pendingAction !== 'sign-out'}
                  onPress={() => {
                    auth.signOut();
                  }}
                />
              </ThemedView>

              <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
                <ThemedText type="subtitle">RSVP history</ThemedText>
                {plansStatus === 'loading' ? (
                  <View style={styles.inline}>
                    <ActivityIndicator color={Colors[scheme].tint} />
                    <Muted>Loading your plans.</Muted>
                  </View>
                ) : plansStatus === 'error' ? (
                  <>
                    <Muted>Your plans could not be loaded right now.</Muted>
                    <ActionButton
                      label="Try again"
                      quiet
                      onPress={() => setPlansReloadVersion((value) => value + 1)}
                    />
                  </>
                ) : plans.length === 0 ? (
                  <Muted>No RSVPs yet. Save a plan from Things To Do and it will appear here.</Muted>
                ) : (
                  plans.map((plan) => (
                    <View key={plan.eventId} style={styles.plan}>
                      <ThemedText style={styles.planTitle}>{plan.title}</ThemedText>
                      <Muted>{formatPlanDate(plan.startsAt)}</Muted>
                      {plan.venueName ? <Muted>{plan.venueName}</Muted> : null}
                      <Muted>
                        {plan.status === 'cancelled'
                          ? 'Cancelled'
                          : new Date(plan.endsAt ?? plan.startsAt).getTime() < Date.now()
                            ? 'Past'
                            : plan.status === 'interested'
                              ? 'Interested'
                              : 'Going'}
                      </Muted>
                    </View>
                  ))
                )}
              </ThemedView>
            </>
          ) : auth.available ? (
            <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
              <AppleSignIn />
              <ThemedText type="subtitle">
                {codeSent ? 'Enter your code' : 'Sign in without a password'}
              </ThemedText>
              <Muted>
                {codeSent
                  ? `We sent a six-digit code to ${email.trim()}.`
                  : 'We will email you a short-lived six-digit code.'}
              </Muted>
              <TextInput
                value={email}
                onChangeText={setEmail}
                editable={!codeSent && !pending}
                placeholder="you@example.com"
                placeholderTextColor={Colors[scheme].icon}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                accessibilityLabel="Email address"
                style={[
                  styles.input,
                  scheme === 'dark' && styles.inputDark,
                  codeSent && styles.inputDisabled,
                  inputFont,
                ]}
              />
              {codeSent ? (
                <>
                  <TextInput
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={Colors[scheme].icon}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    accessibilityLabel="Six-digit sign-in code"
                    style={[styles.input, scheme === 'dark' && styles.inputDark, inputFont]}
                  />
                  <ActionButton
                    label="Verify code"
                    onPress={verifyCode}
                    busy={auth.pendingAction === 'verify-code'}
                    disabled={code.length !== 6 || (pending && auth.pendingAction !== 'verify-code')}
                  />
                  <View style={styles.buttonRow}>
                    <ActionButton
                      label="Send another code"
                      quiet
                      onPress={requestCode}
                      busy={auth.pendingAction === 'request-code'}
                      disabled={pending && auth.pendingAction !== 'request-code'}
                    />
                    <ActionButton
                      label="Use a different email"
                      quiet
                      disabled={pending}
                      onPress={() => {
                        auth.clearError();
                        setCode('');
                        setCodeSent(false);
                      }}
                    />
                  </View>
                </>
              ) : (
                <ActionButton
                  label="Email me a code"
                  onPress={requestCode}
                  busy={auth.pendingAction === 'request-code'}
                  disabled={email.trim().length === 0 || pending}
                />
              )}
            </ThemedView>
          ) : (
            <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
              <ThemedText type="subtitle">Accounts are temporarily unavailable</ThemedText>
              <Muted>Nearby discovery still works.</Muted>
            </ThemedView>
          )}

          {auth.error ? (
            <ThemedView
              lightColor="#FFF0ED"
              darkColor="#3A211E"
              style={styles.notice}
              accessibilityRole="alert">
              <ThemedText>{auth.error.message}</ThemedText>
            </ThemedView>
          ) : null}

          <InstallAppCard />
          <UpdateFallback />

          <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card} testID="feed-mode">
            <ThemedText type="subtitle">Feed mode</ThemedText>
            <View style={styles.chipRow}>
              {enabledModes(matureEnabled).map((m) => (
                <Chip key={m} label={MODE_LABEL[m]} selected={mode === m} onPress={() => requestMode(m)} />
              ))}
            </View>
            {matureEnabled && pendingAdultConfirm ? (
              <View accessibilityRole="alert" style={styles.confirmBlock}>
                <ThemedText type="subtitle">Confirm you are 21 or older</ThemedText>
                <Muted>21+ mode may include events at bars, casinos, and other age-restricted venues.</Muted>
                <View style={styles.chipRow}>
                  <Chip label="I am 21 or older" selected={false} onPress={confirmAdult} />
                  <Chip label="Not now" selected={false} onPress={cancelAdultConfirm} />
                </View>
              </View>
            ) : null}
            <Muted>Family, Everyone, and 21+ decide which events the feed shows.</Muted>
          </ThemedView>

          <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card} testID="ticket-sellers">
            <ThemedText type="subtitle">Ticket sellers in Things To Do</ThemedText>
            <View style={styles.chipRow}>
              <Chip label="Off" accessibilityLabel="Ticket sellers off" selected={!ticketSellers.shown}
                onPress={ticketSellers.hide} />
              <Chip label="On" accessibilityLabel="Ticket sellers on" selected={ticketSellers.shown}
                onPress={ticketSellers.requestShow} accessibilityHint="Asks you to confirm before Things To Do shows them." />
            </View>
            {ticketSellers.pendingConfirm ? (
              <View accessibilityRole="alert" style={styles.confirmBlock}>
                <ThemedText type="subtitle">Show ticket sellers in Things To Do?</ThemedText>
                <Muted>
                  Adds listings from Ticketmaster, Live Nation, AXS, SeatGeek, StubHub, TickPick and other
                  ticket sellers to the free and local events Things To Do shows.
                </Muted>
                <View style={styles.chipRow}>
                  <Chip label="Show ticket sellers" selected={false} onPress={ticketSellers.confirmShow} />
                  <Chip label="Not now" selected={false} onPress={ticketSellers.cancelShow} />
                </View>
              </View>
            ) : null}
            <Muted>Things To Do is free and local first. Ticket sellers stay hidden unless you turn them on here.</Muted>
          </ThemedView>

          <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card} testID="maps-choice">
            <ThemedText type="subtitle">Directions open in</ThemedText>
            <View style={styles.chipRow}>
              {MAPS_APPS.map((option) => (
                <Chip
                  key={option}
                  label={MAPS_APP_LABEL[option]}
                  selected={mapsApp === option}
                  onPress={() => chooseMapsApp(option)}
                />
              ))}
            </View>
            <Muted>onto sends only the venue to your maps app, never where you are.</Muted>
          </ThemedView>

          <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card} testID="coming-soon-card">
            <ThemedText type="subtitle">Coming soon to onto</ThemedText>
            <Muted>Features in development for upcoming releases:</Muted>
            <View style={styles.featureItem}>
              <ThemedText type="defaultSemiBold">🏷️ User-Created Community Events</ThemedText>
              <Muted>Post garage sales, pickup games, group motorcycle rides, cycling rollouts, and neighborhood pop-ups directly onto the feed.</Muted>
            </View>
            <View style={styles.featureItem}>
              <ThemedText type="defaultSemiBold">👥 People To See & Meetups</ThemedText>
              <Muted>Host meetups around public events and discover who else is attending with shared interests.</Muted>
              <View style={styles.buttonRow}>
                <RouteButton href="/community" label="Community pilot & hosting" />
              </View>
            </View>
            <View style={styles.featureItem}>
              <ThemedText type="defaultSemiBold">🔔 Local Activity Alerts</ThemedText>
              <Muted>Get quiet, customizable weekly digests of new events posted within 5 miles.</Muted>
            </View>
            <View style={styles.featureItem}>
              <ThemedText type="defaultSemiBold">🗺️ Weekend Road Tripper</ThemedText>
              <Muted>Plan multi-city weekend discovery itineraries across connected onto regions.</Muted>
            </View>
          </ThemedView>

          <ThemedView lightColor={Surface.element.light} darkColor={Surface.element.dark} style={styles.card}>
            <ThemedText type="subtitle">Data and privacy</ThemedText>
            <Muted>Your precise location stays on this {DEVICE_NOUN} and is not saved to your account.</Muted>
            <View style={styles.buttonRow}>
              <RouteButton href="/privacy" label="Privacy policy" />
              <RouteButton href="/support" label="Support" />
            </View>
            <ActionButton label={`Erase data on this ${DEVICE_NOUN}`} quiet onPress={confirmErase} />
            {eraseNotice ? (
              <ThemedView
                lightColor="#FFF0ED"
                darkColor="#3A211E"
                style={styles.notice}
                accessibilityRole="alert">
                <ThemedText>{eraseNotice}</ThemedText>
              </ThemedView>
            ) : null}
            {signedIn ? (
              <ActionButton
                label="Delete account permanently"
                destructive
                busy={auth.pendingAction === 'delete-account'}
                disabled={pending && auth.pendingAction !== 'delete-account'}
                onPress={confirmDelete}
              />
            ) : null}
          </ThemedView>

        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heading: {
    gap: 6,
  },
  confirmBlock: {
    gap: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  featureItem: {
    gap: 4,
    paddingTop: 6,
  },
  notice: {
    borderRadius: 16,
    padding: 16,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    color: '#11181C',
  },
  inputDark: {
    backgroundColor: '#151718',
    color: '#ECEDEE',
  },
  inputDisabled: {
    opacity: 0.65,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inline: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plan: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#8A8F98',
    paddingTop: 12,
    gap: 2,
  },
  planTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
