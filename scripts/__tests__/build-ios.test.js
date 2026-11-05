const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'build-ios.sh'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
// Comments explain the why; the rules below are about what actually runs.
const commands = script
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('npm run build:ios', () => {
  it('is wired to the script', () => {
    expect(pkg.scripts['build:ios']).toBe('bash scripts/build-ios.sh');
  });

  it('builds the production iOS profile', () => {
    expect(commands).toMatch(/eas-cli build --platform ios --profile production/);
  });

  it('pulls the production environment into a private temp file, never .env.local', () => {
    expect(commands).toMatch(/mktemp/);
    expect(commands).toMatch(/chmod 600 "\$env_file"/);
    expect(commands).toMatch(/env:pull --environment production --path "\$env_file"/);
    expect(commands).not.toMatch(/\.env\.local/);
  });

  it('deletes the values file on every exit and before the build starts', () => {
    expect(commands).toMatch(/trap 'rm -f "\$env_file"' EXIT/);
    const removed = commands.indexOf('rm -f "$env_file"\n');
    const build = commands.indexOf('eas-cli build');
    expect(removed).toBeGreaterThan(-1);
    expect(removed).toBeLessThan(build);
  });

  it('never prints the pulled values', () => {
    expect(commands).not.toMatch(/\bcat\b|\becho\b|printenv|\benv\s*$/m);
    expect(commands).toMatch(/env:pull[^\n]*>\/dev\/null/);
  });

  it('stops on the first failure', () => {
    expect(commands).toMatch(/set -euo pipefail/);
  });
});
