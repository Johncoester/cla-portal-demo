import { test, expect, signIn, openMockFile, freshIssues, runId, onTest } from '../fixtures.js';
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
  await signIn(page, 'buyer');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const result = await uploadOfferedVisibilities(page, runId());
  expect(result.offered).toBeTruthy();
  expect(result.options.map((o) => o.value)).toEqual(['buyer']);
  expect(result.options.map((o) => o.label).join(' ')).toMatch(/Share with CLA Title/);
  expect(result.saved.join(' ')).toMatch(/Share with CLA Title/i);
  expect(freshIssues(issues)).toEqual([]);
});

test('seller document sharing options that are offered must upload', async ({ page, issues }) => {
  await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/documents`);
  const result = await uploadOfferedVisibilities(page, runId());
  expect(result.offered).toBeTruthy();
  expect(result.options.map((o) => o.value)).toEqual(['seller']);
  expect(result.options.map((o) => o.label).join(' ')).toMatch(/Share with CLA Title/);
  expect(result.saved.join(' ')).toMatch(/Share with CLA Title/i);
  expect(freshIssues(issues)).toEqual([]);
});

test('buyer Share Files lists staff and the buyer agent, not the other side', async ({ page, issues }) => {
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

test('seller Share Files lists staff and the listing agent, not the other side', async ({ page, issues }) => {
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

test('seller message is still there after a reload', async ({ page, issues }) => {
  await signIn(page, 'seller');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/inbox`);
  await sendPortalMessage(page, runId());
  expect(freshIssues(issues)).toEqual([]);
});
