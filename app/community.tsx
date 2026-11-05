import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ActionButton, Chip, Muted } from '@/components/ui';
import { useOntoBackend } from '@/lib/backend/context';
import type {
  HostedSubmission,
  OwnReview,
  PublicVenue,
  HostingInput,
  PilotState,
  CommunityReport,
} from '@/lib/community';
import { reportedTarget } from '@/lib/community-reports';
import { invalidatePublicCatalog } from '@/lib/catalog-refresh';
import { venueTimeIso, venueTimeFields } from '@/lib/venue-time';
import { ALL_CATEGORIES } from '@/data/activities';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTierMode } from '@/hooks/use-tier-mode';
export default function CommunityScreen() {
  const context = useOntoBackend();
  const { mode, loaded } = useTierMode();
  const owner =
    context.auth.state.kind === 'signed-in' ? context.auth.state.user.id : null;
  if (!loaded) return null;
  if (mode !== 'everyone')
    return (
      <SafeAreaView style={{ padding: 20 }}>
        <Muted>
          Hosting and public reviews are available in Everyone. Switch to Everyone in Account to see them.
        </Muted>
      </SafeAreaView>
    );
  if (!owner)
    return (
      <SafeAreaView style={{ padding: 20 }}>
        <Muted>
          Sign in from Account to host or manage your reviews. Browsing and
          Going stay available without an account.
        </Muted>
      </SafeAreaView>
    );
  return <CommunityPanel key={owner} />;
}
function CommunityPanel() {
  const {
    hostingBackend: hosting,
    reviewsBackend: reviews,
    reviewerBackend: reviewer,
  } = useOntoBackend();
  const params = useLocalSearchParams<{ parentEventId?: string }>();
  const color = Colors[useColorScheme() ?? 'light'].text;
  const [pilot, setPilot] = useState<PilotState>({
      hosting: false,
      reviews: false,
      reviewer: false,
    }),
    [venues, setVenues] = useState<PublicVenue[]>([]),
    [hosts, setHosts] = useState<HostedSubmission[]>([]),
    [ownReviews, setOwnReviews] = useState<OwnReview[]>([]),
    [queue, setQueue] = useState<HostedSubmission[]>([]),
    [reviewQueue, setReviewQueue] = useState<OwnReview[]>([]),
    [reports, setReports] = useState<CommunityReport[]>([]);
  const [revision, setRevision] = useState(0),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<string | undefined>(),
    [showForm, setShowForm] = useState(false),
    [note, setNote] = useState('');
  const empty: HostingInput = {
    title: '',
    description: '',
    meetingInstructions: '',
    venueId: '',
    startsAt: '',
    endsAt: '',
    category: 'community',
    newcomersWelcome: false,
    ...(typeof params.parentEventId === 'string'
      ? { parentEventId: params.parentEventId }
      : {}),
  };
  const [editReview, setEditReview] = useState<OwnReview | null>(null),
    [reviewScore, setReviewScore] = useState(''),
    [reviewText, setReviewText] = useState('');
  const [draft, setDraft] = useState<HostingInput>(empty);
  const [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState(''),
    [startTime, setStartTime] = useState(''),
    [endTime, setEndTime] = useState('');
  const timedDraft = () => {
    const venue = venues.find((v) => v.id === draft.venueId);
    if (!venue) throw new Error('Choose a venue');
    return {
      ...draft,
      startsAt: venueTimeIso(startDate, startTime, venue.timezone),
      endsAt: venueTimeIso(endDate || startDate, endTime, venue.timezone),
    };
  };
  useEffect(() => {
    let active = true;
    (async () => {
      if (!hosting) return;
      try {
        const state = await hosting.getPilotState();
        if (!active) return;
        const [v, h, r] = await Promise.all([
          hosting.listVenues(),
          hosting.listMyHosted(),
          reviews?.listMyReviews() ?? Promise.resolve([]),
        ]);
        if (!active) return;
        setPilot(state);
        setVenues(v);
        setHosts(h);
        setOwnReviews(r);
        if (state.reviewer && reviewer) {
          const [q, rq, rp] = await Promise.all([
            reviewer.listPendingHosts(),
            reviewer.listPendingReviews(),
            reviewer.listReports(),
          ]);
          if (active) {
            setQueue(q);
            setReviewQueue(rq);
            setReports(rp);
          }
        }
      } catch {
        if (active) setMessage('The community pilot is not available yet.');
      }
    })();
    return () => {
      active = false;
    };
  }, [hosting, reviews, reviewer, revision]);
  const action = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      invalidatePublicCatalog();
      setMessage(success);
      setRevision((x) => x + 1);
    } catch {
      setMessage(
        'Could not complete this action. Check your entries or reload and try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const field = (
    key:
      | 'title'
      | 'description'
      | 'meetingInstructions'
      | 'startsAt'
      | 'endsAt',
    label: string,
    multiline = false,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={color}
      value={draft[key]}
      onChangeText={(value) => setDraft((old) => ({ ...old, [key]: value }))}
      multiline={multiline}
      style={{
        color,
        borderWidth: 1,
        borderColor: color,
        padding: 12,
        borderRadius: 8,
      }}
      maxLength={
        key === 'description' ? 4000 : key === 'meetingInstructions' ? 500 : 240
      }
    />
  );
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 16,
          maxWidth: 640,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <ThemedText type="title">Community</ThemedText>
        <Muted>
          Everyone activities at verified public venues. Going stays private.
          James reviews each submission before it appears.
        </Muted>
        {!pilot.hosting ? (
          <Muted>Hosting is not open yet.</Muted>
        ) : (
          <ActionButton
            label={
              params.parentEventId ? 'Plan a spin-off' : 'Host an activity'
            }
            onPress={() => {
              setEditing(undefined);
              setDraft(empty);
              setStartDate('');
              setEndDate('');
              setStartTime('');
              setEndTime('');
              setShowForm(true);
            }}
          />
        )}
        {showForm && pilot.hosting ? (
          <View style={{ gap: 12 }}>
            <ThemedText type="subtitle">
              {draft.parentEventId ? 'New spin-off' : 'Your activity'}
            </ThemedText>
            <Muted>
              A spin-off is your new plan; it does not copy attendees or imply
              the original organizer endorses it.
            </Muted>
            {field('title', 'Activity title')}
            {field('description', 'Public description', true)}
            <ThemedText>Choose a public venue</ThemedText>
            {venues.map((v) => (
              <Chip
                key={v.id}
                label={`${v.name} · ${v.locality}`}
                selected={draft.venueId === v.id}
                onPress={() => setDraft((old) => ({ ...old, venueId: v.id }))}
              />
            ))}
            {!venues.length ? (
              <Muted>No reviewed public venues are available yet.</Muted>
            ) : null}
            {field('meetingInstructions', 'How to find the group', true)}
            <Muted>
              Use a public landmark or meeting point. Do not include a home
              address or identify attendees.
            </Muted>
            <Muted>
              Enter the local time at{' '}
              {venues.find((v) => v.id === draft.venueId)?.name ??
                'your chosen venue'}
              .
            </Muted>
            {[
              {
                label: 'Start date (YYYY-MM-DD)',
                value: startDate,
                set: setStartDate,
              },
              {
                label: 'Start time (HH:mm, 24-hour)',
                value: startTime,
                set: setStartTime,
              },
              {
                label: 'End date (blank for same day)',
                value: endDate,
                set: setEndDate,
              },
              {
                label: 'End time (HH:mm, 24-hour)',
                value: endTime,
                set: setEndTime,
              },
            ].map((f) => (
              <TextInput
                key={f.label}
                accessibilityLabel={f.label}
                placeholder={f.label}
                placeholderTextColor={color}
                value={f.value}
                onChangeText={f.set}
                style={{
                  color,
                  borderWidth: 1,
                  borderColor: color,
                  padding: 12,
                }}
              />
            ))}
            {ALL_CATEGORIES.filter(
              (c) => !['nightlife', 'roadtrip'].includes(c),
            ).map((c) => (
              <Chip
                key={c}
                label={c}
                selected={draft.category === c}
                onPress={() => setDraft((old) => ({ ...old, category: c }))}
              />
            ))}
            <Chip
              label="Newcomers welcome"
              selected={draft.newcomersWelcome}
              onPress={() =>
                setDraft((old) => ({
                  ...old,
                  newcomersWelcome: !old.newcomersWelcome,
                }))
              }
            />
            <ActionButton
              label="Save draft"
              busy={busy}
              onPress={() =>
                action(
                  () =>
                    hosting!
                      .saveHosted(timedDraft(), editing, false)
                      .then((id) => setEditing(id)),
                  'Draft saved privately.',
                )
              }
            />
            <ActionButton
              label="Submit for review"
              busy={busy}
              onPress={() =>
                action(
                  () =>
                    hosting!
                      .saveHosted(timedDraft(), editing, true)
                      .then(() => setShowForm(false)),
                  'Submitted for review. It is not public yet.',
                )
              }
            />
            <ActionButton
              label="Close draft"
              quiet
              onPress={() => setShowForm(false)}
            />
          </View>
        ) : null}
        <ThemedText type="subtitle">Your activities</ThemedText>
        {hosts.map((h) => (
          <View key={h.id} style={{ gap: 8 }}>
            <ThemedText>
              {h.title} · {h.state}
            </ThemedText>
            {h.reviewNote ? <Muted>{h.reviewNote}</Muted> : null}
            {h.state !== 'cancelled' ? (
              <>
                <ActionButton
                  label="Edit activity"
                  quiet
                  onPress={() => {
                    setDraft(h);
                    const zone =
                      venues.find((v) => v.id === h.venueId)?.timezone ??
                      'America/New_York';
                    const start = venueTimeFields(h.startsAt, zone),
                      end = venueTimeFields(h.endsAt, zone);
                    setStartDate(start.date);
                    setStartTime(start.time);
                    setEndDate(end.date);
                    setEndTime(end.time);
                    setEditing(h.id);
                    setShowForm(true);
                  }}
                />
                <ActionButton
                  label="Cancel activity"
                  quiet
                  busy={busy}
                  onPress={() =>
                    action(
                      () => hosting!.cancelHosted(h.id),
                      'Activity cancelled.',
                    )
                  }
                />
              </>
            ) : null}
          </View>
        ))}
        <ThemedText type="subtitle">Your public reviews</ThemedText>
        {ownReviews.map((r) => (
          <View key={r.id}>
            <Muted>
              {r.score}/5 · {r.text} · {r.state}
            </Muted>
            {r.reviewNote ? <Muted>{r.reviewNote}</Muted> : null}
            <ActionButton
              label="Edit review"
              quiet
              onPress={() => {
                setEditReview(r);
                setReviewScore(String(r.score));
                setReviewText(r.text);
              }}
            />
            <ActionButton
              label="Delete review"
              quiet
              onPress={() =>
                action(() => reviews!.deleteReview(r.id), 'Review deleted.')
              }
            />
          </View>
        ))}
        {editReview && pilot.reviews ? (
          <View>
            <Muted>
              Your edited review becomes private until reviewed again.
            </Muted>
            <TextInput
              accessibilityLabel="Edited review rating"
              value={reviewScore}
              onChangeText={setReviewScore}
              keyboardType="number-pad"
              style={{ color, padding: 12 }}
            />
            <TextInput
              accessibilityLabel="Edited public review"
              value={reviewText}
              onChangeText={setReviewText}
              maxLength={1000}
              multiline
              style={{ color, padding: 12 }}
            />
            <ActionButton
              label="Submit edited review"
              busy={busy}
              onPress={() =>
                action(
                  () =>
                    reviews!
                      .saveReview({
                        eventId: editReview.eventId,
                        score: Number(reviewScore),
                        text: reviewText,
                      })
                      .then(() => setEditReview(null)),
                  'Edited review submitted for approval.',
                )
              }
            />
            <ActionButton
              label="Cancel edit"
              quiet
              onPress={() => setEditReview(null)}
            />
          </View>
        ) : null}
        {pilot.reviewer && reviewer ? (
          <>
            <ThemedText type="subtitle">Review queue</ThemedText>
            <Muted>
              Check public venue, age suitability, personal information, event
              accuracy and text that identifies attendees. Remove unsafe
              approved content as well as reviewing pending submissions.
            </Muted>
            <ActionButton
              label="Reload review queue"
              quiet
              busy={busy}
              onPress={() => setRevision((value) => value + 1)}
            />
            <TextInput
              accessibilityLabel="Review decision note"
              placeholder="Decision note"
              placeholderTextColor={color}
              value={note}
              onChangeText={setNote}
              maxLength={500}
              style={{ color, padding: 12 }}
            />
            {queue
              .filter((h) => ['pending', 'approved'].includes(h.state))
              .map((h) => (
                <View key={h.id} style={{ gap: 8 }}>
                  <ThemedText>
                    {h.title} · {h.state}
                  </ThemedText>
                  <Muted>{h.description}</Muted>
                  <Muted>{h.meetingInstructions}</Muted>
                  <Muted>
                    {h.startsAt} – {h.endsAt} ·{' '}
                    {venues.find((v) => v.id === h.venueId)?.name ?? h.venueId}
                  </Muted>
                  <Muted>
                    {h.category}
                    {h.newcomersWelcome ? ' · Newcomers welcome' : ''}
                    {h.parentEventId ? ' · Spin-off' : ''}
                  </Muted>
                  <ActionButton
                    label="Approve activity"
                    busy={busy}
                    onPress={() =>
                      action(
                        () =>
                          reviewer!.moderate(
                            'host',
                            h.id,
                            h.version,
                            true,
                            note,
                          ),
                        'Approved.',
                      )
                    }
                  />
                  <ActionButton
                    label="Reject or remove activity"
                    quiet
                    busy={busy}
                    onPress={() =>
                      action(
                        () =>
                          reviewer!.moderate(
                            'host',
                            h.id,
                            h.version,
                            false,
                            note,
                          ),
                        'Removed from public discovery.',
                      )
                    }
                  />
                </View>
              ))}
            {reviewQueue
              .filter((r) => ['pending', 'approved'].includes(r.state))
              .map((r) => (
                <View key={r.id}>
                  <Muted>
                    {r.score}/5 · {r.text} · {r.state}
                  </Muted>
                  <ActionButton
                    label="Approve review"
                    busy={busy}
                    onPress={() =>
                      action(
                        () =>
                          reviewer!.moderate(
                            'review',
                            r.id,
                            r.version,
                            true,
                            note,
                          ),
                        'Approved.',
                      )
                    }
                  />
                  <ActionButton
                    label="Reject or remove review"
                    quiet
                    busy={busy}
                    onPress={() =>
                      action(
                        () =>
                          reviewer!.moderate(
                            'review',
                            r.id,
                            r.version,
                            false,
                            note,
                          ),
                        'Removed.',
                      )
                    }
                  />
                </View>
              ))}
            <ThemedText type="subtitle">Reports</ThemedText>
            {reports
              .filter((r) => !r.resolved)
              .map((r) => {
                const target = reportedTarget(r, queue, reviewQueue, venues);
                return (
                  <View key={r.id} style={{ gap: 8 }}>
                    <ThemedText type="defaultSemiBold">
                      {target?.label ?? 'Reported content unavailable'}
                    </ThemedText>
                    {target ? (
                      <Muted>{target.details}</Muted>
                    ) : (
                      <Muted>Reload the queue before acting on this content.</Muted>
                    )}
                    <Muted>Report reason: {r.reason}</Muted>
                    {target ? (
                      <ActionButton
                        label={target.removalLabel}
                        quiet
                        busy={busy}
                        onPress={() =>
                          action(
                            () =>
                              reviewer.moderate(
                                target.kind,
                                target.id,
                                target.version,
                                false,
                                note,
                              ),
                            'Reported content removed from public discovery.',
                          )
                        }
                      />
                    ) : null}
                    <ActionButton
                      label="Mark report reviewed"
                      quiet
                      busy={busy}
                      onPress={() =>
                        action(
                          () => reviewer.resolveReport(r.id),
                          'Report marked reviewed.',
                        )
                      }
                    />
                  </View>
                );
              })}
          </>
        ) : null}
        {message ? <Muted>{message}</Muted> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
