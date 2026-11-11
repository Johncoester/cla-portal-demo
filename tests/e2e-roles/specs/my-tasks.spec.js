import { test, expect, signIn, openMockFile, freshIssues } from '../fixtures.js';
import { targetMode } from '../helpers/gate.js';

test('listing agent View Tasks focuses their section, and My Tasks is only that role', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'mock only');
  test.setTimeout(90000);
  const calls = [];
  page.on('request', (req) => { if (/supabase|\/rest\/v1\/|\/rpc\//.test(req.url())) calls.push(req.url()); });
  await signIn(page, 'listingAgent');
  await openMockFile(page);
  const before = calls.length;
  await page.locator('[data-view-tasks]').click();
  await expect(page.locator('[data-sidebox="listing-agent"][data-focused-section="listing-agent"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="listing-agent"] summary')).toBeFocused();
  await expect(page.locator('[data-sidebox="buyer"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="seller"]')).toBeVisible();
  const top = await page.locator('[data-sidebox="listing-agent"]').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(180);
  expect(calls.length).toBe(before);
  await page.locator('[data-nav-my-tasks]').click();
  await expect(page.locator('[data-file-tasks="mine"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="listing-agent"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="buyer"]')).toHaveCount(0);
  await expect(page.locator('[data-sidebox="seller"]')).toHaveCount(0);
  await page.locator('a.nav-link[href$="/tasks"]').click();
  await expect(page.locator('[data-sidebox="buyer"]')).toBeVisible();
  await expect(page.locator('[data-file-tasks="mine"]')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});

test('a buyer My Tasks shows only the buyer side', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'mock only');
  test.setTimeout(90000);
  await signIn(page, 'buyer');
  await openMockFile(page);
  await page.locator('[data-co-tab="My Tasks"]').click();
  await expect(page.locator('[data-file-tasks="mine"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="buyer"]')).toBeVisible();
  await expect(page.locator('[data-sidebox="seller"]')).toHaveCount(0);
  await expect(page.locator('[data-sidebox="listing-agent"]')).toHaveCount(0);
  await page.locator('[data-co-tab="To-do list"]').click();
  await expect(page.locator('[data-file-tasks="mine"]')).toHaveCount(0);
  await expect(page.locator('[data-sidebox="buyer"]')).toBeVisible();
  expect(freshIssues(issues)).toEqual([]);
});
