/* CRM Feedback 31 item 2. Janine, Nov 18 2026: Clone copies every chart.
 * Fake data only. The hosted copy is one insert of the chart rows. No network and no database. */
import { readFileSync } from 'node:fs';
import { crmSurfaceSupabase } from '../js/data/supabase-crm-surface.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const JANINE = '00000000-0000-4000-8000-0000000000aa';
const SRC = '00000000-0000-4000-8000-0000000000bb';
const tables = { crm_dashboards: new Map(), crm_dash_components: new Map() };
const calls = [];
let reads = 0;
tables.crm_dashboards.set(SRC, {
  id: SRC, name: 'Lead dashboard', description: 'Built in', owner_id: null, visibility: 'all',
  share: { users: [], roles: [], departments: [] }, locked: true, builtin: true, created_by: null, retired_at: null,
  filters: { ownerId: 'owner-a', period: 'prev_year' },
});
const chart = {
  id: '00000000-0000-4000-8000-0000000000c1', dashboard_id: SRC, name: 'Deals by stage', type: 'chart', module: 'deals',
  chart_type: 'stacked', measure: { fn: 'sum', field: 'amount' },
  grouping: { field: 'closingDate', bucket: 'month', grouping2: { field: 'stage', bucket: 'month' } },
  criteria: [{ field: 'stage', op: 'is', value: 'Active' }], target: null, width: 3, height: 2, position: 2, retired_at: null,
};
const meter = {
  id: '00000000-0000-4000-8000-0000000000c2', dashboard_id: SRC, name: 'Closed this year', type: 'target', module: 'deals',
  chart_type: null, measure: { fn: 'count' }, grouping: {}, criteria: [{ field: 'closingDate', op: 'is', value: 'this_year' }],
  target: 50, width: 1, height: 1, position: 1, retired_at: null,
};
const hidden = {
  id: '00000000-0000-4000-8000-0000000000c3', dashboard_id: SRC, name: 'Retired chart', type: 'kpi', module: 'deals',
  chart_type: null, measure: { fn: 'count' }, grouping: {}, criteria: [], target: null, width: 1, height: 1, position: 3, retired_at: '2026-11-01T00:00:00Z',
};
tables.crm_dash_components.set(chart.id, chart);
tables.crm_dash_components.set(meter.id, meter);
tables.crm_dash_components.set(hidden.id, hidden);
const sourceBefore = JSON.parse(JSON.stringify({ dash: tables.crm_dashboards.get(SRC), charts: [chart, meter, hidden] }));

function from(table) {
  const q = { table, op: 'select', payload: null, filters: [], returning: false, order: '' };
  const exec = (mode) => {
    calls.push({ table: q.table, op: q.op, returning: q.returning, payload: q.payload, filters: q.filters.map((pair) => pair.slice()) });
    const bag = tables[q.table];
    if (!bag) return Promise.resolve({ data: null, error: { message: 'unknown table ' + q.table } });
    if (q.op === 'insert' && q.returning) return Promise.resolve({ data: null, error: { message: 'insert must not read the new row back' } });
    if (q.op === 'insert') {
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      list.forEach((row, i) => bag.set(row.id || q.table + ':' + bag.size + ':' + i, { ...row }));
      return Promise.resolve({ data: null, error: null });
    }
    if (q.op === 'update') return Promise.resolve({ data: null, error: { message: 'clone must not change the original' } });
    let data = [...bag.values()].filter((row) => q.filters.every(([k, v]) => row[k] === v));
    if (q.order) data.sort((a, b) => (Number(a[q.order]) || 0) - (Number(b[q.order]) || 0));
    if (mode === 'many') return Promise.resolve({ data, error: null });
    const row = data[0] || null;
    if (mode === 'maybe') return Promise.resolve({ data: row ? { ...row } : null, error: null });
    if (!row) return Promise.resolve({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } });
    return Promise.resolve({ data: { ...row }, error: null });
  };
  const api = {
    insert(row) { q.op = 'insert'; q.payload = row; return api; },
    update(row) { q.op = 'update'; q.payload = row; return api; },
    select() { if (q.op === 'insert' || q.op === 'update') q.returning = true; else q.op = 'select'; return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    order(col) { q.order = col; return api; },
    is() { return api; },
    single() { return exec('single'); },
    maybeSingle() { return exec('maybe'); },
    then(resolve, reject) { return exec('many').then(resolve, reject); },
  };
  return api;
}

const bump = () => { reads += 1; return Promise.resolve([]); };
const self = { getCrmSettings: async () => ({ picklists: {}, fields: [] }), listCrmLeads: bump, listCrmContacts: bump, listCrmAccounts: bump, listCrmDeals: bump, listCrmOpportunities: bump, listCrmTasks: bump, listCrmAssignees: bump };
const me = async () => ({ id: JANINE, role: 'Super admin', isAdmin: true, email: 'janine@example.test', firstName: 'Janine', lastName: 'Admin' });
const surface = crmSurfaceSupabase({ sb: { from }, ok: pass, camel, me, on() {}, self });

let blank = '';
try { await surface.cloneCrmDashboard(SRC, { name: '   ' }); } catch (e) { blank = e.message; }
ok(blank === 'Dashboard Name is required.' && calls.length === 0, 'a blank copy name is refused before any request');

calls.length = 0;
reads = 0;
const started = performance.now();
const copy = await surface.cloneCrmDashboard(SRC);
const elapsed = performance.now() - started;
const inserts = calls.filter((c) => c.op === 'insert');
const dashInsert = inserts.find((c) => c.table === 'crm_dashboards');
const chartInsert = inserts.find((c) => c.table === 'crm_dash_components');
ok(copy.name === 'Lead dashboard (copy)' && copy.id !== SRC && copy.visibility === 'me' && copy.builtin !== true, 'the copy is named "<name> (copy)", Only me, and is not the original');
ok(same(copy.filters, { ownerId: 'owner-a', period: 'prev_year' }) && dashInsert && same(dashInsert.payload.filters, { ownerId: 'owner-a', period: 'prev_year' }) && dashInsert.payload.filters !== tables.crm_dashboards.get(SRC).filters, 'the copy keeps the dashboard filters and does not reuse the original object');
ok(inserts.length === 2 && dashInsert.returning === false && chartInsert && chartInsert.returning === false && Array.isArray(chartInsert.payload) && chartInsert.payload.length === 2, 'charts go in one insert, and neither insert reads the new rows back');
ok(calls.filter((c) => c.op === 'update').length === 0 && reads === 0 && elapsed < 50, 'clone does not change a row, does not load records, and stays fast (' + elapsed.toFixed(2) + ' ms)');
const copied = chartInsert.payload.slice().sort((a, b) => a.position - b.position);
ok(copied.map((c) => c.name).join('|') === 'Closed this year|Deals by stage' && copied.every((c) => c.dashboard_id === copy.id && c.created_by === JANINE && !c.id), 'both visible charts are stored on the new dashboard, in order, with new ids');
ok(copied[0].type === 'target' && copied[0].chart_type === null && copied[0].target === 50 && copied[0].width === 1 && copied[0].height === 1 && copied[0].position === 1 && same(copied[0].criteria, meter.criteria) && same(copied[0].measure, meter.measure), 'the target keeps its settings, filter, order, and layout');
ok(copied[1].type === 'chart' && copied[1].module === 'deals' && copied[1].chart_type === 'stacked' && copied[1].width === 3 && copied[1].height === 2 && copied[1].position === 2 && copied[1].grouping.grouping2.field === 'stage' && same(copied[1].criteria, chart.criteria) && same(copied[1].measure, chart.measure), 'the stacked chart keeps its second grouping, filter, width, and height');
ok(!chartInsert.payload.some((c) => c.name === 'Retired chart'), 'a retired chart is not copied');
chartInsert.payload[1].grouping.field = 'changed';
chartInsert.payload[1].criteria[0].value = 'changed';
ok(chart.grouping.field === 'closingDate' && chart.criteria[0].value === 'Active' && tables.crm_dashboards.get(SRC).name === 'Lead dashboard' && same(tables.crm_dashboards.get(SRC).filters, sourceBefore.dash.filters), 'the original dashboard and its charts stay unchanged');

calls.length = 0;
const manyId = '00000000-0000-4000-8000-0000000000d1';
tables.crm_dashboards.set(manyId, { id: manyId, name: 'N'.repeat(100), description: '', owner_id: JANINE, visibility: 'me', share: {}, locked: false, builtin: false, created_by: JANINE, retired_at: null, filters: {} });
for (let i = 0; i < 30; i += 1) {
  const id = '00000000-0000-4000-8000-0000000001' + String(i).padStart(2, '0');
  tables.crm_dash_components.set(id, { id, dashboard_id: manyId, name: 'Chart ' + i, type: 'kpi', module: 'contacts', chart_type: null, measure: { fn: 'count' }, grouping: {}, criteria: [], target: null, width: 1, height: 1, position: i, retired_at: null });
}
reads = 0;
const manyStarted = performance.now();
const many = await surface.cloneCrmDashboard(manyId);
const manyMs = performance.now() - manyStarted;
const manyCharts = calls.filter((c) => c.op === 'insert' && c.table === 'crm_dash_components');
ok(many.name === 'N'.repeat(93) + ' (copy)' && many.name.length === 100 && manyCharts.length === 1 && manyCharts[0].payload.length === 30 && reads === 0 && manyMs < 50, 'a full dashboard copies 30 charts in one insert (' + manyMs.toFixed(2) + ' ms)');

calls.length = 0;
const emptyId = '00000000-0000-4000-8000-0000000000e1';
tables.crm_dashboards.set(emptyId, { id: emptyId, name: 'Empty', description: '', owner_id: JANINE, visibility: 'me', share: {}, locked: false, builtin: false, created_by: JANINE, retired_at: null });
const empty = await surface.cloneCrmDashboard(emptyId);
ok(empty.name === 'Empty (copy)' && calls.filter((c) => c.op === 'insert' && c.table === 'crm_dash_components').length === 0, 'a dashboard with no charts does not insert a chart row');

let missing = '';
try { await surface.cloneCrmDashboard('00000000-0000-4000-8000-0000000000ff'); } catch (e) { missing = e.message; }
ok(missing === 'Dashboard not found.', 'an unknown dashboard is refused');

const page = read('js/pages/crm-dashboards.js');
ok(page.includes('dashboardCopyName(dash.name)') && page.includes("const suffix = ' (copy)'") && !page.includes('Copy of ${dash.name}'), 'Clone suggests "<name> (copy)"');
const hosted = read('js/data/supabase-crm-surface.js');
const fn = hosted.slice(hosted.indexOf('async cloneCrmDashboard'), hosted.indexOf('async retireCrmDashboard'));
ok(!fn.includes('getCrmDashboard') && fn.split('.insert(').length === 2, 'clone reads the saved charts and writes them with one insert');

const mockApi = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await mockApi.signInDev('u-admin');
const made = await mockApi.createCrmDashboard({ name: 'Pipeline', visibility: 'me' });
const addedChart = await mockApi.addCrmComponent(made.id, { name: 'Amount by month', type: 'chart', width: 3, config: { module: 'deals', measure: { fn: 'sum', field: 'amount' }, grouping: { field: 'closingDate', bucket: 'month' }, grouping2: { field: 'stage' }, criteria: [{ field: 'stage', op: 'is', value: 'Active' }], chartType: 'stacked' } });
const addedKpi = await mockApi.addCrmComponent(made.id, { name: 'Open deals', type: 'kpi', width: 1, config: { module: 'deals', measure: { fn: 'count' }, criteria: [{ field: 'stage', op: 'is', value: 'Active' }] } });
const addedHidden = await mockApi.addCrmComponent(made.id, { name: 'Hidden', type: 'kpi', config: { module: 'deals', measure: { fn: 'count' }, criteria: [] } });
await mockApi.reorderCrmDashboard(made.id, [{ id: addedKpi.id, width: 1, height: 's' }, { id: addedChart.id, width: 3, height: 'l' }, { id: addedHidden.id, width: 2, height: 'm' }]);
await mockApi.retireCrmComponent(addedHidden.id, true);
await mockApi.updateCrmDashboard(made.id, { filters: { period: 'prev_year' } });
const before = await mockApi.getCrmDashboard(made.id);
const beforeJson = JSON.stringify(before.list.map((c) => ({ id: c.id, name: c.name, type: c.type, width: c.width, height: c.height, position: c.position, config: c.config })));
const demo = await mockApi.cloneCrmDashboard(made.id);
const demoDash = await mockApi.getCrmDashboard(demo.id);
const after = await mockApi.getCrmDashboard(made.id);
ok(demo.name === 'Pipeline (copy)' && demo.visibility === 'me' && demo.filters.period === 'prev_year' && demo.id !== made.id, 'the demo copy uses "<name> (copy)" and keeps the period filter');
ok(demoDash.list.length === 2 && demoDash.list.map((c) => c.name).join('|') === 'Open deals|Amount by month' && demoDash.list.every((c) => !before.list.some((b) => b.id === c.id)), 'the demo copy has the same charts, in order, with new ids');
ok(demoDash.list[0].height === 's' && demoDash.list[0].width === 1 && demoDash.list[1].width === 3 && demoDash.list[1].height === 'l' && demoDash.list[1].config.grouping2.field === 'stage' && same(demoDash.list[1].config.criteria, [{ field: 'stage', op: 'is', value: 'Active' }]), 'the demo copy keeps layout, second grouping, and the chart filter');
ok(!demoDash.list.some((c) => c.name === 'Hidden') && !demoDash.retiredComponents.some((c) => c.name === 'Hidden'), 'the demo copy leaves the retired chart behind');
ok(JSON.stringify(after.list.map((c) => ({ id: c.id, name: c.name, type: c.type, width: c.width, height: c.height, position: c.position, config: c.config }))) === beforeJson && after.name === 'Pipeline', 'the original demo dashboard is unchanged');
let demoBlank = '';
const countBefore = (await mockApi.listCrmDashboards({ includeRetired: true })).length;
try { await mockApi.cloneCrmDashboard(made.id, { name: '  ' }); } catch (e) { demoBlank = e.message; }
ok(demoBlank === 'Dashboard Name is required.' && (await mockApi.listCrmDashboards({ includeRetired: true })).length === countBefore, 'a blank demo copy name adds no dashboard');
const long = await mockApi.createCrmDashboard({ name: 'M'.repeat(100), visibility: 'me' });
const longCopy = await mockApi.cloneCrmDashboard(long.id);
ok(longCopy.name.length === 100 && longCopy.name.endsWith(' (copy)'), 'a 100-character demo name still ends with (copy)');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.location = { hash: '#/crm/dashboards/' + made.id };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { dashboardsPage } = await import('../js/pages/crm-dashboards.js');
const view = await dashboardsPage({ api: mockApi, params: { id: made.id }, me: { canEdit: true, isAdmin: true, canConfigure: true, id: 'u-admin' }, refresh() {}, owners: [] });
const host = document.getElementById('app');
host.innerHTML = String(view.body);
view.mount(host);
const cloneBtn = host.querySelector('[data-dash-action="clone"]');
let suggested = '';
globalThis.prompt = (_label, value) => { suggested = value; return null; };
cloneBtn.click();
await new Promise((resolve) => setTimeout(resolve, 0));
ok(!!cloneBtn && suggested === 'Pipeline (copy)' && globalThis.location.hash === '#/crm/dashboards/' + made.id, 'the Clone button suggests Pipeline (copy) and Cancel leaves the dashboard');
const beforeBlank = (await mockApi.listCrmDashboards({ includeRetired: true })).length;
globalThis.prompt = () => '   ';
cloneBtn.click();
await new Promise((resolve) => setTimeout(resolve, 0));
const toast = document.querySelector('#toasts .toast.err');
ok(toast && toast.textContent.includes('Dashboard Name is required.') && (await mockApi.listCrmDashboards({ includeRetired: true })).length === beforeBlank, 'a blank name on the screen says what to fill in and saves nothing');

console.log(fail ? fail + ' failed' : 'crm dashboard clone passed');
if (fail) process.exit(1);
