import {
  DEFAULT_LOCALE,
  type AuthUser,
  type Locale,
  type LoginInput,
  type RegisterInput,
  type Session,
  type UpdateAccountInput,
  type UserRole,
} from '@ars/shared';
import type { Deps } from '../deps.js';
import { notFound, unauthorized } from '../errors.js';
import type { Principal } from '../http/context.js';
import { toIso } from '../util.js';

interface ProfileRow {
  id: string;
  role: UserRole;
  display_name: string;
  locale: Locale;
  created_at: unknown;
}

function toAuthUser(row: ProfileRow, email: string, emailVerified: boolean): AuthUser {
  return {
    id: row.id,
    email,
    role: row.role,
    displayName: row.display_name,
    locale: row.locale,
    emailVerified,
    createdAt: toIso(row.created_at),
  };
}

async function loadProfile(deps: Deps, userId: string): Promise<ProfileRow> {
  const res = await deps.db.service((c) =>
    c.query<ProfileRow>(
      `select id, role, display_name, locale, created_at from profiles where id = $1`,
      [userId],
    ),
  );
  const row = res.rows[0];
  if (!row) throw notFound('Profile not found', 'error.notFound');
  return row;
}

export async function register(deps: Deps, input: RegisterInput): Promise<Session> {
  const identity = await deps.auth.register(input.email, input.password);
  const locale = input.locale ?? DEFAULT_LOCALE;

  const profile = await deps.db.service(async (c) => {
    const res = await c.query<ProfileRow>(
      `insert into profiles (id, role, display_name, locale)
       values ($1, $2, $3, $4)
       returning id, role, display_name, locale, created_at`,
      [identity.userId, input.role, input.displayName, locale],
    );
    if (input.role === 'job_seeker') {
      await c.query(`insert into candidates (user_id) values ($1) on conflict do nothing`, [
        identity.userId,
      ]);
    }
    return res.rows[0]!;
  });

  const token = deps.tokens.issue(identity, input.role);
  return {
    accessToken: token.token,
    tokenType: 'Bearer',
    expiresAt: token.expiresAt,
    user: toAuthUser(profile, identity.email, identity.emailVerified),
    ...(identity.devVerificationToken
      ? { devEmailVerificationToken: identity.devVerificationToken }
      : {}),
  };
}

export async function login(deps: Deps, input: LoginInput): Promise<Session> {
  const identity = await deps.auth.login(input.email, input.password);
  const profile = await loadProfile(deps, identity.userId);
  const token = deps.tokens.issue(identity, profile.role);
  return {
    accessToken: token.token,
    tokenType: 'Bearer',
    expiresAt: token.expiresAt,
    user: toAuthUser(profile, identity.email, identity.emailVerified),
  };
}

export async function verifyEmail(deps: Deps, token: string): Promise<Session> {
  const identity = await deps.auth.verifyEmail(token);
  const profile = await loadProfile(deps, identity.userId);
  const issued = deps.tokens.issue(identity, profile.role);
  return {
    accessToken: issued.token,
    tokenType: 'Bearer',
    expiresAt: issued.expiresAt,
    user: toAuthUser(profile, identity.email, true),
  };
}

export async function me(deps: Deps, principal: Principal): Promise<AuthUser> {
  const profile = await loadProfile(deps, principal.userId);
  return toAuthUser(profile, principal.email, principal.emailVerified);
}

export async function updateAccount(
  deps: Deps,
  principal: Principal,
  input: UpdateAccountInput,
): Promise<AuthUser> {
  if (input.password) {
    await deps.auth.updatePassword(principal.userId, input.password);
  }
  const profile = await deps.db.withContext(
    { role: 'authenticated', userId: principal.userId, email: principal.email },
    async (c) => {
      const res = await c.query<ProfileRow>(
        `update profiles
         set display_name = coalesce($2, display_name),
             locale = coalesce($3, locale)
         where id = $1
         returning id, role, display_name, locale, created_at`,
        [principal.userId, input.displayName ?? null, input.locale ?? null],
      );
      if (!res.rows[0]) throw unauthorized();
      return res.rows[0];
    },
  );
  return toAuthUser(profile, principal.email, principal.emailVerified);
}
