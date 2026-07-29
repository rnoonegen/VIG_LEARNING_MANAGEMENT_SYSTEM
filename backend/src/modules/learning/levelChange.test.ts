import { describe, expect, it } from 'vitest';
import type { SkillStatus } from '@vig/shared';
import { summariseLevelProgress } from './service.js';

/**
 * BR-08 — level change preserves history, and unfinished skills may be carried
 * forward. Before anything moves, the school is shown exactly what is finished
 * and what is not (F4).
 *
 * The spec's worked example: "Aarav finishes Level 6 with most skills mastered
 * but still needs support with one ratio skill. The school moves him to Level 7
 * and carries that skill forward for review."
 */

const SKILLS = [
  { id: 'compare', name: 'Comparing fractions' },
  { id: 'add', name: 'Adding unlike fractions' },
  { id: 'word', name: 'Fraction word problems' },
  { id: 'ratio', name: 'Ratio & proportion' },
];

function statuses(entries: Record<string, SkillStatus>): Map<string, SkillStatus> {
  return new Map(Object.entries(entries));
}

describe('summariseLevelProgress', () => {
  it('reproduces the spec’s Level 6 example', () => {
    const { counts, unfinishedSkills } = summariseLevelProgress(
      SKILLS,
      statuses({
        compare: 'MASTERED',
        add: 'MASTERED',
        word: 'MASTERED',
        ratio: 'NEEDS_SUPPORT',
      }),
    );

    expect(counts.MASTERED).toBe(3);
    expect(counts.NEEDS_SUPPORT).toBe(1);
    // Exactly one skill is offered for carry-forward.
    expect(unfinishedSkills).toEqual([
      { id: 'ratio', name: 'Ratio & proportion', status: 'NEEDS_SUPPORT' },
    ]);
  });

  it('treats a skill with no progress row as To Learn, not as finished', () => {
    // The dangerous bug: an untouched level looking complete.
    const { counts, unfinishedSkills } = summariseLevelProgress(SKILLS, statuses({}));

    expect(counts.TO_LEARN).toBe(4);
    expect(counts.MASTERED).toBe(0);
    expect(unfinishedSkills).toHaveLength(4);
  });

  it('counts every status bucket', () => {
    const { counts } = summariseLevelProgress(
      SKILLS,
      statuses({
        compare: 'MASTERED',
        add: 'LEARNING',
        word: 'NEEDS_SUPPORT',
        ratio: 'TO_LEARN',
      }),
    );

    expect(counts).toEqual({ TO_LEARN: 1, LEARNING: 1, NEEDS_SUPPORT: 1, MASTERED: 1 });
  });

  it('returns nothing to carry forward when the level is fully mastered', () => {
    const { unfinishedSkills } = summariseLevelProgress(
      SKILLS,
      statuses({
        compare: 'MASTERED',
        add: 'MASTERED',
        word: 'MASTERED',
        ratio: 'MASTERED',
      }),
    );
    expect(unfinishedSkills).toEqual([]);
  });

  it('treats Learning and Needs Support alike as unfinished', () => {
    const { unfinishedSkills } = summariseLevelProgress(
      SKILLS,
      statuses({ compare: 'LEARNING', add: 'NEEDS_SUPPORT', word: 'MASTERED', ratio: 'MASTERED' }),
    );
    expect(unfinishedSkills.map((s) => s.id).sort()).toEqual(['add', 'compare']);
  });

  it('ignores progress rows for skills outside this level', () => {
    // A stale row from another level must not inflate the counts.
    const { counts } = summariseLevelProgress(
      [{ id: 'compare', name: 'Comparing fractions' }],
      statuses({ compare: 'MASTERED', 'some-other-level-skill': 'MASTERED' }),
    );
    expect(counts.MASTERED).toBe(1);
  });

  it('handles an empty level without throwing', () => {
    const { counts, unfinishedSkills } = summariseLevelProgress([], statuses({}));
    expect(unfinishedSkills).toEqual([]);
    expect(counts).toEqual({ TO_LEARN: 0, LEARNING: 0, NEEDS_SUPPORT: 0, MASTERED: 0 });
  });

  it('preserves the order the curriculum defines', () => {
    const { unfinishedSkills } = summariseLevelProgress(SKILLS, statuses({ add: 'MASTERED' }));
    expect(unfinishedSkills.map((s) => s.id)).toEqual(['compare', 'word', 'ratio']);
  });
});
