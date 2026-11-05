const fs = require('node:fs');
const path = require('node:path');
const {
  ANCHOR_EASTERN_DATE,
  calendarDaysBetween,
  evaluateSyncScheduleGate,
  getEasternDateTimeParts,
  isTargetEasternHour,
} = require('../sync-schedule-gate');

describe('sync-schedule-gate (#374)', () => {
  test('extracts America/New_York local date and hour across EDT and EST', () => {
    expect(getEasternDateTimeParts('2026-10-26T06:00:00Z')).toEqual({
      dateKey: '2026-10-26',
      year: 2026,
      month: 10,
      day: 26,
      hour: 2,
      minute: 0,
    });
    expect(getEasternDateTimeParts('2026-11-03T07:00:00Z')).toEqual({
      dateKey: '2026-11-03',
      year: 2026,
      month: 11,
      day: 3,
      hour: 2,
      minute: 0,
    });
  });

  test('runs every other day at 02:00 EDT (06:00 UTC) and skips 07:00 UTC and odd days', () => {
    // 2026-10-24 is anchor day (offset 0)
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-24T06:00:00Z',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2026-10-24',
      easternHour: 2,
      daysSinceAnchor: 0,
      isAlternatingDay: true,
      matchesHour: true,
    });

    // 07:00 UTC during EDT is 03:00 EDT -> skip
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-24T07:00:00Z',
      })
    ).toMatchObject({
      shouldRun: false,
      easternDate: '2026-10-24',
      easternHour: 3,
      matchesHour: false,
    });

    // 2026-10-25 (offset +1) at 02:00 EDT -> skip odd day
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-25T06:00:00Z',
      })
    ).toMatchObject({
      shouldRun: false,
      easternDate: '2026-10-25',
      easternHour: 2,
      daysSinceAnchor: 1,
      isAlternatingDay: false,
      matchesHour: true,
    });

    // 2026-10-26 (offset +2) at 02:00 EDT -> run
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-26T06:00:00Z',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2026-10-26',
      easternHour: 2,
      daysSinceAnchor: 2,
      isAlternatingDay: true,
      matchesHour: true,
    });
  });

  test('handles fall-back DST transition (2026-11-01) and 31-day Oct->Nov month boundary without drift', () => {
    // Oct 30 (offset +6) runs at 06:00 UTC (02:00 EDT)
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-30T06:00:00Z',
      }).shouldRun
    ).toBe(true);

    // Oct 31 (offset +7) skips even though it is the 31st of the month
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-31T06:00:00Z',
      }).shouldRun
    ).toBe(false);

    // Nov 1, 2026 is fall-back Sunday (offset +8, due day):
    // At 06:00 UTC, America/New_York falls back to 01:00 EST -> skip
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-01T06:00:00Z',
      })
    ).toMatchObject({
      shouldRun: false,
      easternDate: '2026-11-01',
      easternHour: 1,
      daysSinceAnchor: 8,
    });

    // At 07:00 UTC, America/New_York reaches 02:00 EST -> runs once
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-01T07:00:00Z',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2026-11-01',
      easternHour: 2,
      daysSinceAnchor: 8,
      isAlternatingDay: true,
      matchesHour: true,
    });

    // Nov 2 (offset +9) skips; Nov 3 (offset +10) runs at 07:00 UTC (02:00 EST)
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-02T07:00:00Z',
      }).shouldRun
    ).toBe(false);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-03T07:00:00Z',
      }).shouldRun
    ).toBe(true);
  });

  test('preserves exact 2-day cadence across 28-day, 29-day, and 30-day month boundaries', () => {
    // 30-day November boundary: 2026-11-29 (offset +36, even) -> 2026-11-30 (offset +37, odd) -> 2026-12-01 (offset +38, even)
    expect(calendarDaysBetween(ANCHOR_EASTERN_DATE, '2026-11-29')).toBe(36);
    expect(calendarDaysBetween(ANCHOR_EASTERN_DATE, '2026-11-30')).toBe(37);
    expect(calendarDaysBetween(ANCHOR_EASTERN_DATE, '2026-12-01')).toBe(38);

    // 28-day February 2027 boundary: 2027-02-27 (offset +126, even) -> 2027-02-28 (offset +127, odd) -> 2027-03-01 (offset +128, even)
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2027-02-27T07:00:00Z',
      }).shouldRun
    ).toBe(true);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2027-02-28T07:00:00Z',
      }).shouldRun
    ).toBe(false);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2027-03-01T07:00:00Z',
      }).shouldRun
    ).toBe(true);

    // 29-day leap February 2028 boundary
    expect(calendarDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2028-02-28T07:00:00Z',
        anchorEasternDate: '2028-02-28',
      }).shouldRun
    ).toBe(true);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2028-02-29T07:00:00Z',
        anchorEasternDate: '2028-02-28',
      }).shouldRun
    ).toBe(false);
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2028-03-01T07:00:00Z',
        anchorEasternDate: '2028-02-28',
      }).shouldRun
    ).toBe(true);
  });

  test('handles spring-forward DST transition Sunday when 02:00 local is skipped', () => {
    // On 2027-03-14, 06:00 UTC is 01:00 EST and 07:00 UTC jumps directly to 03:00 EDT.
    expect(isTargetEasternHour('2027-03-14T06:00:00Z')).toMatchObject({
      matchesHour: false,
      dstSpringForwardFallback: false,
    });
    expect(isTargetEasternHour('2027-03-14T07:00:00Z')).toMatchObject({
      matchesHour: true,
      dstSpringForwardFallback: true,
    });

    // When 2027-03-14 is an even day relative to anchor, 07:00 UTC (03:00 EDT fallback) runs:
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2027-03-14T07:00:00Z',
        anchorEasternDate: '2027-03-12',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2027-03-14',
      easternHour: 3,
      daysSinceAnchor: 2,
      dstSpringForwardFallback: true,
    });
  });

  test('always allows workflow_dispatch regardless of hour or day offset', () => {
    expect(
      evaluateSyncScheduleGate({
        eventName: 'workflow_dispatch',
        now: '2026-10-25T18:42:00Z',
      })
    ).toMatchObject({
      shouldRun: true,
      eventName: 'workflow_dispatch',
      easternDate: '2026-10-25',
      isAlternatingDay: false,
      matchesHour: false,
    });
  });

  test('wires schedule gate and 06:00/07:00 UTC cron in .github/workflows/sync-events.yml', () => {
    const workflowPath = path.resolve(__dirname, '../../../.github/workflows/sync-events.yml');
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('cron: "0 6 * * *"');
    expect(workflow).toContain('cron: "0 7 * * *"');
    expect(workflow).not.toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('node scripts/pipeline/sync-schedule-gate.js --github-output "$GITHUB_OUTPUT"');
    expect(workflow).toContain("if: steps.schedule_gate.outputs.should_run == 'true'");
  });

  test('derives scheduled slot so delayed self-hosted runner triggers do not miss or duplicate runs (Codex review finding)', () => {
    // During EDT (2026-10-26, offset +2):
    // 06:00 UTC schedule (2:00 a.m. EDT) delayed by 5.5 hours to 11:30 UTC still runs:
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-10-26T11:30:00Z',
        scheduledCron: '0 6 * * *',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2026-10-26',
      easternHour: 2,
      daysSinceAnchor: 2,
      isAlternatingDay: true,
      matchesHour: true,
    });

    // During EST (2026-11-04, offset +11 even day from 2026-10-24? 11 is odd -> Nov 03 is offset 10):
    // 2026-11-03:
    // 06:00 UTC schedule during EST corresponds to 01:00 EST. Even if delayed to 02:15 EST (07:15 UTC), it is skipped:
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-03T07:15:00Z',
        scheduledCron: '0 6 * * *',
      })
    ).toMatchObject({
      shouldRun: false,
      easternDate: '2026-11-03',
      easternHour: 1,
      matchesHour: false,
    });

    // 07:00 UTC schedule during EST corresponds to 02:00 EST. Even if delayed to 10:00 UTC, it runs:
    expect(
      evaluateSyncScheduleGate({
        eventName: 'schedule',
        now: '2026-11-03T10:00:00Z',
        scheduledCron: '0 7 * * *',
      })
    ).toMatchObject({
      shouldRun: true,
      easternDate: '2026-11-03',
      easternHour: 2,
      daysSinceAnchor: 10,
      isAlternatingDay: true,
      matchesHour: true,
    });
  });

  test('records root cause and disposition for every failing and skipped source (#374)', () => {
    const dispositionPath = path.resolve(
      __dirname,
      '../../../docs/sources/2026-10-26-sync-disposition.json'
    );
    const ledger = JSON.parse(fs.readFileSync(dispositionPath, 'utf8'));
    expect(ledger.totals).toEqual({
      totalSources: 629,
      syncedSources: 233,
      failedSources: 335,
      skippedSources: 61,
    });
    expect(ledger.failedSources).toHaveLength(335);
    expect(ledger.skippedSources).toHaveLength(61);
    for (const item of ledger.failedSources) {
      expect(typeof item.sourceName).toBe('string');
      expect(typeof item.rootCauseCategory).toBe('string');
      expect(typeof item.disposition).toBe('string');
      expect(item.disposition.length).toBeGreaterThan(0);
    }
    for (const item of ledger.skippedSources) {
      expect(typeof item.sourceName).toBe('string');
      expect(item.disposition).toBe('intentionally_paused_pending_verification');
    }
  });
});
