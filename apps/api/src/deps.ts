import type { Logger } from 'pino';
import { createEmbeddingProvider, createLlmProvider } from './adapters/ai/index.js';
import type { EmbeddingProvider, LlmProvider } from './adapters/ai/index.js';
import { createAuthAdapter, createTokenService } from './adapters/auth/index.js';
import type { AuthAdapter, TokenService } from './adapters/auth/index.js';
import { createStorageAdapter } from './adapters/storage/index.js';
import type { StorageAdapter } from './adapters/storage/index.js';
import { createVirusScanner } from './adapters/virusscan/index.js';
import type { VirusScanner } from './adapters/virusscan/index.js';
import type { AppConfig } from './config.js';
import { createDb } from './db/index.js';
import type { Db } from './db/types.js';
import { createLogger } from './logger.js';

/** Everything the services + routes need. Swappable for deterministic tests. */
export interface Deps {
  config: AppConfig;
  log: Logger;
  db: Db;
  auth: AuthAdapter;
  tokens: TokenService;
  storage: StorageAdapter;
  scanner: VirusScanner;
  llm: LlmProvider;
  embeddings: EmbeddingProvider;
}

export async function buildDeps(config: AppConfig, overrides: Partial<Deps> = {}): Promise<Deps> {
  const log = overrides.log ?? createLogger(config);
  const db = overrides.db ?? (await createDb(config));
  return {
    config,
    log,
    db,
    auth: overrides.auth ?? createAuthAdapter(config, db),
    tokens: overrides.tokens ?? createTokenService(config),
    storage: overrides.storage ?? createStorageAdapter(config),
    scanner: overrides.scanner ?? createVirusScanner(config),
    llm: overrides.llm ?? createLlmProvider(config),
    embeddings: overrides.embeddings ?? createEmbeddingProvider(config),
  };
}
