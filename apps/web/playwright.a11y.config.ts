import { defineConfig, devices } from '@playwright/test';
import { webServer } from './e2e/webserver';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'a11y.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173' },
  webServer,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
