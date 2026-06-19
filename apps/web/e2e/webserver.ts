import { fileURLToPath } from 'node:url';
import type { PlaywrightTestConfig } from '@playwright/test';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  ARS_RUNTIME: 'local',
  API_PORT: '4000',
  API_HOST: '127.0.0.1',
  AI_PROVIDER: 'mock',
  EMBEDDING_PROVIDER: 'mock',
  VIRUS_SCANNER: 'mock',
  LOCAL_JWT_SECRET: 'e2e-secret-key',
  WEB_ORIGIN: 'http://localhost:5173',
};

/** Fresh API (in-memory PGlite, all migrations) + web dev server. Free ports before running. */
export const webServer: PlaywrightTestConfig['webServer'] = [
  {
    command: 'npm run serve -w @ars/api',
    cwd: root,
    port: 4000,
    reuseExistingServer: false,
    timeout: 90_000,
    env: apiEnv,
  },
  {
    command: 'npm run dev -w @ars/web',
    cwd: root,
    port: 5173,
    reuseExistingServer: false,
    timeout: 90_000,
  },
];
