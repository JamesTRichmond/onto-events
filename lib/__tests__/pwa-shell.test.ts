import fs from 'fs';
import path from 'path';
import { installState, isIosSafari } from '../pwa-install';

const root = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('manifest.json', () => {
  it('meets the install locks', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0B1020');
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(manifest.theme_color).toBe('#0B1020');
  });

  it('carries the app name and locked copy', () => {
    expect(manifest.name).toBe('onto');
    expect(manifest.short_name).toBe('onto');
    expect(manifest.description).toBe('onto shows you things to do near you.');
  });


  it('ships 192, 512 and maskable icons that exist on disk', () => {
    const has = (size: string, purpose: string) =>
      manifest.icons.some((i: any) => i.sizes === size && (i.purpose ?? 'any').includes(purpose));
    expect(has('192x192', 'any')).toBe(true);
    expect(has('512x512', 'any')).toBe(true);
    expect(has('512x512', 'maskable')).toBe(true);
    for (const i of manifest.icons) {
      expect(fs.existsSync(path.join(root, 'public', i.src))).toBe(true);
    }
  });

  it('has SPA routing and header rules for Cloudflare Pages', () => {
    expect(fs.readFileSync(path.join(root, 'public/_redirects'), 'utf8')).toContain('/* /index.html 200');
    const headers = fs.readFileSync(path.join(root, 'public/_headers'), 'utf8');
    expect(headers).toMatch(/\/sw\.js\s+Cache-Control: no-cache/);
    expect(headers).toMatch(/\/_expo\/static\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  });
});

describe('installState', () => {
  const base = { displayModeStandalone: false, hasDeferredPrompt: false, userAgent: CHROME };
  it('detects installed via display-mode or navigator.standalone', () => {
    expect(installState({ ...base, displayModeStandalone: true })).toBe('installed');
    expect(installState({ ...base, userAgent: IOS, navigatorStandalone: true })).toBe('installed');
  });
  it('is promptable once beforeinstallprompt fired', () => {
    expect(installState({ ...base, hasDeferredPrompt: true })).toBe('promptable');
  });
  it('falls back to manual Add to Home Screen on iOS Safari', () => {
    expect(isIosSafari(IOS)).toBe(true);
    expect(installState({ ...base, userAgent: IOS })).toBe('ios-manual');
  });
  it('is unsupported otherwise', () => {
    expect(installState(base)).toBe('unsupported');
  });
});

describe('+html first paint', () => {
  const html = fs.readFileSync(path.join(root, 'app/+html.tsx'), 'utf8');
  it('paints html, body and #root #0B1020 from the first frame', () => {
    expect(html).toContain('html,body,#root{background-color:#0B1020');
    expect(html).not.toMatch(/#fff\b|#151718/i);
  });
  it('uses the locked copy in the meta description', () => {
    expect(html).toContain('onto shows you things to do near you.');
  });
});
