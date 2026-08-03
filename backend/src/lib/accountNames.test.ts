import { describe, expect, it } from 'vitest';
import { accountUsername, joinName, splitName } from '@vig/shared';

/**
 * The account-name format is a school convention, not an implementation detail:
 * it is printed on paperwork and read out over the phone. These lock the shape.
 */
describe('accountUsername', () => {
  const in2026 = new Date('2026-08-03T00:00:00.000Z');

  it('builds the documented parent format', () => {
    expect(accountUsername('P', 'nagaraju', 'vengaldasu', in2026)).toBe('P26NagVen');
  });

  it('builds the student format from the same rule', () => {
    expect(accountUsername('S', 'Aarav', 'Sharma', in2026)).toBe('S26AarSha');
  });

  it('is unaffected by how the admin capitalised the name', () => {
    expect(accountUsername('P', 'NAGARAJU', 'VENGALDASU', in2026)).toBe(
      accountUsername('P', 'nagaraju', 'vengaldasu', in2026),
    );
  });

  it('takes the year the account is issued, not a fixed one', () => {
    expect(accountUsername('S', 'Aarav', 'Sharma', new Date('2031-01-15T00:00:00.000Z'))).toBe('S31AarSha');
  });

  it('uses what is there when a name is shorter than three characters', () => {
    expect(accountUsername('P', 'Al', 'Bo', in2026)).toBe('P26AlBo');
  });

  it('drops spaces and punctuation rather than emitting them', () => {
    expect(accountUsername('S', "O'Br", 'de Souza', in2026)).toBe('S26ObrDes');
  });

  it('returns nothing while the form is still empty', () => {
    expect(accountUsername('P', '', '', in2026)).toBe('');
  });
});

describe('name fields', () => {
  it('joins the two collected fields into the one displayed spelling', () => {
    expect(joinName('Nagaraju', 'Vengaldasu')).toBe('Nagaraju Vengaldasu');
  });

  it('does not leave a trailing space when only one field is filled', () => {
    expect(joinName('Nagaraju', '')).toBe('Nagaraju');
  });

  it('splits a legacy full name so an older record still edits', () => {
    expect(splitName('Ananya Sharma')).toEqual({ firstName: 'Ananya', lastName: 'Sharma' });
  });

  it('keeps a multi-word surname together', () => {
    expect(splitName('Maria de Souza')).toEqual({ firstName: 'Maria', lastName: 'de Souza' });
  });
});
