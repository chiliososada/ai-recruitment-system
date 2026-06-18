import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { conflict, unauthorized } from '../../errors.js';
import type { Db } from '../../db/types.js';
import type { AuthAdapter, AuthIdentity, RegisterResult } from './types.js';

interface IdentityRow {
  user_id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
}

/**
 * Local auth adapter: bcrypt password hashing + the `auth.local_identities` credential
 * table. Deterministic and fully testable with no external service (D-011). Access tokens
 * are issued separately by `TokenService`.
 */
export class LocalAuthAdapter implements AuthAdapter {
  constructor(private readonly db: Db) {}

  async register(email: string, password: string): Promise<RegisterResult> {
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(24).toString('hex');
    try {
      const row = await this.db.service((c) =>
        c.query<IdentityRow>(
          `insert into auth.local_identities (email, password_hash, verification_token)
           values ($1, $2, $3)
           returning user_id, email, password_hash, email_verified`,
          [email, passwordHash, verificationToken],
        ),
      );
      const id = row.rows[0]!;
      return {
        userId: id.user_id,
        email: id.email,
        emailVerified: id.email_verified,
        devVerificationToken: verificationToken,
      };
    } catch (err) {
      if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
        throw conflict('Email already registered', 'auth.email.taken');
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<AuthIdentity> {
    const row = await this.db.service((c) =>
      c.query<IdentityRow>(
        `select user_id, email, password_hash, email_verified from auth.local_identities where email = $1`,
        [email],
      ),
    );
    const identity = row.rows[0];
    if (!identity) throw unauthorized('Invalid credentials', 'auth.invalidCredentials');
    const ok = await bcrypt.compare(password, identity.password_hash);
    if (!ok) throw unauthorized('Invalid credentials', 'auth.invalidCredentials');
    return {
      userId: identity.user_id,
      email: identity.email,
      emailVerified: identity.email_verified,
    };
  }

  async verifyEmail(token: string): Promise<AuthIdentity> {
    const row = await this.db.service((c) =>
      c.query<IdentityRow>(
        `update auth.local_identities set email_verified = true, verification_token = null
         where verification_token = $1
         returning user_id, email, password_hash, email_verified`,
        [token],
      ),
    );
    const identity = row.rows[0];
    if (!identity) throw unauthorized('Invalid or used verification token', 'auth.verify.invalid');
    return { userId: identity.user_id, email: identity.email, emailVerified: true };
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    await this.db.service((c) =>
      c.query(`update auth.local_identities set password_hash = $1 where user_id = $2`, [
        passwordHash,
        userId,
      ]),
    );
  }
}
