import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));

const apiEnv = {
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

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run serve -w @ars/api',
      cwd: root,
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
      env: apiEnv,
    },
    {
      command: 'npm run dev -w @ars/web',
      cwd: root,
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
