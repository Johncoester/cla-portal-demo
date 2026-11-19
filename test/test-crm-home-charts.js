/* CRM Feedback 31 item 1: Add to Home. Fake data only. No network and no hosted database. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { crmSupabase } from '../js/data/supabase-crm.js';
import { resetHomeChartsProbe, cleanHomeTitle, homeChartsMissing, homeChartMessage } from '../js/data/crm-home-charts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const md5 = (text) => createHash('md5').update(text).digest('hex');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };

ok(cleanHomeTitle('  My chart  ') === 'My chart', 'a Home name is trimmed');
ok(cleanHomeTitle('   ') === '', 'a blank Home name means use the dashboard name');
let long = false; try { cleanHomeTitle('x'.repeat(101)); } catch (e) { long = e.message === 'The Home name can be at most 100 characters.'; }
ok(long, 'a Home name stops at 100 characters');
ok(homeChartsMissing({ code: 'PGRST205', message: "Could not find the table 'public.crm_home_charts' in the schema cache" }) && homeChartsMissing({ code: '42P01', message: 'relation "public.crm_home_charts" does not exist' }), 'a missing table is recognised');
ok(!homeChartsMissing({ code: '23505', message: 'duplicate key' }) && homeChartMessage({ message: 'duplicate key value violates unique constraint "crm_home_charts_pkey"' }) === 'That chart is already on your Home.', 'a duplicate pin is told in plain words');
ok(homeChartMessage({ code: '42P01', message: 'relation "crm_home_charts" does not exist' }) === 'Add to Home is not ready on this portal yet.', 'a missing table does not show a database code');

const mig = read('supabase/migrations/20261125320000_crm_home_charts.sql');
const rb = read('supabase/rollbacks/20261125320000_crm_home_charts.sql');
const migMd5 = md5(mig);
const rbMd5 = md5(rb);
console.log('sql-md5', migMd5, rbMd5);
ok(mig.includes('create table public.crm_home_charts') && mig.includes('user_id = (select auth.uid())') && mig.includes('component_id uuid not null') && mig.includes('title text not null default') && mig.includes('position integer not null'), 'the migration stores one person, one chart, a title, and an order');
const policies = [...mig.matchAll(/create policy [\s\S]*?;/g)].map((m) => m[0]);
ok(policies.length === 4 && policies.every((p) => p.includes('(select auth.uid())') && !p.includes('private.')), 'each policy is only that person, with no private helper');
ok(!/create (or replace )?function private\./i.test(mig) && mig.includes('private helpers changed') && mig.includes("array['deals', 'tasks', 'profiles']"), 'the migration adds no private helper and checks deals, tasks, and profiles');
ok(!/on public\.deals|on public\.tasks|on public\.profiles/i.test(mig), 'the migration does not rewrite deals, tasks, or profiles policies');
ok(rb.includes('drop table if exists public.crm_home_charts') && rb.includes('drop policy if exists crm_home_charts_select') && rb.includes('drop policy if exists crm_home_charts_delete') && !/create table|create policy/i.test(rb), 'the rollback drops only this table and its policies');

const homeSrc = read('js/pages/crm-home.js');
const homeFn = homeSrc.slice(homeSrc.indexOf('export async function homePage'), homeSrc.indexOf('const localDay'));
const blocking = homeFn.slice(homeFn.indexOf('const [tasks'), homeFn.indexOf('const today'));
ok(!blocking.includes('listCrmHomeCharts') && !blocking.includes('crm_home_charts'), 'the Home task load does not ask for charts');
ok(homeFn.indexOf('homeChartsSkip') < homeFn.indexOf('listCrmHomeCharts'), 'Home skips the chart read when it already knows there is nothing to show');
ok(homeFn.includes('data-home-refresh') && homeFn.includes('data-home-rename') && homeFn.includes('data-home-remove') && homeFn.includes('data-drag-handle') && !homeFn.includes('data-resize'), 'each Home chart has Refresh, Rename, Remove, and a drag handle, and no resize');
const dashSrc = read('js/pages/crm-dashboards.js');
ok(dashSrc.includes('data-add-home') && dashSrc.includes('countsOnly: true') && dashSrc.includes('homeChartsDown'), 'Add to Home is hidden until the table can be read, and that check does not load chart numbers');
const hostedSrc = read('js/data/supabase-crm-surface.js');
const hostedFn = hostedSrc.slice(hostedSrc.indexOf('async listCrmHomeCharts'), hostedSrc.indexOf('async addCrmHomeChart'));
ok(hostedFn.includes('if (!pins.length) return { available: true, charts: [] }') && hostedFn.indexOf('if (!pins.length)') < hostedFn.indexOf('homeChartViews'), 'an empty Home list does not read the charts');
ok(hostedFn.includes("select('component_id,title,position')") && hostedSrc.includes(".in('id', ids)"), 'pinned charts are read in one batch');

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.confirm = () => true;
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
if (selectValue) Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { configurable: true, get() { return selectValue.get.call(this); },
  set(v) { const want = String(v); [...this.options].forEach((o) => { if (o.getAttribute('value') === want || o.value === want) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } });

const { homePage } = await import('../js/pages/crm-home.js');
const { dashboardsPage } = await import('../js/pages/crm-dashboards.js');
const { toText } = await import('../js/ui.js');

function boot(userId = 'u-admin') {
  resetHomeChartsProbe();
  const session = mem();
  globalThis.sessionStorage = session;
  window.sessionStorage = session;
  const api = createMockAdapter({ storage: mem(), sessionStorage: session, features: { crm: true } });
  return { session, api, ready: api.signInDev(userId) };
}

const admin = boot();
await admin.ready;
const me = await admin.api.crmMe();
const cfg = await admin.api.getCrmSettings();
const chartCalls = [];
const origList = admin.api.listCrmHomeCharts.bind(admin.api);
admin.api.listCrmHomeCharts = async (opts) => { chartCalls.push(opts || null); return origList(opts); };
const host = document.getElementById('app');
const first = await homePage({ api: admin.api, me, params: {}, cfg, refresh() {}, assignees: [] });
ok(chartCalls.length === 0, 'opening Home does not ask for charts before the page is drawn');
host.innerHTML = toText(first.body);
first.mount(host);
await first.chartsReady();
ok(chartCalls.length === 1 && !host.querySelector('[data-home-charts]'), 'a person with no charts gets one read after the page is up, and Home looks the same');
chartCalls.length = 0;
const second = await homePage({ api: admin.api, me, params: {}, cfg, refresh() {}, assignees: [] });
host.innerHTML = toText(second.body);
second.mount(host);
await second.chartsReady();
ok(chartCalls.length === 0 && admin.session.getItem('crm-home:chart-probe:' + me.id) === 'empty', 'Home does not ask again after it has seen that there are no charts');

admin.session.removeItem('crm-home:chart-probe:' + me.id);
await admin.api.addCrmHomeChart('dc-l1');
await admin.api.addCrmHomeChart('dc-l2');
let dup = ''; try { await admin.api.addCrmHomeChart('dc-l1'); } catch (e) { dup = e.message; }
ok(dup === 'That chart is already on your Home.', 'adding the same chart again explains that it is already on Home');
const named = await admin.api.listCrmHomeCharts();
ok(named.charts.map((c) => c.id).join() === 'dc-l1,dc-l2' && named.charts[0].name === 'Leads by Lead Source' && named.charts[0].sourceName === 'Leads by Lead Source', 'Home shows the charts in the order they were added, under the dashboard name');
await admin.api.renameCrmHomeChart('dc-l1', 'My leads');
const dash = await admin.api.getCrmDashboard('dash-leads');
ok(dash.list.find((c) => c.id === 'dc-l1').name === 'Leads by Lead Source', 'renaming on Home does not rename the dashboard chart');
const renamed = await admin.api.listCrmHomeCharts();
ok(renamed.charts[0].name === 'My leads' && renamed.charts[0].homeTitle === 'My leads', 'Home uses the name that belongs only to Home');
let kept = true; try { await admin.api.renameCrmHomeChart('dc-l1', 'x'.repeat(101)); kept = false; } catch { /* expected */ }
ok(kept && (await admin.api.listCrmHomeCharts()).charts[0].homeTitle === 'My leads', 'a too-long name is refused and the Home name stays');
await admin.api.renameCrmHomeChart('dc-l1', '');
ok((await admin.api.listCrmHomeCharts()).charts[0].name === 'Leads by Lead Source', 'clearing the Home name shows the dashboard name again');
await admin.api.reorderCrmHomeCharts(['dc-l2', 'dc-l1']);
ok((await admin.api.listCrmHomeCharts()).charts.map((c) => c.id).join() === 'dc-l2,dc-l1', 'drag order is saved as the Home order');
const beforeRemove = dash.list.map((c) => c.id);
await admin.api.removeCrmHomeChart('dc-l2');
const after = await admin.api.getCrmDashboard('dash-leads');
ok(after.list.map((c) => c.id).join() === beforeRemove.join() && !(await admin.api.listCrmHomeCharts()).charts.some((c) => c.id === 'dc-l2'), 'Remove takes the chart off Home and leaves it on the dashboard');

const proc = boot('u-proc');
await proc.ready;
const procList = await proc.api.listCrmHomeCharts();
ok(procList.charts.length === 0 && (await admin.api.listCrmHomeCharts()).charts.some((c) => c.id === 'dc-l1'), 'Home charts belong to the person who added them');

resetHomeChartsProbe();
admin.session.removeItem('crm-home:chart-probe:' + me.id);
let refreshed = 0;
const shown = await homePage({ api: admin.api, me, params: {}, cfg, refresh() { refreshed += 1; }, assignees: [] });
host.innerHTML = toText(shown.body);
shown.mount(host);
await shown.chartsReady();
const card = host.querySelector('[data-home-chart="dc-l1"]');
ok(!!card && card.querySelector('[data-home-refresh]') && card.querySelector('[data-home-rename]') && card.querySelector('[data-home-remove]') && card.querySelector('[data-drag-handle]') && !card.querySelector('[data-resize]'), 'the Home card shows Refresh, Rename, Remove, and a drag handle');
card.querySelector('[data-home-rename]').click();
const form = document.querySelector('[data-home-rename-form]');
ok(!!form, 'Rename opens a name field and keeps it until Save works');
const nameInput = form.querySelector('input[name="homeName"]');
nameInput.value = 'Desk chart';
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((r) => setTimeout(r, 0));
ok(refreshed === 1 && (await admin.api.listCrmHomeCharts()).charts.find((c) => c.id === 'dc-l1').homeTitle === 'Desk chart' && (await admin.api.getCrmDashboard('dash-leads')).list.find((c) => c.id === 'dc-l1').name === 'Leads by Lead Source', 'saving the Home name leaves the dashboard chart alone');
host.querySelector('[data-home-remove="dc-l1"]').click();
await new Promise((r) => setTimeout(r, 0));
ok(!host.querySelector('[data-home-chart]') && (await admin.api.getCrmDashboard('dash-leads')).list.some((c) => c.id === 'dc-l1'), 'Remove on the card takes only the Home copy off');

const dashView = await dashboardsPage({ api: admin.api, params: { id: 'dash-leads' }, me, refresh() {}, owners: [] });
host.innerHTML = toText(dashView.body);
dashView.mount(host);
const addBtn = host.querySelector('[data-add-home="dc-l1"]');
ok(!!addBtn && host.querySelectorAll('[data-add-home]').length === dash.list.length, 'each chart on the dashboard has Add to Home');
addBtn.click();
await new Promise((r) => setTimeout(r, 20));
ok((await admin.api.listCrmHomeCharts()).charts.some((c) => c.id === 'dc-l1'), 'Add to Home puts that chart on this person\'s Home');

resetHomeChartsProbe();
const quiet = boot();
await quiet.ready;
const quietMe = await quiet.api.crmMe();
quiet.api.listCrmHomeCharts = async () => ({ available: false, charts: [] });
const hidden = await dashboardsPage({ api: quiet.api, params: { id: 'dash-leads' }, me: quietMe, refresh() {}, owners: [] });
host.innerHTML = toText(hidden.body);
ok(!host.querySelector('[data-add-home]'), 'Add to Home is hidden when the Home chart table is not there yet');
resetHomeChartsProbe();

function hostedClient(pins, { missing = false } = {}) {
  const calls = [];
  const from = (table) => {
    const q = { table, filters: [], op: 'select', ids: null };
    const run = (mode) => {
      calls.push({ table: q.table, op: q.op, filters: q.filters.map((pair) => pair.slice()), ids: q.ids });
      if (missing && table === 'crm_home_charts') return Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.crm_home_charts' in the schema cache" } });
      let data = table === 'crm_home_charts' ? pins.filter((row) => q.filters.every(([k, v]) => row[k] === v)) : [];
      if (q.ids) data = data.filter((row) => q.ids.includes(row.id || row.component_id));
      if (mode === 'maybe') return Promise.resolve({ data: data[0] || null, error: null });
      return Promise.resolve({ data, error: null });
    };
    const api = {
      select() { return api; }, eq(k, v) { q.filters.push([k, v]); return api; }, order() { return api; },
      in(k, ids) { q.ids = ids; q.filters.push([k, ids]); return api; },
      insert(row) { q.op = 'insert'; calls.push({ table, op: 'insert', row }); return Promise.resolve({ data: null, error: null }); },
      update(row) { q.op = 'update'; q.row = row; return api; },
      delete() { q.op = 'delete'; return api; },
      upsert(rows) { q.op = 'upsert'; calls.push({ table, op: 'upsert', rows }); return Promise.resolve({ data: null, error: null }); },
      maybeSingle() { return run('maybe'); },
      then(res, rej) { return run('many').then(res, rej); },
    };
    return api;
  };
  const sb = { from, rpc: async (name) => { calls.push({ rpc: name }); return { data: null, error: null }; } };
  const okFn = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
  const api = crmSupabase({ sb, ok: okFn, camel, me: async () => ({ id: 'user-a', role: 'Admin', isAdmin: true, email: 'a@example.com' }), flags: { crm: true } });
  return { api, calls };
}

const emptyHosted = hostedClient([]);
const emptyPack = await emptyHosted.api.listCrmHomeCharts();
const emptyReads = emptyHosted.calls.filter((c) => c.table);
ok(emptyPack.available === true && emptyPack.charts.length === 0 && emptyReads.length === 1 && emptyReads[0].table === 'crm_home_charts' && !emptyHosted.calls.some((c) => c.table === 'crm_dash_components'), 'no pinned charts means one pin read and no chart read');
const pinned = hostedClient([
  { user_id: 'user-a', component_id: 'dc-1', title: '', position: 0 },
  { user_id: 'user-a', component_id: 'dc-2', title: 'Mine', position: 1 },
]);
await pinned.api.listCrmHomeCharts();
const compReads = pinned.calls.filter((c) => c.table === 'crm_dash_components');
ok(compReads.length === 1 && Array.isArray(compReads[0].ids) && compReads[0].ids.join() === 'dc-1,dc-2', 'two Home charts are loaded with one component read');
const missingHosted = hostedClient([], { missing: true });
const missingPack = await missingHosted.api.listCrmHomeCharts();
ok(missingPack.available === false && missingPack.charts.length === 0, 'a missing table reports that Add to Home is not available');

console.log(fail ? fail + ' failed' : 'crm home charts passed');
if (fail) process.exit(1);
