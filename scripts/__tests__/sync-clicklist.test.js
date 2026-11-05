const path = require('node:path');
const {
  validateManifest,
  mergeCopilotInstructions,
  isFileAllowedForSync,
  loadCanonicalArtifacts,
  planTargetSync,
  generatePrDescription,
  redactSecrets,
  SYNC_BRANCH_NAME,
  PR_TITLE,
  MANAGED_START_MARKER,
  MANAGED_END_MARKER,
} = require('../sync-clicklist-core');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('Cross-Repository Sync Core Engine', () => {
  describe('validateManifest', () => {
    it('accepts a valid manifest object with empty targets', () => {
      const result = validateManifest({
        version: 1,
        description: 'Test manifest',
        targets: [],
      });
      expect(result.version).toBe(1);
      expect(result.targets).toEqual([]);
    });

    it('accepts a valid manifest with enabled target repositories', () => {
      const result = validateManifest({
        version: 1,
        targets: [
          { repository: 'JamesTRichmond/repo-one', branch: 'main', enabled: true },
          { repository: 'JamesTRichmond/repo-two', branch: 'develop' },
        ],
      });
      expect(result.version).toBe(1);
      expect(result.targets.length).toBe(2);
    });

    it('rejects manifest with non-object or null', () => {
      expect(() => validateManifest(null)).toThrow(/valid JSON object or string/i);
      expect(() => validateManifest('invalid')).toThrow(/Malformed manifest JSON/i);
    });

    it('rejects manifest without targets array', () => {
      expect(() => validateManifest({ version: 1 })).toThrow(/must have a "targets" array/i);
    });

    it('rejects invalid repository formats', () => {
      expect(() =>
        validateManifest({
          version: 1,
          targets: [{ repository: 'invalid_no_slash' }],
        }),
      ).toThrow(/Must be in "owner\/repo" format/i);

      expect(() =>
        validateManifest({
          version: 1,
          targets: [{ repository: '' }],
        }),
      ).toThrow(/Must be in "owner\/repo" format/i);
    });

    it('rejects duplicate repositories case-insensitively', () => {
      expect(() =>
        validateManifest({
          version: 1,
          targets: [
            { repository: 'JamesTRichmond/onto' },
            { repository: 'jamestrichmond/onto' },
          ],
        }),
      ).toThrow(/Duplicate target repository/i);
    });

    it('rejects invalid target property types', () => {
      expect(() =>
        validateManifest({
          version: 1,
          targets: [{ repository: 'JamesTRichmond/test', branch: 123 }],
        }),
      ).toThrow(/invalid "branch" name/i);

      expect(() =>
        validateManifest({
          version: 1,
          targets: [{ repository: 'JamesTRichmond/test', enabled: 'yes' }],
        }),
      ).toThrow(/non-boolean "enabled" property/i);
    });
  });

  describe('mergeCopilotInstructions', () => {
    const managedSnippet = 'Managed Content Line 1\nManaged Content Line 2';

    it('creates a fresh file with managed block if existing content is empty or null', () => {
      const result = mergeCopilotInstructions('', managedSnippet);
      expect(result).toContain(MANAGED_START_MARKER);
      expect(result).toContain(managedSnippet);
      expect(result).toContain(MANAGED_END_MARKER);
    });

    it('appends managed block to existing instructions without markers', () => {
      const existing = '# Target Repo Instructions\n\nCustom instructions for target repo.';
      const result = mergeCopilotInstructions(existing, managedSnippet);

      expect(result.startsWith(existing)).toBe(true);
      expect(result).toContain(MANAGED_START_MARKER);
      expect(result).toContain(managedSnippet);
      expect(result).toContain(MANAGED_END_MARKER);
    });

    it('replaces only the managed block and preserves all surrounding content', () => {
      const header = '# Target Repo Instructions\n\nPre-content here.\n\n';
      const oldManaged = `${MANAGED_START_MARKER}\nOld managed instructions\n${MANAGED_END_MARKER}`;
      const footer = '\n\nPost-content here.\n- Custom Rule A\n- Custom Rule B';
      const existing = `${header}${oldManaged}${footer}`;

      const result = mergeCopilotInstructions(existing, managedSnippet);

      expect(result).toContain('Pre-content here.');
      expect(result).toContain('Post-content here.');
      expect(result).toContain('- Custom Rule A');
      expect(result).toContain(managedSnippet);
      expect(result).not.toContain('Old managed instructions');
    });

    it('refuses to overwrite when start marker exists without end marker', () => {
      const corrupted = `# Instructions\n${MANAGED_START_MARKER}\nSome content without end`;
      expect(() => {
        mergeCopilotInstructions(corrupted, managedSnippet);
      }).toThrow(/Corrupted or ambiguous managed instructions markers/i);
    });

    it('refuses to overwrite when end marker exists without start marker', () => {
      const corrupted = `# Instructions\nSome content\n${MANAGED_END_MARKER}`;
      expect(() => {
        mergeCopilotInstructions(corrupted, managedSnippet);
      }).toThrow(/Corrupted or ambiguous managed instructions markers/i);
    });

    it('refuses to overwrite when multiple marker sets exist', () => {
      const corrupted = `# Instructions\n${MANAGED_START_MARKER}\nBlock 1\n${MANAGED_END_MARKER}\n${MANAGED_START_MARKER}\nBlock 2\n${MANAGED_END_MARKER}`;
      expect(() => {
        mergeCopilotInstructions(corrupted, managedSnippet);
      }).toThrow(/Corrupted or ambiguous managed instructions markers/i);
    });

    it('refuses to overwrite when markers are inverted (end before start)', () => {
      const corrupted = `# Instructions\n${MANAGED_END_MARKER}\nContent\n${MANAGED_START_MARKER}`;
      expect(() => {
        mergeCopilotInstructions(corrupted, managedSnippet);
      }).toThrow(/Corrupted or ambiguous managed instructions markers/i);
    });
  });

  describe('isFileAllowedForSync & artifact filtering', () => {
    it('allows canonical standard, template files, and copilot instructions', () => {
      expect(isFileAllowedForSync('docs/JAMES-CLICKLIST-STANDARD.md')).toBe(true);
      expect(isFileAllowedForSync('docs/clicklist-template/README.md')).toBe(true);
      expect(isFileAllowedForSync('docs/clicklist-template/JAMES-CLICKLIST.template.html')).toBe(true);
      expect(isFileAllowedForSync('docs/clicklist-template/INSTALL-PROMPT.md')).toBe(true);
      expect(isFileAllowedForSync('docs/clicklist-template/copilot-instructions-snippet.md')).toBe(true);
      expect(isFileAllowedForSync('.github/copilot-instructions.md')).toBe(true);
    });

    it('strictly forbids synchronizing live project-specific checklists', () => {
      expect(isFileAllowedForSync('JAMES-CLICKLIST.html')).toBe(false);
      expect(isFileAllowedForSync('JAMES-CLICKLIST.md')).toBe(false);
      expect(isFileAllowedForSync('store/ios/review-notes.md')).toBe(false);
      expect(isFileAllowedForSync('RELEASE_CHECKLIST.md')).toBe(false);
    });

    it('strictly forbids synchronizing secrets, credentials, configs, and source code', () => {
      expect(isFileAllowedForSync('.env')).toBe(false);
      expect(isFileAllowedForSync('.env.production')).toBe(false);
      expect(isFileAllowedForSync('id_rsa')).toBe(false);
      expect(isFileAllowedForSync('cert.pem')).toBe(false);
      expect(isFileAllowedForSync('package.json')).toBe(false);
      expect(isFileAllowedForSync('app.json')).toBe(false);
      expect(isFileAllowedForSync('eas.json')).toBe(false);
      expect(isFileAllowedForSync('src/App.tsx')).toBe(false);
    });
  });

  describe('loadCanonicalArtifacts', () => {
    it('loads all canonical files with appropriate headers', () => {
      const artifacts = loadCanonicalArtifacts(REPO_ROOT);
      expect(artifacts.sharedFiles.get('docs/JAMES-CLICKLIST-STANDARD.md')).toBeDefined();
      expect(artifacts.sharedFiles.get('docs/clicklist-template/README.md')).toBeDefined();
      expect(artifacts.sharedFiles.get('docs/clicklist-template/JAMES-CLICKLIST.template.html')).toBeDefined();
      expect(artifacts.sharedFiles.get('docs/clicklist-template/INSTALL-PROMPT.md')).toBeDefined();
      expect(artifacts.sharedFiles.get('docs/clicklist-template/copilot-instructions-snippet.md')).toBeDefined();

      // Ensure canonical source warning is present
      const standardContent = artifacts.sharedFiles.get('docs/JAMES-CLICKLIST-STANDARD.md');
      const templateContent = artifacts.sharedFiles.get('docs/clicklist-template/JAMES-CLICKLIST.template.html');

      expect(standardContent).toContain('CANONICAL SOURCE: https://github.com/JamesTRichmond/onto');
      expect(templateContent).toContain('CANONICAL SOURCE: https://github.com/JamesTRichmond/onto');
    });
  });

  describe('planTargetSync', () => {
    const canonicalArtifacts = {
      sharedFiles: new Map([
        ['docs/JAMES-CLICKLIST-STANDARD.md', '# Standard v1'],
      ]),
      snippetContent: 'Snippet v1',
    };

    it('plans creation when file does not exist in target', () => {
      const targetFiles = new Map();
      const plan = planTargetSync(targetFiles, canonicalArtifacts);

      expect(plan.changes.length).toBe(2); // standard + copilot instructions
      expect(plan.changes[0].isNew).toBe(true);
      expect(plan.changes[1].isNew).toBe(true);
    });

    it('plans update when file content has changed', () => {
      const targetFiles = new Map([
        ['docs/JAMES-CLICKLIST-STANDARD.md', '# Standard v0'],
        ['.github/copilot-instructions.md', `${MANAGED_START_MARKER}\nSnippet v0\n${MANAGED_END_MARKER}`],
      ]);

      const plan = planTargetSync(targetFiles, canonicalArtifacts);

      expect(plan.changes.length).toBe(2);
      expect(plan.changes[0].isNew).toBe(false);
      expect(plan.changes[1].isNew).toBe(false);
    });

    it('detects idempotency when target files are already in sync', () => {
      const targetFiles = new Map([
        ['docs/JAMES-CLICKLIST-STANDARD.md', '# Standard v1'],
        ['.github/copilot-instructions.md', `${MANAGED_START_MARKER}\nSnippet v1\n${MANAGED_END_MARKER}`],
      ]);

      const plan = planTargetSync(targetFiles, canonicalArtifacts);

      expect(plan.changes.length).toBe(0);
      expect(plan.unchanged.length).toBe(2);
    });
  });

  describe('redactSecrets', () => {
    it('redacts tokens and classic PATs from strings', () => {
      const secret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      const text = `Error connecting with token ${secret} on api.github.com`;
      const redacted = redactSecrets(text, [secret]);

      expect(redacted).not.toContain(secret);
      expect(redacted).toContain('[REDACTED_SECRET]');
    });

    it('redacts fine-grained PAT patterns automatically', () => {
      const pat = 'github_pat_11AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTTUUVVWWXXYYZZ1234567890';
      const text = 'Request header Authorization: Bearer ' + pat + ' on host';
      const redacted = redactSecrets(text, []);

      expect(redacted).not.toContain(pat);
      expect(redacted).toContain('[REDACTED_FINE_GRAINED_PAT]');
    });
  });

  describe('Constants and PR metadata', () => {
    it('uses deterministic branch name and PR title', () => {
      expect(SYNC_BRANCH_NAME).toBe('onto-clicklist-sync');
      expect(PR_TITLE).toBe('[Automated] Synchronize clicklist standard and Copilot instructions from onto');
    });

    it('builds a descriptive markdown pull request body', () => {
      const plan = {
        changes: [
          { path: 'docs/JAMES-CLICKLIST-STANDARD.md', isNew: false },
          { path: '.github/copilot-instructions.md', isNew: false },
        ],
      };
      const body = generatePrDescription(plan);

      expect(body).toContain('JamesTRichmond/onto');
      expect(body).toContain('docs/JAMES-CLICKLIST-STANDARD.md');
      expect(body).toContain('.github/copilot-instructions.md');
      expect(body).toContain('Next Actions');
      expect(body).toContain('INSTALL-PROMPT.md');
    });
  });
});
