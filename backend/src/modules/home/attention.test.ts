import { describe, expect, it } from 'vitest';
import type { AttentionIssueDto } from '@vig/shared';
import { finaliseIssues, pushIssue } from './attention.js';

/**
 * BR-16 — one root cause is one issue, with drill-down to the affected classes.
 *
 * The worked example from the spec: "Priya marks herself unavailable Friday
 * morning, but she already has three classes. Admin Home says 'Priya is
 * unavailable — 3 classes affected' rather than displaying three unrelated
 * warnings."
 */

function teacherUnavailable(teacherId: string, dateKey: string): AttentionIssueDto {
  return {
    groupKey: `TEACHER_UNAVAILABLE:${teacherId}:${dateKey}`,
    type: 'TEACHER_UNAVAILABLE',
    title: 'Priya Sharma is unavailable',
    detail: '24 Jul 2026',
    severity: 'danger',
    actionLabel: 'Resolve',
    actionHref: '/admin/schedule/reschedule?occurrences=',
    affected: [],
  };
}

function affected(id: string, label = 'Mathematics') {
  return { id, label, sublabel: '24 Jul 2026 · 9:00 AM', href: `/admin/schedule?date=2026-07-24` };
}

describe('pushIssue — grouping by root cause', () => {
  it('collapses three classes broken by one absence into one issue', () => {
    const issues = new Map<string, AttentionIssueDto>();
    const cause = teacherUnavailable('priya', '2026-07-24');

    pushIssue(issues, cause, affected('occ-1'));
    pushIssue(issues, cause, affected('occ-2', 'English'));
    pushIssue(issues, cause, affected('occ-3', 'Science'));

    expect(issues.size).toBe(1);
    expect([...issues.values()][0]!.affected).toHaveLength(3);
  });

  it('keeps different root causes separate', () => {
    const issues = new Map<string, AttentionIssueDto>();

    // Same teacher, different date — a different root cause.
    pushIssue(issues, teacherUnavailable('priya', '2026-07-24'), affected('occ-1'));
    pushIssue(issues, teacherUnavailable('priya', '2026-07-31'), affected('occ-2'));
    // Different teacher entirely.
    pushIssue(issues, teacherUnavailable('meera', '2026-07-24'), affected('occ-3'));

    expect(issues.size).toBe(3);
  });

  it('does not mutate the issue template it was handed', () => {
    const issues = new Map<string, AttentionIssueDto>();
    const cause = teacherUnavailable('priya', '2026-07-24');

    pushIssue(issues, cause, affected('occ-1'));
    pushIssue(issues, cause, affected('occ-2'));

    // The caller reuses one literal per loop iteration; if push wrote through to
    // it, every issue would accumulate every other issue's affected records.
    expect(cause.affected).toHaveLength(0);
  });
});

describe('finaliseIssues', () => {
  it('counts the affected classes into the detail line', () => {
    const issues = new Map<string, AttentionIssueDto>();
    const cause = teacherUnavailable('priya', '2026-07-24');

    pushIssue(issues, cause, affected('occ-1'));
    pushIssue(issues, cause, affected('occ-2'));
    pushIssue(issues, cause, affected('occ-3'));

    const [issue] = finaliseIssues(issues);
    expect(issue!.detail).toContain('3 classes affected');
  });

  it('uses the singular for a single affected class', () => {
    const issues = new Map<string, AttentionIssueDto>();
    pushIssue(issues, teacherUnavailable('priya', '2026-07-24'), affected('occ-1'));

    const [issue] = finaliseIssues(issues);
    expect(issue!.detail).toContain('1 class affected');
    expect(issue!.detail).not.toContain('classes');
  });

  it('builds a reschedule link carrying every affected occurrence', () => {
    const issues = new Map<string, AttentionIssueDto>();
    const cause = teacherUnavailable('priya', '2026-07-24');

    pushIssue(issues, cause, affected('occ-1'));
    pushIssue(issues, cause, affected('occ-2'));

    const [issue] = finaliseIssues(issues);
    expect(issue!.actionHref).toBe('/admin/schedule/reschedule?occurrences=occ-1,occ-2');
  });

  it('orders danger before warning before info', () => {
    const issues = new Map<string, AttentionIssueDto>();
    const make = (groupKey: string, severity: AttentionIssueDto['severity']): AttentionIssueDto => ({
      groupKey,
      type: 'INCOMPLETE_STUDENT_SETUP',
      title: groupKey,
      detail: '',
      severity,
      actionLabel: 'Review',
      actionHref: '#',
      affected: [],
    });

    pushIssue(issues, make('c-info', 'info'), affected('a'));
    pushIssue(issues, make('a-danger', 'danger'), affected('b'));
    pushIssue(issues, make('b-warning', 'warning'), affected('c'));

    expect(finaliseIssues(issues).map((i) => i.severity)).toEqual(['danger', 'warning', 'info']);
  });

  it('leaves non-teacher issues’ action links untouched', () => {
    const issues = new Map<string, AttentionIssueDto>();
    pushIssue(
      issues,
      {
        groupKey: 'INCOMPLETE_STUDENT_SETUP:s1',
        type: 'INCOMPLETE_STUDENT_SETUP',
        title: 'Setup incomplete',
        detail: 'Still needed: subject levels.',
        severity: 'info',
        actionLabel: 'Review student',
        actionHref: '/admin/students/s1',
        affected: [],
      },
      affected('s1'),
    );

    const [issue] = finaliseIssues(issues);
    expect(issue!.actionHref).toBe('/admin/students/s1');
    expect(issue!.detail).toBe('Still needed: subject levels.');
  });
});
