/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories load isolated native mocks. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommunityDetails } from '../community-details';
import { invalidatePublicCatalog } from '@/lib/catalog-refresh';
import { STORAGE_KEYS } from '@/lib/storage';
import type { FeedItem } from '@/lib/feed';
import type { PublicReviewsBackend, HostingBackend, ReviewsBackend } from '@/lib/community';
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockLinkNavigate = jest.fn();
jest.mock('expo-router', () => ({ Link: ({ children, onPress, href }: any) => { const { Text } = require('react-native'); return <Text accessibilityRole="link" onPress={() => { onPress?.(); mockLinkNavigate(href); }}>{children}</Text>; } }));
const mockContext: { auth: {state: any}; publicReviewsBackend: PublicReviewsBackend; hostingBackend: Partial<HostingBackend>|null; reviewsBackend: Partial<ReviewsBackend>|null } = { auth: {state:{kind:'signed-out'}}, publicReviewsBackend:{listPublicReviews:jest.fn()}, hostingBackend:null, reviewsBackend:null };
jest.mock('@/lib/backend/context', () => ({ useOntoBackend: () => mockContext, useOptionalOntoBackend: () => mockContext }));
const item = { id:'event', title:'Public activity', rating:'general', startsAtIso:'2099-01-01T18:00:00Z' } as FeedItem;
const savedPlan = { ...item, startsAtIso: '2026-10-10T19:00:00Z', endsAtIso: '2026-10-10T20:00:00Z' };
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); mockContext.auth.state = {kind:'signed-out'}; mockContext.hostingBackend=null; mockContext.reviewsBackend=null; (mockContext.publicReviewsBackend.listPublicReviews as jest.Mock).mockResolvedValue([{id:'review',eventId:'event',score:4,text:'Clear meeting instructions'}]); });
afterEach(() => jest.restoreAllMocks());
it('guests can read approved anonymous output without a posting or attendance requirement', async () => {
 render(<CommunityDetails item={item} joined={false} mode="everyone" />);
 await screen.findByText('4/5 · Clear meeting instructions');
 expect(screen.queryByText('Write an anonymous public review')).toBeNull();
 expect(screen.queryByText(/What’s next/)).toBeNull();
 expect(screen.queryByText(/verified attendance/i)).toBeNull();
});
it('Family never offers reviews, hosting or newcomer features', async () => {
 render(<CommunityDetails item={{...item,hosted:{meetingInstructions:'Desk',newcomersWelcome:true}}} joined mode="family" />);
 await waitFor(() => expect(mockContext.publicReviewsBackend.listPublicReviews).not.toHaveBeenCalled());
 expect(screen.queryByText('How to find us')).toBeNull(); expect(screen.queryByText('Newcomers welcome')).toBeNull();
});
it('disabled pilot hides submission and spin-off affordances', async () => {
 mockContext.auth.state={kind:'signed-in',user:{id:'a'}};
 mockContext.hostingBackend={getPilotState:jest.fn().mockResolvedValue({hosting:false,reviews:false,reviewer:false})};
 mockContext.reviewsBackend={saveReview:jest.fn()};
 render(<CommunityDetails item={item} joined={false} mode="everyone" />);
 await screen.findByText('4/5 · Clear meeting instructions');
 expect(screen.queryByText('Write an anonymous public review')).toBeNull(); expect(screen.queryByText(/What’s next/)).toBeNull();
});
it('account switch discards a private unfinished review', async () => {
 mockContext.auth.state={kind:'signed-in',user:{id:'a'}};
 mockContext.hostingBackend={getPilotState:jest.fn().mockResolvedValue({hosting:true,reviews:true,reviewer:false})}; mockContext.reviewsBackend={saveReview:jest.fn()};
 const view=render(<CommunityDetails item={item} joined={false} mode="everyone" />);
 fireEvent.press(await screen.findByText('Write an anonymous public review'));
 fireEvent.changeText(screen.getByLabelText('Public review'),'Private unfinished text');
 mockContext.auth.state={kind:'signed-in',user:{id:'b'}};
 view.rerender(<CommunityDetails item={item} joined={false} mode="everyone" />);
 await screen.findByText('Write an anonymous public review');
 expect(screen.queryByDisplayValue('Private unfinished text')).toBeNull(); expect(screen.queryByLabelText('Public review')).toBeNull();
 expect(mockContext.reviewsBackend.saveReview).not.toHaveBeenCalled();
});

it('navigating to a spin-off dismisses the current details sheet', async () => {
 mockContext.auth.state={kind:'signed-in',user:{id:'a'}};
 mockContext.hostingBackend={getPilotState:jest.fn().mockResolvedValue({hosting:true,reviews:false,reviewer:false})};
 const onNavigate=jest.fn();
 render(<CommunityDetails item={item} joined={false} mode="everyone" onNavigate={onNavigate} />);
 fireEvent.press(await screen.findByText('What’s next? Plan a spin-off'));
 expect(onNavigate).toHaveBeenCalledTimes(1);
});
it('public review invalidation clears withdrawn content and refreshes its projection', async () => {
 render(<CommunityDetails item={item} joined={false} mode="everyone" />);
 await screen.findByText('4/5 · Clear meeting instructions');
 (mockContext.publicReviewsBackend.listPublicReviews as jest.Mock).mockResolvedValue([]);
 act(()=>invalidatePublicCatalog());
 await waitFor(()=>expect(screen.queryByText('4/5 · Clear meeting instructions')).toBeNull());
 expect(mockContext.publicReviewsBackend.listPublicReviews).toHaveBeenCalledTimes(2);
});

it('offers private arrival feedback when a saved plan opens around its scheduled time', async () => {
 jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T18:45:00Z'));
 const view = render(<CommunityDetails item={savedPlan} joined={false} mode="everyone" />);
 await screen.findByText('4/5 · Clear meeting instructions');
 expect(screen.queryByText('Find it okay?')).toBeNull();
 expect(screen.queryByText('Send a venue correction')).toBeNull();
 view.rerender(<CommunityDetails item={savedPlan} joined mode="everyone" />);
 await screen.findByText('Find it okay?');
 expect(screen.getByText('Your answer stays on this device.')).toBeTruthy();
 expect(screen.getByText('Send a venue correction')).toBeTruthy();
 expect(mockLinkNavigate).not.toHaveBeenCalled();
 expect(await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback)).toBeNull();
});

it.each([
 ['Yes, easy', 'easy'],
 ['Hard to find', 'hard'],
 ['Skip', 'skipped'],
])('keeps venue correction separate and available after %s', async (label, answer) => {
 jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T19:00:00Z'));
 const onNavigate = jest.fn();
 const saveReview = jest.fn(), reportContent = jest.fn();
 mockContext.reviewsBackend = { saveReview, reportContent };
 render(<CommunityDetails item={savedPlan} joined mode="everyone" onNavigate={onNavigate} />);
 fireEvent.press(await screen.findByLabelText(label));
 await waitFor(() => expect(screen.queryByText('Find it okay?')).toBeNull());
 await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback))!)).toEqual({ event: answer }));
 expect(screen.getByText('Send a venue correction')).toBeTruthy();
 expect(mockLinkNavigate).not.toHaveBeenCalled();
 expect(onNavigate).not.toHaveBeenCalled();
 expect(saveReview).not.toHaveBeenCalled();
 expect(reportContent).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Send a venue correction'));
 expect(mockLinkNavigate).toHaveBeenCalledWith('/support');
 expect(onNavigate).toHaveBeenCalledTimes(1);
 expect(saveReview).not.toHaveBeenCalled();
 expect(reportContent).not.toHaveBeenCalled();
});

it('keeps a skipped prompt dismissed after reopening while retaining the eligible correction link', async () => {
 jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-10T19:00:00Z'));
 const view = render(<CommunityDetails item={savedPlan} joined mode="everyone" />);
 fireEvent.press(await screen.findByLabelText('Skip'));
 await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback))!)).toEqual({ event: 'skipped' }));
 view.unmount();
 render(<CommunityDetails item={savedPlan} joined mode="everyone" />);
 await screen.findByText('Send a venue correction');
 expect(screen.queryByText('Find it okay?')).toBeNull();
 expect(screen.queryByLabelText('Skip')).toBeNull();
 expect(mockLinkNavigate).not.toHaveBeenCalled();
});

it.each(['2026-10-10T18:29:00Z', '2026-10-10T22:01:00Z'])('hides arrival actions outside the saved-plan window at %s', async (now) => {
 jest.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
 render(<CommunityDetails item={savedPlan} joined mode="everyone" />);
 await screen.findByText('4/5 · Clear meeting instructions');
 expect(screen.queryByText('Find it okay?')).toBeNull();
 expect(screen.queryByText('Send a venue correction')).toBeNull();
});

it('submits an optional public review without requiring Going', async () => {
 mockContext.auth.state = { kind: 'signed-in', user: { id: 'a' } };
 mockContext.hostingBackend = { getPilotState: jest.fn().mockResolvedValue({ hosting: false, reviews: true, reviewer: false }) };
 const saveReview = jest.fn().mockResolvedValue('new-review');
 mockContext.reviewsBackend = { saveReview };
 render(<CommunityDetails item={item} joined={false} mode="everyone" />);
 fireEvent.press(await screen.findByText('Write an anonymous public review'));
 expect(screen.getByText(/We do not verify attendance/)).toBeTruthy();
 fireEvent.changeText(screen.getByLabelText('Review rating from 1 to 5'), '4');
 fireEvent.changeText(screen.getByLabelText('Public review'), 'The public entrance is easy to find.');
 fireEvent.press(screen.getByLabelText('Submit public review'));
 await waitFor(() => expect(saveReview).toHaveBeenCalledWith({ eventId: 'event', score: 4, text: 'The public entrance is easy to find.' }));
 await screen.findByText('Review submitted. It stays private until approved.');
 expect(screen.queryByLabelText('Public review')).toBeNull();
 expect(screen.queryByText('Find it okay?')).toBeNull();
 expect(await AsyncStorage.getItem(STORAGE_KEYS.arrivalFeedback)).toBeNull();
});
