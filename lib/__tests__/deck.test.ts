import {
  bringBack,
  DECK_LIST_CAP,
  dropMaybe,
  EMPTY_DECK_LISTS,
  maybe,
  maybesInFeed,
  parseIdList,
  pass,
  passedInFeed,
  restore,
  returnToMaybe,
  sortedFeed,
} from '../deck';

const feed = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const none: ReadonlySet<string> = new Set();

describe('swipe sorting lists', () => {
  it('a pass takes the card off the list and out of Maybes', () => {
    const kept = maybe(EMPTY_DECK_LISTS, 'a');
    const passed = pass(kept, 'a');
    expect(passed).toEqual({ passed: ['a'], maybes: [], fromMaybes: ['a'] });
    expect(sortedFeed(feed, passed, none).map((i) => i.id)).toEqual(['b', 'c', 'd']);
  });

  it('a maybe leaves the list, lands in Maybes and lifts an earlier pass', () => {
    const lists = maybe(pass(EMPTY_DECK_LISTS, 'b'), 'b');
    expect(lists).toEqual({ passed: [], maybes: ['b'], fromMaybes: [] });
    expect(sortedFeed(feed, lists, none).map((i) => i.id)).toEqual(['a', 'c', 'd']);
  });

  it('restore and dropMaybe put cards back in the feed’s own order', () => {
    let lists = pass(pass(EMPTY_DECK_LISTS, 'a'), 'c');
    lists = maybe(lists, 'b');
    lists = restore(lists, ['a', 'c']);
    lists = dropMaybe(lists, 'b');
    expect(lists).toEqual(EMPTY_DECK_LISTS);
    expect(sortedFeed(feed, lists, none).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a plan you are Going to never hides, even if it was swiped; order is never re-ranked', () => {
    const lists = maybe(pass(EMPTY_DECK_LISTS, 'c'), 'b');
    expect(sortedFeed(feed, lists, new Set(['c', 'b'])).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortedFeed(feed, lists, none).map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('passedInFeed names only passes the current feed still holds', () => {
    const lists = pass(pass(EMPTY_DECK_LISTS, 'a'), 'gone');
    expect(passedInFeed(feed, lists)).toEqual(['a']);
  });

  it('Maybes is the feed’s own order, and Undo from Maybes puts the card back there', () => {
    const lists = maybe(maybe(EMPTY_DECK_LISTS, 'c'), 'a');
    expect(maybesInFeed(feed, lists).map((item) => item.id)).toEqual(['a', 'c']);
    const tossed = pass(lists, 'a');
    expect(maybesInFeed(feed, tossed).map((item) => item.id)).toEqual(['c']);
    expect(maybesInFeed(feed, returnToMaybe(tossed, 'a')).map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('bring back returns a Maybe toss to Maybes and a feed toss to the feed', () => {
    const tossed = pass(pass(maybe(EMPTY_DECK_LISTS, 'a'), 'a'), 'b');
    const back = bringBack(tossed, ['a', 'b']);
    expect(back.maybes).toEqual(['a']);
    expect(back.passed).toEqual([]);
    expect(back.fromMaybes).toEqual([]);
    expect(sortedFeed(feed, back, none).map((item) => item.id)).toEqual(['b', 'c', 'd']);
  });

  it('repeating a decision does not duplicate the id', () => {
    const lists = pass(pass(EMPTY_DECK_LISTS, 'a'), 'a');
    expect(lists.passed).toEqual(['a']);
  });

  it('keeps only the newest ids past the cap', () => {
    let lists = EMPTY_DECK_LISTS;
    for (let i = 0; i < DECK_LIST_CAP + 5; i += 1) lists = pass(lists, `e${i}`);
    expect(lists.passed).toHaveLength(DECK_LIST_CAP);
    expect(lists.passed[0]).toBe('e5');
    expect(lists.passed.at(-1)).toBe(`e${DECK_LIST_CAP + 4}`);
  });
});

describe('parseIdList', () => {
  it('reads stored ids and drops anything that is not a non-empty string', () => {
    expect(parseIdList('["a", "", 3, null, "b", "a"]')).toEqual(['a', 'b']);
  });

  it('garbage in, empty list out', () => {
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList('not json')).toEqual([]);
    expect(parseIdList('{"a":1}')).toEqual([]);
  });
});
