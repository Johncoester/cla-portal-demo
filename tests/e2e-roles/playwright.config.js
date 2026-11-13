import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { assertSafeTarget, targetMode } from './helpers/gate.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const target = assertSafeTarget();

export default defineConfig({
  testDir: './specs',
  // John, Nov 13: start every TEST run from clean test data (the E2E buyer's and seller's tasks back to To do).
  globalSetup: path.join(here, 'global-setup.js'),
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  // CI uses one browser. Two workers against TEST doubled the REST rate and filled the 20-connection pool.
  workers: process.env.CI ? 1 : 2,
  retries: 0,
  outputDir: path.join(here, 'test-results'),
  reporter: [['list'], ['./summary-reporter.js']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target.url,
    // Nov 13: off here. fixtures.js records the trace itself and leaves the sign-in step out, so no test password is in it.
    trace: 'off',
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
