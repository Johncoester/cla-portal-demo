import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertSafeTarget, targetMode } from './helpers/gate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const target = assertSafeTarget();

export default defineConfig({
  testDir: './specs',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 0,
  outputDir: path.join(here, 'test-results'),
  reporter: [['list'], ['./summary-reporter.js']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target.url,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: targetMode() === 'test' ? undefined : {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1',
    cwd: '../..',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
