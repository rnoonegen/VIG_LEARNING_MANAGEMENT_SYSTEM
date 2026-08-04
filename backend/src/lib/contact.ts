import type { ContactDetailsDto } from '@vig/shared';

/**
 * The contact block a teacher and a parent both carry (020): how to reach them,
 * and who to ring if they cannot be reached.
 *
 * Three places write it — the admin's add form, the admin's edit form, and the
 * person's own Settings → Profile — so the "which fields were actually sent"
 * rule lives here rather than three times over.
 */

const FIELDS = ['email', 'mobileNumber', 'bloodGroup', 'address', 'emergencyContact'] as const;

type ContactField = (typeof FIELDS)[number];
type ContactInput = Partial<Record<ContactField, string | undefined>>;
type ContactRow = Partial<Record<ContactField, string | null>>;

/** For a Prisma `select`, so a query returns the whole block and nothing else. */
export const CONTACT_SELECT = {
  email: true,
  mobileNumber: true,
  bloodGroup: true,
  address: true,
  emergencyContact: true,
} as const;

/**
 * Only the fields the caller actually sent.
 *
 * An omitted field is left alone; an empty one is taken back off, which is how
 * a detail entered by mistake gets removed. Stored trimmed, because a number
 * with a trailing space is the same number.
 */
export function contactPatch(input: ContactInput): Partial<Record<ContactField, string | null>> {
  const patch: Partial<Record<ContactField, string | null>> = {};
  for (const field of FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    patch[field] = value.trim() || null;
  }
  return patch;
}

export function toContactDto(row: ContactRow): ContactDetailsDto {
  return {
    email: row.email ?? null,
    mobileNumber: row.mobileNumber ?? null,
    bloodGroup: row.bloodGroup ?? null,
    address: row.address ?? null,
    emergencyContact: row.emergencyContact ?? null,
  };
}
