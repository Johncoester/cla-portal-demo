import { test, expect, signIn, openMockFile, freshIssues } from '../fixtures.js';
import { gotoHash, dealId } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';
import { assertRecipientsAllowed, plusAlias } from '../helpers/allowlist.js';
import { findRememberedInviteLink, gmailAccessToken, rememberInviteLink } from '../helpers/inbox.js';

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

const USED_INVITE_TAG = 'e2e-used-invite';

function usedInvitePassword() {
  const value = process.env.E2E_USED_INVITE_PASSWORD || process.env.E2E_CLIENT_BUYER_PASSWORD || '';
  if (!value || value.length < 8) {
    const err = new Error('Missing secret E2E_USED_INVITE_PASSWORD.');
    err.code = 'E2E_SECRET';
    throw err;
  }
  return value;
}

async function inviteRows(page, email) {
  await page.goto('/#/agent-invites');
  await page.locator('[data-invite-table]').waitFor();
  const rows = page.locator('[data-invite-row]', { hasText: email });
  const count = await rows.count();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    out.push({
      id: await row.getAttribute('data-invite-row'),
      status: await row.getAttribute('data-invite-status'),
    });
  }
  return out;
}

async function revokeInvite(page, id) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`[data-invite-row="${id}"] [data-revoke]`).click();
  await expect(page.locator(`[data-invite-row="${id}"]`)).toHaveAttribute('data-invite-status', 'revoked', { timeout: 20000 });
}

async function shownInviteLink(page, id) {
  const btn = page.locator(`[data-invite-row="${id}"] [data-show-link]`);
  if (!(await btn.count())) return '';
  await btn.click();
  const box = page.locator('[data-invite-link]');
  await expect(box).toBeVisible();
  return box.inputValue();
}

async function ensureBuyer(page, id, email) {
  await gotoHash(page, `#/deals/${id}/contacts`);
  // Nov 11: count() does not wait. Before the table drew, the buyer already on the file looked missing,
  // the test added them again, and contacts_email_uq answered 409 in the console.
  await page.locator('[data-contacts-table]').waitFor();
  const row = page.locator('tr', { hasText: email });
  if (await row.count()) return;
  await page.locator('#addp').click();
  const modal = page.locator('#modal');
  const details = modal.locator('[data-newperson]');
  await modal.locator('select[name="role"]').selectOption('Client-Buyer');
  await details.locator('input[name="firstName"]').fill('E2E');
  await details.locator('input[name="lastName"]').fill('UsedInvite');
  await details.locator('input[name="email"]').fill(email);
  await details.locator('input[name="phone"]').fill('301-555-0148');
  await modal.locator('#apf button[type="submit"]').click();
  await expect(page.locator('tr', { hasText: email })).toBeVisible();
}

async function createInviteLink(page, id, email) {
  await gotoHash(page, `#/deals/${id}/contacts`);
  const row = page.locator('tr', { hasText: email }).first();
  await row.locator('[data-invite-portal]').click();
  await page.locator('[data-invite-create]').click();
  const box = page.locator('[data-invite-link]');
  await expect(box).toBeVisible({ timeout: 60000 });
  return box.inputValue();
}

async function assertUsedInviteOpensSignIn(browser, link, email) {
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  try {
    const open = async () => {
      await guestPage.goto(link);
      const signup = guestPage.locator('[data-client-signup]');
      const login = guestPage.locator('#login-form');
      await expect(signup.or(login)).toBeVisible({ timeout: 30000 });
      return (await signup.count()) > 0 && await signup.isVisible();
    };
    if (await open()) {
      await guestPage.locator('[data-client-signup] input[name="cellPhone"]').fill('301-555-0148');
      const password = usedInvitePassword();
      await guestPage.locator('[data-invite-password]').fill(password);
      await guestPage.locator('[data-invite-password-2]').fill(password);
      await guestPage.locator('[data-client-submit]').click();
      await guestPage.waitForFunction(() => !location.hash.includes('/agent-invite/'));
      const menu = guestPage.locator('[data-usermenu]');
      if (await menu.count()) await menu.click();
      await guestPage.locator('[data-signout]').click();
      await guestPage.waitForFunction(() => location.hash.includes('/login') || !document.querySelector('[data-usermenu]'));
      await guestPage.goto(link);
    }
    await expect(guestPage).toHaveURL(/#\/login\?email=/);
    await expect(guestPage.locator('#login-form input[name="email"]')).toHaveValue(email);
    await expect(guestPage.locator('#login-form')).toHaveAttribute('data-login-email', email);
    await expect(guestPage.locator('[data-client-signup]')).toHaveCount(0);
    await expect(guestPage.locator('body')).not.toContainText(/account exists/i);
    await expect(guestPage.locator('body')).not.toContainText(/already used/i);
  } finally {
    await guest.close();
  }
}

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

  const email = plusAlias(process.env.E2E_MAIL_TO, USED_INVITE_TAG);
  assertRecipientsAllowed([email], { label: 'used invite' });
  const gmail = await gmailAccessToken();
  await signIn(page, 'processor');
  await openMockFile(page);
  const id = dealId(page);
  await ensureBuyer(page, id, email);
  let rows = await inviteRows(page, email);
  for (const row of rows.filter((item) => item.status === 'expired')) await revokeInvite(page, row.id);
  rows = await inviteRows(page, email);
  const accepted = rows.filter((row) => row.status === 'accepted');
  const unused = rows.filter((row) => row.status === 'pending');
  let link = '';
  if (accepted.length) {
    for (const row of unused) await revokeInvite(page, row.id);
    link = await findRememberedInviteLink(gmail, email);
    if (!link) throw new Error('The used invite is already accepted, and its link is not in the test inbox.');
  } else if (unused.length) {
    let keep = unused[0];
    for (const row of unused) {
      const shown = await shownInviteLink(page, row.id);
      if (shown) { keep = row; link = shown; break; }
    }
    if (!link) link = await findRememberedInviteLink(gmail, email);
    if (!link) throw new Error('An unused invite for this email has no link on screen or in the test inbox.');
    for (const row of unused) if (row.id !== keep.id) await revokeInvite(page, row.id);
    await rememberInviteLink(gmail, email, link.includes('#/') ? link.slice(link.indexOf('#/')) : link);
  } else {
    const created = await createInviteLink(page, id, email);
    link = created;
    await rememberInviteLink(gmail, email, created.includes('#/') ? created.slice(created.indexOf('#/')) : created);
  }
  const hash = link.includes('#/') ? link.slice(link.indexOf('#/')) : link;
  const origin = new URL(page.url()).origin;
  await assertUsedInviteOpensSignIn(browser, `${origin}/${hash}`, email);
  expect(freshIssues(issues)).toEqual([]);
});
