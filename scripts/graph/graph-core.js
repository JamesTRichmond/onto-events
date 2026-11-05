// Pure graph engine for the onto project graph. No I/O here: collect.mjs gathers
// evidence, this file turns it into nodes, edges, a health score, trims and
// ranked actions. Keeping it pure is what makes the loop testable and lets any
// agent (or CI) run it without credentials.

const DAY = 86400000;

// Branch prefixes are the ownership boundary (TEAM-SYNC contracts). Commit
// authors map to the same owners so velocity credits the right seat.
const OWNERS = {
  james: { label: 'James', kind: 'human', authors: [/james richmond/i, /^jamestrichmond$/i] },
  claude: { label: 'Claude (pb)', kind: 'agent', authors: [/^claude$/i], branches: ['claude/'] },
  sol: { label: 'Codex (sol)', kind: 'agent', authors: [/codex/i], branches: ['sol/'] },
  copilot: { label: 'Copilot', kind: 'agent', authors: [/copilot/i], branches: ['copilot/'] },
  grok: { label: 'Grok', kind: 'agent', authors: [/grok/i], branches: ['grok/'] },
  astra: { label: 'Astra', kind: 'agent', authors: [/astra/i], branches: ['astra/'] },
};

// Subsystems are the durable "what" nodes. A commit touching a path under one
// of these prefixes strengthens the owner -> subsystem edge.
const SUBSYSTEMS = [
  // Order matters: first match wins, so the graph's own files sit above docs.
  { id: 'graph', label: 'Project graph', match: /^(scripts|docs)\/graph\// },
  { id: 'app', label: 'App screens', match: /^(app|components|hooks|constants)\// },
  { id: 'lib', label: 'lib/ core', match: /^lib\// },
  { id: 'pipeline', label: 'Ingestion pipeline', match: /^scripts\/(pipeline|sync-events|refresh)/ },
  { id: 'supabase', label: 'Supabase', match: /^supabase\// },
  { id: 'data', label: 'Data + feeds', match: /^data\// },
  { id: 'ci', label: 'CI + gates', match: /^(\.github\/|scripts\/release\/|eslint|tsconfig)/ },
  { id: 'web', label: 'Web + store', match: /^(public\/|store\/|app\.json|app\.config|eas\.json)/ },
  { id: 'docs', label: 'Docs + law', match: /\.md$|^docs\//i },
  { id: 'clicklist', label: 'Clicklist', match: /CLICKLIST/i },
];

const LAW = ['PRODUCT_BRIEF.md', 'TIER_QUESTIONS.md', 'DECISIONS.md', 'SAFETY.md'];

const WEIGHTS = { release: 25, supply: 25, quality: 20, velocity: 15, decisions: 15 };

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const daysBetween = (a, b) => Math.max(0, Math.floor((b - a) / DAY));
const parseDay = (iso) => Date.parse(iso);

function ownerOf({ author = '', branch = '' }) {
  for (const [id, o] of Object.entries(OWNERS)) {
    if (o.branches?.some((p) => branch.startsWith(p))) return id;
  }
  for (const [id, o] of Object.entries(OWNERS)) {
    if (o.authors.some((re) => re.test(author.trim()))) return id;
  }
  return 'unknown';
}

function subsystemOf(file) {
  return SUBSYSTEMS.find((s) => s.match.test(file))?.id ?? null;
}

// commits: [{ sha, author, date (ISO), subject, files: [] }]
function commitEdges(commits, now, windowDays) {
  const weights = new Map();
  const lastTouch = new Map();
  for (const c of commits) {
    const t = parseDay(c.date);
    if (!Number.isFinite(t) || now - t > windowDays * DAY) continue;
    const owner = ownerOf({ author: c.author, branch: c.branch ?? '' });
    const subs = new Set((c.files ?? []).map(subsystemOf).filter(Boolean));
    for (const sub of subs) {
      const key = `${owner}->${sub}`;
      weights.set(key, (weights.get(key) ?? 0) + 1);
      lastTouch.set(sub, Math.max(lastTouch.get(sub) ?? 0, t));
    }
  }
  return { weights, lastTouch };
}

function scoreRelease(inputs) {
  const { done = 0, total = 0 } = inputs.clicklist ?? {};
  return total ? clamp01(done / total) : 0;
}

function scoreSupply(supply, inputs) {
  const targets = inputs.supplyTargets ?? { sources: 5, catalogEvents: 500 };
  const liveSources = supply.sources.filter((s) => s.enabled !== false).length;
  const sourcePart = clamp01(liveSources / targets.sources);
  const catalogPart = clamp01(supply.catalogEvents / targets.catalogEvents);
  // Honest supply: Ticketmaster-only counts for half at most. Empty Monday is
  // the product, but a single corporate source is not a market.
  const trusted = supply.sources.some((s) => s.enabled !== false && !/ticketmaster/i.test(s.name));
  return clamp01(0.6 * sourcePart + 0.4 * catalogPart) * (trusted ? 1 : 0.5);
}

function scoreQuality(gates, inputs, prev) {
  const known = Object.values(gates ?? {}).filter((v) => v !== null && v !== undefined);
  const green = known.length ? known.filter((v) => v === 0).length / known.length : null;
  const adv = inputs.gates?.advisories ?? {};
  const advPart = adv.critical > 0 ? 0 : clamp01(1 - (adv.high ?? 0) * 0.03 - (adv.moderate ?? 0) * 0.005);
  const tests = inputs.gates?.tests ?? 0;
  const testPart = prev?.metrics?.tests ? clamp01(tests / prev.metrics.tests) : tests > 0 ? 1 : 0;
  // Unknown gates are not green: they cost half of that component.
  const gatePart = green === null ? 0.5 : green;
  return clamp01(0.5 * gatePart + 0.3 * advPart + 0.2 * testPart);
}

function scoreVelocity(merges7d, staleSubsystems, subsystemCount) {
  const mergePart = clamp01(merges7d / 5);
  const freshPart = subsystemCount ? 1 - staleSubsystems / subsystemCount : 0;
  return clamp01(0.7 * mergePart + 0.3 * freshPart);
}

function scoreDecisions(decisions, now, maxAgeDays) {
  if (!decisions.length) return 1;
  const penalty = decisions.reduce((sum, d) => {
    const age = daysBetween(parseDay(d.openedAt), now);
    return sum + 1 + Math.max(0, age - maxAgeDays) * 0.5;
  }, 0);
  return clamp01(1 - penalty / 8);
}

function buildActions({ decisions, reported, milestones, staleSubsystems, supply, inputs, now, trim }) {
  const actions = [];
  for (const d of decisions) {
    const age = daysBetween(parseDay(d.openedAt), now);
    actions.push({
      owner: 'james', kind: 'decide', priority: 3 + Math.min(age, 10) + (d.blocks?.length ?? 0) * 2,
      text: d.title, why: `open ${age}d${d.blocks?.length ? `, blocks ${d.blocks.join(', ')}` : ''}`, ref: d.id,
    });
  }
  for (const r of reported) {
    const age = daysBetween(parseDay(r.since), now);
    if (age >= trim.reportedMaxAgeDays) {
      actions.push({ owner: 'claude', kind: 'verify', priority: 4 + age, text: `Verify: ${r.claim}`, why: `REPORTED by ${r.by} ${age}d ago; ${r.verifyWith}`, ref: r.id });
    }
  }
  for (const sub of staleSubsystems) {
    actions.push({ owner: 'claude', kind: 'stale', priority: 2, text: `No commits to ${sub} in ${trim.staleDays}d`, why: 'confirm idle on purpose or schedule work', ref: sub });
  }
  const liveTrusted = supply.sources.filter((s) => s.enabled !== false && !/ticketmaster/i.test(s.name)).length;
  if (liveTrusted === 0) {
    actions.push({ owner: 'claude', kind: 'supply', priority: 8, text: 'First trusted calendar into data/feeds.json', why: 'Ticketmaster is the only source; feed cannot demote it yet', ref: 'feeds' });
  }
  const next = inputs.clicklist?.next?.[0];
  if (next) actions.push({ owner: 'james', kind: 'click', priority: 9, text: `Clicklist step ${next}`, why: `${inputs.clicklist.done}/${inputs.clicklist.total} done`, ref: `clicklist-${next}` });
  for (const m of milestones) {
    actions.push({ owner: m.owner, kind: 'milestone', priority: 1 + (5 - Math.min(m.order, 5)), text: m.title, why: `milestone #${m.order}`, ref: m.id });
  }
  actions.sort((a, b) => b.priority - a.priority);
  const nextByOwner = {};
  for (const a of actions) if (!nextByOwner[a.owner]) nextByOwner[a.owner] = a;
  return { actions, nextByOwner };
}

function buildGraph(evidence) {
  const { commits = [], merges = [], supply = { sources: [], catalogEvents: 0 }, gates = {}, inputs = {}, snapshots = [], now, sha = null } = evidence;
  if (!Number.isFinite(now)) throw new Error('buildGraph requires a numeric clock');
  const trim = { trimWindowDays: 14, staleDays: 7, decisionMaxAgeDays: 3, reportedMaxAgeDays: 2, ...(inputs.trim ?? {}) };
  const decisions = inputs.decisions ?? [];
  const reported = inputs.reported ?? [];
  const milestones = [...(inputs.milestones ?? [])].sort((a, b) => a.order - b.order);

  const { weights, lastTouch } = commitEdges(commits, now, trim.trimWindowDays);
  const merges7d = merges.filter((m) => now - parseDay(m.date) <= 7 * DAY).length;
  const staleSubsystems = SUBSYSTEMS.filter((s) => (now - (lastTouch.get(s.id) ?? 0)) > trim.staleDays * DAY && lastTouch.has(s.id)).map((s) => s.id);

  const nodes = [];
  const edges = [];
  const trims = [];
  const activeOwners = new Set([...weights.keys()].map((k) => k.split('->')[0]));
  for (const [id, o] of Object.entries(OWNERS)) {
    const active = activeOwners.has(id) || decisions.length && id === 'james' || milestones.some((m) => m.owner === id);
    if (active) nodes.push({ id, type: o.kind, label: o.label });
    else trims.push({ id, reason: `no commits or assignments in ${trim.trimWindowDays}d` });
  }
  for (const s of SUBSYSTEMS) {
    if (lastTouch.has(s.id)) nodes.push({ id: s.id, type: 'subsystem', label: s.label, stale: staleSubsystems.includes(s.id), lastTouch: new Date(lastTouch.get(s.id)).toISOString().slice(0, 10) });
    else trims.push({ id: s.id, reason: `no commits in ${trim.trimWindowDays}d` });
  }
  for (const law of LAW) nodes.push({ id: `law:${law}`, type: 'law', label: law });
  for (const [key, w] of weights) {
    const [from, to] = key.split('->');
    edges.push({ from, to, kind: 'commits', weight: w });
  }
  for (const m of milestones) {
    nodes.push({ id: m.id, type: 'milestone', label: m.title, order: m.order });
    edges.push({ from: m.owner, to: m.id, kind: 'owns', weight: 1 });
  }
  for (const d of decisions) {
    const age = daysBetween(parseDay(d.openedAt), now);
    nodes.push({ id: `decision:${d.id}`, type: 'decision', label: d.title, ageDays: age, overdue: age > trim.decisionMaxAgeDays });
    edges.push({ from: 'james', to: `decision:${d.id}`, kind: 'decides', weight: 1 });
    for (const b of d.blocks ?? []) edges.push({ from: `decision:${d.id}`, to: b, kind: 'blocks', weight: 2 });
  }
  for (const s of supply.sources) {
    nodes.push({ id: `source:${s.id ?? s.name}`, type: 'source', label: s.name, enabled: s.enabled !== false, trust: s.trust ?? null });
    edges.push({ from: `source:${s.id ?? s.name}`, to: 'data', kind: 'supplies', weight: s.enabled === false ? 0 : 1 });
  }
  for (const r of reported) nodes.push({ id: `reported:${r.id}`, type: 'reported', label: r.claim, ageDays: daysBetween(parseDay(r.since), now) });

  // Rebuilding twice in one day compares against yesterday, not against itself.
  const today = new Date(now).toISOString().slice(0, 10);
  const prior = snapshots.filter((s) => s.date !== today);
  const prev = prior.length ? prior[prior.length - 1] : null;
  const components = {
    release: scoreRelease(inputs),
    supply: scoreSupply(supply, inputs),
    quality: scoreQuality(gates, inputs, prev),
    velocity: scoreVelocity(merges7d, staleSubsystems, SUBSYSTEMS.filter((s) => lastTouch.has(s.id)).length),
    decisions: scoreDecisions(decisions, now, trim.decisionMaxAgeDays),
  };
  const score = Math.round(Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + w * components[k], 0));
  const delta = prev ? score - prev.health : null;

  const metrics = {
    date: new Date(now).toISOString().slice(0, 10), sha,
    health: score, components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    merges7d, commits14d: commits.filter((c) => now - parseDay(c.date) <= trim.trimWindowDays * DAY).length,
    clicklistDone: inputs.clicklist?.done ?? 0, clicklistTotal: inputs.clicklist?.total ?? 0,
    sources: supply.sources.filter((s) => s.enabled !== false).length, catalogEvents: supply.catalogEvents,
    tests: inputs.gates?.tests ?? 0, openDecisions: decisions.length, staleSubsystems: staleSubsystems.length,
    gatesKnown: Object.values(gates).filter((v) => v !== null && v !== undefined).length,
  };
  const { actions, nextByOwner } = buildActions({ decisions, reported, milestones, staleSubsystems, supply, inputs, now, trim });

  const trendSource = [...snapshots.filter((s) => s.date !== metrics.date), { date: metrics.date, health: score }];
  const trend = trendSource.slice(-30).map((s) => ({ date: s.date, health: s.health }));
  const verdict = delta === null ? 'first snapshot — no comparison yet' : delta > 0 ? `improving (+${delta})` : delta < 0 ? `slipping (${delta})` : 'flat';

  return {
    generatedAt: new Date(now).toISOString(), sha, weights: WEIGHTS, trim,
    nodes, edges, trims, metrics, health: { score, delta, verdict, components: metrics.components }, trend, actions, nextByOwner,
  };
}

module.exports = { buildGraph, ownerOf, subsystemOf, OWNERS, SUBSYSTEMS, WEIGHTS, LAW };
