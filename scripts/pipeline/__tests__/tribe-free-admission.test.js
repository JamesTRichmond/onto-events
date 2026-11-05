const { parseTribePages } = require('../adapters/tribe');
const body = require('../fixtures/tribe/peace-justice-center-burlington.json');
const now = Date.parse(body.capture.evaluationClock);
const options = { now, timezone: 'America/New_York', requireTimedEvents: true, requireFreeAdmission: true };
const first = body.pages[0].events[0];
const pageWith = (event) => [{ events: [event], total_pages: 1 }];

it('reads all21 actual free public book-club and cleanup occurrences with the approved option', () => {
  expect(parseTribePages(body.pages, options).items).toHaveLength(21);
});

it('rejects a changed, missing, ambiguous or contradictory price before normalization', () => {
  const prices = [
    { cost: '$20' }, { cost: '' }, { cost: null }, { cost: 'Free for members' },
    { cost: 'Free – $20' }, { cost_details: { values: ['0', '20'] } },
    { cost_details: { values: [] } }, { cost_details: {} }, { cost_details: null },
    ...[null, '', false, 'unknown', '-0', '0e3', '$0', '0,00'].map((value) => ({ cost_details: { values: [value] } })),
  ];
  for (const price of prices) {
    const result = parseTribePages(pageWith({ ...first, ...price }), options);
    expect(result.items).toEqual([]);
    expect(result.diagnostics).toEqual({ 'unverified free admission': 1 });
  }
  const missing = { ...first };
  delete missing.cost;
  expect(parseTribePages(pageWith(missing), options).items).toEqual([]);
});

it('accepts an explicit free label only when every published amount is zero', () => {
  const event = { ...first, cost: ' FREE ', cost_details: { values: ['0', '0.00'] } };
  expect(parseTribePages(pageWith(event), options).items).toHaveLength(1);
});

it('preserves the existing price-agnostic behavior for publishers without the opt-in', () => {
  expect(parseTribePages(pageWith({ ...first, cost: '$20', cost_details: { values: ['20'] } }), { ...options, requireFreeAdmission: undefined }).items).toHaveLength(1);
});
