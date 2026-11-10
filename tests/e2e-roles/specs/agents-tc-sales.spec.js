import { test, expect, signIn, openMockFile, freshIssues, runId } from '../fixtures.js';
import { walkFileTabs, uploadOfferedVisibilities, shareFileLabels, assertRecipients, sendPortalMessage, fillAssignedTasks, gotoHash, dealId } from '../helpers/portal.js';
import { recipientRules } from '../helpers/people.js';
import { targetMode } from '../helpers/gate.js';

async function portal(page, key) {
  const person = await signIn(page, key);
  await openMockFile(page);
  await walkFileTabs(page, person);
  expect(page.url()).not.toMatch(/#\/crm\b/);
  return { person, id: dealId(page) };
}

test('buyer agent file, tasks, documents, share list, and a message', async ({ page, issues }) => {
  test.setTimeout(120000);
  const { person, id } = await portal(page, 'buyerAgent');
  await gotoHash(page, `#/deals/${id}/tasks`);
  await fillAssignedTasks(page, runId(), { requireUpload: false });
  await gotoHash(page, `#/deals/${id}/documents`);
  const docs = await uploadOfferedVisibilities(page, runId(), person);
  expect(docs.saved.length).toBeGreaterThan(1);
  const labels = await shareFileLabels(page);
  assertRecipients(labels, recipientRules(person));
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('listing agent file, documents, share list, and a message', async ({ page, issues }) => {
  test.setTimeout(120000);
  const { person, id } = await portal(page, 'listingAgent');
  await gotoHash(page, `#/deals/${id}/tasks`);
  const links = page.getByRole('link', { name: /^(Fill in|View)\b/ });
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') || '').filter(Boolean));
  expect(hrefs.length).toBeGreaterThan(0);
  await gotoHash(page, hrefs[0]);
  await expect(page.locator('#tform, [data-task-no-fields], .card').first()).toBeVisible();
  await expect(page.locator('[data-task-no-fields]')).toHaveCount(0);
  await expect(page.locator('#view, .co-cb').first()).not.toContainText('template n/a');
  await gotoHash(page, `#/deals/${id}/documents`);
  const docs = await uploadOfferedVisibilities(page, runId(), person);
  expect(docs.saved.length).toBeGreaterThan(1);
  const labels = await shareFileLabels(page);
  assertRecipients(labels, recipientRules(person));
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('transaction coordinator file tabs, tasks, contacts, documents, email, and a message', async ({ page, issues }) => {
  test.setTimeout(120000);
  const { person, id } = await portal(page, 'coordinator');
  await gotoHash(page, `#/deals/${id}/tasks`);
  await expect(page.locator('#view, .co-cb').first()).toContainText(/task/i);
  await gotoHash(page, `#/deals/${id}/contacts`);
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('[data-edit]')).toHaveCount(0);
  await expect(page.locator('[data-invite-portal]')).toHaveCount(0);
  await gotoHash(page, `#/deals/${id}/documents`);
  const docs = await uploadOfferedVisibilities(page, runId(), person);
  expect(docs.saved).toEqual(expect.arrayContaining(['Everyone on the file']));
  await gotoHash(page, `#/deals/${id}/email`);
  await expect(page.locator('[data-email-tab]')).toBeVisible();
  await expect(page.locator('[data-mail-allowlist]')).toContainText('[CLA #');
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('sales person is view-only on the file', async ({ page, issues }) => {
  const { id } = await portal(page, 'salesPerson');
  await gotoHash(page, `#/deals/${id}/documents`);
  await expect(page.locator('#upbtn')).toHaveCount(0);
  await expect(page.locator('#sharefiles')).toHaveCount(0);
  await gotoHash(page, `#/deals/${id}/inbox`);
  await expect(page.locator('#newthread')).toHaveCount(0);
  await gotoHash(page, `#/deals/${id}`);
  await expect(page.locator('#editdeal')).toHaveCount(0);
  await expect(page.locator('a[href="#/orders/new"]')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});

test('sales team is view-only on the file', async ({ page, issues }) => {
  const { id } = await portal(page, 'salesTeam');
  await gotoHash(page, `#/deals/${id}/documents`);
  await expect(page.locator('#upbtn')).toHaveCount(0);
  await gotoHash(page, `#/deals/${id}`);
  await expect(page.locator('#editdeal')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});

test('sales team invite shows the stored email and a copy link, and does not email', async ({ page, issues }) => {
  await signIn(page, 'salesTeam');
  await page.route('**/functions/v1/gmail-send**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sent: false, error: 'E2E checked the copy link only.' }),
  }));
  if (targetMode() === 'test') {
    await openMockFile(page);
    const id = dealId(page);
    await gotoHash(page, `#/deals/${id}/contacts`);
  } else {
    await page.goto('/#/deals/deal-4/contacts');
  }
  const who = targetMode() === 'test' ? 'E2E Invite' : 'Cora Seller';
  const row = page.locator('tr', { hasText: who }).first();
  await row.waitFor();
  await row.locator('[data-invite-portal]').click();
  const email = await page.locator('[data-invite-email]').inputValue();
  expect(email, 'stored email is blank').toMatch(/@/);
  await page.locator('[data-invite-create]').click();
  const link = page.locator('[data-invite-link]');
  const pending = page.locator('.toast.err', { hasText: /pending invite/i });
  await expect(link.or(pending)).toBeVisible();
  // A pending invite from an earlier run is resent. The test does not delete that row.
  if (await pending.count() && !(await link.count())) {
    await page.locator('#modal [data-close]').first().click();
    await gotoHash(page, '#/agent-invites?status=pending');
    const inviteRow = page.locator('[data-invite-row]', { hasText: email }).first();
    await inviteRow.waitFor();
    await inviteRow.locator('[data-resend]').click();
  }
  await expect(page.locator('[data-invite-link]')).toHaveValue(/#\/(?:agent-invite|hr-invite)\//);
  await expect(page.locator('[data-invite-result]')).toContainText(email);
  await expect(page.locator('[data-invite-sent="yes"]')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});
