import { z } from 'zod';

const RuntimeSchema = z.enum(['local', 'supabase']);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ARS_RUNTIME: RuntimeSchema.default('local'),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  LOCAL_JWT_SECRET: z.string().default('dev-only-insecure-secret-change-me'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),

  DATABASE_URL: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default('.storage'),

  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('resumes'),

  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
  EMBEDDING_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().default(384),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  VIRUS_SCANNER: z.enum(['mock', 'clamav']).default('mock'),
  CLAMAV_HOST: z.string().default('127.0.0.1'),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProduction: boolean;
  corsOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const isProduction = parsed.NODE_ENV === 'production';

  // FR-02.4: production must not silently skip virus scanning.
  if (isProduction && parsed.ARS_RUNTIME === 'supabase' && parsed.VIRUS_SCANNER === 'mock') {
    throw new Error(
      'Refusing to start: VIRUS_SCANNER=mock is not allowed in production. Configure a real scanner (e.g. clamav).',
    );
  }
  if (parsed.ARS_RUNTIME === 'supabase' && !parsed.DATABASE_URL) {
    throw new Error('ARS_RUNTIME=supabase requires DATABASE_URL.');
  }
  if (isProduction && parsed.LOCAL_JWT_SECRET === 'dev-only-insecure-secret-change-me') {
    if (parsed.ARS_RUNTIME === 'local') {
      throw new Error('Refusing to start production with the default LOCAL_JWT_SECRET.');
    }
  }

  return {
    ...parsed,
    isProduction,
    corsOrigins: parsed.WEB_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
