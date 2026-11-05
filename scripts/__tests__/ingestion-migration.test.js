const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260902000002_ingestion.sql',
  ),
  'utf8',
);

const horizonMigration = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260903000001_sync_horizon.sql',
  ),
  'utf8',
);

describe('production ingestion migration', () => {
  it('keeps mature events unavailable to public clients', () => {
    expect(migration).toContain("using (rating <> 'mature');");
    // catalog_sync_state may use using (true); — intentional for public freshness metadata.
    // Ensure the events policy itself is not open.
    expect(migration).not.toMatch(
      /create policy events_public_read\s+on onto\.events\s+for select\s+using \(true\);/i,
    );
  });

  it('grants catalog writes only to the trusted service role', () => {
    expect(migration).toContain(
      'grant select, insert, update, delete on onto.events to service_role;',
    );
    expect(migration).not.toMatch(
      /grant (?:insert|update|delete)[^;]*onto\.events to (?:anon|authenticated)/i,
    );
  });

  it('publishes freshness without publishing mutation rights', () => {
    expect(migration).toContain(
      'create table if not exists onto.catalog_sync_state',
    );
    expect(migration).toContain(
      'grant select on onto.catalog_sync_state to anon, authenticated;',
    );
    expect(migration).not.toMatch(
      /grant (?:insert|update|delete)[^;]*catalog_sync_state to (?:anon|authenticated)/i,
    );
  });

  it('retires missing source listings only after a complete successful refresh', () => {
    expect(migration).toContain('create or replace function onto.finish_catalog_sync(');
    expect(migration).toContain('and ingested_at < p_completed_at');
    expect(migration).toContain('set is_cancelled = true');
    expect(migration).toContain(
      'grant execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer)\nto service_role;',
    );
    expect(migration).toContain(
      'revoke execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer)\nfrom public, anon, authenticated;',
    );
  });
});

describe('sync horizon migration', () => {
  it('bounds retirement to the latest start time fetched in the run', () => {
    expect(horizonMigration).toContain('create or replace function onto.finish_catalog_sync(');
    expect(horizonMigration).toMatch(/p_horizon timestamptz default null/);
    expect(horizonMigration).toContain('and ingested_at < p_completed_at');
    expect(horizonMigration).toMatch(
      /and \(p_horizon is null or starts_at < p_horizon\);/,
    );
    expect(horizonMigration).toContain('set is_cancelled = true');
  });

  it('replaces the old overload so rpc resolution stays unambiguous', () => {
    expect(horizonMigration).toContain(
      'drop function if exists onto.finish_catalog_sync(text, timestamptz, integer, integer);',
    );
    expect(horizonMigration).toMatch(/security definer\s+set search_path = ''/);
  });

  it('keeps the finish step callable only by the trusted service role', () => {
    expect(horizonMigration).toContain("if (select auth.role()) <> 'service_role' then");
    expect(horizonMigration).toContain(
      "raise exception 'service role required' using errcode = '42501';",
    );
    expect(horizonMigration).toContain(
      'grant execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer, timestamptz)\nto service_role;',
    );
    expect(horizonMigration).toContain(
      'revoke execute on function onto.finish_catalog_sync(text, timestamptz, integer, integer, timestamptz)\nfrom public, anon, authenticated;',
    );
    expect(horizonMigration).not.toMatch(
      /grant execute[^;]*finish_catalog_sync[^;]*to (?:anon|authenticated|public)/i,
    );
  });
});
