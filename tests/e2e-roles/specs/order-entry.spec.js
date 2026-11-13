import { test, expect, signIn, openMockFile, freshIssues, runId, onTest } from '../fixtures.js';
import { advance, dealId, gotoHash, officeToday } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';

test('Place Order, edit details, parties, referral source, and the file-number prefix', async ({ page, issues }) => {
  test.setTimeout(120000);
  const run = runId();
  const buyer = `Zzqe2e${run.slice(-4)} Buyer`;
  const seller = `Zzqe2e${run.slice(-4)} Seller`;
  await signIn(page, 'processor');
  await page.goto('/#/orders/new');
  await page.locator('#nof').waitFor();
  await expect(page.locator('h2.page-title')).toContainText('Place Order');

  // The hosted check uses the office day. A UTC runner is already on the next calendar day after 7 PM Eastern.
  await page.locator('[data-wiz-step="transaction"] input[name="openDate"]').fill(officeToday());
  await advance(page, 'property');
  const parcel = `E2E-${run.slice(-6)}`;
  await page.locator('[data-wiz-step="property"] input[name="street"]').fill(`100 E2E Test File ${run}`);
  await page.locator('[data-wiz-step="property"] input[name="city"]').fill('Alexandria');
  await page.locator('[data-wiz-step="property"] select[name="state"]').selectOption('VA');
  await page.locator('[data-wiz-step="property"] input[name="zip"]').fill('22314');
  await page.locator('[data-wiz-step="property"] input[name="parcelId"]').fill(parcel);

  await advance(page, 'parties');
  const buyerRow = page.locator('[data-multi="Client-Buyer"] [data-party-row="1"]');
  const buyerBox = buyerRow.locator('.picker-q');
  await buyerBox.fill(buyer);
  await buyerBox.press('Enter');
  await expect(buyerRow.locator('[data-chosen]')).toContainText('Selected:');
  const buyerSource = buyerRow.locator('input[name="referralSource"]');
  await expect(buyerSource).toBeEnabled();
  await buyerSource.check();
  const sellerRow = page.locator('[data-multi="Client-Seller"] [data-party-row="1"]');
  const sellerBox = sellerRow.locator('.picker-q');
  await sellerBox.fill(seller);
  await sellerBox.press('Enter');
  await expect(sellerRow.locator('[data-chosen]')).toContainText('Selected:');
  await expect(page.locator('[data-multi="Client-Buyer"] [data-party-row="2"]')).toBeVisible();
  await expect(page.locator('[data-multi="Client-Seller"] [data-party-row="2"]')).toBeVisible();

  await advance(page, 'loan');
  await expect(page.locator('[data-wiz-step="loan"] [data-earnest-commission]')).toBeVisible();
  // Agent fees at file opening (Nov 13): the listing agent's commission is typed as a %, the $ fills in from the purchase price
  await page.locator('[data-wiz-step="loan"] input[name="purchasePrice"]').fill('400,000');
  await page.locator('[data-wiz-step="loan"] input[name="af.listing.percent"]').fill('3');
  await expect(page.locator('[data-wiz-step="loan"] input[name="af.listing.amount"]')).toHaveValue('12000.00');
  await page.locator('[data-wiz-step="loan"] input[name="af.buyer.admin"]').fill('395');
  await advance(page, 'agents');
  await expect(page.locator('[data-wiz-step="agents"] select[name="p:Transaction Coordinator"]')).toBeVisible();
  await expect(page.locator('[data-wiz-step="agents"] select[name="p:Transaction Coordinator:2"]')).toBeVisible();
  await advance(page, 'team');
  await expect(page.locator('[data-wiz-step="team"] input[name="closerName"]')).toBeVisible();
  const sales = page.locator('[data-wiz-step="team"] input[name="salesIds"]');
  await expect(page.locator('[data-sales-picker] legend')).toHaveText('Salespeople on this order');
  await expect(sales.first()).toHaveAttribute('type', 'checkbox');
  if (await sales.count()) await sales.first().check();
  await page.locator('[data-wiz-step="team"] textarea[name="notes"]').fill(`E2E-RUN-${run}`);
  await advance(page, 'review');
  await page.locator('[data-place-order]').click();
  const err = page.locator('.toast.err');
  await page.locator('[data-op-order-no]').waitFor({ timeout: 20000 }).catch(async () => {
    throw new Error((await err.count()) ? await err.innerText() : 'Place Order did not open the new file');
  });

  const number = (await page.locator('[data-op-order-no]').innerText()).match(/([A-Z]{2})-(\d{2})-(\d+)/);
  expect(number, 'file number missing').toBeTruthy();
  expect(number[1]).toBe('VA');
  console.log(`E2E placed file ${number[0]}`);
  await expect(page.locator('[data-parties]')).toContainText(buyer);
  await expect(page.locator('[data-parties]')).toContainText(seller);
  await expect(page.locator('[data-parcel-id]')).toContainText(parcel);
  await expect(page.locator('[data-file-identity]')).toBeVisible();
  await expect(page.locator('[data-file-address]')).toContainText('100 E2E Test File');
  await expect(page.locator('[data-file-order]')).toContainText(number[0]);
  await expect(page.locator('[data-file-buyers]')).toContainText(buyer);
  await expect(page.locator('[data-file-sellers]')).toContainText(seller);
  await expect(page.locator('[data-wire-box]')).toHaveCount(0);
  await expect(page.locator('[data-settlement-section]')).toHaveCount(0);
  await expect(page.locator('[data-order-contacts]')).toHaveCount(0);
  await expect(page.locator('[data-closing-date] [data-settlement-row="date"]')).toBeVisible();
  await expect(page.locator('[data-closing-date] [data-settlement-row="time"]')).toBeVisible();
  await expect(page.locator('[data-closing-location]')).toBeVisible();
  await expect(page.locator('[data-closer]')).toBeVisible();
  // the Place Order figures are the file's Agent fees
  await expect(page.locator('[data-agent-fees] [data-agent-fee-side="listing"] [data-af-commission]')).toContainText('3%');
  await expect(page.locator('[data-agent-fees] [data-agent-fee-side="listing"] [data-af-commission]')).toContainText('$12,000');
  await expect(page.locator('[data-agent-fees] [data-agent-fee-side="buyer"] [data-af-admin]')).toContainText('$395');

  await page.locator('#editdeal').click();
  await page.locator('#edf select[name="state"]').selectOption('FL');
  await page.locator('#edf input[name="city"]').fill('Miami');
  await page.locator('#edf input[name="purchasePrice"]').fill('450000');
  await page.locator('#edf button[type="submit"]').click();
  await expect(page.locator('.toast', { hasText: 'Order saved' })).toBeVisible();
  await expect(page.locator('[data-op-address]')).toContainText('Miami');
  await expect(page.locator('[data-op-order-no]')).toContainText(`FL-${number[2]}-${number[3]}`);
  await expect(page.locator('[data-purchase-price]')).toContainText('450,000');
  await page.reload();
  await expect(page.locator('[data-op-order-no]')).toContainText(`FL-${number[2]}-${number[3]}`);
  await expect(page.locator('[data-op-address]')).toContainText('Miami');
  await expect(page.locator('[data-purchase-price]')).toContainText('450,000');

  await page.locator('input[data-referral-source^="buyer:"]').first().check();
  await expect(page.locator('[data-source-of-business]')).toContainText(/Buyer/i);
  await page.reload();
  await expect(page.locator('[data-source-of-business]')).toContainText(/Buyer/i);
  await expect(page.locator('input[data-referral-source^="buyer:"]:checked')).toHaveCount(1);

  await page.locator('#statussel').selectOption('Cancelled');
  await expect(page.locator('.toast', { hasText: 'Status updated' })).toBeVisible();
  expect(freshIssues(issues)).toEqual([]);
});

test('a contact edit persists and does not report a blank email as saved', async ({ page, issues }) => {
  onTest('FF-NEW-2');
  await signIn(page, 'processor');
  await openMockFile(page);
  const id = targetMode() === 'test' ? dealId(page) : 'deal-1';
  await gotoHash(page, `#/deals/${id}/contacts`);
  const who = targetMode() === 'test' ? 'E2E Seller' : 'Sally Seller';
  const row = page.locator('tr', { hasText: who }).first();
  await row.waitFor();
  const before = (await row.innerText());
  await row.locator('[data-edit]').click();
  const email = page.locator('#ecf input[name="email"]');
  const company = page.locator('#ecf input[name="company"]');
  const storedEmail = await email.inputValue();
  const storedCompany = await company.inputValue();
  expect(storedEmail).toMatch(/@/);
  const token = `E2E Co ${runId().slice(-4)}`;
  try {
    await company.fill(token);
    await page.locator('#ecf button[type="submit"]').click();
    const saved = page.locator('.toast', { hasText: 'Contact saved' });
    const failed = page.locator('.toast.err, #ecf');
    await expect(saved.or(failed)).toBeVisible();
    if (await page.locator('.toast.err').count()) {
      throw new Error(await page.locator('.toast.err').innerText());
    }
    await expect(saved).toBeVisible();
    await page.reload();
    const again = page.locator('tr', { hasText: who }).first();
    await expect(again).toContainText(token);
    await expect(again).toContainText(storedEmail);
    expect(before).toBeTruthy();
  } finally {
    if (await page.locator('#modal').count()) await page.locator('#modal [data-close]').first().click().catch(() => {});
    const back = page.locator('tr', { hasText: who }).first();
    if (await back.count()) {
      await back.locator('[data-edit]').click();
      await page.locator('#ecf input[name="company"]').fill(storedCompany);
      await page.locator('#ecf input[name="email"]').fill(storedEmail);
      await page.locator('#ecf button[type="submit"]').click().catch(() => {});
    }
  }
  expect(freshIssues(issues)).toEqual([]);
});
