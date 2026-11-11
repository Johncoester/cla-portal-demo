import { test, expect, signIn, freshIssues } from '../fixtures.js';
import { advance, officeToday } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';

async function choose(page, picker, id, query) {
  const box = page.locator(`[data-picker="${picker}"] .picker-q`);
  await box.click();
  await box.fill(query);
  const hit = page.locator(`[data-picker="${picker}"] li[data-id="${id}"]`);
  await hit.waitFor();
  await hit.click();
  await expect(page.locator(`[data-picker="${picker}"] [data-chosen]`)).toContainText('Selected:');
}

test('preselected seller, agents and lender stay on the file, and the draft does not return', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'mock only; this must not place a file on TEST');
  test.setTimeout(120000);
  const calls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (/supabase|\/rest\/v1\/|\/rpc\//.test(url)) calls.push(url);
  });
  await signIn(page, 'processor');
  await page.goto('/#/orders/new');
  await page.locator('#nof').waitFor();
  await page.locator('[data-wiz-step="transaction"] input[name="openDate"]').fill(officeToday());
  await advance(page, 'property');
  await page.locator('[name="street"]').fill('100 Place Order Lane');
  await page.locator('[name="city"]').fill('Alexandria');
  await page.locator('[name="state"]').selectOption('VA');
  await page.locator('[name="zip"]').fill('22314');
  await advance(page, 'parties');
  await choose(page, 'p:Client-Buyer', 'c-buyer', 'Ben');
  await choose(page, 'p:Client-Seller', 'c-seller', 'Sally');
  await advance(page, 'loan');
  await choose(page, 'p:Lender', 'c-lender1', 'Linda');
  await advance(page, 'agents');
  await choose(page, 'p:Buyer Agent', 'c-bagent', 'Bianca');
  await choose(page, 'p:Listing Agent', 'c-lagent', 'Larry');
  await advance(page, 'team');
  await advance(page, 'review');
  const before = calls.length;
  await page.evaluate(() => {
    for (const name of ['p:Client-Seller', 'p:Buyer Agent', 'p:Listing Agent', 'p:Lender']) {
      const hid = document.querySelector(`[data-picker="${name}"] input[type=hidden]`);
      if (hid) hid.value = '';
    }
  });
  await page.locator('[data-place-order]').click();
  await page.locator('[data-op-order-no]').waitFor({ timeout: 20000 });
  expect(calls.length, 'placing must not add a hosted round trip').toBe(before);
  const parties = page.locator('[data-parties]');
  await expect(parties).toContainText('Ben Buyer');
  await expect(parties).toContainText('Sally Seller');
  await expect(parties).toContainText('Bianca Buyer-Agent');
  await expect(parties).toContainText('Larry Listing-Agent');
  await expect(parties).toContainText('Linda Lender');
  await page.goto('/#/orders/new');
  await page.locator('#nof').waitFor();
  await expect(page.locator('[data-draft-restored]')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('Restored an unplaced draft');
  expect(freshIssues(issues)).toEqual([]);
});

test('a company-only lender is saved when an extra contact row is incomplete', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'mock only; this must not place a file on TEST');
  test.setTimeout(120000);
  await signIn(page, 'processor');
  await page.goto('/#/orders/new');
  await page.locator('#nof').waitFor();
  await page.locator('[data-wiz-step="transaction"] input[name="openDate"]').fill(officeToday());
  await advance(page, 'property');
  await page.locator('[name="street"]').fill('200 Company Lane');
  await page.locator('[name="city"]').fill('Alexandria');
  await page.locator('[name="state"]').selectOption('VA');
  await page.locator('[name="zip"]').fill('22314');
  await advance(page, 'parties');
  await choose(page, 'p:Client-Buyer', 'c-buyer', 'Ben');
  await advance(page, 'loan');
  await page.locator('[name="lenderName"]').fill('Only Company Loans');
  await page.locator('[data-add-lender-contact]').click();
  await page.locator('[data-lender-contact-row] [data-lc="role"]').selectOption('loan_officer');
  await advance(page, 'agents');
  await advance(page, 'team');
  await advance(page, 'review');
  await page.locator('[data-place-order]').click();
  await page.locator('[data-op-order-no]').waitFor({ timeout: 20000 });
  await expect(page.locator('[data-parties]')).toContainText('Only Company Loans');
  await expect(page.locator('[data-wiz-errors]:not([hidden])')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});
