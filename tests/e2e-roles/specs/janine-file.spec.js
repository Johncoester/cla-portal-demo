import { test, expect, signIn, openMockFile, freshIssues } from '../fixtures.js';
import { targetMode } from '../helpers/gate.js';
import { advance, dealId, gotoHash } from '../helpers/portal.js';

test('the staff file header stays on screen while the file scrolls', async ({ page, issues }) => {
  await signIn(page, 'processor');
  await openMockFile(page);
  const id = dealId(page);
  await expect(page.locator('[data-order-header]')).toBeVisible();
  await expect(page.locator('[data-oh-purchase]')).toContainText('$');
  await gotoHash(page, `#/deals/${id}/tasks`);
  const header = page.locator('[data-order-header]');
  await header.waitFor();
  await page.locator('[data-task-row]').first().waitFor();
  const read = () => header.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, position: getComputedStyle(el).position };
  });
  const before = await read();
  await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)));
  await page.waitForTimeout(200);
  const after = await read();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(before.position).toBe('sticky');
  expect(scrolled).toBeGreaterThan(200);
  expect(after.top).toBeGreaterThan(40);
  expect(after.top).toBeLessThan(80);
  await expect(header).toContainText('Purchase');
  // Nov 11: the used-invite test keeps a second Client-Buyer (E2E UsedInvite) on the TEST file, so the title is
  // "Buyer & UsedInvite / Seller" there. Require the buyer side, then " / ", then the seller side.
  await expect(header.locator('[data-oh-parties]')).toHaveText(/\bBuyer\b.* \/ Seller\b/);
  expect(freshIssues(issues)).toEqual([]);
});

test('the buyer sees the agent phone and not themselves on the closing team', async ({ page, issues }) => {
  await signIn(page, 'buyer');
  await page.goto('/#/orders');
  await page.locator('[data-agent-inline] [data-your-agent]').waitFor();
  await expect(page.locator('[data-agent-inline] [data-agent-tel]').first()).toBeVisible();
  await openMockFile(page);
  await expect(page.locator('[data-co-you], .co-you')).toHaveCount(0);
  await expect(page.locator('[data-co-person="Ben Buyer"]')).toHaveCount(0);
  await expect(page.locator('[data-agent-tel]').first()).toBeVisible();
  await expect(page.locator('[data-your-agent]')).toContainText(targetMode() === 'test' ? '301-555-0148' : '301-555-0105');
  await gotoHash(page, '#/deals/deal-2/tasks');
  await page.getByRole('link', { name: 'Personal information' }).first().click();
  const citizenship = page.locator('#tform select[name="citizenship"]');
  await citizenship.waitFor();
  const choices = await citizenship.locator('option').allTextContents();
  for (const label of ['U.S. Citizen', 'Permanent Resident', 'Non-Resident Alien', 'Other']) {
    expect(choices).toContain(label);
  }
  await citizenship.selectOption('U.S. Citizen');
  await page.locator('#tform button[data-mode="save"]').click();
  await expect(page.locator('.toast', { hasText: 'Progress saved' })).toBeVisible();
  await expect(citizenship).toHaveValue('U.S. Citizen');
  expect(freshIssues(issues)).toEqual([]);
});

test('Place Order fills city, state, county and ZIP from the street line', async ({ page, issues }) => {
  await signIn(page, 'processor');
  await page.goto('/#/orders/new');
  await page.locator('#nof').waitFor();
  await advance(page, 'property');
  const street = page.locator('[data-wiz-step="property"] input[name="street"]');
  await street.fill('10 Oak Street, Rockville, MD 20850');
  await street.blur();
  await expect(page.locator('[data-wiz-step="property"] input[name="city"]')).toHaveValue('Rockville');
  await expect(page.locator('[data-wiz-step="property"] select[name="state"]')).toHaveValue('MD');
  await expect(page.locator('[data-wiz-step="property"] input[name="zip"]')).toHaveValue('20850');
  await expect(page.locator('[data-wiz-step="property"] input[name="county"]')).toHaveValue('Montgomery');
  await expect(page.locator('[data-add-parcel]')).toBeVisible();
  expect(freshIssues(issues)).toEqual([]);
});
