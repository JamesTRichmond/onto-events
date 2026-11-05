const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const script = path.join(root, 'scripts', 'check-web-deploy-env.cjs');
const NAME = 'EXPO_PUBLIC_ENABLE_APPLE_SIGN_IN';
const SENTINEL = 'sentinel-value-must-not-print-7f3a';

function run(value, { scriptPath = script, dotenv = false } = {}) {
  const env = { ...process.env };
  delete env[NAME];
  if (dotenv) delete env.EXPO_NO_DOTENV;
  else env.EXPO_NO_DOTENV = '1';
  if (value !== undefined) env[NAME] = value;
  const r = spawnSync(process.execPath, [scriptPath], { env, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

describe('web deploy Apple sign-in flag check', () => {
  it('fails loudly, naming the variable, when it is unset', () => {
    const r = run(undefined);
    expect(r.status).toBe(1);
    expect(r.out).toContain(NAME);
    expect(r.out).toContain('Nothing was deployed');
  });

  it.each(['true', 'false'])('accepts an explicit %s', (value) => {
    expect(run(value)).toEqual({ status: 0, out: '' });
  });

  it.each(['yes', '', 'TRUE', SENTINEL])('rejects %j without printing it', (value) => {
    const r = run(value);
    expect(r.status).toBe(1);
    expect(r.out).toContain(NAME);
    if (value) expect(r.out).not.toContain(SENTINEL);
  });

  it('reads .env files like the release build, with the shell winning', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-deploy-check-'));
    try {
      fs.mkdirSync(path.join(dir, 'scripts'));
      fs.copyFileSync(script, path.join(dir, 'scripts', 'check-web-deploy-env.cjs'));
      fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      fs.writeFileSync(path.join(dir, '.env.production'), `${NAME}=true\n`);
      const copy = path.join(dir, 'scripts', 'check-web-deploy-env.cjs');
      expect(run(undefined, { scriptPath: copy, dotenv: true }).status).toBe(0);
      expect(run(SENTINEL, { scriptPath: copy, dotenv: true }).status).toBe(1);
      expect(run(undefined, { scriptPath: copy }).status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs after build:release and before Wrangler in deploy:web', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const steps = pkg.scripts['deploy:web'].split(' && ');
    expect(steps[0]).toBe('npm run build:release');
    expect(steps[1]).toBe('node scripts/check-web-deploy-env.cjs');
    expect(steps[2]).toMatch(/^npx --yes wrangler@4\.128\.0 pages deploy dist /);
  });
});
