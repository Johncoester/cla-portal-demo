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
    if (!(set.participants || []).some((p) => p.role === 'Processor')) return 'setting the Processor did not show on Contacts';
    return '';
  } catch (e) { return 'processor sync: ' + (e && e.message ? e.message : String(e)); }
});
if (syncProblem) problems.push(`processor sync: ${syncProblem}`);

// REC-CALC-1: a misspelled county shows the plain message and no fee lines. A listed county still calculates.
await page.evaluate(async () => {
  const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/js\/data\/adapter\.js\?v=\d+/.test(n));
  const { getAdapter } = await import(mods[0]);
  const api = await getAdapter();
  await api.signInDev('u-admin');
  await api.setModuleLive('accounting', true);
});
await page.goto(`${base}#/deals/deal-1/accounting?calc=1`); await page.reload(); await settle('montgomery calculator');
try {
  await page.waitForSelector('[data-calc-form]', { timeout: 10000 });
  await page.click('[data-calc-preview]');
  await page.waitForSelector('[data-calc-diff] tr[data-calc-row]', { timeout: 10000 });
  const countyLines = await page.locator('[data-calc-row]').evaluateAll((rows) => rows.map((r) => r.innerText).filter((t) => /County (recordation|transfer) tax/i.test(t)));
  if (countyLines.length < 2) problems.push(`Montgomery preview is missing county taxes (${countyLines.length})`);
} catch (e) { problems.push('valid county did not calculate: ' + (e && e.message ? e.message : e)); }
await page.evaluate(async () => {
  const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/js\/data\/adapter\.js\?v=\d+/.test(n));
  const { getAdapter } = await import(mods[0]);
  const api = await getAdapter();
  await api.signInDev('u-admin');
  await api.updateDeal('deal-1', { county: 'Mongomery' });
});
await page.goto(`${base}#/deals/deal-1/accounting?calc=1`); await page.reload(); await settle('misspelled county calculator');
try {
  await page.waitForSelector('[data-calc-not-ready]', { timeout: 10000 });
  const note = await page.locator('[data-calc-not-ready]').innerText();
  if (!note.includes("We couldn't find this county in CLA's rates. Pick the county from the list, then calculate again.")) problems.push('misspelled county message: ' + note);
  if (await page.locator('[data-calc-diff]').count()) problems.push('misspelled county still showed fee lines');
  if (await page.locator('[data-calc-form]').count()) problems.push('misspelled county still offered Calculate');
} catch (e) { problems.push('misspelled county screen: ' + (e && e.message ? e.message : e)); }
await page.goto(`${base}#/deals/deal-1`); await settle('edit order county');
try {
  await page.click('#editdeal');
  await page.waitForSelector('#edf select[name="county"]', { timeout: 10000 });
  const label = await page.locator('#edf select[name="county"] option[data-county-unmatched]').evaluate((o) => o.textContent || '');
  const selected = await page.locator('#edf select[name="county"]').inputValue();
  if (selected !== 'Mongomery' || !label.includes('Mongomery') || !label.includes('not matched')) problems.push('saved county was not shown as not matched: ' + selected + ' / ' + label);
} catch (e) { problems.push('edit order county list: ' + (e && e.message ? e.message : e)); }
await page.goto(`${base}#/orders/new`); await settle('place order county');
try {
  await page.click('[data-wiz-tab="property"]');
  await page.waitForSelector('[data-wiz-step="property"] select[name="county"]', { timeout: 10000 });
  await page.selectOption('[data-wiz-step="property"] select[name="state"]', 'MD');
  const names = await page.locator('[data-wiz-step="property"] select[name="county"] option').evaluateAll((opts) => opts.map((o) => o.value).filter(Boolean));
  if (!names.includes('Montgomery')) problems.push('Place Order county list is missing Montgomery');
  if (names.includes('Miami-Dade')) problems.push('Place Order county list is not limited to Maryland');
  if (await page.locator('[data-wiz-step="property"] input[name="county"]').count()) problems.push('Place Order county is still a typed box');
} catch (e) { problems.push('place order county list: ' + (e && e.message ? e.message : e)); }

await browser.close(); server.close();
console.log(rows.join('\n'));
const unique = [...new Set(problems)];
console.log(unique.length ? `\n${unique.length} problem(s):\n  ${unique.join('\n  ')}` : `\n${picks.length} people, no page errors, console errors, failed loads, or stuck pages`);
process.exit(unique.length ? 1 : 0);
