import { test, expect, signIn, openMockFile, freshIssues } from '../fixtures.js';
import { gotoHash, dealId } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';

test('a buyer agent cannot complete a client task', async ({ page, issues }) => {
  await signIn(page, 'buyerAgent');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  const clientRows = page.locator('[data-task-row]', { hasText: 'Client-Buyer' });
  await expect(clientRows.first()).toBeVisible();
  await expect(clientRows.locator('[data-tick]')).toHaveCount(0);
  const forClient = page.getByRole('link', { name: 'Fill in for client' });
  if (await forClient.count()) {
    await forClient.first().click();
    await expect(page.locator('[data-agent-no-complete]')).toBeVisible();
    await expect(page.locator('[data-mode="complete"]')).toHaveCount(0);
    await expect(page.locator('[data-mode="save"]')).toBeVisible();
  } else {
    await expect(page.locator('[data-mode="complete"]')).toHaveCount(0);
  }
  expect(freshIssues(issues)).toEqual([]);
});

test('a used invite link opens Sign in with the email', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'the sample used invite is in the mock data');
  await page.goto('/#/agent-invite/demo-used-ai-1');
  await expect(page).toHaveURL(/#\/login\?email=bianca\.buyeragent%40example\.test/);
  await expect(page.locator('body')).not.toContainText(/account exists/i);
  await expect(page.locator('body')).not.toContainText(/already used/i);
  await expect(page.locator('#who')).toHaveValue('u-bagent');
  await expect(page.locator('#pickform')).toHaveAttribute('data-login-email', 'bianca.buyeragent@example.test');
  expect(freshIssues(issues)).toEqual([]);
});
