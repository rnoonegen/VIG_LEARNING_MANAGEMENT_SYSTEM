import type { MyProfileDto, Role, UpdateMyProfileInput } from '@vig/shared';
import { splitName } from '@vig/shared';
import { prisma } from '../../prisma.js';
import { notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { CONTACT_SELECT, contactPatch, toContactDto } from '../../lib/contact.js';
import { avatarStorage, signAvatar } from '../../lib/storage.js';

/**
 * The signed-in person's own profile.
 *
 * Everything else that edits a teacher or a parent is administrative and lives
 * behind requireRole('ADMIN'). This is the other side of that: the account
 * holder maintaining their own photo, contact details and language, with no way
 * to reach anybody else's record — the id is always taken from the session,
 * never from the request.
 *
 * What they cannot change is their name or their sign-in name. The username is
 * built from the name and issued by the school (T26PriSha), so the two move
 * together or not at all, and that is the administrator's to do.
 */

export async function getMyProfile(userId: string): Promise<MyProfileDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      language: true,
      avatarPath: true,
      teacher: { select: { firstName: true, lastName: true, ...CONTACT_SELECT } },
      parent: { select: { firstName: true, lastName: true, ...CONTACT_SELECT } },
    },
  });
  if (!user) throw notFound('User');

  const person = user.teacher ?? user.parent ?? null;
  // Names were not always collected in two fields; fall back to splitting the
  // one we have so an older account still reads correctly.
  const split = splitName(user.fullName);

  return {
    userId: user.id,
    fullName: user.fullName,
    firstName: person?.firstName ?? split.firstName,
    lastName: person?.lastName ?? split.lastName,
    username: user.username,
    role: user.role as Role,
    language: user.language,
    avatarUrl: await signAvatar(user.avatarPath),
    // An administrator is neither a teacher nor a parent, so there is no row to
    // hold their contact block. The form shows the account details only.
    contact: person ? toContactDto(person) : null,
  };
}

export async function updateMyProfile(
  userId: string,
  input: UpdateMyProfileInput,
): Promise<MyProfileDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, teacher: { select: { id: true } }, parent: { select: { id: true } } },
  });
  if (!user) throw notFound('User');

  const contact = contactPatch(input);

  await prisma.$transaction(async (tx) => {
    if (input.language !== undefined) {
      await tx.user.update({ where: { id: userId }, data: { language: input.language } });
    }
    if (user.teacher) await tx.teacher.update({ where: { id: user.teacher.id }, data: contact });
    if (user.parent) await tx.parent.update({ where: { id: user.parent.id }, data: contact });
  });

  // Contact details are personal data the school holds, so a change to them is
  // recorded like any other change to a person's record.
  await audit({ actorId: userId, action: 'PROFILE_UPDATED', entity: 'User', entityId: userId });

  return getMyProfile(userId);
}

/** A signed URL to put a new photo at. The bytes never pass through the API (AD-04). */
export function createAvatarUploadUrl(fileName: string, mimeType: string, role: Role) {
  const prefix = role === 'TEACHER' ? 'teachers' : role === 'PARENT' ? 'parents' : 'users';
  return avatarStorage.createUploadUrl(fileName, mimeType, prefix);
}

export async function setMyAvatar(userId: string, storagePath: string): Promise<MyProfileDto> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });
  if (!existing) throw notFound('User');

  await prisma.user.update({ where: { id: userId }, data: { avatarPath: storagePath } });

  // The old object is rubbish the moment the row stops pointing at it.
  if (existing.avatarPath && existing.avatarPath !== storagePath) {
    await avatarStorage.remove(existing.avatarPath).catch(() => undefined);
  }

  await audit({ actorId: userId, action: 'PROFILE_AVATAR_SET', entity: 'User', entityId: userId });
  return getMyProfile(userId);
}

export async function removeMyAvatar(userId: string): Promise<MyProfileDto> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarPath: true },
  });
  if (!existing) throw notFound('User');

  if (existing.avatarPath) {
    await prisma.user.update({ where: { id: userId }, data: { avatarPath: null } });
    await avatarStorage.remove(existing.avatarPath).catch(() => undefined);
    await audit({
      actorId: userId,
      action: 'PROFILE_AVATAR_REMOVED',
      entity: 'User',
      entityId: userId,
    });
  }
  return getMyProfile(userId);
}
