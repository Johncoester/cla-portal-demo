import { test as base, expect } from '@playwright/test';
import { targetMode } from './helpers/gate.js';
import { PEOPLE, SEED_FILE } from './helpers/people.js';
import { knownFailureActive } from './known-failures.js';

const IGNORE = /config\.js|favicon|Download the React DevTools/i;

// A reload can abort supabase-js getUser. The library logs TypeError: Failed to fetch from auth-js.
// The page retries the read. That console line is not a failed save.
function authFetchNoise(text) {
  return /Failed to fetch/.test(text) && /auth-js/.test(text);
}

// Chrome logs a failed network request. The page does not console.error this.
// Only the create_portal_invite 400 whose body is the pending-invite P0001 is ignored, and only after that body was read.
function pendingInviteNetwork400(text) {
  return /Failed to load resource: the server responded with a status of 400/.test(text) && /\/rpc\/create_portal_invite/.test(text);
}

const PENDING_INVITE_MESSAGE = /already a pending invite/i;

export async function allowPendingInvite400(page, issues) {
  issues.allowedInvite400 = 0;
  await page.route('**/rest/v1/rpc/create_portal_invite', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    let message = '';
    try { message = String((JSON.parse(body) || {}).message || ''); } catch (e) { message = ''; }
    if (response.status() === 400 && PENDING_INVITE_MESSAGE.test(message)) issues.allowedInvite400 += 1;
    await route.fulfill({ response, body });
  });
}

export const test = base.extend({
  issues: async ({ page }, use) => {
    if (targetMode() !== 'test') {
      await page.route('**/config.js*', (route) => route.fulfill({ status: 404, body: '' }));
      await page.addInitScript(() => { window.CLA_DEV_PICKER = true; });
    }
    const issues = [];
    page.on('pageerror', (err) => {
      const message = String(err && err.message ? err.message : err);
      const stack = String(err && err.stack || '');
      const line = `pageerror: ${message}`;
      if (authFetchNoise(`${line}\n${stack}`)) return;
      issues.push(line);
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const where = (msg.location() && msg.location().url) || '';
      const text = msg.text();
      const line = where ? `${text} (${where})` : text;
      if (IGNORE.test(text) || IGNORE.test(where) || authFetchNoise(line)) return;
      if (pendingInviteNetwork400(line) && issues.allowedInvite400 > 0) { issues.allowedInvite400 -= 1; return; }
      issues.push(line);
    });
    await use(issues);
  },
});

export { expect };

export function freshIssues(issues) {
  let pendingLeft = issues.allowedInvite400 || 0;
  return issues.filter((line) => {
    if (IGNORE.test(line) || authFetchNoise(line)) return false;
    if (pendingLeft > 0 && pendingInviteNetwork400(line)) { pendingLeft -= 1; return false; }
    return true;
  });
}

export async function signIn(page, key) {
  const person = PEOPLE[key];
  if (!person) throw new Error(`Unknown role ${key}`);
  await page.goto('/#/login');
  if (targetMode() === 'test') {
    const email = process.env[person.emailEnv] || '';
    const password = process.env[person.passwordEnv] || '';
    if (!email || !password) throw new Error(`Missing secret ${person.emailEnv} or ${person.passwordEnv}.`);
    await page.locator('#login-form input[name="email"]').fill(email);
    await page.locator('#login-form input[name="password"]').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
  } else {
    await page.locator('#who').waitFor();
    await page.locator(`#who option[value="${person.mockId}"]`).waitFor({ state: 'attached' });
    await page.locator('#who').selectOption(person.mockId);
    await page.locator('#pickform button[type="submit"]').click();
  }
  await page.waitForFunction(() => !location.hash.includes('/login'));
  return person;
}

export async function openMockFile(page, id = 'deal-1') {
  if (targetMode() === 'test') {
    await page.goto('/#/orders?s=All');
    // Place Order uses a street that also contains "E2E Test File". The seed file is MD-26-99001.
    const row = page.locator('tr', { hasText: SEED_FILE }).first();
    await row.waitFor();
    await row.locator('a.view-btn').click();
    await page.waitForURL(/#\/deals\/[^/?#]+/);
  } else {
    await page.goto(`/#/deals/${id}`);
  }
  // .box-title is the orders heading, and it is still on screen for a moment after the hash changes.
  // The file is open when its own marker is visible and the route is no longer loading.
  await page.waitForFunction(() => {
    if (document.querySelector('[data-route-loading], [data-loading-note]')) return false;
    return !!document.querySelector('[data-op-order-no], [data-co-file], [data-co-greet]');
  });
  await page.locator('[data-co-tab], [data-tc-tab], a.nav-link[href*="#/deals/"]').first().waitFor();
}

export function runId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function onTest(ticket) {
  test.fail(knownFailureActive(ticket, targetMode()), ticket);
}
