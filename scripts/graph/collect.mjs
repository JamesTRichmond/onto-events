// Evidence collection for the project graph. Everything here is read-only and
// local: git log, repo files, optional gate exit files. No network, no secrets.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const GIT_SEP = '';

function git(root, args) {
  // --no-optional-locks: a plain git call from a sandboxed shell can leave a
  // stale .git/index.lock behind (see pb-state-of-onto gotchas).
  return execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function parseCommitLog(raw) {
  return raw.split(GIT_SEP).map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
    const [head, ...files] = chunk.split('\n');
    const [sha, author, date, ...subject] = head.split('|');
    return { sha, author, date, subject: subject.join('|'), files: files.map((f) => f.trim()).filter(Boolean) };
  });
}

export function collectGit(root, { ref = 'main', days = 14 } = {}) {
  const commits = parseCommitLog(git(root, ['log', ref, `--since=${days}.days`, '--no-merges', '--name-only', `--format=${GIT_SEP}%H|%an|%aI|%s`]));
  const merges = git(root, ['log', ref, '--merges', `--since=${days}.days`, '--format=%H|%aI|%s'])
    .split('\n').filter(Boolean).map((line) => {
      const [sha, date, ...subject] = line.split('|');
      const pr = subject.join('|').match(/^Merge pull request #(\d+)/)?.[1] ?? null;
      return { sha, date, subject: subject.join('|'), pr };
    })
    // Only PR merges count as velocity; a branch syncing main into itself is noise.
    .filter((m) => m.pr !== null);
  const sha = git(root, ['rev-parse', '--short', ref]).trim();
  return { commits, merges, sha };
}

export function collectSupply(root) {
  const feedsPath = path.join(root, 'data', 'feeds.json');
  const feeds = fs.existsSync(feedsPath) ? JSON.parse(fs.readFileSync(feedsPath, 'utf8')) : [];
  const sources = [
    { id: 'ticketmaster', name: 'Ticketmaster', trust: 1, enabled: true },
    ...(Array.isArray(feeds) ? feeds : []).map((f) => ({ id: f.id ?? f.name, name: f.name ?? f.id, trust: f.trust ?? 3, enabled: f.enabled !== false })),
  ];
  const livePath = path.join(root, 'data', 'live-events.ts');
  const live = fs.existsSync(livePath) ? fs.readFileSync(livePath, 'utf8') : '';
  const catalogEvents = (live.match(/startsAtIso/g) ?? []).length;
  const generatedAt = live.match(/GENERATED_AT = '([^']+)'/)?.[1] ?? null;
  return { sources, catalogEvents, generatedAt };
}

// The /gates skill writes one <gate>.exit file per gate; an integer per file.
export function collectGates(dir) {
  const gates = { tsc: null, lint: null, jest: null, release: null, dryRun: null, webExport: null, retiredName: null };
  if (!dir || !fs.existsSync(dir)) return gates;
  for (const key of Object.keys(gates)) {
    const file = path.join(dir, `${key}.exit`);
    if (fs.existsSync(file)) {
      const n = Number.parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
      gates[key] = Number.isFinite(n) ? n : null;
    }
  }
  return gates;
}

export function collectSnapshots(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function collectAll(root, { gatesDir, now = Date.now() } = {}) {
  const graphDir = path.join(root, 'docs', 'graph');
  const inputs = JSON.parse(fs.readFileSync(path.join(graphDir, 'inputs.json'), 'utf8'));
  const { commits, merges, sha } = collectGit(root);
  return {
    commits, merges, sha, now, inputs,
    supply: collectSupply(root),
    gates: collectGates(gatesDir),
    snapshots: collectSnapshots(path.join(graphDir, 'snapshots')),
  };
}
