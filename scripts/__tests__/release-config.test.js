const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const store = JSON.parse(
  fs.readFileSync(path.join(root, 'store.config.json'), 'utf8'),
);
const supabaseConfig = fs.readFileSync(
  path.join(root, 'supabase', 'config.toml'),
  'utf8',
);

describe('iPhone release configuration', () => {
  it('links the immutable Expo project and iOS bundle identity', () => {
    expect(app.expo.owner).toBe('onto-events');
    expect(app.expo.extra.eas.projectId).toBe(
      'a86ff21a-3235-4d92-9b8d-f190f225dd3a',
    );
    expect(app.expo.ios.bundleIdentifier).toBe('events.onto.app');
    expect(app.expo.ios.supportsTablet).toBe(false);
    expect(app.expo.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it('pins an EAS image and environment for every build profile', () => {
    for (const profile of ['development', 'preview', 'production']) {
      expect(eas.build[profile].environment).toBe(profile);
      expect(eas.build[profile].ios.image).toBe('latest');
    }
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.production.env.EXPO_PUBLIC_ENABLE_MATURE).toBe('false');
  });

  it('keeps App Store metadata aligned with the free Salt Lake City v1', () => {
    const info = store.apple.info['en-US'];
    expect(store.configVersion).toBe(0);
    expect(store.apple.version).toBe(app.expo.version);
    expect(store.apple.copyright).toBe('2026 James Richmond');
    expect(store.apple.categories).toEqual(['LIFESTYLE', 'TRAVEL']);
    expect(store.apple.release.automaticRelease).toBe(false);
    expect(info.title).toBe('onto: Things to do now');
    expect(info.description).toMatch(/without creating an account/i);
    expect(info.description).toMatch(/no subscription required/i);
    expect(info.description).toMatch(/no mature or 21\+ events/i);
    expect(info.privacyPolicyUrl).toMatch(/^https:\/\//);
    expect(info.supportUrl).toMatch(/^https:\/\//);
  });

  it('discloses the automatic profile display name in every privacy text', () => {
    const disclosure =
      /creates a profile record with a display name taken from the part of (?:your|their) email address before the @ sign/i;
    for (const file of [
      path.join('app', 'privacy.tsx'),
      'PRIVACY.md',
      path.join('store', 'ios', 'privacy-disclosure.md'),
    ]) {
      const text = fs
        .readFileSync(path.join(root, file), 'utf8')
        .replace(/\s+/g, ' ');
      expect(text).toMatch(disclosure);
      expect(text).toMatch(/(?:choose|chosen|edited|editable|different|another).*display name|display name.*(?:edited|choose)/i);
      expect(text).toMatch(/Apple/i);
      expect(text).toMatch(/encrypted.*revocation|revocation.*encrypted/i);
      expect(text).toMatch(/profile is deleted with (?:your|the) account/i);
      expect(text).toMatch(/RSVP status and timestamps/);
    }
  });

  it('has reproducible commands for the public App Store support site', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.build).toMatch(/^expo export --platform web --output-dir dist && node scripts\/pwa\/build-sw\.mjs --dist dist$/);
    expect(pkg.scripts['deploy:web']).toContain('wrangler@4.128.0 pages deploy dist');
  });

  it('never commits privileged ingestion credentials into app configuration', () => {
    const publicConfig = JSON.stringify({ app, eas });
    expect(publicConfig).not.toMatch(/SERVICE_ROLE|TM_KEY|TICKETMASTER.*KEY/i);
    expect(publicConfig).not.toMatch(/SUPABASE_PUBLISHABLE_KEY\s*["':]+\s*\S{20}/i);
  });

  it('ships a reproducible six-digit email-code flow', () => {
    const emailSection = supabaseConfig.match(
      /\[auth\.email\]\n([\s\S]*?)(?=\n\[)/,
    )?.[1];
    expect(emailSection).toContain('otp_length = 6');
    expect(emailSection).toContain('otp_expiry = 600');

    for (const template of ['confirmation', 'magic_link']) {
      expect(supabaseConfig).toContain(`[auth.email.template.${template}]`);
      expect(supabaseConfig).toContain(
        `content_path = "./supabase/templates/${template}.html"`,
      );
      const html = fs.readFileSync(
        path.join(root, 'supabase', 'templates', `${template}.html`),
        'utf8',
      );
      expect(html).toContain('{{ .Token }}');
      expect(html).not.toContain('{{ .ConfirmationURL }}');
    }
  });

  it('uses direct Expo environment references for the client backend', () => {
    const clientSource = fs.readFileSync(
      path.join(root, 'lib', 'backend', 'supabase-client.ts'),
      'utf8',
    );
    expect(clientSource).toMatch(
      /EXPO_PUBLIC_SUPABASE_URL:\s*process\.env\.EXPO_PUBLIC_SUPABASE_URL/,
    );
    expect(clientSource).toMatch(
      /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:\s*\n?\s*process\.env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});
