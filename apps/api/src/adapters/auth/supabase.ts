import { AppError, conflict, unauthorized } from '../../errors.js';
import type { AuthAdapter, AuthIdentity, RegisterResult } from './types.js';

interface GotrueUser {
  id: string;
  email: string;
  email_confirmed_at?: string | null;
}

/**
 * Supabase Auth (GoTrue) credential adapter for the `supabase` runtime. Stores credentials
 * in Supabase; the API still issues/verifies its own access tokens via TokenService.
 * Not exercised by the local test suite (no credentials) but a real implementation.
 */
export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly serviceKey: string,
  ) {}

  private async call(
    path: string,
    init: RequestInit,
    useServiceKey = false,
  ): Promise<Record<string, unknown>> {
    const key = useServiceKey ? this.serviceKey : this.anonKey;
    const res = await fetch(`${this.url}/auth/v1/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(init.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = String(json.msg ?? json.error_description ?? json.error ?? res.statusText);
      if (res.status === 422 || /registered|exists/i.test(message)) {
        throw conflict(message, 'auth.email.taken');
      }
      if (res.status === 400 || res.status === 401) {
        throw unauthorized(message, 'auth.invalidCredentials');
      }
      throw new AppError('UPSTREAM_AI_ERROR', `Supabase auth error: ${message}`);
    }
    return json;
  }

  async register(email: string, password: string): Promise<RegisterResult> {
    const json = await this.call('signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const user = (json.user as GotrueUser | undefined) ?? (json as unknown as GotrueUser);
    return { userId: user.id, email, emailVerified: Boolean(user.email_confirmed_at) };
  }

  async login(email: string, password: string): Promise<AuthIdentity> {
    const json = await this.call('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const user = json.user as GotrueUser | undefined;
    if (!user) throw unauthorized('Invalid credentials', 'auth.invalidCredentials');
    return { userId: user.id, email: user.email, emailVerified: Boolean(user.email_confirmed_at) };
  }

  async verifyEmail(token: string): Promise<AuthIdentity> {
    const json = await this.call('verify', {
      method: 'POST',
      body: JSON.stringify({ type: 'signup', token }),
    });
    const user = json.user as GotrueUser | undefined;
    if (!user) throw unauthorized('Invalid verification token', 'auth.verify.invalid');
    return { userId: user.id, email: user.email, emailVerified: true };
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    await this.call(
      `admin/users/${userId}`,
      { method: 'PUT', body: JSON.stringify({ password }) },
      true,
    );
  }
}
