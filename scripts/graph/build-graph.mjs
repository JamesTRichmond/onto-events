// CLI: rebuild the project graph, its dashboard and today's snapshot.
//   node scripts/graph/build-graph.mjs [--dry] [--gates <dir>] [--root <repo>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { collectAll } from './collect.mjs';
import { renderDashboard } from './dashboard.mjs';

const require = createRequire(import.meta.url);
const { buildGraph } = require('./graph-core.js');

export function parseArgs(argv) {
  const args = { dry: false, gates: null, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry') args.dry = true;
    else if (argv[i] === '--gates') args.gates = argv[++i] ?? null;
    else if (argv[i] === '--root') args.root = argv[++i] ?? null;
  }
  return args;
}

function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const root = args.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const graphDir = path.join(root, 'docs', 'graph');
  const evidence = collectAll(root, { gatesDir: args.gates });
  const graph = buildGraph(evidence);
  const summary = `graph ${graph.metrics.date} @ ${graph.sha}: health ${graph.health.score} (${graph.health.verdict}) · `
    + `merges7d ${graph.metrics.merges7d} · sources ${graph.metrics.sources} · catalog ${graph.metrics.catalogEvents} · `
    + `clicklist ${graph.metrics.clicklistDone}/${graph.metrics.clicklistTotal} · decisions ${graph.metrics.openDecisions} · trims ${graph.trims.length}`;
  if (args.dry) return { graph, summary, written: [] };
  fs.mkdirSync(path.join(graphDir, 'snapshots'), { recursive: true });
  const written = [];
  const graphFile = path.join(graphDir, 'graph.json');
  writeAtomic(graphFile, `${JSON.stringify(graph, null, 2)}\n`);
  written.push(graphFile);
  const snapFile = path.join(graphDir, 'snapshots', `${graph.metrics.date}.json`);
  writeAtomic(snapFile, `${JSON.stringify(graph.metrics, null, 2)}\n`);
  written.push(snapFile);
  const dashFile = path.join(graphDir, 'dashboard.html');
  writeAtomic(dashFile, renderDashboard(graph));
  written.push(dashFile);
  return { graph, summary, written };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { summary, written } = run();
  process.stdout.write(`${summary}\n${written.map((f) => `  wrote ${path.relative(process.cwd(), f)}`).join('\n')}\n`);
}
