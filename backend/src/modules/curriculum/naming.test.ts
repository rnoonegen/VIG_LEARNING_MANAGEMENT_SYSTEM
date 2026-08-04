import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A curriculum with "Fractions" in it three times is worse than one with none:
 * the teacher ticking a student off has to pick, and the coverage grid then
 * disagrees with itself. So a name is unique within its parent — one subject
 * name across the school, one heading per level, one sub-heading per heading —
 * and it is compared the way a person reads it, not the way Postgres sorts it.
 */

const subject = { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
const level = { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
const topic = { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
const skill = { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };

vi.mock('../../prisma.js', () => ({
  prisma: {
    subject,
    level,
    topic,
    skill,
    $transaction: (fn: (tx: unknown) => unknown) => fn({ subject, level: { createMany: vi.fn() } }),
  },
}));
vi.mock('../../lib/audit.js', () => ({ audit: vi.fn() }));

const { createSkill, createSubject, createTopic, normaliseName, updateNode } = await import(
  './service.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const delegate of [subject, level, topic, skill]) {
    delegate.findFirst.mockResolvedValue(null);
    delegate.create.mockResolvedValue({ id: 'new' });
    delegate.update.mockResolvedValue({ id: 'updated' });
  }
  level.findUnique.mockResolvedValue({ id: 'l1', subjectId: 's1' });
  topic.findUnique.mockResolvedValue({ id: 't1', levelId: 'l1' });
  skill.findUnique.mockResolvedValue({ id: 'k1', topicId: 't1' });
});

describe('normaliseName', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseName('  Adding   unlike  fractions ')).toBe('Adding unlike fractions');
  });

  it('leaves a name that is already clean alone', () => {
    expect(normaliseName('Mathematics')).toBe('Mathematics');
  });
});

describe('duplicate names are refused', () => {
  it('refuses a second subject with the same name', async () => {
    subject.findFirst.mockResolvedValue({ name: 'Mathematics', status: 'ACTIVE' });

    await expect(createSubject({ name: 'Mathematics' }, 'admin')).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
    expect(subject.create).not.toHaveBeenCalled();
  });

  it('names the subject that is in the way', async () => {
    subject.findFirst.mockResolvedValue({ name: 'Mathematics', status: 'ACTIVE' });

    await expect(createSubject({ name: 'mathematics' }, 'admin')).rejects.toThrow(/Mathematics/);
  });

  it('matches without regard to case or stray spacing', async () => {
    await createSubject({ name: '  MATHEMATICS  ' }, 'admin');

    expect(subject.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { name: { equals: 'MATHEMATICS', mode: 'insensitive' } },
    });
    expect(subject.create.mock.calls[0]?.[0]).toMatchObject({ data: { name: 'MATHEMATICS' } });
  });

  it('refuses a heading already in that level', async () => {
    topic.findFirst.mockResolvedValue({ name: 'Fractions', status: 'ACTIVE' });

    await expect(createTopic('l1', 'fractions', 'teacher')).rejects.toMatchObject({ status: 409 });
    expect(topic.create).not.toHaveBeenCalled();
  });

  it('scopes a heading to its own level, not the whole curriculum', async () => {
    await createTopic('l1', 'Fractions', 'teacher');

    expect(topic.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { levelId: 'l1' } });
  });

  it('refuses a sub-heading already under that heading', async () => {
    skill.findFirst.mockResolvedValue({ name: 'Adding unlike denominators', status: 'ACTIVE' });

    await expect(
      createSkill('t1', { name: 'adding  unlike denominators' }, 'teacher'),
    ).rejects.toMatchObject({ status: 409 });
    expect(skill.create).not.toHaveBeenCalled();
  });

  it('refuses a rename onto a sibling name', async () => {
    topic.findFirst.mockResolvedValue({ name: 'Fractions', status: 'ACTIVE' });

    await expect(updateNode('topics', 't2', { name: 'Fractions' })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('lets a node keep its own name while renaming', async () => {
    await updateNode('topics', 't1', { name: 'Fractions' });

    expect(topic.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: { not: 't1' }, levelId: 'l1' },
    });
  });
});

describe('archived rows', () => {
  it('says so when the clash is a removed subject', async () => {
    subject.findFirst.mockResolvedValue({ name: 'Telugu', status: 'ARCHIVED' });

    await expect(createSubject({ name: 'Telugu' }, 'admin')).rejects.toThrow(/removed subject/);
  });

  it('frees a removed heading name for reuse', async () => {
    await createTopic('l1', 'Fractions', 'teacher');

    // Archived siblings are filtered out of the lookup entirely.
    expect(topic.findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { status: { not: 'ARCHIVED' } },
    });
  });
});
