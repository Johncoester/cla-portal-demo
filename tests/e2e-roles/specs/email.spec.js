import { test, expect, signIn, openMockFile, freshIssues, runId } from '../fixtures.js';
import { dealId, gotoHash, tinyPdf } from '../helpers/portal.js';
import { targetMode } from '../helpers/gate.js';
import { attachmentBytes, gmailAccessToken, gmailCredentials, pollInbox, replyWithAttachment, sha256, trashMessage } from '../helpers/inbox.js';

test('file email composer fills a template and does not send from mock', async ({ page, issues }) => {
  test.skip(targetMode() === 'test', 'The mock composer check runs only in mock mode.');
  const leaked = [];
  page.on('request', (req) => {
    if (/gmail-send|gmail\.googleapis/.test(req.url())) leaked.push(req.url());
  });
  await signIn(page, 'coordinator');
  await openMockFile(page);
  const id = dealId(page);
  await gotoHash(page, `#/deals/${id}/email`);
  await page.locator('[data-mail-new]').click();
  await expect(page.locator('[data-mail-compose]')).toContainText('[CLA #');
  const template = page.locator('[data-mail-template]');
  await expect(template.locator('option')).not.toHaveCount(1);
  await template.selectOption({ index: 1 });
  const subject = await page.locator('[data-mail-subject]').inputValue();
  const body = await page.locator('[data-rte]').innerText();
  expect(subject.length).toBeGreaterThan(0);
  expect(`${subject}\n${body}`).not.toMatch(/\{\{[^}]+\}\}/);
  await page.locator('[data-mail-to]').fill('buyer@example.test');
  await page.locator('[data-mail-check]').click();
  await expect(page.locator('[data-mail-check-result]')).toContainText(/Gmail works on CLA Portal Live Test only|Nothing was sent/i);
  expect(leaked).toEqual([]);
  expect(freshIssues(issues)).toEqual([]);
});

test('file email, invite, and reply arrive at the test inbox', async ({ page }) => {
  test.skip(targetMode() !== 'test', 'Live Gmail delivery runs only against TEST (E2E_TARGET=test). Mock mode does not send.');
  const creds = await gmailCredentials();
  if (!creds.ok) {
    if (creds.required) throw new Error(creds.message);
    test.skip(true, creds.message);
  }
  test.setTimeout(240000);
  const run = runId();
  const token = await gmailAccessToken();
  const trashed = [];
  try {
    await signIn(page, 'processor');
    await openMockFile(page);
    const id = dealId(page);
    const parties = await page.locator('[data-parties], [data-co-file]').first().innerText();
    // Nov 13 (John): no allowed-inbox list. The file email goes to every address on the test file, plus E2E_MAIL_TO,
    // the one inbox this test can read to check the email and its attachment arrived.
    const found = [...new Set((parties.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((a) => a.toLowerCase()))];

    const big = Buffer.alloc(5 * 1024 * 1024 + 1024, 0x61);
    big.write('%PDF-1.4\n');
    const hash = sha256(big);
    const bigName = `e2e-${run}-large.pdf`;
    await gotoHash(page, `#/deals/${id}/documents`);
    await page.locator('#upbtn').click();
    await expect(page.locator('#uf legend', { hasText: 'Who can see it' })).toBeVisible();
    await page.locator('[data-upload-files]').setInputFiles({ name: bigName, mimeType: 'application/pdf', buffer: big });
    await page.locator('[data-upload-submit]').click();
    await expect(page.locator('#view, .co-cb').first()).toContainText(bigName, { timeout: 60000 });

    await gotoHash(page, `#/deals/${id}/email`);
    await page.locator('[data-mail-new]').click();
    const inbox = String(process.env.E2E_MAIL_TO || '').trim().toLowerCase();
    if (!inbox) throw new Error('E2E_MAIL_TO is not set, so the test has no inbox to check.');
    await page.locator('[data-mail-to]').fill([...new Set([...found, inbox])].join(', '));
    const template = page.locator('[data-mail-template]');
    if (await template.count()) await template.selectOption({ index: 1 });
    const sentTo = (await page.locator('[data-mail-to]').inputValue()).split(/[,;\n]/).map((a) => a.trim().toLowerCase()).filter(Boolean);
    expect(sentTo).toContain(inbox);
    console.log(`File email To: ${sentTo.map((a) => (a === inbox ? 'E2E_MAIL_TO' : a)).join(', ')}`);
    const subject = `E2E-RUN-${run} file note`;
    await page.locator('[data-mail-subject]').fill(subject);
    const merged = await page.locator('[data-rte]').innerText();
    expect(merged).not.toMatch(/\{\{[^}]+\}\}/);
    await page.locator(`[data-mail-doc]`).evaluateAll((els, name) => {
      const hit = els.find((el) => (el.parentElement && el.parentElement.textContent || '').includes(name));
      if (hit) hit.checked = true;
    }, bigName);
    const started = Date.now();
    await page.locator('[data-mail-send]').click();
    await expect(page.locator('.toast', { hasText: /Sent from/ })).toBeVisible({ timeout: 60000 });
    const mail = await pollInbox({ token, subjectIncludes: `E2E-RUN-${run}` });
    trashed.push(mail.id);
    expect(mail.subject).toMatch(/\[CLA #[A-Za-z0-9-]+ - .+\]/);
    expect(mail.snippet + mail.subject).not.toMatch(/\{\{/);
    const attached = mail.attachments.find((a) => a.filename === bigName);
    expect(attached, 'large attachment missing').toBeTruthy();
    const bytes = await attachmentBytes(token, mail.id, attached);
    expect(bytes.length).toBe(big.length);
    expect(sha256(bytes)).toBe(hash);
    expect(mail.latencyMs).toBeLessThan(180000);
    expect(Date.now() - started).toBeLessThan(240000);

    const replyName = `e2e-${run}-reply.pdf`;
    const replyBytes = tinyPdf(replyName).buffer;
    const from = (await page.locator('[data-mail-from]').innerText()).match(/[\w.+-]+@[\w.-]+/);
    expect(from, 'sender mailbox missing').toBeTruthy();
    const sent = await replyWithAttachment({
      token, threadId: mail.threadId, to: from[0], subject: mail.subject, filename: replyName, bytes: replyBytes,
    });
    if (sent && sent.id) trashed.push(sent.id);
    await page.locator('[data-mail-sync]').click();
    await expect(page.locator('[data-mail-dir="in"]')).toBeVisible({ timeout: 180000 });
    await gotoHash(page, `#/deals/${id}/documents`);
    await expect(page.locator('#view, .co-cb').first()).toContainText(replyName);
    expect(await page.locator(`text=${replyName}`).count()).toBe(1);

    await gotoHash(page, `#/deals/${id}/contacts`);
    const inviteRow = page.locator('[data-invite-portal]').first();
    await expect(inviteRow).toBeVisible();
    await inviteRow.click();
    const inviteEmail = await page.locator('[data-invite-email]').inputValue();
    console.log(`Invite To: ${inviteEmail === inbox ? 'E2E_MAIL_TO' : inviteEmail}`);
    await page.locator('[data-invite-create]').click();
    await expect(page.locator('[data-invite-link]')).toBeVisible();
    const inviteMail = await pollInbox({ token, subjectIncludes: 'CLA Title & Escrow Has Shared Access' });
    trashed.push(inviteMail.id);
    expect(inviteMail.latencyMs).toBeLessThan(180000);
  } finally {
    for (const id of trashed) await trashMessage(token, id).catch(() => {});
  }
});
