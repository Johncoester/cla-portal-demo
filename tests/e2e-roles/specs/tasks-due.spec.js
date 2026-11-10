import { test, expect, signIn, openMockFile, freshIssues, runId } from '../fixtures.js';
import { gotoHash, dealId } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';
import { SEED_FILE } from '../helpers/people.js';

async function signInAs(page, key) {
  const menu = page.locator('[data-usermenu]');
  if (await menu.count()) {
    await menu.click();
    const out = page.locator('[data-signout]');
    if (await out.count()) {
      await out.click();
      await page.waitForFunction(() => location.hash.includes('/login'));
    }
  }
  await page.evaluate(() => sessionStorage.removeItem('cla-portal-new:session:v1'));
  await signIn(page, key);
}

test('processor adds a task with a due date for the buyer audience', async ({ page, issues }) => {
  test.setTimeout(120000);
  const title = `E2E buyer packet ${runId()}`;
  await signIn(page, 'processor');
  await openMockFile(page);
  if (targetMode() === 'test') await expect(page.locator('[data-op-order-no]')).toContainText(SEED_FILE);
  const id = targetMode() === 'test' ? dealId(page) : 'deal-1';
  await gotoHash(page, `#/deals/${id}/tasks`);
  await page.locator('#addtask').click();
  await page.locator('#tf input[name="title"]').fill(title);
  await page.locator('#tf select[name="assignedRole"]').selectOption('Client-Buyer');
  await page.locator('#tf input[name="dueDate"]').fill('2026-12-20');
  await page.locator('#tf input[name="audiences"][value="buyer"]').check();
  await page.locator('#tf button[type="submit"]').click();
  const saved = page.locator('.toast', { hasText: 'Task saved' });
  const failed = page.locator('.toast.err');
  await expect(saved.or(failed)).toBeVisible();
  if (await failed.isVisible()) throw new Error(await failed.innerText());
  const row = page.locator('[data-task-row]', { hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText('12/20/2026');
  expect(freshIssues(issues)).toEqual([]);

  await signInAs(page, 'buyer');
  await openMockFile(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  const buyerRow = page.locator('[data-task-row]', { hasText: title });
  await expect(buyerRow).toBeVisible();
  await expect(buyerRow).toContainText('12/20/2026');
  await expect(buyerRow.locator('[data-edit]')).toHaveCount(0);
  await expect(page.locator('#tf input[name="dueDate"]')).toHaveCount(0);

  await signInAs(page, 'seller');
  await openMockFile(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  await expect(page.locator('#view, .co-cb').first()).not.toContainText(title);
  expect(freshIssues(issues)).toEqual([]);
});
