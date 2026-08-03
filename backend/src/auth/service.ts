import { randomBytes } from 'node:crypto';
import type { Role, SessionUser } from '@vig/shared';
import { prisma } from '../prisma.js';
import { supabaseAdmin, supabaseAnon, usernameToEmail } from '../lib/supabase.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { signAvatar } from '../lib/storage.js';

/**
 * Temporary passwords are shown to the admin exactly once, in the response body.
 * They are never stored in plaintext, never logged and never re-retrievable
 * (AD-09) — the admin passes them to the user out of band.
 */
function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(9);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `Vig-${body}`;
}

/**
 * Usernames are issued by the school with meaningful case (P26NagVen), so the
 * stored value keeps it and every comparison ignores it. A case-insensitive
 * unique index on users(lower(username)) backs this up in the database
 * (016_names_and_contacts.sql).
 */
function byUsername(username: string) {
  return { username: { equals: username, mode: 'insensitive' as const } };
}

export async function toSessionUser(userId: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      mustChangePassword: true,
      language: true,
      avatarPath: true,
      teacher: { select: { id: true } },
      parent: { select: { id: true } },
    },
  });
  if (!user) throw notFound('User');

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
    language: user.language,
    avatarUrl: await signAvatar(user.avatarPath),
    teacherId: user.teacher?.id ?? null,
    parentId: user.parent?.id ?? null,
  };
}

/**
 * Server-mediated username login (AD-02).
 *
 * The failure message is identical whether the username is unknown or the
 * password is wrong, so the endpoint cannot be used to enumerate accounts.
 */
export async function login(username: string, password: string) {
  const genericFailure = unauthorized('Username or password is incorrect.');

  const user = await prisma.user.findFirst({
    where: byUsername(username),
    select: { id: true, emailAlias: true, status: true },
  });
  if (!user) throw genericFailure;
  if (user.status !== 'ACTIVE') throw genericFailure;

  const { data, error } = await supabaseAnon().auth.signInWithPassword({
    email: user.emailAlias,
    password,
  });
  if (error || !data.session) throw genericFailure;

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token ?? null,
    user: await toSessionUser(user.id),
  };
}

export async function refresh(refreshToken: string) {
  const { data, error } = await supabaseAnon().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) throw unauthorized('Your session has expired.');

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token ?? null,
    user: await toSessionUser(data.user.id),
  };
}

/** Replaces the caller's password and clears the forced-change gate. */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new AppError(502, 'AUTH_ERROR', `Could not update the password: ${error.message}`);

  await prisma.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  await audit({ actorId: userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId });
}

interface CreateUserArgs {
  username: string;
  fullName: string;
  role: Role;
  actorId: string | null;
}

/**
 * Creates a Supabase Auth user and the matching local row in one logical step.
 * The local `users.id` is the Supabase uid, which is what lets us verify a token
 * against Supabase and still read role and status from our own database.
 */
export async function createUser({ username, fullName, role, actorId }: CreateUserArgs) {
  const existing = await prisma.user.findFirst({ where: byUsername(username) });
  if (existing) throw conflict('That username is already taken.');

  const emailAlias = usernameToEmail(username);
  const tempPassword = generateTempPassword();

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email: emailAlias,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { username, full_name: fullName },
  });
  if (error || !data.user) {
    throw new AppError(502, 'AUTH_ERROR', `Could not create the account: ${error?.message ?? 'unknown'}`);
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: data.user!.id,
          username,
          emailAlias,
          role,
          fullName,
          mustChangePassword: true,
        },
      });
      if (role === 'TEACHER') await tx.teacher.create({ data: { userId: created.id } });
      if (role === 'PARENT') await tx.parent.create({ data: { userId: created.id } });
      return created;
    });

    await audit({
      actorId,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      after: { username, role },
    });

    return { user, tempPassword };
  } catch (err) {
    // Keep Supabase Auth and our users table from drifting apart.
    await supabaseAdmin().auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw err;
  }
}

/**
 * Forgot password is an operational issue, not an auth channel (D2/AD-09).
 * The response is identical whether or not the username exists; on a real match
 * every active admin gets a notification and the request surfaces in Needs Attention.
 */
export async function requestPasswordReset(username: string): Promise<void> {
  const user = await prisma.user.findFirst({
    where: byUsername(username),
    select: { id: true, username: true, fullName: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return;

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE' },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((a) => ({
      recipientUserId: a.id,
      type: 'PASSWORD_RESET_REQUEST' as const,
      title: 'Password reset requested',
      body: `${user.fullName} (${user.username}) cannot access their account.`,
      payload: { userId: user.id, username: user.username },
    })),
  });
}

/** Admin-mediated reset. Returns the temporary password once, to the admin only. */
export async function resetPassword(targetUserId: string, actorId: string) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, fullName: true },
  });
  if (!target) throw notFound('User');

  const tempPassword = generateTempPassword();
  const { error } = await supabaseAdmin().auth.admin.updateUserById(targetUserId, {
    password: tempPassword,
  });
  if (error) throw new AppError(502, 'AUTH_ERROR', `Could not reset the password: ${error.message}`);

  await prisma.user.update({ where: { id: targetUserId }, data: { mustChangePassword: true } });

  // Clear any outstanding reset requests for this user so the issue disappears.
  await prisma.notification.deleteMany({
    where: { type: 'PASSWORD_RESET_REQUEST', payload: { path: ['userId'], equals: targetUserId } },
  });

  await audit({ actorId, action: 'PASSWORD_RESET', entity: 'User', entityId: targetUserId });

  return { username: target.username, fullName: target.fullName, tempPassword };
}

/**
 * Changes the sign-in name. The username is the account: it keys the Supabase
 * Auth email alias (AD-02), so both sides move together or neither does.
 */
export async function renameUser(targetUserId: string, username: string, actorId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { username: true, fullName: true },
  });
  if (!user) throw notFound('User');
  if (user.username === username) return;

  // Case-insensitive, so a rename that only changes capitalisation is allowed
  // through while a genuine clash with someone else is still refused.
  const taken = await prisma.user.findFirst({
    where: { ...byUsername(username), NOT: { id: targetUserId } },
    select: { id: true },
  });
  if (taken) throw conflict('That username is already taken.');

  const emailAlias = usernameToEmail(username);
  const { error } = await supabaseAdmin().auth.admin.updateUserById(targetUserId, {
    email: emailAlias,
    email_confirm: true,
    user_metadata: { username, full_name: user.fullName },
  });
  if (error) {
    throw new AppError(502, 'AUTH_ERROR', `Could not update the sign-in name: ${error.message}`);
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { username, emailAlias },
  });

  await audit({
    actorId,
    action: 'USER_RENAMED',
    entity: 'User',
    entityId: targetUserId,
    before: { username: user.username },
    after: { username },
  });
}

/** Long enough to be permanent; GoTrue has no "forever". */
const BAN_INDEFINITELY = '876000h';

/**
 * Takes the credentials away rather than merely flagging the row.
 *
 * The status check in requireAuth already refuses a deactivated user, but a
 * password that still works is a credential still in circulation. Replacing it
 * with an unguessable value and banning the auth user closes both the password
 * and any live session.
 */
async function revokeCredentials(targetUserId: string): Promise<void> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(targetUserId, {
    password: randomBytes(24).toString('base64url'),
    ban_duration: BAN_INDEFINITELY,
  });
  if (error) {
    throw new AppError(502, 'AUTH_ERROR', `Could not remove the sign-in credentials: ${error.message}`);
  }
  await prisma.user.update({ where: { id: targetUserId }, data: { mustChangePassword: true } });
}

/** The mirror image: a reactivated account needs credentials issued afresh. */
async function restoreCredentials(targetUserId: string): Promise<string> {
  const tempPassword = generateTempPassword();
  const { error } = await supabaseAdmin().auth.admin.updateUserById(targetUserId, {
    password: tempPassword,
    ban_duration: 'none',
  });
  if (error) {
    throw new AppError(502, 'AUTH_ERROR', `Could not restore the sign-in account: ${error.message}`);
  }
  await prisma.user.update({ where: { id: targetUserId }, data: { mustChangePassword: true } });
  return tempPassword;
}

/**
 * Deactivating removes access; it never removes work. Everything the person
 * authored — class records, learning updates, observations — is history of a
 * child's progress and stays exactly where it is (BR-09).
 *
 * Returns fresh credentials when an account is switched back on, because
 * deactivation destroyed the old ones. They are shown once, to the admin.
 */
export async function setUserStatus(
  targetUserId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
  actorId: string,
): Promise<{
  user: { id: string; username: string; status: string };
  credentials: { username: string; tempPassword: string } | null;
}> {
  if (targetUserId === actorId) throw badRequest('You cannot change your own account status.');

  const existing = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { username: true, status: true },
  });
  if (!existing) throw notFound('User');

  // Credentials move first, so a failure here leaves the account no more
  // reachable than it was. Both branches are safe to retry.
  let credentials: { username: string; tempPassword: string } | null = null;
  if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
    credentials = { username: existing.username, tempPassword: await restoreCredentials(targetUserId) };
  } else if (status !== 'ACTIVE' && existing.status === 'ACTIVE') {
    await revokeCredentials(targetUserId);
  }

  const user = await prisma.user.update({ where: { id: targetUserId }, data: { status } });

  // A deactivated account cannot act on a reset request, so the outstanding
  // issue goes with it.
  if (status !== 'ACTIVE') {
    await prisma.notification.deleteMany({
      where: { type: 'PASSWORD_RESET_REQUEST', payload: { path: ['userId'], equals: targetUserId } },
    });
  }

  await audit({
    actorId,
    action: 'USER_STATUS_CHANGED',
    entity: 'User',
    entityId: targetUserId,
    before: { status: existing.status },
    after: { status },
  });

  return { user, credentials };
}
