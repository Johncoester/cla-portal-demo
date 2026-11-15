// Merge check (Bob, Nov 10): open the portal in headless Chromium on the mock data (no Supabase, no secrets) as one
// person per role, then the dashboard and every tab of their first file. Fails on any page error, console error,
// failed module load, or a page still on "Loading this page." after 10s (the Nov 10 outage).
// Run: npm install --no-save playwright@1.58.2 && npx playwright install chromium && node tools/smoke-mock.mjs
//      SMOKE_CHANNEL=chrome uses an installed Chrome instead of the downloaded Chromium.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const MOCK = "window.CLA_PORTAL_CONFIG = { mode: 'mock', features: { accounting: true, funding: true, wires: true, policy: true, title: true, crm: true }, devPicker: true };";
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(MOCK); }
  const file = normalize(join(ROOT, p.endsWith('/') ? `${p}index.html` : p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true, ...(process.env.SMOKE_CHANNEL ? { channel: process.env.SMOKE_CHANNEL } : {}) });
const page = await browser.newPage();
const problems = [];
let where = 'start';
page.on('pageerror', (e) => problems.push(`${where}: page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`${where}: console: ${m.text()}`); });
// a request the page itself cancelled by moving on (net::ERR_ABORTED) is not a failure; a missing file is a 404 below
page.on('requestfailed', (r) => { if (r.url().startsWith(base) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) problems.push(`${where}: failed to load ${r.url().slice(base.length)}`); });
page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) problems.push(`${where}: HTTP ${r.status()} ${r.url().slice(base.length)}`); });

async function settle(label) {
  where = label;
  try {
    await page.waitForFunction(() => !document.querySelector('[data-loading-note]') && !document.querySelector('[data-route-loading="1"]'), null, { timeout: 10000 });
  } catch { problems.push(`${label}: still on "Loading this page." after 10s`); }
  await page.waitForTimeout(300);
}
await page.goto(base); await settle('first load');
const users = await page.evaluate(async () => {
  const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/js\/data\/adapter\.js\?v=\d+/.test(n));
  const { getAdapter } = await import(mods[0]);
  return (await (await getAdapter()).listDevUsers()).map((u) => ({ id: u.id, role: u.role, admin: u.isAdmin }));
});
const picks = [...new Map(users.map((u) => [`${u.role}|${u.admin}`, u])).values()];
if (!picks.length) problems.push('no mock users to sign in as');
const rows = [];
for (const u of picks) {
  const who = `${u.role}${u.admin ? ' (admin)' : ''}`;
  await page.evaluate(async (id) => {
    const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/js\/data\/adapter\.js\?v=\d+/.test(n));
    const { getAdapter } = await import(mods[0]); await (await getAdapter()).signInDev(id);
  }, u.id);
  await page.goto(`${base}#/`); await page.reload(); await settle(`${who} dashboard`);
  const deal = await page.evaluate(() => { const a = document.querySelector('a[href^="#/deals/"]'); return a ? a.getAttribute('href').split('/')[2] : null; });
  let tabs = [];
  if (deal) {
    await page.goto(`${base}#/deals/${deal}`); await settle(`${who} file`);
    const pickState = await page.evaluate(() => {
      const row = document.querySelector('[data-party="Processor"]');
      if (!row) return 'absent';
      return row.querySelector('[data-pick-processor]') ? 'open' : 'readonly';
    });
    const canEditParty = !!(u.admin || u.role === 'Processor' || u.role === 'Preprocessor');
    if (pickState === 'open' && !canEditParty) problems.push(`${who}: Processor row opens a picker for someone who cannot edit parties`);
    if (pickState === 'readonly' && canEditParty) problems.push(`${who}: Processor row does nothing for someone who can edit parties`);
    tabs = await page.evaluate((id) => [...new Set([...document.querySelectorAll(`a[href^="#/deals/${id}/"]`)].map((a) => a.getAttribute('href').split('/')[3]).filter(Boolean))], deal);
    for (const tab of tabs) { await page.goto(`${base}#/deals/${deal}/${tab}`); await settle(`${who} file tab ${tab}`); }
  }
  rows.push(`${who.padEnd(32)} ${deal ? `file + ${tabs.length} tabs (${tabs.join(', ')})` : 'no file on the dashboard'}`);
}
const syncProblem = await page.evaluate(async () => {
  try {
    const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/js\/data\/adapter\.js\?v=\d+/.test(n));
    const { getAdapter } = await import(mods[0]);
    const api = await getAdapter();
    await api.signInDev('u-admin');
    const made = await api.createDeal({ street: '1 Processor Sync Lane', city: 'Rockville', state: 'MD', zip: '20850' });
    if (made.processorId) return 'a new mock file started with a Processor';
    await api.addParticipant(made.id, 'c-admin', 'Processor');
    const got = await api.getDeal(made.id);
    if (got.processorId !== 'u-admin') return 'adding a Super admin as Processor on Contacts did not set the file processor';
    if (!(got.participants || []).some((p) => p.role === 'Processor' && p.contactId === 'c-admin')) return 'Contacts is missing the Processor row';
    const row = (got.participants || []).find((p) => p.role === 'Processor');
    await api.removeParticipant(made.id, row.id);
    const cleared = await api.getDeal(made.id);
    if (cleared.processorId) return 'removing the Processor from Contacts left them on the file';
    await api.updateDeal(made.id, { processorId: 'u-sp' });
    const set = await api.getDeal(made.id);
    if (set.processorId !== 'u-sp') return 'setting the Processor did not save';
    if (!(set.participants || []).some((p) => p.role === 'Processor')) return { error: 'setting the Processor did not show on Contacts' };
    const blank = await api.createDeal({ street: '2 Processor Pick Lane', city: 'Rockville', state: 'MD', zip: '20850' });
    if (blank.processorId) return { error: 'the picker file started with a Processor' };
    return { error: '', id: blank.id };
  } catch (e) { return { error: 'processor sync: ' + (e && e.message ? e.message : String(e)) }; }
});
if (!syncProblem || syncProblem.error) problems.push(`processor sync: ${(syncProblem && syncProblem.error) || 'no result'}`);
else {
  await page.goto(`${base}#/deals/${syncProblem.id}`); await page.reload(); await settle('processor picker file');
  const opened = await page.evaluate(() => {
    const btn = document.querySelector('[data-party="Processor"] [data-pick-processor]');
    return btn ? btn.textContent.trim() : '';
  });
  if (opened !== 'Choose processor') problems.push(`unassigned Processor row should say Choose processor, got ${opened || 'nothing'}`);
  else {
    await page.click('[data-pick-processor]');
    await page.waitForSelector('[data-processor-pick] select', { timeout: 5000 });
    await page.click('[data-processor-pick] button[type="submit"]');
    const said = await page.evaluate(() => { const t = document.querySelector('#toasts .toast.err'); return t ? (t.dataset.msg || t.textContent || '') : ''; });
    if (!/Choose a staff login/.test(said)) problems.push(`saving with no Processor chosen said: ${said || 'nothing'}`);
    const still = await page.evaluate(() => !!document.querySelector('[data-processor-pick]'));
    if (!still) problems.push('the Processor form closed after a blank save');
  }
}
await browser.close(); server.close();
console.log(rows.join('\n'));
const unique = [...new Set(problems)];
console.log(unique.length ? `\n${unique.length} problem(s):\n  ${unique.join('\n  ')}` : `\n${picks.length} people, no page errors, console errors, failed loads, or stuck pages`);
process.exit(unique.length ? 1 : 0);
