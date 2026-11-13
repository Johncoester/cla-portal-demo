/* Agent fees walkthrough (AF-1 to AF-6 and the Nov 13 follow-ups; John asked for a test of the whole flow).
 * On the seeded file: the Processor enters the listing agent's commission and admin fee, the listing agent sees only their
 * own side and confirms it, the Processor changes a confirmed fee (a reason is required), and the buyer never sees agent fees.
 * The agent's transaction task no longer asks for fees, and Edit order details points to the Agent fees box.
 * Accounting is not opened here (README); the SQL test checks the fee ledger, CD section H and the ALTA Commission lines.
 * The figures stay on the seeded file between runs, so each step works from whatever an earlier run left. */
import { test, expect, signIn, openMockFile, freshIssues, runId } from '../fixtures.js';
import { dealId, gotoHash } from '../helpers/portal.js';

const side = (page, s) => page.locator(`[data-agent-fees] [data-agent-fee-side="${s}"]`);

// sign out (the menu item may be folded away on a small screen), then sign in as the next person
async function switchTo(page, key) {
  await page.evaluate(() => { const out = document.querySelector('[data-signout]'); if (out) out.click(); });
  await page.waitForFunction(() => location.hash.includes('/login'));
  return signIn(page, key);
}

async function openEdit(page, s) {
  await side(page, s).locator(`[data-af-edit="${s}"]`).click();
  const form = page.locator(`#modal [data-af-form="${s}"]`);
  await form.waitFor();
  return form;
}

test('agent fees: staff enter them, the agent confirms, a staff change needs a reason, buyers never see them', async ({ page, issues }) => {
  test.setTimeout(180000);
  const run = runId();
  // a different figure every run, so every save is a real change
  const pct = `2.${(Date.now() % 9) + 1}`;

  // 1. the Processor enters the listing agent's commission and admin fee
  await signIn(page, 'processor');
  await openMockFile(page);
  const id = dealId(page);
  await expect(page.locator('[data-agent-fees]')).toBeVisible();
  await expect(side(page, 'listing')).toBeVisible();
  await expect(side(page, 'buyer')).toBeVisible();
  let form = await openEdit(page, 'listing');
  await expect(form.locator('[data-af-price]')).toContainText('$');
  await form.locator('input[name="commissionPercent"]').fill(pct);
  await expect(form.locator('input[name="commissionAmount"]')).not.toHaveValue('');
  await form.locator('input[name="adminAmount"]').fill('395');
  if (await form.locator('textarea[name="reason"]').count()) await form.locator('textarea[name="reason"]').fill(`E2E-RUN-${run} staff entry`);
  await form.locator('[data-af-save]').click();
  await expect(page.locator('.toast', { hasText: 'Agent fees saved' }).last()).toBeVisible();
  await expect(side(page, 'listing').locator('[data-af-commission]')).toContainText(`${pct}%`);
  await expect(side(page, 'listing').locator('[data-af-admin]')).toContainText('$395');

  // Edit order details no longer takes a commission: it points to the Agent fees box
  await page.locator('#editdeal').click();
  await expect(page.locator('#edf [data-agent-fees-pointer]')).toBeVisible();
  await expect(page.locator('#edf input[name="commissionPercent"]')).toHaveCount(0);
  await page.locator('#modal [data-close]').first().click();

  // 2. the listing agent sees only their side, checks the "You're confirming" screen, and confirms
  await switchTo(page, 'listingAgent');
  await openMockFile(page);
  await expect(side(page, 'listing')).toBeVisible();
  await expect(side(page, 'buyer')).toHaveCount(0);
  await expect(side(page, 'listing').locator('[data-af-commission]')).toContainText(`${pct}%`);
  form = await openEdit(page, 'listing');
  await form.locator('[data-af-save]').click();
  const check = page.locator('#modal [data-af-check]');
  await expect(check).toBeVisible();
  await check.locator('[data-af-confirm]').click();
  await expect(page.locator('.toast', { hasText: 'Your fees are saved and confirmed.' }).last()).toBeVisible();
  await expect(side(page, 'listing').locator('.af-side-head')).toContainText('Agent confirmed');

  // the agent's transaction task points to the Agent fees box instead of asking for fees
  await gotoHash(page, `#/deals/${id}/tasks`);
  const task = page.locator('a', { hasText: 'Confirm Your Transaction Information' }).first();
  if (await task.count()) {
    await task.click();
    await page.locator('[data-task-main]').waitFor();
    const modify = page.locator('[data-modify]');
    if (await modify.count()) await modify.click();
    if (await page.locator('#atf').count()) {
      await expect(page.locator('#atf [data-agent-task-fees]')).toBeVisible();
      await expect(page.locator('#atf [data-add-row="commissions"]')).toHaveCount(0);
      await expect(page.locator('#atf [data-add-row="fees"]')).toHaveCount(0);
    }
  }

  // 3. the Processor changes the confirmed fee: blank reason is refused, then saved with a reason
  await switchTo(page, 'processor');
  await openMockFile(page);
  form = await openEdit(page, 'listing');
  await expect(form.locator('textarea[name="reason"]')).toBeVisible();
  await form.locator('input[name="adminAmount"]').fill('400');
  await form.locator('[data-af-save]').click();
  await expect(form.locator('[data-af-err]')).toContainText('Enter a reason');
  await expect(form.locator('input[name="adminAmount"]')).toHaveValue('400');
  await form.locator('textarea[name="reason"]').fill(`E2E-RUN-${run} admin fee corrected`);
  await form.locator('[data-af-save]').click();
  await expect(page.locator('.toast', { hasText: 'Agent fees saved' }).last()).toBeVisible();
  await expect(side(page, 'listing').locator('[data-af-admin]')).toContainText('$400');
  await expect(side(page, 'listing').locator('.af-side-head')).toContainText('then changed by CLA staff');
  await page.locator('[data-af-history-btn]').click();
  await expect(page.locator('[data-af-history-table]')).toContainText('admin fee corrected');

  // 4. the buyer never sees agent fees or a commission
  await switchTo(page, 'buyer');
  await openMockFile(page);
  await expect(page.locator('#view, .co-cb').first()).toBeVisible();
  await expect(page.locator('[data-agent-fees]')).toHaveCount(0);
  await expect(page.locator('[data-commission-total], [data-commission-percent]')).toHaveCount(0);

  expect(freshIssues(issues)).toEqual([]);
});
