import type { UserRole } from '@ars/shared';

export interface AuthIdentity {
  userId: string;
  email: string;
  emailVerified: boolean;
}

export interface RegisterResult extends AuthIdentity {
  /** Returned ONLY in local runtime so the email-verification flow is testable (D-011). */
  devVerificationToken?: string;
}

export interface IssuedToken {
  token: string;
  expiresAt: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

/**
 * Pluggable credential provider (FR-01.2, NFR-AI). The local adapter (bcrypt + a local
 * credential table) and the Supabase/GoTrue adapter share this interface. Access-token
 * issuance/verification is handled separately by `TokenService` so the API sets
 * `request.jwt.claims` identically in every runtime (see D-005/D-011).
 */
export interface AuthAdapter {
  register(email: string, password: string): Promise<RegisterResult>;
  /** Verify credentials; resolves to the identity or throws UNAUTHORIZED. */
  login(email: string, password: string): Promise<AuthIdentity>;
  verifyEmail(token: string): Promise<AuthIdentity>;
  updatePassword(userId: string, password: string): Promise<void>;
}
