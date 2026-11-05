// Renders docs/graph/dashboard.html from a built graph. Self-contained, dark
// (James's standing preference), onto's own palette and typeface. No libraries:
// the graph is laid out deterministically in columns by node type so two runs
// on the same evidence draw the same picture.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COLUMNS = [
  { types: ['human', 'agent'], label: 'who' },
  { types: ['subsystem', 'law'], label: 'what' },
  { types: ['milestone'], label: 'toward' },
  { types: ['decision', 'source', 'reported'], label: 'gates' },
];

const TYPE_COLOR = {
  human: 'var(--coral)', agent: 'var(--sky)', subsystem: 'var(--ink)', law: 'var(--gold)',
  milestone: 'var(--good)', decision: 'var(--warn)', source: 'var(--sky)', reported: 'var(--muted)',
};

export function layout(nodes, { width = 1100, rowGap = 34, top = 40 } = {}) {
  const colWidth = width / COLUMNS.length;
  const pos = new Map();
  let height = 0;
  COLUMNS.forEach((col, ci) => {
    const members = nodes.filter((n) => col.types.includes(n.type));
    members.forEach((n, ri) => pos.set(n.id, { x: colWidth * ci + 24, y: top + ri * rowGap }));
    height = Math.max(height, top + members.length * rowGap);
  });
  return { pos, width, height: height + 20, colWidth };
}

function graphSvg(graph) {
  const { pos, width, height, colWidth } = layout(graph.nodes);
  const edges = graph.edges.filter((e) => pos.has(e.from) && pos.has(e.to)).map((e) => {
    const a = pos.get(e.from); const b = pos.get(e.to);
    const dx = (b.x - a.x) / 2;
    const stroke = e.kind === 'blocks' ? 'var(--warn)' : e.kind === 'supplies' ? 'var(--sky)' : 'var(--line)';
    const w = Math.min(1 + Math.log2(1 + e.weight) * 1.2, 6);
    return `<path d="M${a.x + 150},${a.y} C${a.x + 150 + dx},${a.y} ${b.x - dx},${b.y} ${b.x - 6},${b.y}" fill="none" stroke="${stroke}" stroke-width="${w.toFixed(1)}" opacity="${e.kind === 'commits' ? 0.55 : 0.9}"><title>${esc(e.from)} ${esc(e.kind)} ${esc(e.to)} (${e.weight})</title></path>`;
  });
  const heads = COLUMNS.map((c, i) => `<text x="${colWidth * i + 24}" y="18" class="colhead">${c.label}</text>`);
  const nodes = graph.nodes.filter((n) => pos.has(n.id)).map((n) => {
    const p = pos.get(n.id);
    const flag = n.stale ? ' · stale' : n.overdue ? ` · ${n.ageDays}d` : n.enabled === false ? ' · off' : '';
    const label = n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label;
    return `<g transform="translate(${p.x},${p.y})"><circle r="5" fill="${TYPE_COLOR[n.type] ?? 'var(--ink)'}"${n.overdue || n.stale ? ' stroke="var(--warn)" stroke-width="2"' : ''}/><text x="12" y="4" class="node ${n.type}">${esc(label)}${esc(flag)}</text><title>${esc(n.label)}</title></g>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Project graph">${heads.join('')}${edges.join('')}${nodes.join('')}</svg>`;
}

function trendSvg(trend) {
  if (!trend.length) return '';
  const w = 320; const h = 64; const pad = 6;
  const xs = trend.map((_, i) => pad + (trend.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (trend.length - 1)));
  const ys = trend.map((t) => h - pad - (t.health / 100) * (h - 2 * pad));
  const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const last = trend.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Health trend">
<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="var(--line)"/>
<polygon points="${xs[0].toFixed(1)},${h - pad} ${pts} ${xs[last].toFixed(1)},${h - pad}" fill="var(--coral)" opacity="0.12"/>
<polyline points="${pts}" fill="none" stroke="var(--coral)" stroke-width="2"/>
<circle cx="${xs[last].toFixed(1)}" cy="${ys[last].toFixed(1)}" r="4" fill="var(--coral)"/></svg>`;
}

export function renderBody(graph) {
  const h = graph.health;
  const deltaClass = h.delta === null ? 'muted' : h.delta > 0 ? 'good' : h.delta < 0 ? 'bad' : 'muted';
  const deltaText = h.delta === null ? 'first snapshot' : `${h.delta > 0 ? '+' : ''}${h.delta} vs prior`;
  const comps = Object.entries(h.components).map(([k, v]) => `<div class="comp"><span class="lbl">${k} <em>${graph.weights[k]}</em></span><span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span><span class="num">${Math.round(v * 100)}</span></div>`).join('');
  const owners = Object.entries(graph.nextByOwner).map(([o, a]) => `<li><b>${esc(o)}</b><span>${esc(a.text)}</span><small>${esc(a.why)}</small></li>`).join('');
  const actions = graph.actions.map((a) => `<tr><td class="num">${a.priority}</td><td><span class="chip ${esc(a.kind)}">${esc(a.kind)}</span></td><td>${esc(a.owner)}</td><td>${esc(a.text)}<small>${esc(a.why)}</small></td></tr>`).join('');
  const trims = graph.trims.length ? graph.trims.map((t) => `<li><code>${esc(t.id)}</code> ${esc(t.reason)}</li>`).join('') : '<li>nothing trimmed</li>';
  const m = graph.metrics;
  const tiles = [
    ['merges / 7d', m.merges7d], ['commits / 14d', m.commits14d], ['clicklist', `${m.clicklistDone}/${m.clicklistTotal}`],
    ['live sources', m.sources], ['catalog events', m.catalogEvents], ['tests', m.tests],
    ['open decisions', m.openDecisions], ['stale subsystems', m.staleSubsystems], ['gates known', `${m.gatesKnown}/7`],
  ].map(([k, v]) => `<div class="tile"><span class="lbl">${k}</span><span class="val">${esc(v)}</span></div>`).join('');
  return `<title>onto Project Graph</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--bg:#0F1126;--surface:#171A34;--surface2:#1F2342;--ink:#E8E6F0;--muted:#8E90A8;--line:#2C3054;--coral:#FF6B4A;--sky:#7FB3FF;--gold:#E3C56D;--good:#6FCF97;--warn:#F2C94C;--bad:#EB5757;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Plus Jakarta Sans",system-ui,sans-serif;padding:28px clamp(16px,4vw,48px) 64px}
h1{font-size:22px;font-weight:700;margin:0;letter-spacing:-.01em}h2{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin:0 0 12px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 20px;margin-bottom:22px}header .meta{color:var(--muted);font-family:"JetBrains Mono",monospace;font-size:12px}
.mono,.num,code{font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums}
.hero{display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:center;background:var(--surface);border-radius:14px;padding:22px 26px;margin-bottom:22px}
.score{font-family:"JetBrains Mono",monospace;font-size:64px;font-weight:600;line-height:1}.score small{display:block;font:13px "Plus Jakarta Sans",sans-serif;color:var(--muted)}
.delta{font-weight:600}.good{color:var(--good)}.bad{color:var(--bad)}.muted{color:var(--muted)}
.comps{display:grid;gap:8px}.comp{display:grid;grid-template-columns:130px 1fr 36px;gap:12px;align-items:center;font-size:13px}.comp .lbl em{font-style:normal;color:var(--muted)}
.bar{height:6px;background:var(--surface2);border-radius:3px;overflow:hidden}.bar i{display:block;height:100%;background:var(--coral)}
.grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:22px;margin-bottom:22px}@media(max-width:900px){.grid,.hero{grid-template-columns:1fr}}
.panel{background:var(--surface);border-radius:14px;padding:18px 20px;min-width:0}.panel.graph{overflow-x:auto}
svg text{fill:var(--ink);font:12px "Plus Jakarta Sans",sans-serif}svg .colhead{fill:var(--muted);font-size:11px;letter-spacing:.12em;text-transform:uppercase}svg .law{fill:var(--gold)}svg .reported{fill:var(--muted)}
.owners{list-style:none;margin:0;padding:0;display:grid;gap:12px}.owners li{display:grid;gap:2px;padding-left:12px;border-left:3px solid var(--coral)}.owners b{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.owners small{color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:8px 10px 8px 0;border-top:1px solid var(--line);vertical-align:top}td small{display:block;color:var(--muted)}
.chip{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--surface2);color:var(--ink);text-transform:uppercase;letter-spacing:.08em}.chip.decide,.chip.click{background:#3A2E12;color:var(--warn)}.chip.verify,.chip.stale{background:#3A1E1E;color:var(--bad)}.chip.supply{background:#1B2E44;color:var(--sky)}.chip.milestone{background:#1B3324;color:var(--good)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:22px}.tile{background:var(--surface);border-radius:10px;padding:12px 14px;display:grid;gap:2px}.tile .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.tile .val{font-family:"JetBrains Mono",monospace;font-size:22px}
.trims{color:var(--muted);font-size:13px;margin:0;padding-left:18px}footer{color:var(--muted);font-size:12px;margin-top:28px}
</style>
<header><h1>onto project graph</h1><span class="meta">main ${esc(graph.sha)} · ${esc(graph.generatedAt.slice(0, 16).replace('T', ' '))}Z</span></header>
<section class="hero">
  <div class="score">${h.score}<small>health · 0–100</small><span class="delta ${deltaClass}" style="font-size:14px">${esc(deltaText)}</span></div>
  <div class="comps">${comps}</div>
  <div>${trendSvg(graph.trend)}<div class="muted" style="font-size:12px;text-align:right">${graph.trend.length} snapshot${graph.trend.length === 1 ? '' : 's'}</div></div>
</section>
<div class="tiles">${tiles}</div>
<div class="grid">
  <section class="panel graph"><h2>who → what → toward → gates</h2>${graphSvg(graph)}</section>
  <section class="panel"><h2>next move, per seat</h2><ul class="owners">${owners}</ul></section>
</div>
<section class="panel" style="margin-bottom:22px"><h2>ranked actions</h2><div style="overflow-x:auto"><table><tbody>${actions}</tbody></table></div></section>
<section class="panel"><h2>trimmed this run</h2><ul class="trims">${trims}</ul></section>
<footer>Weights: ${Object.entries(graph.weights).map(([k, v]) => `${k} ${v}`).join(' · ')}. Trim window ${graph.trim.trimWindowDays}d, stale ${graph.trim.staleDays}d, decision limit ${graph.trim.decisionMaxAgeDays}d. Rebuild with <code>npm run graph</code>.</footer>
`;
}

// renderBody is the artifact form (the Artifact tool adds the document shell);
// renderDashboard is the standalone file committed to the repo.
export function renderDashboard(graph) {
  const body = renderBody(graph);
  const split = body.indexOf('</style>\n') + '</style>\n'.length;
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${body.slice(0, split)}</head><body>\n${body.slice(split)}</body></html>\n`;
}
