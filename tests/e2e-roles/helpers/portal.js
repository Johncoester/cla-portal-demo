import { expect } from '@playwright/test';
import { isForbiddenTab, requiredTabs, tabOf } from './people.js';

export function tinyPdf(name) {
  const body = `%PDF-1.1\n1 0 obj<</Length 0>>endobj\ntrailer<<>>\n%%EOF\n% ${name}\n`;
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(body) };
}

export async function gotoHash(page, hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  const path = target.split('?')[0];
  const known = ['tasks', 'inbox', 'documents', 'closing', 'contacts', 'agreements', 'activity', 'email', 'accounting', 'title'];
  const parts = path.split('/').filter(Boolean);
  const key = [...parts].reverse().find((p) => known.includes(p)) || 'overview';
  await page.evaluate((h) => { location.hash = h; }, target);
  await page.waitForFunction((tab) => {
    const cur = document.querySelector('[aria-current="page"], a.nav-link.active');
    if (!cur) return false;
    const href = (cur.getAttribute('href') || '').split('?')[0];
    if (tab === 'overview') return /#\/deals\/[^/]+\/?$/.test(href);
    return href.endsWith('/' + tab);
  }, key);
  await page.locator('#view, .co-cb, [data-email-tab]').first().waitFor();
}

export async function fileTabs(page) {
  const hrefs = await page.locator('[data-co-tab], [data-tc-tab], a.nav-link[href*="#/deals/"]').evaluateAll((els) => {
    const out = [];
    const seen = new Set();
    for (const el of els) {
      const href = el.getAttribute('href') || '';
      if (!href.includes('#/deals/')) continue;
      if (seen.has(href.split('?')[0])) continue;
      seen.add(href.split('?')[0]);
      out.push({ href, label: (el.getAttribute('data-co-tab') || el.getAttribute('data-tc-tab') || el.textContent || '').trim() });
    }
    return out;
  });
  return hrefs;
}

export async function walkFileTabs(page, person) {
  const tabs = await fileTabs(page);
  const keys = new Map();
  for (const tab of tabs) {
    const key = tabOf(tab.href);
    if (!key || isForbiddenTab(key) || key === 'accounting') continue;
    if (!keys.has(key)) keys.set(key, tab);
  }
  const missing = requiredTabs(person).filter((key) => !keys.has(key));
  expect(missing, `${person.label} is missing file tabs: ${missing.join(', ')}`).toEqual([]);
  for (const [key, tab] of keys) {
    await gotoHash(page, tab.href);
    const body = page.locator('#view, .co-cb').first();
    await expect(body).toBeVisible();
    await expect(body).not.toContainText('That page does not exist');
    await expect(body).not.toContainText('Page not found');
    const text = (await body.innerText()).trim();
    expect(text.length, `${key} rendered empty`).toBeGreaterThan(0);
    expect(page.url()).not.toMatch(/#\/(crm|hr)\b/);
    expect(page.url()).not.toMatch(/\/(accounting|title|funding|wires|policy)\b/);
  }
}

async function audienceChoices(page) {
  return page.locator('#uf input[name="audience"]').evaluateAll((els) => els.map((el) => ({
    id: el.value,
    label: ((el.closest('label') && el.closest('label').innerText) || '').replace(/\s+/g, ' ').trim(),
    side: el.getAttribute('data-side') || '',
    exclusive: el.hasAttribute('data-cla-only') || el.value === 'cla',
    grants: el.getAttribute('data-grants') || '',
    checked: el.checked,
  })));
}

function describeAudience(checked) {
  if (checked.length === 1 && checked[0].exclusive) return { label: checked[0].label, value: checked[0].grants || '' };
  const sides = [...new Set(checked.map((c) => c.side).filter(Boolean))];
  if (sides.length >= 2 || checked.some((c) => c.id === 'all')) return { label: 'Everyone on the file', value: 'all' };
  if (sides.length === 1) return { label: sides[0] === 'buyer' ? 'Buyer side only' : 'Seller side only', value: sides[0] };
  return { label: checked.map((c) => c.label).join(', '), value: '' };
}

async function clickAudience(page, id) {
  const boxes = page.locator('#uf input[name="audience"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    if ((await boxes.nth(i).getAttribute('value')) === id) {
      await boxes.nth(i).click();
      return;
    }
  }
  throw new Error(`Audience choice ${id} is not on the upload form.`);
}

/* Who can see it is party checkboxes. CLA only stands alone. Checking a person shares that whole side. */
async function applyAudience(page, plan) {
  if (plan.kind === 'keep') return;
  const cla = page.locator('#uf input[name="audience"][value="cla"]');
  if (await cla.count() && !(await cla.isChecked())) await cla.click();
  if (plan.kind === 'cla') return;
  for (const id of plan.click) {
    const boxes = page.locator('#uf input[name="audience"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      if ((await boxes.nth(i).getAttribute('value')) === id && !(await boxes.nth(i).isChecked())) await clickAudience(page, id);
    }
  }
}

function audiencePlans(choices, person) {
  const cla = choices.find((c) => c.exclusive);
  const buyer = choices.find((c) => c.side === 'buyer');
  const seller = choices.find((c) => c.side === 'seller');
  const checked = choices.filter((c) => c.checked);
  const current = describeAudience(checked);
  const plans = [{ kind: 'keep', label: current.label, value: current.value, click: [] }];
  const side = person && person.side;
  if (buyer && seller) {
    if (cla && current.value !== 'staff') plans.push({ kind: 'cla', label: cla.label, value: 'staff', click: [] });
    if (side !== 'seller' && current.value !== 'buyer') plans.push({ kind: 'side', label: 'Buyer side only', value: 'buyer', click: [buyer.id] });
    if (side !== 'buyer' && current.value !== 'seller') plans.push({ kind: 'side', label: 'Seller side only', value: 'seller', click: [seller.id] });
    if (current.value !== 'all') plans.push({ kind: 'all', label: 'Everyone on the file', value: 'all', click: [buyer.id, seller.id] });
  }
  return plans;
}

export { officeDate as officeToday } from '../../../js/data/office-date.js';

export async function uploadOfferedVisibilities(page, run, person) {
  await page.getByRole('heading', { name: 'Documents & Files' }).waitFor();
  const openBtn = page.getByRole('button', { name: 'Upload here' });
  if (await openBtn.count() === 0) return { offered: false, saved: [], options: [], values: [] };
  const posted = [];
  const onRequest = (req) => {
    if (req.method() !== 'POST' || !/\/documents(?:\?|$)/.test(req.url())) return;
    try {
      const body = req.postDataJSON();
      if (body && body.visibility) posted.push(body.visibility);
    } catch (e) { /* the body was not the document row */ }
  };
  page.on('request', onRequest);
  try {
    await openBtn.click();
    await expect(page.locator('#uf legend', { hasText: 'Who can see it' })).toBeVisible();
    const choices = await audienceChoices(page);
    expect(choices.length, 'upload offered no audience').toBeGreaterThan(0);
    const plans = audiencePlans(choices, person);
    const saved = [];
    const options = [];
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      if (i > 0) await page.getByRole('button', { name: 'Upload here' }).click();
      const form = page.locator('#uf');
      await expect(form.locator('legend', { hasText: 'Who can see it' })).toBeVisible();
      await applyAudience(page, plan);
      const file = tinyPdf(`e2e-${run}-${plan.value || i}.pdf`);
      await form.locator('[data-upload-files]').setInputFiles(file);
      await form.locator('[data-upload-submit]').click();
      const err = form.locator('[data-upload-err]');
      const body = page.locator('#view, .co-cb').first();
      await Promise.race([
        body.getByText(file.name, { exact: true }).waitFor({ timeout: 20000 }),
        err.filter({ hasText: /\S/ }).waitFor({ timeout: 20000 }),
      ]);
      const errText = await err.innerText({ timeout: 1000 }).catch(() => '');
      const toastText = await page.locator('.toast').last().innerText({ timeout: 1000 }).catch(() => '');
      const denied = /cannot add|not saved|row-level security|not available for your role/i.test(`${errText} ${toastText}`) && !/uploaded/i.test(toastText);
      if (denied) throw new Error(`Sharing option "${plan.label}" is offered but the upload was refused: ${errText || toastText}`);
      await expect(body).toContainText(file.name);
      saved.push(plan.label);
      options.push({ value: plan.value, label: plan.label });
      await page.locator('#modal').waitFor({ state: 'detached' }).catch(() => {});
    }
    return { offered: true, saved, options, values: posted };
  } finally {
    page.off('request', onRequest);
  }
}

export async function messageRecipientLabels(page) {
  await page.locator('#newthread').click();
  // Start conversation loads recipients, then inserts #ntf. Reading before that insert returns no names.
  const form = page.locator('#modal #ntf');
  await form.waitFor();
  const labels = await form.locator('input[name="to"]').evaluateAll((els) => els.map((el) => (el.closest('label') ? el.closest('label').innerText : '').replace(/\s+/g, ' ').trim()).filter(Boolean));
  await page.locator('#modal [data-close]').first().click();
  return labels;
}

export async function shareFileLabels(page) {
  const btn = page.locator('#sharefiles, #sharefiles2').first();
  await expect(btn).toBeVisible();
  await btn.click();
  const select = page.locator('#cmpf select[name="to"]');
  await expect(select).toBeVisible();
  const labels = await select.locator('option').evaluateAll((els) => els.map((el) => (el.textContent || '').trim()).filter((t) => t && !/choose a recipient/i.test(t)));
  await page.locator('#modal [data-close]').first().click();
  return labels;
}

export function assertRecipients(labels, rules) {
  const blob = labels.join('\n');
  for (const re of rules.must) expect(blob, `missing ${re} in: ${blob}`).toMatch(re);
  for (const re of rules.mustNot) expect(blob, `unexpected ${re} in: ${blob}`).not.toMatch(re);
  if (rules.staff) expect(blob, `no CLA staff in: ${blob}`).toMatch(rules.staffRe);
}

export async function sendPortalMessage(page, run) {
  const body = `E2E-RUN-${run} portal message`;
  await page.locator('#newthread').click();
  await page.locator('#ntf input[name="subject"]').fill(`E2E-RUN-${run} note`);
  const box = page.locator('#ntf input[name="to"]').first();
  await expect(box).toBeVisible();
  await box.check();
  await page.locator('#ntf textarea[name="body"]').fill(body);
  await page.locator('#ntf button[type="submit"]').click();
  await expect(page.locator('#view, .co-cb').first()).toContainText(body);
  await page.reload();
  await expect(page.locator('#view, .co-cb').first()).toContainText(body);
}

export function dealId(page) {
  const m = page.url().match(/#\/deals\/([^/?#]+)/);
  if (!m) throw new Error('The page is not on a file.');
  return m[1];
}

export async function fillAssignedTasks(page, run, { requireUpload = true } = {}) {
  await page.getByRole('link', { name: /^Fill in\b/ }).first().waitFor();
  const hrefs = await page.getByRole('link', { name: /^Fill in\b/ }).evaluateAll((els) => els.map((el) => el.getAttribute('href') || '').filter(Boolean));
  expect(hrefs.length, 'no Fill in link on an assigned task').toBeGreaterThan(0);
  let sawFile = false;
  let saved = false;
  const token = `E2E${run.slice(-6)}`;
  for (const href of hrefs) {
    await gotoHash(page, href);
    await page.locator('#tform, [data-task-no-fields], [data-task-form-state]').first().waitFor();
    await expect(page.locator('[data-task-no-fields]')).toHaveCount(0);
    await expect(page.locator('#view, .co-cb').first()).not.toContainText('template n/a');
    const fields = page.locator('#tform input:not([type="hidden"]), #tform select, #tform textarea');
    expect(await fields.count()).toBeGreaterThan(0);
    if (await page.locator('#tform input[type="file"]').count()) sawFile = true;
    if (!saved) {
      // Conditional fields (bank name on seller proceeds) stay in the form hidden until their question applies.
      const text = page.locator('#tform textarea:visible, #tform input[type="text"]:visible').first();
      if (await text.count()) {
        await text.fill(token);
        await page.locator('#tform button[data-mode="save"]').click();
        await expect(page.locator('.toast', { hasText: 'Progress saved' })).toBeVisible();
        await page.reload();
        await expect(page.locator('#tform textarea:visible, #tform input[type="text"]:visible').first()).toHaveValue(token);
        saved = true;
      }
    }
  }
  if (requireUpload) expect(sawFile, 'no assigned form showed an upload control').toBeTruthy();
  expect(saved, 'Save progress did not persist').toBeTruthy();
}

export async function advance(page, step) {
  await page.locator('[data-wiz-next]').click();
  const visible = page.locator(`[data-wiz-step="${step}"]:not([hidden])`);
  const err = page.locator('.toast.err, [data-wiz-errors]:not([hidden])');
  await Promise.race([
    visible.waitFor({ timeout: 15000 }),
    err.waitFor({ timeout: 15000 }).then(async () => {
      throw new Error((await err.allInnerTexts()).join(' | ') || 'Place Order step failed');
    }),
  ]);
}
