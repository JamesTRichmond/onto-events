const { buildGraph, ownerOf, subsystemOf, SUBSYSTEMS } = require('../graph-core');

const NOW = Date.parse('2026-09-06T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();

function evidence(overrides = {}) {
  return {
    now: NOW,
    sha: 'abc1234',
    commits: [
      { sha: '1', author: 'Claude', date: day(1), subject: 'feed', files: ['lib/feed.ts', 'lib/__tests__/feed.test.ts'] },
      { sha: '2', author: 'James Richmond', date: day(2), subject: 'copy', files: ['store/ios/app-store-copy.md'] },
      { sha: '3', author: 'copilot-swe-agent[bot]', date: day(3), subject: 'ci', files: ['.github/workflows/ci.yml'] },
      { sha: '4', author: 'Claude', date: day(20), subject: 'old', files: ['supabase/migrations/0001.sql'] },
    ],
    merges: [{ sha: 'm1', date: day(1), subject: 'Merge pull request #56', pr: '56' }, { sha: 'm2', date: day(9), subject: 'Merge pull request #40', pr: '40' }],
    supply: { sources: [{ id: 'ticketmaster', name: 'Ticketmaster', trust: 1, enabled: true }], catalogEvents: 399 },
    gates: { tsc: 0, lint: 0, jest: 0, release: 0, dryRun: 0, webExport: 0, retiredName: 0 },
    inputs: {
      clicklist: { done: 10, total: 16, next: ['11'] },
      supplyTargets: { sources: 5, catalogEvents: 550 },
      gates: { tests: 486, advisories: { critical: 0, high: 9, moderate: 17 } },
      decisions: [{ id: 'perm', title: 'Source permissions', openedAt: day(5), blocks: ['supply-bronze'] }],
      reported: [{ id: 'sync', claim: 'Sync green', by: 'PROGRESS', since: day(3), verifyWith: 'gh run list' }],
      milestones: [{ id: 'app-store-public', title: 'Public download', owner: 'james', order: 1 }, { id: 'supply-bronze', title: 'Bronze', owner: 'claude', order: 2 }],
    },
    snapshots: [],
    ...overrides,
  };
}

describe('ownership', () => {
  test('branch prefix beats author', () => {
    expect(ownerOf({ author: 'Claude', branch: 'copilot/x' })).toBe('copilot');
    expect(ownerOf({ author: 'copilot-swe-agent[bot]' })).toBe('copilot');
    expect(ownerOf({ author: 'James Richmond' })).toBe('james');
    expect(ownerOf({ author: 'Someone Else' })).toBe('unknown');
  });
  test('subsystem routing covers the repo shape', () => {
    expect(subsystemOf('app/(tabs)/index.tsx')).toBe('app');
    expect(subsystemOf('scripts/pipeline/schema.js')).toBe('pipeline');
    expect(subsystemOf('JAMES-CLICKLIST.html')).toBe('clicklist');
    expect(subsystemOf('docs/graph/inputs.json')).toBe('graph');
    expect(subsystemOf('package-lock.json')).toBeNull();
  });
});

describe('buildGraph', () => {
  test('requires a clock', () => {
    expect(() => buildGraph({})).toThrow(/clock/);
  });

  test('builds nodes and weighted commit edges inside the trim window', () => {
    const g = buildGraph(evidence());
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['james', 'claude', 'copilot', 'lib', 'web', 'ci', 'law:SAFETY.md', 'decision:perm', 'source:ticketmaster', 'app-store-public']));
    expect(g.edges).toContainEqual({ from: 'claude', to: 'lib', kind: 'commits', weight: 1 });
    expect(g.edges).toContainEqual({ from: 'decision:perm', to: 'supply-bronze', kind: 'blocks', weight: 2 });
  });

  test('self-trims idle owners and subsystems, keeps law', () => {
    const g = buildGraph(evidence());
    const trimmed = g.trims.map((t) => t.id);
    expect(trimmed).toEqual(expect.arrayContaining(['grok', 'astra', 'sol', 'supabase']));
    expect(trimmed).not.toContain('claude');
    expect(g.nodes.filter((n) => n.type === 'law')).toHaveLength(4);
  });

  test('flags overdue decisions and aged REPORTED claims as actions', () => {
    const g = buildGraph(evidence());
    const decision = g.nodes.find((n) => n.id === 'decision:perm');
    expect(decision.overdue).toBe(true);
    expect(g.actions.some((a) => a.kind === 'verify' && a.owner === 'claude')).toBe(true);
    expect(g.actions.some((a) => a.kind === 'supply')).toBe(true);
    expect(g.nextByOwner.james.owner).toBe('james');
    expect(g.actions.map((a) => a.priority)).toEqual([...g.actions.map((a) => a.priority)].sort((a, b) => b - a));
  });

  test('health is bounded, deterministic, and moves with evidence', () => {
    const base = buildGraph(evidence());
    expect(base.health.score).toBeGreaterThan(0);
    expect(base.health.score).toBeLessThanOrEqual(100);
    expect(buildGraph(evidence()).health.score).toBe(base.health.score);
    const better = buildGraph(evidence({
      supply: { sources: [{ id: 'ticketmaster', name: 'Ticketmaster' }, { id: 'kilby', name: 'Kilby Court', trust: 3 }], catalogEvents: 520 },
      inputs: { ...evidence().inputs, clicklist: { done: 14, total: 16, next: ['15'] }, decisions: [] },
    }));
    expect(better.health.score).toBeGreaterThan(base.health.score);
    expect(better.actions.some((a) => a.kind === 'supply')).toBe(false);
  });

  test('unknown gates are not green', () => {
    const known = buildGraph(evidence()).health.components.quality;
    const unknown = buildGraph(evidence({ gates: {} })).health.components.quality;
    expect(unknown).toBeLessThan(known);
  });

  test('delta and trend come from snapshots', () => {
    const g = buildGraph(evidence({ snapshots: [{ date: '2026-09-05', health: 40, metrics: { tests: 480 } }] }));
    expect(g.health.delta).toBe(g.health.score - 40);
    expect(g.trend.map((t) => t.date)).toEqual(['2026-09-05', '2026-09-06']);
    expect(g.health.verdict).toMatch(/improving|slipping|flat/);
    const rerun = buildGraph(evidence({ snapshots: [{ date: '2026-09-06', health: 1 }] }));
    expect(rerun.health.delta).toBeNull();
  });

  test('a stale subsystem lowers velocity', () => {
    const fresh = buildGraph(evidence());
    const stale = buildGraph(evidence({ commits: evidence().commits.map((c) => ({ ...c, date: day(10) })) }));
    expect(stale.metrics.staleSubsystems).toBeGreaterThan(0);
    expect(stale.health.components.velocity).toBeLessThan(fresh.health.components.velocity);
    expect(SUBSYSTEMS.length).toBeGreaterThan(5);
  });
});
