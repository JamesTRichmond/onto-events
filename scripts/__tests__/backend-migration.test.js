const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260902000001_core.sql',
  ),
  'utf8',
);
const hardeningMigration = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260902000003_review_hardening.sql',
  ),
  'utf8',
);

describe('production backend migration contract', () => {
  it('enables RLS on every user-state table', () => {
    for (const table of [
      'profiles',
      'event_rsvps',
      'user_blocks',
      'user_reports',
      'user_presence',
    ]) {
      expect(migration).toContain(
        `alter table onto.${table} enable row level security;`,
      );
    }
  });

  it('keeps public discovery read-only and accountless', () => {
    expect(migration).toContain('create policy events_public_read');
    expect(migration).toContain("using (rating <> 'mature');");
    expect(migration).toContain('grant select on onto.events to anon, authenticated;');
    expect(migration).not.toMatch(/create policy events_\w+\s+on onto\.events\s+for (insert|update|delete)/i);
  });

  it('keeps social and presence defaults private', () => {
    expect(migration).toContain('is_discoverable boolean not null default false');
    expect(migration).toContain(
      'share_with_connections boolean not null default false',
    );
    expect(migration).toContain(
      "visibility onto.presence_visibility not null default 'private'",
    );
  });

  it('limits every user-state policy to the authenticated role', () => {
    const userPolicies = migration.match(
      /create policy (?:profiles|event_rsvps|user_blocks|user_reports|user_presence)_[\s\S]*?;/g,
    ) ?? [];
    expect(userPolicies.length).toBeGreaterThan(0);
    userPolicies.forEach((policy) => expect(policy).toContain('to authenticated'));
  });

  it('enforces blocks in both directions', () => {
    const blockTable = migration.indexOf('create table if not exists onto.user_blocks');
    const blockHelper = migration.indexOf(
      'create or replace function onto.users_are_blocked',
    );
    const firstBlockPolicyUse = migration.indexOf(
      'not onto.users_are_blocked(auth.uid(), user_id)',
    );

    expect(blockHelper).toBeGreaterThan(blockTable);
    expect(firstBlockPolicyUse).toBeGreaterThan(blockHelper);
    expect(migration).toContain(
      'and (a = auth.uid() or b = auth.uid())',
    );
    expect(migration).toContain(
      '(ub.blocker_id = a and ub.blocked_id = b)',
    );
    expect(migration).toContain(
      '(ub.blocker_id = b and ub.blocked_id = a)',
    );
    expect(migration).toContain(
      'not onto.users_are_blocked(auth.uid(), user_id)',
    );
  });

  it('stores only coarse presence, never exact personal location', () => {
    const start = migration.indexOf(
      'create table if not exists onto.user_presence',
    );
    const end = migration.indexOf(
      '-- ---------------------------------------------------------------------------',
      start + 10,
    );
    const presenceTable = migration.slice(start, end);

    expect(presenceTable).toContain('coarse_area text');
    expect(presenceTable).not.toMatch(/latitude|longitude|coordinates|geography|geometry/i);
  });

  it('expires cancelled and stale events from active discovery', () => {
    expect(migration).toContain('create or replace view onto.active_events');
    expect(migration).toContain('where e.is_cancelled = false');
    expect(migration).toContain(
      "coalesce(e.ends_at, e.starts_at + interval '3 hours') > now()",
    );
  });

  it('allows foreign-key target removal without losing historical reports', () => {
    expect(migration).not.toMatch(/^as \$$|^\$;$/m);
    expect(migration).toContain(
      'drop constraint if exists user_reports_target_present;',
    );
    expect(migration).toContain(
      'create or replace function onto.require_report_target()',
    );
    expect(migration).toContain('before insert on onto.user_reports');
  });

  it('allows an authenticated user to delete only their own account', () => {
    expect(migration).toContain(
      'create or replace function onto.delete_my_account()',
    );
    expect(migration).toContain('requester uuid := (select auth.uid());');
    expect(migration).toContain('as $$\ndeclare\n  requester uuid');
    expect(migration).toContain('delete from auth.users where id = requester;');
    expect(migration).toContain(
      'revoke execute on function onto.delete_my_account() from public;',
    );
    expect(migration).toContain(
      'grant execute on function onto.delete_my_account() to authenticated;',
    );
    expect(migration).not.toMatch(/delete from auth\.users(?! where id = requester)/i);
  });

  it('exposes a version probe for deployment smoke tests', () => {
    expect(migration).toContain(
      'create or replace function onto.backend_contract_version()',
    );
    expect(migration).toContain('select 1;');
    expect(migration).toContain(
      'grant execute on function onto.backend_contract_version() to anon, authenticated;',
    );
  });

  it('keeps a complete RSVP history including past and cancelled plans', () => {
    const start = migration.indexOf('create or replace function onto.my_rsvp_history()');
    const end = migration.indexOf('-- ---------------------------------------------------------------------------', start + 10);
    const historyFunction = migration.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(historyFunction).toContain('r.updated_at as rsvp_updated_at');
    expect(historyFunction).not.toContain("r.status <> 'cancelled'");
    expect(historyFunction).not.toContain("interval '3 hours') > now()");
  });

  it('backfills profiles and grants only moderation read access forward', () => {
    expect(hardeningMigration).toContain('from auth.users');
    expect(hardeningMigration).toContain('insert into onto.profiles (user_id, display_name)');
    expect(hardeningMigration).toMatch(/select\s+id,\s+left\(/);
    expect(hardeningMigration).toContain('on conflict (user_id) do nothing;');
    expect(hardeningMigration).toContain(
      'grant select on onto.user_reports to service_role;',
    );
    expect(hardeningMigration).not.toMatch(
      /grant (?:insert|update|delete|all)[^;]*onto\.user_reports to service_role/i,
    );
  });
});
