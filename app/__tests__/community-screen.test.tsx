/* eslint-disable @typescript-eslint/no-require-imports -- Use the existing isolated native storage mock. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import CommunityScreen from '../community';
import type { HostedSubmission, HostingBackend, ReviewsBackend, ReviewerBackend, OwnReview } from '@/lib/community';
import type { TierMode } from '@/lib/tiers';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockTier = { mode: 'everyone' as TierMode, loaded: true };
jest.mock('@/hooks/use-tier-mode', () => ({ useTierMode: () => mockTier }));

const target: HostedSubmission = {
  id: '00000000-0000-0000-0000-000000000011',
  venueId: 'public-library', title: 'Tuesday Board Games',
  description: 'Public games at the library', meetingInstructions: 'Meet at the public desk',
  startsAt: '2099-10-20T19:00:00-04:00', endsAt: '2099-10-20T21:00:00-04:00',
  category: 'games', newcomersWelcome: true, state: 'approved', version: 7, reviewNote: null,
};
const report = { id: 'report-one', kind: 'host', targetId: target.id, reason: 'Meeting instructions need review', resolved: false };
const mockHosting: HostingBackend = {
  getPilotState: jest.fn(), listVenues: jest.fn(), listMyHosted: jest.fn(),
  saveHosted: jest.fn(), cancelHosted: jest.fn(),
};
const mockReviews: ReviewsBackend = {
  listPublicReviews: jest.fn(), listMyReviews: jest.fn(), saveReview: jest.fn(),
  deleteReview: jest.fn(), reportContent: jest.fn(),
};
const mockReviewer: ReviewerBackend = {
  listPendingHosts: jest.fn(), listPendingReviews: jest.fn(), listReports: jest.fn(),
  resolveReport: jest.fn(), moderate: jest.fn(),
};
const mockContext = {
  auth: { state: { kind: 'signed-in', user: { id: 'reviewer-account' } } },
  hostingBackend: mockHosting, reviewsBackend: mockReviews,
  reviewerBackend: mockReviewer as ReviewerBackend | null,
};
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => mockContext }));

beforeEach(() => {
  jest.clearAllMocks();
  mockTier.mode = 'everyone';
  mockTier.loaded = true;
  mockContext.auth.state = { kind: 'signed-in', user: { id: 'reviewer-account' } };
  mockContext.reviewerBackend = mockReviewer;
  (mockHosting.getPilotState as jest.Mock).mockResolvedValue({ hosting: true, reviews: true, reviewer: true });
  (mockHosting.listVenues as jest.Mock).mockResolvedValue([]);
  (mockHosting.listMyHosted as jest.Mock).mockResolvedValue([]);
  (mockReviews.listMyReviews as jest.Mock).mockResolvedValue([]);
  (mockReviews.saveReview as jest.Mock).mockReset().mockResolvedValue('saved-review');
  (mockReviews.deleteReview as jest.Mock).mockReset().mockResolvedValue(undefined);
  (mockReviewer.listPendingHosts as jest.Mock).mockResolvedValue([
    { ...target, id: 'different-activity', title: 'Wednesday Board Games', version: 9 }, target,
  ]);
  (mockReviewer.listPendingReviews as jest.Mock).mockResolvedValue([]);
  (mockReviewer.listReports as jest.Mock).mockResolvedValue([report]);
  (mockReviewer.moderate as jest.Mock).mockReset().mockResolvedValue(undefined);
});

it('identifies reported content and removes only its current approved version', async () => {
  (mockReviewer.moderate as jest.Mock).mockImplementationOnce(async () => {
    (mockReviewer.listPendingHosts as jest.Mock).mockResolvedValue([{ ...target, state: 'rejected', version: 8 }]);
  });
  render(<CommunityScreen />);
  await screen.findByText('Reported activity: Tuesday Board Games');
  fireEvent.changeText(screen.getByLabelText('Review decision note'), 'Correct the meeting instructions');
  fireEvent.press(screen.getByLabelText('Remove reported activity: Tuesday Board Games'));
  await waitFor(() => expect(mockReviewer.moderate).toHaveBeenCalledWith('host', target.id, 7, false, 'Correct the meeting instructions'));
  await screen.findByText('Reported content removed from public discovery.');
  await screen.findByText('Reported content unavailable');
  expect(mockReviewer.resolveReport).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Remove reported activity: Tuesday Board Games')).toBeNull();
});

it('removes the matching review instead of an activity with the same ID', async () => {
  const review: OwnReview = { id: target.id, eventId: 'published-event', score: 2, text: 'The meeting point needs correcting', state: 'approved', version: 4, reviewNote: null };
  (mockReviewer.listPendingReviews as jest.Mock).mockResolvedValue([review]);
  (mockReviewer.listReports as jest.Mock).mockResolvedValue([{ ...report, kind: 'review' }]);
  (mockReviewer.moderate as jest.Mock).mockImplementationOnce(async () => {
    (mockReviewer.listPendingReviews as jest.Mock).mockResolvedValue([{ ...review, state: 'rejected', version: 5 }]);
  });
  render(<CommunityScreen />);
  await screen.findByText('Reported review');
  fireEvent.press(screen.getByLabelText('Remove reported review'));
  await waitFor(() => expect(mockReviewer.moderate).toHaveBeenCalledWith('review', target.id, 4, false, ''));
  await screen.findByText('Reported content unavailable');
});

it.each(['pending', 'rejected', 'cancelled'] as const)('cannot remove a reported activity whose current state is %s', async (state) => {
  (mockReviewer.listPendingHosts as jest.Mock).mockResolvedValue([{ ...target, state }]);
  render(<CommunityScreen />);
  await screen.findByText('Reported content unavailable');
  expect(screen.queryByLabelText('Remove reported activity: Tuesday Board Games')).toBeNull();
  expect(mockReviewer.moderate).not.toHaveBeenCalled();
});

it('keeps a failed removal unresolved and reloads the current target before retrying', async () => {
  (mockReviewer.moderate as jest.Mock).mockRejectedValueOnce(new Error('Submission changed'));
  render(<CommunityScreen />);
  await screen.findByText('Reported activity: Tuesday Board Games');
  fireEvent.press(screen.getByLabelText('Remove reported activity: Tuesday Board Games'));
  await screen.findByText('Could not complete this action. Check your entries or reload and try again.');
  expect(mockReviewer.resolveReport).not.toHaveBeenCalled();
  (mockReviewer.listPendingHosts as jest.Mock).mockResolvedValue([{ ...target, title: 'Updated Board Games', version: 8 }]);
  fireEvent.press(screen.getByLabelText('Reload review queue'));
  await waitFor(() => expect(mockReviewer.listPendingHosts).toHaveBeenCalledTimes(2));
  await screen.findByText('Reported activity: Updated Board Games');
  fireEvent.press(screen.getByLabelText('Remove reported activity: Updated Board Games'));
  await waitFor(() => expect(mockReviewer.moderate).toHaveBeenLastCalledWith('host', target.id, 8, false, ''));
  await screen.findByText('Reported content removed from public discovery.');
  await waitFor(() => expect(mockReviewer.listReports).toHaveBeenCalledTimes(3));
});

it('hides reviewer reports as soon as the reviewer capability detaches', async () => {
  const view = render(<CommunityScreen />);
  await screen.findByText('Reported activity: Tuesday Board Games');
  mockContext.reviewerBackend = null;
  await act(async () => view.rerender(<CommunityScreen />));
  expect(screen.queryByText('Reports')).toBeNull();
  expect(screen.queryByLabelText('Remove reported activity: Tuesday Board Games')).toBeNull();
  expect(mockReviewer.moderate).not.toHaveBeenCalled();
});

it('does not load or show reports for a non-reviewer account', async () => {
  (mockHosting.getPilotState as jest.Mock).mockResolvedValue({ hosting: true, reviews: true, reviewer: false });
  render(<CommunityScreen />);
  await screen.findByText('Host an activity');
  expect(screen.queryByText('Reports')).toBeNull();
  expect(mockReviewer.listReports).not.toHaveBeenCalled();
});

it('edits only the selected own review and reloads its pending version', async () => {
  const review: OwnReview = { id: 'own-review', eventId: 'published-event', score: 3, text: 'The signs helped', state: 'approved', version: 4, reviewNote: null };
  (mockHosting.getPilotState as jest.Mock).mockResolvedValue({ hosting: false, reviews: true, reviewer: false });
  (mockReviews.listMyReviews as jest.Mock).mockResolvedValue([review]);
  (mockReviews.saveReview as jest.Mock).mockImplementationOnce(async (input) => {
    (mockReviews.listMyReviews as jest.Mock).mockResolvedValue([{ ...review, ...input, state: 'pending', version: 5 }]);
    return review.id;
  });
  render(<CommunityScreen />);
  await screen.findByText('3/5 · The signs helped · approved');
  fireEvent.press(screen.getByLabelText('Edit review'));
  expect(screen.getByDisplayValue('3')).toBeTruthy();
  expect(screen.getByDisplayValue('The signs helped')).toBeTruthy();
  expect(screen.getByText('Your edited review becomes private until reviewed again.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Edited review rating'), '4');
  fireEvent.changeText(screen.getByLabelText('Edited public review'), 'The public entrance signs were clear.');
  fireEvent.press(screen.getByLabelText('Submit edited review'));
  await waitFor(() => expect(mockReviews.saveReview).toHaveBeenCalledWith({ eventId: review.eventId, score: 4, text: 'The public entrance signs were clear.' }));
  await screen.findByText('Edited review submitted for approval.');
  await screen.findByText('4/5 · The public entrance signs were clear. · pending');
  expect(screen.queryByLabelText('Edited public review')).toBeNull();
  expect(mockReviews.listMyReviews).toHaveBeenCalledTimes(2);
  expect(mockReviews.deleteReview).not.toHaveBeenCalled();
  expect(mockReviewer.moderate).not.toHaveBeenCalled();
});

it('deletes the selected own review and retains another review after reloading', async () => {
  const review: OwnReview = { id: 'own-review', eventId: 'published-event', score: 3, text: 'The signs helped', state: 'approved', version: 4, reviewNote: null };
  const another: OwnReview = { ...review, id: 'another-own-review', eventId: 'another-event', score: 5, text: 'The room was clearly marked' };
  (mockHosting.getPilotState as jest.Mock).mockResolvedValue({ hosting: false, reviews: true, reviewer: false });
  (mockReviews.listMyReviews as jest.Mock).mockResolvedValue([review, another]);
  (mockReviews.deleteReview as jest.Mock).mockImplementationOnce(async () => {
    (mockReviews.listMyReviews as jest.Mock).mockResolvedValue([another]);
  });
  render(<CommunityScreen />);
  await screen.findByText('3/5 · The signs helped · approved');
  fireEvent.press(screen.getAllByLabelText('Delete review')[0]);
  await waitFor(() => expect(mockReviews.deleteReview).toHaveBeenCalledWith(review.id));
  await screen.findByText('Review deleted.');
  await waitFor(() => expect(mockReviews.listMyReviews).toHaveBeenCalledTimes(2));
  await expect((mockReviews.listMyReviews as jest.Mock).mock.results[1].value).resolves.toEqual([another]);
  await waitFor(() => expect(screen.queryByText('3/5 · The signs helped · approved')).toBeNull());
  expect(screen.getByText('5/5 · The room was clearly marked · approved')).toBeTruthy();
  expect(screen.getAllByLabelText('Delete review')).toHaveLength(1);
  expect(mockReviews.listMyReviews).toHaveBeenCalledTimes(2);
  expect(mockReviews.saveReview).not.toHaveBeenCalled();
  expect(mockReviewer.moderate).not.toHaveBeenCalled();
});

it.each(['family', 'mature'] as const)('keeps a direct Community route closed in %s mode without loading private ports', (mode) => {
  mockTier.mode = mode;
  render(<CommunityScreen />);
  expect(screen.getByText('Hosting and public reviews are available in Everyone. Switch to Everyone in Account to see them.')).toBeTruthy();
  expect(screen.queryByText('Community')).toBeNull();
  expect(screen.queryByLabelText('Host an activity')).toBeNull();
  expect(screen.queryByText('Your public reviews')).toBeNull();
  expect(mockHosting.getPilotState).not.toHaveBeenCalled();
  expect(mockHosting.listVenues).not.toHaveBeenCalled();
  expect(mockHosting.listMyHosted).not.toHaveBeenCalled();
  expect(mockReviews.listMyReviews).not.toHaveBeenCalled();
  expect(mockReviewer.listReports).not.toHaveBeenCalled();
});

it('waits for the stored mode and never mounts community for a loaded Family choice', () => {
  mockTier.loaded = false;
  const view = render(<CommunityScreen />);
  expect(screen.queryByText('Community')).toBeNull();
  expect(mockHosting.getPilotState).not.toHaveBeenCalled();
  mockTier.mode = 'family';
  mockTier.loaded = true;
  view.rerender(<CommunityScreen />);
  expect(screen.getByText('Hosting and public reviews are available in Everyone. Switch to Everyone in Account to see them.')).toBeTruthy();
  expect(mockHosting.getPilotState).not.toHaveBeenCalled();
  expect(mockReviews.listMyReviews).not.toHaveBeenCalled();
});

it('mounts the signed-in Everyone panel only after mode loading completes', async () => {
  mockTier.loaded = false;
  const view = render(<CommunityScreen />);
  expect(mockHosting.getPilotState).not.toHaveBeenCalled();
  mockTier.loaded = true;
  view.rerender(<CommunityScreen />);
  await screen.findByLabelText('Host an activity');
  expect(mockHosting.getPilotState).toHaveBeenCalledTimes(1);
  expect(mockReviews.listMyReviews).toHaveBeenCalledTimes(1);
});

it('unmounts an open private draft on a live switch to Family and starts clean on returning to Everyone', async () => {
  const view = render(<CommunityScreen />);
  fireEvent.press(await screen.findByLabelText('Host an activity'));
  fireEvent.changeText(screen.getByLabelText('Activity title'), 'Unsubmitted private draft');
  mockTier.mode = 'family';
  view.rerender(<CommunityScreen />);
  expect(screen.queryByLabelText('Activity title')).toBeNull();
  expect(screen.queryByLabelText('Save draft')).toBeNull();
  expect(screen.queryByLabelText('Delete review')).toBeNull();
  expect(screen.queryByText('Reports')).toBeNull();
  expect(mockHosting.saveHosted).not.toHaveBeenCalled();
  expect(mockReviews.saveReview).not.toHaveBeenCalled();
  expect(mockReviews.deleteReview).not.toHaveBeenCalled();
  mockTier.mode = 'everyone';
  view.rerender(<CommunityScreen />);
  fireEvent.press(await screen.findByLabelText('Host an activity'));
  expect(screen.getByLabelText('Activity title').props.value).toBe('');
  expect(screen.queryByDisplayValue('Unsubmitted private draft')).toBeNull();
  expect(mockHosting.getPilotState).toHaveBeenCalledTimes(2);
});

it('stops a held community load from starting private queries after switching to Family', async () => {
  let release!: (state: { hosting: boolean; reviews: boolean; reviewer: boolean }) => void;
  const pending = new Promise((resolve) => { release = resolve; });
  (mockHosting.getPilotState as jest.Mock).mockImplementationOnce(() => pending);
  const view = render(<CommunityScreen />);
  expect(mockHosting.getPilotState).toHaveBeenCalledTimes(1);
  mockTier.mode = 'family';
  view.rerender(<CommunityScreen />);
  await act(async () => { release({ hosting: true, reviews: true, reviewer: true }); await pending; });
  expect(mockHosting.listVenues).not.toHaveBeenCalled();
  expect(mockHosting.listMyHosted).not.toHaveBeenCalled();
  expect(mockReviews.listMyReviews).not.toHaveBeenCalled();
  expect(mockReviewer.listReports).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Host an activity')).toBeNull();
  expect(screen.queryByText('Reports')).toBeNull();
});
