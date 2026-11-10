import { test as base, expect } from '@playwright/test';
import { targetMode } from './helpers/gate.js';
import { PEOPLE } from './helpers/people.js';

const IGNORE = /config\.js|favicon|Download the React DevTools/i;

export const test = base.extend({
  issues: async ({ page }, use) => {
    if (targetMode() !== 'test') {
      await page.route('**/config.js*', (route) => route.fulfill({ status: 404, body: '' }));
      await page.addInitScript(() => { window.CLA_DEV_PICKER = true; });
    }
    const issues = [];
    page.on('pageerror', (err) => issues.push(`pageerror: ${err && err.message ? err.message : err}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const where = (msg.location() && msg.location().url) || '';
      const text = msg.text();
      if (IGNORE.test(text) || IGNORE.test(where)) return;
      issues.push(where ? `${text} (${where})` : text);
    });
    await use(issues);
  },
});

export { expect };

export function freshIssues(issues) {
  return issues.filter((line) => !IGNORE.test(line));
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
    const row = page.locator('tr', { hasText: 'E2E Test File' }).first();
    await row.waitFor();
    await row.locator('a.view-btn').click();
  } else {
    await page.goto(`/#/deals/${id}`);
  }
  await page.locator('[data-op-order-no], [data-co-file], [data-co-greet], .box-title').first().waitFor();
}

export function runId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function onTest(ticket) {
  test.fail(targetMode() === 'test', ticket);
}
