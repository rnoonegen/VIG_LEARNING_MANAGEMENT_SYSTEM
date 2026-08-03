/**
 * School-issued account names.
 *
 * VIG hands out the username; nobody chooses their own. The shape encodes who
 * the account belongs to and the year it was issued, so a name read off a slip
 * of paper is unambiguous:
 *
 *   P26NagVen   parent,  2026, Nagaraju Vengaldasu
 *   S26AarSha   student, 2026, Aarav Sharma
 *   T26PriSha   teacher, 2026, Priya Sharma
 *
 * Both sides of the wire derive it from the same function: the form shows the
 * admin what the account will be called before they commit, and the API
 * generates the real one — the API's answer wins, because only it can see
 * collisions.
 */

export type AccountPrefix = 'P' | 'S' | 'T';

/** Three characters, initial capital: "nagaraju" → "Nag". */
function namePart(value: string): string {
  const letters = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
  if (!letters) return '';
  return letters[0]!.toUpperCase() + letters.slice(1).toLowerCase();
}

/**
 * The role letter, the two-digit year, then three characters of each name.
 *
 * Returns an empty string when there is nothing to build from, so a
 * half-completed form shows no username rather than a misleading stub.
 */
export function accountUsername(
  prefix: AccountPrefix,
  firstName: string,
  lastName: string,
  issuedOn: Date = new Date(),
): string {
  const first = namePart(firstName);
  const last = namePart(lastName);
  if (!first && !last) return '';

  const year = String(issuedOn.getFullYear()).slice(-2);
  return `${prefix}${year}${first}${last}`;
}

/** The single spelling of a person's name, from the two fields we collect. */
export function joinName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

/**
 * Splits a stored full name back into two fields, for editing records created
 * before first and last names were collected separately.
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

/** How a parent relates to the child, offered as a fixed list (BR-13). */
export const PARENT_RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Other'] as const;
export type ParentRelationship = (typeof PARENT_RELATIONSHIPS)[number];
