import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ActionButton } from './action-button';
import { Muted } from './muted';
import { onPublicCatalogChanged, invalidatePublicCatalog } from '@/lib/catalog-refresh';
import { useUiPalette } from '@/hooks/use-ui-palette';
import { useOntoBackend, useOptionalOntoBackend } from '@/lib/backend/context';
import type { PublicReview } from '@/lib/community';
import { arrivalPromptEligible } from '@/lib/community';
import type { FeedItem } from '@/lib/feed';
import { useArrivalFeedback } from '@/hooks/use-arrival-feedback';
import type { TierMode } from '@/lib/tiers';
export function CommunityDetails(
  props: Parameters<typeof ConnectedCommunityDetails>[0],
) {
  const context = useOptionalOntoBackend();
  const owner =
    context?.auth.state.kind === 'signed-in'
      ? context.auth.state.user.id
      : 'guest';
  return context ? (
    <ConnectedCommunityDetails
      key={`${owner}:${props.item.id}:${props.mode}`}
      {...props}
    />
  ) : null;
}
function ConnectedCommunityDetails({
  item,
  joined,
  mode,
  onNavigate,
}: {
  item: FeedItem;
  joined: boolean;
  mode: TierMode;
  onNavigate?: () => void;
}) {
  const { hostingBackend, reviewsBackend, publicReviewsBackend } =
    useOntoBackend();
  const [reviews, setReviews] = useState<PublicReview[]>([]),
    [ready, setReady] = useState(false),
    [hostingReady, setHostingReady] = useState(false),
    [compose, setCompose] = useState(false),
    [score, setScore] = useState('5'),
    [text, setText] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const palette = useUiPalette();
  const [revision, setRevision] = useState(0);
  useEffect(() => onPublicCatalogChanged(() => { setReviews([]); setRevision(value => value + 1); }), []);
  const arrival = useArrivalFeedback(item.id);
  useEffect(() => {
    let active = true;
    setReviews([]);
    setReady(false);
    setHostingReady(false);
    if (mode === 'everyone' && item.rating === 'general') {
      publicReviewsBackend
        ?.listPublicReviews(item.id)
        .then((value) => {
          if (active) setReviews(value);
        })
        .catch(() => {});
      hostingBackend
        ?.getPilotState()
        .then((value) => {
          if (active) {
            setReady(value.reviews && reviewsBackend !== null);
            setHostingReady(value.hosting);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [
    revision,
    publicReviewsBackend,
    reviewsBackend,
    hostingBackend,
    item.id,
    item.rating,
    mode,
  ]);
  if (mode !== 'everyone' || item.rating !== 'general') return null;
  const arrivalEligible = arrival.loaded && !!item.startsAtIso && arrivalPromptEligible(
    { startsAt: item.startsAtIso, endsAt: item.endsAtIso ?? null },
    joined,
    Date.now(),
  );
  const act = async (operation: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
      invalidatePublicCatalog();
      setMessage(success);
    } catch {
      setMessage('Could not save this action. Please try again later.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {item.hosted ? (
        <>
          <ThemedText type="defaultSemiBold">How to find us</ThemedText>
          <Muted>{item.hosted.meetingInstructions}</Muted>
          {item.hosted.newcomersWelcome ? (
            <Muted>Newcomers welcome</Muted>
          ) : null}
        </>
      ) : null}
      {arrivalEligible && !arrival.answered ? (
        <>
          <ThemedText>Find it okay?</ThemedText>
          <Muted>Your answer stays on this device.</Muted>
          {(['easy', 'hard', 'skipped'] as const).map((value) => (
            <ActionButton
              key={value}
              label={
                value === 'easy'
                  ? 'Yes, easy'
                  : value === 'hard'
                    ? 'Hard to find'
                    : 'Skip'
              }
              quiet
              onPress={() => arrival.answer(value)}
            />
          ))}
        </>
      ) : null}
      {arrivalEligible ? (
        <Link href="/support" onPress={onNavigate}>Send a venue correction</Link>
      ) : null}
      {hostingReady ? (
        <Link
          href={{ pathname: '/community', params: { parentEventId: item.id } }}
          onPress={onNavigate}
        >
          What’s next? Plan a spin-off
        </Link>
      ) : null}
      {item.hosted && reviewsBackend ? (
        <ActionButton
          label="Report this activity"
          quiet
          busy={busy}
          onPress={() =>
            act(
              () =>
                reviewsBackend.reportContent(
                  'host',
                  item.id.replace(/^hosted-/, ''),
                  'Activity needs safety or accuracy review',
                ),
              'Report sent for human review. It does not remove content automatically.',
            )
          }
        />
      ) : null}
      {reviews.length ? (
        <ThemedText type="defaultSemiBold">Community reviews</ThemedText>
      ) : null}
      {reviews.map((review) => (
        <View key={review.id}>
          <Muted>
            {review.score}/5 · {review.text}
          </Muted>
          {reviewsBackend ? (
            <ActionButton
              label="Report review"
              quiet
              onPress={() =>
                act(
                  () =>
                    reviewsBackend.reportContent(
                      'review',
                      review.id,
                      'Review needs safety or accuracy review',
                    ),
                  'Report sent for human review.',
                )
              }
            />
          ) : null}
        </View>
      ))}
      {ready && !compose ? (
        <ActionButton
          label="Write an anonymous public review"
          quiet
          onPress={() => setCompose(true)}
        />
      ) : null}
      {compose ? (
        <>
          <Muted>
            This review will be public after approval. Leave out people’s names
            and personal details. We do not verify attendance.
          </Muted>
          <TextInput
            accessibilityLabel="Review rating from 1 to 5"
            value={score}
            onChangeText={setScore}
            keyboardType="number-pad"
            style={{ color: palette.text, padding: 12 }}
          />
          <TextInput
            accessibilityLabel="Public review"
            value={text}
            onChangeText={setText}
            maxLength={1000}
            multiline
            style={{ color: palette.text, padding: 12 }}
          />
          <ActionButton
            label="Submit public review"
            busy={busy}
            onPress={() =>
              act(
                () =>
                  reviewsBackend!
                    .saveReview({
                      eventId: item.id,
                      score: Number(score),
                      text,
                    })
                    .then(() => {
                      setCompose(false);
                      setText('');
                    }),
                'Review submitted. It stays private until approved.',
              )
            }
          />
          <ActionButton
            label="Cancel review"
            quiet
            onPress={() => setCompose(false)}
          />
        </>
      ) : null}
      {message ? <Muted>{message}</Muted> : null}
    </View>
  );
}
