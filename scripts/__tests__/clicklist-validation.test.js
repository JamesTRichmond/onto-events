const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLICKLIST_HTML_PATH = path.join(REPO_ROOT, 'JAMES-CLICKLIST.html');
const STANDARD_MD_PATH = path.join(REPO_ROOT, 'docs', 'JAMES-CLICKLIST-STANDARD.md');
const COPILOT_INSTRUCTIONS_PATH = path.join(REPO_ROOT, '.github', 'copilot-instructions.md');
const TEMPLATE_HTML_PATH = path.join(REPO_ROOT, 'docs', 'clicklist-template', 'JAMES-CLICKLIST.template.html');

// Permanent number-to-identity ledger. Grouping may change; identity may not.
// Retirement removes an action from progress without giving its number away.
const identities = {
  38: 'onto-coordination-rules-merge',
  39: 'onto-coordination-global-guard',
  40: 'onto-coordination-chatgpt-setup',
  41: 'onto-coordination-gemini-setup',
  42: 'onto-coordination-grok-setup',
  43: 'onto-coordination-claude-setup',
  44: 'onto-coordination-step1-signoff',
      31: 'onto-v2-source-review', 32: 'onto-v2-permissions', 33: 'onto-v2-apple-moderation', 34: 'onto-v2-migrations-build', 35: 'onto-v2-device-pilot',
  36: 'onto-asheville-research-access', 37: 'onto-asheville-region-review',
  1: 'onto-apple-dev-membership',
  2: 'onto-apple-agreements',
  3: 'onto-appstore-name-reserve',
  4: 'onto-support-email',
  5: 'onto-cloudflare-dns-pages',
  6: 'onto-tm-key-secret',
  7: 'onto-supabase-secrets',
  8: 'onto-clicklist-sync-secret',
  9: 'onto-eas-build-testflight',
  10: 'onto-physical-device-test',
  11: 'onto-appstore-metadata-review',
  12: 'onto-appstore-screenshots-review',
  13: 'onto-appstore-privacy-nutrition',
  14: 'onto-final-appstore-submission',
  15: 'onto-post-release-smoke-test',
  16: 'onto-release-guard-approval',
  17: 'onto-supabase-production-controls',
  18: 'onto-eas-production-env',
  19: 'onto-public-release-approval',
  20: 'onto-gallivan-feed-decision',
  21: 'onto-v2-radius-default-decision',
};

function cardsFrom(html) {
  return Array.from(html.matchAll(/<details class="step-card"[^>]*>[\s\S]*?<\/details>/g), match => {
    const source = match[0];
    return {
      source,
      id: source.match(/data-step-id="([^"]+)"/)[1],
      rev: Number(source.match(/data-rev="(\d+)"/)[1]),
      number: Number(source.match(/<span class="step-number">(\d+)<\/span>/)[1]),
    };
  });
}

describe('JAMES-CLICKLIST.html validation', () => {
  let html;
  let cards;

  beforeAll(() => {
    expect(fs.existsSync(CLICKLIST_HTML_PATH)).toBe(true);
    html = fs.readFileSync(CLICKLIST_HTML_PATH, 'utf8');
    cards = cardsFrom(html);
  });

  it('is a self-contained HTML document without remote runtime dependencies', () => {
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toMatch(/<html lang="en">/i);
    expect(html).not.toMatch(/<script[^>]+src=["'](?!data:)https?:\/\//i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:\/\//i);
  });

  it('preserves the storage namespace, revision check and scoped reset', () => {
    expect(html).toContain("const NAMESPACE = 'onto.clicklist.v1';");
    expect(html).toContain('saved.rev === rev');
    expect(html).toMatch(/key\.startsWith\(NAMESPACE \+ ':'\)/);
    expect(html).not.toContain('localStorage.clear(');
    expect(html).toContain('storage-note');
  });

  it('keeps semantic instructions readable without JavaScript', () => {
    expect(cards.length).toBe(32);
    expect((html.match(/<summary class="step-summary"/g) || []).length).toBe(cards.length);
    for (const card of cards) {
      expect(card.source).toContain('<div class="step-body">');
      expect(card.source).not.toMatch(/<details[^>]*\sopen(?:\s|>)/);
    }
  });

  it('gives every active card a unique identity, matching checkbox, estimate and success signal', () => {
    expect(new Set(cards.map(card => card.id)).size).toBe(cards.length);
    for (const { source, id, rev, number } of cards) {
      expect(id).toMatch(/^onto-[a-z0-9-]+$/);
      expect(rev).toBeGreaterThanOrEqual(1);
      expect(source).toContain(`id="card-${id}"`);
      const checkbox = source.match(/<input\b[^>]+>/)[0];
      expect(checkbox).toContain('type="checkbox"');
      expect(checkbox).toContain(`data-step-id="${id}"`);
      expect(checkbox).toContain(`data-rev="${rev}"`);
      expect(checkbox).toContain(`aria-label="Step ${number} completion"`);
      expect(source).toContain('<span class="step-estimate">');
      expect(source).toContain('<div class="success-box">');
      expect(source).toContain('Success looks like:');
    }
    expect((html.match(/<div class="success-box">/g) || []).length).toBe(cards.length);
  });

  it('preserves every permanent number across active and retired actions', () => {
    const retired = Array.from(html.matchAll(/data-retired-number="(\d+)" data-retired-id="([^"]+)"/g),
      match => ({ number: Number(match[1]), id: match[2] }));
    const ledger = [...cards, ...retired];
    expect(new Set(ledger.map(entry => entry.number)).size).toBe(ledger.length);
    expect(new Set(ledger.map(entry => entry.id)).size).toBe(ledger.length);
    expect(Object.fromEntries(ledger.map(entry => [entry.number, entry.id]))).toEqual(identities);
    expect(retired.map(entry => entry.number).sort()).toEqual([6, 7, 8]);
  });

  it('invalidates materially changed steps without resetting unchanged completions', () => {
    for (const number of [1]) expect(cards.find(card => card.number === number).rev).toBe(1);
    for (const number of [2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15]) {
      expect(cards.find(card => card.number === number).rev).toBeGreaterThanOrEqual(2);
    }
    expect(cards.find(card => card.number === 9).rev).toBe(5);
    // Step 10 was rewritten for the V2 device pass (fresh-install 1 mile, Maybes undo). Rev 10 adds complete pilot and Apple acceptance.
    expect(cards.find(card => card.number === 10).rev).toBe(10);
  });

  it('revises only the existing Austin human gates without recycling their identities', () => {
    for (const [number, rev] of [[31, 33], [32, 16], [35, 4]]) {
      const card = cards.find(entry => entry.number === number);
      expect(card.id).toBe(identities[number]);
      expect(card.rev).toBe(rev);
      expect(card.source.match(/<input\b[^>]+>/)[0]).toContain(`data-rev="${rev}"`);
    }
    expect(cards.find(card => card.number === 10).rev).toBe(10);
  });

  it('binds Austin merge approval and automatic enrollment to the exact final ledger', () => {
    const source = cards.find(card => card.number === 31).source;
    expect(source).toContain('https://github.com/JamesTRichmond/onto/pull/331');
    expect(source).toContain('docs/sources/2026-10-18-AUSTIN.md');
    for (const text of [
      'same exact final commit',
      'exact active Austin feed IDs',
      'data/feeds.json',
      'quarantined or unverified publishers remain unapproved',
      'final ledger has no active Austin feed IDs',
      'All registered Austin live feeds are paused and quarantined',
      'offline snapshot contains 17 market schedule occurrences',
      'official indexed year-round schedule excerpts',
      'not raw HTTP captures or live-verified feed results',
      'neither market feed is approved for live sync',
      'Merging active feed entries automatically enrolls those IDs',
      'scheduled sync and its hosted catalog writes',
      'no later post-merge activation gate',
      'empty, this merge enrolls no Austin feeds',
      'changed head or active-ID list requires renewed approval',
    ]) expect(source).toContain(text);
    expect(source).not.toMatch(/60 verified|333 (?:upcoming )?events/i);
    expect(source).toContain('This does not authorize a manual hosted write, deployment or device acceptance');
  });

  it('separates Austin hosted-write and deployment authorization from source approval', () => {
    const permissions = cards.find(card => card.number === 32).source;
    for (const text of [
      'manual hosted catalog writes or workflow dispatch',
      'target environment and scope',
      'empty active-ID ledger authorizes no Austin feed writes',
      'Separately approve or withhold deployment of the exact PWA commit to Cloudflare Pages',
      'approved hosted URL and preview or production scope',
      'observation time, approved feed IDs, actual eligible Austin supply',
      'local fixtures and a source merge are not hosted verification',
      'No deployment or hosted-write approval is implied by source approval',
      'Do not publish <code>JAMES-CLICKLIST.html</code>',
      'Step 35 remains blocked',
    ]) expect(permissions).toContain(text);
    expect(permissions).not.toMatch(/60 verified|333 (?:upcoming )?events/i);
  });

  it('blocks Austin physical PWA acceptance until the exact hosted release has supply evidence', () => {
    const device = cards.find(card => card.number === 35).source;
    expect(device.match(/<summary[\s\S]*?<\/summary>/)[0]).toContain('blocked on step 32');
    for (const text of [
      'approved hosted URL and exact Cloudflare Pages PWA commit',
      'matching hosted supply verification',
      'physical iPhone',
      'Safari',
      'Add to Home Screen',
      'both tabs must share the selected city/pin',
      'America/Chicago',
      'November 1, 2026 DST transition',
      'iPhone set to another timezone',
      'After October 24, 2026',
      'expired events must not reappear',
      'regional isolation online and offline',
      'nearby or farther lists',
      'Mount Bonnell at Covert Park',
      'Dripping Springs pin is excluded',
      'Creedmoor pin is included',
      'missing evidence or an empty catalog cannot be recorded as a complete pass',
    ]) expect(device).toContain(text);
    expect(device).not.toContain('External testers use the external TestFlight route');
    expect(device).not.toContain('Wait for the exact processed build');
  });

  it('gates the new V2 build and device pass on the chosen fresh-install distance', () => {
    const choice = cards.find(card => card.number === 21).source;
    const build = cards.find(card => card.number === 9).source;
    const device = cards.find(card => card.number === 10).source;
    // James settled this as "1 mile", not the spelled-out open choice the older assertion expected.
    expect(choice).toContain('1 mile');
    expect(choice).toContain('100 miles');
    expect(choice).toContain('no longer an open');
    expect(build).toContain('steps 1, 2, 3, 16, 17, 18 and 21');
    expect(device).toContain('docs/v2/TESTER-RUNBOOK.md');
    expect(device).toContain('It does not establish this build');
  });

  it('provides a copy button for every literal block', () => {
    const blocks = Array.from(html.matchAll(/<div class="copy-block">([\s\S]*?)<\/div>/g));
    expect(blocks.length).toBeGreaterThan(0);
    expect((html.match(/<pre>/g) || []).length).toBe(blocks.length);
    for (const block of blocks) {
      expect(block[1]).toContain('<code>');
      expect(block[1]).toContain('class="copy-btn"');
    }
  });

  it('separates build/upload, App Review and public-release approval', () => {
    const build = cards.find(card => card.number === 9).source;
    expect(build).toContain('Do not queue a duplicate');
    expect(build).toContain('steps 1, 2, 3, 16, 17, 18 and 21');
    expect(build).not.toContain('--auto-submit');
    expect(build).not.toContain('--latest');
    expect(build).toContain('eas-cli@latest build');
    expect(build).toContain('eas-cli@latest submit');
    expect(build).toContain('set -a; source .env.local; set +a');
    expect(build).toContain('eas-cli@latest build:view BUILD_ID');
    expect(build).toContain('--id BUILD_ID');
    expect(build).toContain('APP_MANAGER');
    expect(build).toContain('appstoreconnect.apple.com/apps/6808894038/testflight/ios');
    expect(cards.find(card => card.number === 14).source).toContain('dependency audit');
    expect(cards.find(card => card.number === 19).source).toContain('Pending Developer Release');
    expect(cards.find(card => card.number === 15).source).toContain('Wait for step 19');
  });

  it('does not reintroduce the incorrect collected-location answer', () => {
    const privacy = cards.find(card => card.number === 13).source;
    expect(privacy).toContain('email address, user ID, profile display name and cloud RSVP');
    expect(privacy).toContain('<strong>not collected</strong>');
    expect(privacy).not.toContain('Location (Coarse/Precise');
    const source = fs.readFileSync(path.join(REPO_ROOT, 'store/ios/privacy-disclosure.md'), 'utf8');
    expect(source).toContain('Precise Location: used on device');
    expect(source).toContain('Contact Info > Name');
  });

  it('does not embed credentials or secret values', () => {
    expect(html).not.toMatch(/ey[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/);
    expect(html).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
    expect(html).not.toMatch(/github_pat_[a-zA-Z0-9_]{50,}/);
    expect(html).not.toMatch(/(?:password|passwd|secret)\s*[:=]\s*["'][^"']+["']/i);
    expect(html).toMatch(/Never paste or embed secret values/i);
  });
});

describe('Clicklist Standard and Copilot Instructions', () => {
  it('keeps the canonical standard', () => {
    expect(fs.existsSync(STANDARD_MD_PATH)).toBe(true);
    const standard = fs.readFileSync(STANDARD_MD_PATH, 'utf8');
    expect(standard).toContain('CANONICAL SOURCE: https://github.com/JamesTRichmond/onto');
    expect(standard).toContain('Strict Membership Rule');
    expect(standard).toContain('Completion-State Safety and Revisioning');
    expect(standard).toContain('Maintenance Rules for Copilot Coding Agents');
  });

  it('keeps repository-wide managed instructions', () => {
    const instructions = fs.readFileSync(COPILOT_INSTRUCTIONS_PATH, 'utf8');
    expect(instructions).toContain('<!-- BEGIN MANAGED CLICKLIST INSTRUCTIONS: JamesTRichmond/onto -->');
    expect(instructions).toContain('<!-- END MANAGED CLICKLIST INSTRUCTIONS: JamesTRichmond/onto -->');
    for (const text of ['JAMES-CLICKLIST.html', 'docs/JAMES-CLICKLIST-STANDARD.md', 'Clicklist updated:', 'Clicklist unchanged:']) {
      expect(instructions).toContain(text);
    }
  });

  it('keeps the reusable template placeholders', () => {
    const template = fs.readFileSync(TEMPLATE_HTML_PATH, 'utf8');
    for (const placeholder of ['{{REPO_NAME}}', '{{STORAGE_NAMESPACE}}', '{{LAST_VERIFIED_DATE}}', '{{RELEASE_TARGET}}', '[EXAMPLE]']) {
      expect(template).toContain(placeholder);
    }
  });
});

