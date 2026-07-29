import type { Role } from '@vig/shared';

/** The authenticated caller, resolved from the token then re-read from our own DB. */
export interface AuthContext {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  /** Teacher row id when role is TEACHER. */
  teacherId: string | null;
  /** Parent row id when role is PARENT. */
  parentId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
