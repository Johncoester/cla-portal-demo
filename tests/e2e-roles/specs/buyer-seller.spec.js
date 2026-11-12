import { test, expect, signIn, openMockFile, freshIssues, runId, onTest } from '../fixtures.js';
import { targetMode } from '../helpers/gate.js';
import { walkFileTabs, uploadOfferedVisibilities, shareFileLabels, messageRecipientLabels, assertRecipients, sendPortalMessage, fillAssignedTasks, gotoHash, dealId } from '../helpers/portal.js';
import { PEOPLE, recipientRules } from '../helpers/people.js';

async function smoke(page, key) {
  const person = await signIn(page, key);
  await openMockFile(page);
  await walkFileTabs(page, person);
  const labels = await page.locator('[data-co-tab]').allTextContents();
  for (const label of labels) {
    expect(label.toLowerCase()).not.toMatch(/accounting|payoff|crm/);
    expect(label.trim()).not.toBe('Title');
  }
  return person;
}

test('buyer portal opens the file and every client tab', async ({ page, issues }) => {
  await smoke(page, 'buyer');
  expect(freshIssues(issues)).toEqual([]);
});

test('seller portal opens the file and every client tab', async ({ page, issues }) => {
  await smoke(page, 'seller');
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer Fill In shows questions, fields, an upload, and Save progress sticks', async ({ page, issues }) => {
  onTest('FF-015');
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  await fillAssignedTasks(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('seller Fill In shows questions, fields, an upload, and Save progress sticks', async ({ page, issues }) => {
  onTest('FF-015');
  await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  await fillAssignedTasks(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer document sharing options that are offered must upload', async ({ page, issues }) => {
  onTest('FF-016');
  const person = await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const result = await uploadOfferedVisibilities(page, runId(), person);
  expect(result.offered).toBeTruthy();
  expect(result.options.map((o) => o.label)).toEqual(['Share with CLA Title']);
  expect(result.saved.join(' ')).toMatch(/Share with CLA Title/i);
  if (targetMode() === 'test') expect(result.values).toEqual(['buyer']);
  expect(freshIssues(issues)).toEqual([]);
});

test('seller document sharing options that are offered must upload', async ({ page, issues }) => {
  const person = await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const result = await uploadOfferedVisibilities(page, runId(), person);
  expect(result.offered).toBeTruthy();
  expect(result.options.map((o) => o.label)).toEqual(['Share with CLA Title']);
  expect(result.saved.join(' ')).toMatch(/Share with CLA Title/i);
  if (targetMode() === 'test') expect(result.values).toEqual(['seller']);
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer Share Files lists the buyer-side coordinator and not the other side', async ({ page, issues }) => {
  onTest('FF-017');
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const labels = await shareFileLabels(page);
  const rules = recipientRules(PEOPLE.buyer);
  assertRecipients(labels, rules);
  await gotoHash(page, `#/deals/${id}/inbox`);
  assertRecipients(await messageRecipientLabels(page), rules);
  expect(freshIssues(issues)).toEqual([]);
});

test('seller Share Files lists the listing agent and no buyer-side coordinator', async ({ page, issues }) => {
  await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const labels = await shareFileLabels(page);
  assertRecipients(labels, recipientRules(PEOPLE.seller));
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer message is still there after a reload', async ({ page, issues }) => {
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer can ask for an update on every listed topic', async ({ page, issues }) => {
  onTest('JN-44a');
  await signIn(page, 'buyer');
  await openMockFile(page);
  await page.locator('[data-co-ask]').click();
  const select = page.locator('#requpdate select[name="topic"]');
  const values = await select.locator('option').evaluateAll((els) => els.map((el) => el.value).filter(Boolean));
  expect(values.length).toBeGreaterThan(1);
  const run = runId();
  for (const value of values) {
    await select.selectOption(value);
    // Nov 11: request_update refuses a second open request on the same topic (by design). The run's note lets
    // cleanup-runs.mjs remove these, so the next run can ask again.
    await page.locator('#requpdate input[name="note"]').fill(`E2E-RUN-${run} update`);
    await page.locator('#requpdate button[type="submit"]').click();
    await expect(page.locator('.toast', { hasText: 'Update requested. CLA Title will answer here.' }).last()).toBeVisible();
    await page.locator('#modal').waitFor({ state: 'detached' });
    await page.locator('[data-co-ask]').click();
    await page.locator('#requpdate').waitFor();
  }
  await expect(page.locator('.toast.err')).toHaveCount(0);
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer lender answers mark the task done', async ({ page, issues }) => {
  onTest('JN-44b');
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  const lender = page.getByRole('link', { name: /Lender information/ });
  await lender.first().click();
  await page.locator('#tform').waitFor();
  await expect(page.locator('[data-task-form-state]')).toHaveCount(0);
  await page.locator('#tform input[name="company"]').fill('E2E Lender');
  await page.locator('#tform input[name="officer_name"]').fill('E2E Officer');
  await page.locator('#tform input[name="officer_email"]').fill('e2e-lender@example.test');
  await page.locator('#tform input[name="officer_phone"]').fill('2025550100');
  await page.locator('#tform button[data-mode="complete"]').click();
  await expect(page.locator('.toast', { hasText: 'Task complete. Thank you!' })).toBeVisible();
  await expect(page.locator('tr[data-task-row]', { hasText: 'Lender information' }).first()).toContainText('done');
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer can upload an ID and complete the task', async ({ page, issues }) => {
  onTest('JN-44c');
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  await page.getByRole('link', { name: /Upload (photo |identification|your )?ID/i }).first().click();
  await page.locator('#tform').waitFor();
  await expect(page.locator('[data-task-form-state]')).toHaveCount(0);
  await page.locator('#tform select[name="id_type"]').selectOption({ index: 1 });
  await page.locator('#tform input[name="id_expires"]').fill('2030-01-01');
  await page.locator('#tform input[type="file"]').setInputFiles({ name: 'e2e-id.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.1\n%%EOF') });
  await page.locator('#tform button[data-mode="complete"]').click();
  await expect(page.locator('.toast', { hasText: 'Task complete. Thank you!' })).toBeVisible();
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer personal information completes without an error', async ({ page, issues }) => {
  onTest('JN-44d');
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/tasks`);
  await page.getByRole('link', { name: /Personal information/ }).first().click();
  await page.locator('#tform, [data-task-form-state]').first().waitFor();
  await expect(page.locator('[data-task-form-state]')).toHaveCount(0);
  const fillIfEmpty = async (sel, value) => {
    const el = page.locator(sel);
    if ((await el.inputValue()) === '') await el.fill(value);
  };
  await fillIfEmpty('#tform input[name="email"]', 'e2e-buyer@example.test');
  await fillIfEmpty('#tform input[name="cell_phone"]', '301-555-0199');
  await fillIfEmpty('#tform input[name="current_address"]', '100 E2E Test File, Annapolis, MD 21401');
  const marital = page.locator('#tform select[name="marital_status"]');
  if ((await marital.inputValue()) === '') await marital.selectOption('Single');
  const attend = page.locator('#tform select[name="attending_closing"]');
  if ((await attend.inputValue()) === '') await attend.selectOption('Yes');
  await page.locator('#tform [data-buyer-ssn]').fill('900-12-3456');
  await page.locator('#tform button[data-mode="complete"]').click();
  await expect(page.locator('.toast.err')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Task complete. Thank you!' })).toBeVisible();
  expect(freshIssues(issues)).toEqual([]);
});

test('seller message is still there after a reload', async ({ page, issues }) => {
  await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});
