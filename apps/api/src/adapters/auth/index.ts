import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/types.js';
import { LocalAuthAdapter } from './local.js';
import { SupabaseAuthAdapter } from './supabase.js';
import { TokenService } from './token.js';
import type { AuthAdapter } from './types.js';

export function createAuthAdapter(config: AppConfig, db: Db): AuthAdapter {
  if (config.ARS_RUNTIME === 'supabase') {
    return new SupabaseAuthAdapter(
      config.SUPABASE_URL ?? '',
      config.SUPABASE_ANON_KEY ?? '',
      config.SUPABASE_SERVICE_ROLE_KEY ?? '',
    );
  }
  return new LocalAuthAdapter(db);
}

export function createTokenService(config: AppConfig): TokenService {
  const secret =
    config.ARS_RUNTIME === 'supabase'
      ? config.SUPABASE_JWT_SECRET || config.LOCAL_JWT_SECRET
      : config.LOCAL_JWT_SECRET;
  return new TokenService(secret);
}

export { TokenService } from './token.js';
export type {
  AuthAdapter,
  AuthIdentity,
  RegisterResult,
  TokenPayload,
  IssuedToken,
} from './types.js';
