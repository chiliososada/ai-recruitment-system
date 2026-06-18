import jwt from 'jsonwebtoken';
import { UserRoleSchema, type UserRole } from '@ars/shared';
import { unauthorized } from '../../errors.js';
import type { AuthIdentity, IssuedToken, TokenPayload } from './types.js';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * App-owned access tokens (HS256). Used in BOTH runtimes: the API verifies the token and
 * sets `request.jwt.claims` itself, so RLS applies uniformly whether credentials live in
 * the local table or in Supabase Auth.
 */
export class TokenService {
  constructor(private readonly secret: string) {}

  issue(identity: AuthIdentity, role: UserRole): IssuedToken {
    const token = jwt.sign(
      {
        sub: identity.userId,
        email: identity.email,
        email_verified: identity.emailVerified,
        app_role: role,
      },
      this.secret,
      { algorithm: 'HS256', expiresIn: TOKEN_TTL_SECONDS },
    );
    return { token, expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString() };
  }

  verify(token: string): TokenPayload {
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    } catch {
      throw unauthorized('Invalid or expired token', 'auth.token.invalid');
    }
    const role = UserRoleSchema.safeParse(decoded.app_role);
    if (!decoded.sub || !role.success) throw unauthorized('Malformed token', 'auth.token.invalid');
    return {
      userId: String(decoded.sub),
      email: String(decoded.email ?? ''),
      role: role.data,
      emailVerified: Boolean(decoded.email_verified),
    };
  }
}
