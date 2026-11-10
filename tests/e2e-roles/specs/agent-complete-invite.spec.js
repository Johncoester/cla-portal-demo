import { test, expect, signIn, openMockFile, freshIssues, runId } from '../fixtures.js';
import { gotoHash, dealId } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';
import { assertRecipientsAllowed, plusAlias } from '../helpers/allowlist.js';

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

test('a used invite link opens Sign in with the email', async ({ page, browser, issues }) => {
  test.setTimeout(180000);
  if (targetMode() !== 'test') {
    await page.goto('/#/agent-invite/demo-used-ai-1');
    await expect(page).toHaveURL(/#\/login\?email=bianca\.buyeragent%40example\.test/);
    await expect(page.locator('body')).not.toContainText(/account exists/i);
    await expect(page.locator('body')).not.toContainText(/already used/i);
    await expect(page.locator('#who')).toHaveValue('u-bagent');
    await expect(page.locator('#pickform')).toHaveAttribute('data-login-email', 'bianca.buyeragent@example.test');
    expect(freshIssues(issues)).toEqual([]);
    return;
  }

  const email = plusAlias(process.env.E2E_MAIL_TO, `e2e-used-${runId()}`);
  assertRecipientsAllowed([email], { label: 'used invite' });
  const password = `E2e-${runId()}-a1`;
  let guest;
  let id = '';
  try {
  await signIn(page, 'processor');
  await openMockFile(page);
  id = dealId(page);
  await gotoHash(page, `#/deals/${id}/contacts`);
  await page.locator('#addp').click();
  const modal = page.locator('#modal');
  const details = modal.locator('[data-newperson]');
  await modal.locator('select[name="role"]').selectOption('Client-Buyer');
  await details.locator('input[name="firstName"]').fill('E2E');
  await details.locator('input[name="lastName"]').fill('UsedInvite');
  await details.locator('input[name="email"]').fill(email);
  await details.locator('input[name="phone"]').fill('301-555-0148');
  await modal.locator('#apf button[type="submit"]').click();
  const row = page.locator('tr', { hasText: email });
  await expect(row).toBeVisible();
  await row.locator('[data-invite-portal]').click();
  await page.locator('[data-invite-create]').click();
  const linkBox = page.locator('[data-invite-link]');
  await expect(linkBox).toBeVisible({ timeout: 60000 });
  const link = await linkBox.inputValue();
  expect(link).toMatch(/#\/agent-invite\/[0-9a-f]{64}$/);

  guest = await browser.newContext();
  const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await expect(guestPage.locator('[data-client-signup]')).toBeVisible();
    await guestPage.locator('[data-client-signup] input[name="cellPhone"]').fill('301-555-0148');
    await guestPage.locator('[data-invite-password]').fill(password);
    await guestPage.locator('[data-invite-password-2]').fill(password);
    await guestPage.locator('[data-client-submit]').click();
    await guestPage.waitForFunction(() => !location.hash.includes('/agent-invite/'));
    const menu = guestPage.locator('[data-usermenu]');
    if (await menu.count()) await menu.click();
    await guestPage.locator('[data-signout]').click();
    await guestPage.waitForFunction(() => location.hash.includes('/login') || !document.querySelector('[data-usermenu]'));
    await guestPage.goto(link);
    await expect(guestPage).toHaveURL(/#\/login\?email=/);
    await expect(guestPage.locator('#login-form input[name="email"]')).toHaveValue(email);
    await expect(guestPage.locator('#login-form')).toHaveAttribute('data-login-email', email);
    await expect(guestPage.locator('body')).not.toContainText(/account exists/i);
    await expect(guestPage.locator('body')).not.toContainText(/already used/i);
  } finally {
    if (guest) await guest.close();
    if (id && email) {
      try {
        await gotoHash(page, `#/deals/${id}/contacts`);
        page.once('dialog', (dialog) => dialog.accept());
        const mine = page.locator('tr', { hasText: email });
        if (await mine.count()) await mine.locator('[data-unlink]').click();
      } catch (e) { /* the order row is already gone, or this login cannot remove it */ }
    }
  }
  expect(freshIssues(issues)).toEqual([]);
});
