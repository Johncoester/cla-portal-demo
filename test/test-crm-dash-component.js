/* CRM dashboard chart save (BUG-184). Fake client only. No network and no hosted database.
 * Quick Chart sends { name, type, config: { module, measure, grouping, criteria, chartType } }.
 * crm_dash_components.module is not null, the name check allows at most 100 characters,
 * and the height check allows 1 or 2. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crmSurfaceSupabase } from '../js/data/supabase-crm-surface.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const copy = (o) => structuredClone(o);

const JANINE = '00000000-0000-4000-8000-0000000000aa';
const DASH = '00000000-0000-4000-8000-0000000000d1';
const tables = {
  crm_dashboards: new Map([[DASH, { id: DASH, name: 'Janine', description: '', owner_id: JANINE, visibility: 'me', share: { users: [], roles: [], departments: [] }, locked: false, builtin: false, created_by: JANINE, retired_at: null }]]),
  crm_dash_components: new Map(),
};
const calls = [];
let seq = 1;
const lists = { contacts: 0, leads: 0 };
const CHARTS = new Set(['column', 'bar', 'stacked', 'pie', 'doughnut', 'table', 'line', 'area']);
const TYPES = new Set(['chart', 'kpi', 'target', 'funnel']);
const MODULES = new Set(['contacts', 'leads', 'accounts', 'deals', 'tasks', 'meetings', 'calls', 'opportunities']);
function componentError(row) {
  if (row.type != null && !TYPES.has(row.type)) return 'type check';
  if (row.type === 'chart' && !CHARTS.has(row.chart_type)) return 'a chart needs a chart type';
  if (row.type && row.type !== 'chart' && row.chart_type != null) return 'a non-chart sends a null chart type';
  if (row.chart_type != null && !CHARTS.has(row.chart_type)) return 'chart type check';
  if (row.module != null && !MODULES.has(row.module)) return 'module check';
  if (row.measure != null) {
    if (typeof row.measure !== 'object' || !['count', 'sum', 'avg'].includes(row.measure.fn)) return 'measure check';
    if (Object.prototype.hasOwnProperty.call(row.measure, 'target')) return 'target belongs in its column';
  }
  if (row.target != null && !(typeof row.target === 'number' && isFinite(row.target) && row.target >= 0)) return 'target check';
  if (row.criteria != null && (!Array.isArray(row.criteria) || row.criteria.length > 10)) return 'criteria check';
  if (row.width != null && ![1, 2, 3].includes(row.width)) return 'width check';
  if (row.grouping != null && (typeof row.grouping !== 'object' || Array.isArray(row.grouping))) return 'grouping check';
  if (row.name != null && (String(row.name).trim().length < 1 || String(row.name).length > 100 || /[\u0000-\u001f\u007f]/.test(String(row.name)))) return 'name check';
  if (row.height != null && row.height !== 1 && row.height !== 2) return 'height check';
  return '';
}

function from(table) {
  const q = { table, op: 'select', payload: null, filters: [], returning: false };
  const bag = () => tables[table] || new Map();
  const exec = (mode) => {
    calls.push({ table: q.table, op: q.op, returning: q.returning, payload: q.payload == null ? null : copy(q.payload), filters: q.filters.map((pair) => pair.slice()) });
    if (q.op === 'insert') {
      const row = { id: q.payload.id || `dc-${seq++}`, ...q.payload };
      if (table === 'crm_dash_components') {
        if (row.module == null || row.module === '') return Promise.resolve({ data: null, error: { message: 'null value in column "module" of relation "crm_dash_components" violates not-null constraint' } });
        const why = componentError(row);
        if (why) return Promise.resolve({ data: null, error: { message: why } });
      }
      bag().set(row.id, row);
      tables[table] = bag();
      return Promise.resolve({ data: q.returning ? copy(row) : null, error: null });
    }
    if (q.op === 'update') {
      const rows = [...bag().values()].filter((row) => q.filters.every(([k, v]) => row[k] === v));
      if (!rows.length) return Promise.resolve({ data: null, error: { message: 'missing' } });
      if (q.payload && table === 'crm_dash_components') {
        if (Object.prototype.hasOwnProperty.call(q.payload, 'module') && (q.payload.module == null || q.payload.module === '')) return Promise.resolve({ data: null, error: { message: 'null value in column "module" of relation "crm_dash_components" violates not-null constraint' } });
        const why = componentError(q.payload);
        if (why) return Promise.resolve({ data: null, error: { message: why } });
      }
      rows.forEach((row) => Object.assign(row, q.payload));
      return Promise.resolve({ data: q.returning ? copy(rows[0]) : null, error: null });
    }
    let data = [...bag().values()].filter((row) => q.filters.every(([k, v]) => row[k] === v));
    if (mode === 'many') return Promise.resolve({ data: data.map(copy), error: null });
    const row = data[0] || null;
    if (mode === 'maybe') return Promise.resolve({ data: row ? copy(row) : null, error: null });
    if (!row) return Promise.resolve({ data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } });
    return Promise.resolve({ data: copy(row), error: null });
  };
  const api = {
    insert(row) { q.op = 'insert'; q.payload = row; return api; },
    update(row) { q.op = 'update'; q.payload = row; return api; },
    select() { if (q.op === 'insert' || q.op === 'update') q.returning = true; else q.op = 'select'; return api; },
    eq(k, v) { q.filters.push([k, v]); return api; },
    order() { return api; },
    is() { return api; },
    single() { return exec('single'); },
    maybeSingle() { return exec('maybe'); },
    then(resolve, reject) { return exec('many').then(resolve, reject); },
  };
  return api;
}

const contacts = [
  { id: 'c1', relationshipStatus: 'Prospecting', ownerId: 'owner-a', createdAt: '2026-11-01T12:00:00' },
  { id: 'c2', relationshipStatus: 'Potential/Warm', ownerId: 'owner-b', createdAt: '2026-11-02T12:00:00' },
];
const leads = [
  { id: 'l1', relationshipStatus: 'Prospecting', createdAt: '2026-11-01T12:00:00' },
  { id: 'l2', relationshipStatus: 'Hot Prospect', createdAt: '2026-11-01T18:00:00' },
  { id: 'l3', relationshipStatus: 'Prospecting', createdAt: '2026-11-03T12:00:00' },
];
const me = async () => ({ id: JANINE, role: 'Super admin', isAdmin: true, email: 'janine@example.test', firstName: 'Janine', lastName: 'Santos' });
const surface = crmSurfaceSupabase({
  sb: { from }, ok: pass, camel, me, on() {},
  self: {
    getCrmSettings: async () => ({ picklists: {}, fields: [] }),
    listCrmContacts: async () => { lists.contacts += 1; return contacts; },
    listCrmLeads: async () => { lists.leads += 1; return leads; },
  },
});

const chart = (module, grouping) => ({ name: module === 'contacts' ? 'Client by Status' : 'Leads by day', type: 'chart', config: { module, measure: { fn: 'count' }, grouping, criteria: [], chartType: 'column' } });
const inserts = () => calls.filter((c) => c.op === 'insert' && c.table === 'crm_dash_components');
const updates = () => calls.filter((c) => c.op === 'update' && c.table === 'crm_dash_components');

let missing = '';
try { await surface.addCrmComponent(DASH, { name: 'Client by Status', type: 'chart', config: { measure: { fn: 'count' }, grouping: { field: 'relationshipStatus', bucket: 'day' }, criteria: [], chartType: 'column' } }); } catch (e) { missing = e.message; }
ok(missing === 'Pick a module.' && inserts().length === 0, 'a chart with no module is refused before insert');
calls.length = 0;
let absent = '';
try { await surface.addCrmComponent(DASH, { name: 'Client by Status', type: 'chart' }); } catch (e) { absent = e.message; }
ok(absent === 'Pick a module.' && inserts().length === 0, 'a chart payload without config.module is refused before insert');

calls.length = 0;
const byStatus = await surface.addCrmComponent(DASH, chart('contacts', { field: 'relationshipStatus', bucket: 'day' }));
const statusInsert = inserts()[0];
ok(!!statusInsert && statusInsert.payload.module === 'contacts' && statusInsert.payload.grouping.field === 'relationshipStatus' && statusInsert.payload.grouping.bucket === 'day', 'the clients insert stores module contacts and the Relationship Status grouping');
ok(statusInsert.payload.chart_type === 'column' && statusInsert.payload.target === null && statusInsert.payload.measure.fn === 'count' && statusInsert.payload.measure.target == null && Array.isArray(statusInsert.payload.criteria) && statusInsert.payload.criteria.length === 0 && statusInsert.payload.name === 'Client by Status' && statusInsert.payload.height === 1, 'the clients insert keeps column, a null target column, record count, no filters, and a height inside 1-2');
ok(byStatus.config.module === 'contacts' && byStatus.config.grouping.field === 'relationshipStatus' && byStatus.config.chartType === 'column' && byStatus.config.measure.fn === 'count', 'adding the clients chart returns the full config');

calls.length = 0;
const byDay = await surface.addCrmComponent(DASH, chart('leads', { field: 'createdAt', bucket: 'day' }));
const dayInsert = inserts()[0];
ok(!!dayInsert && dayInsert.payload.module === 'leads' && dayInsert.payload.grouping.field === 'createdAt' && dayInsert.payload.grouping.bucket === 'day', 'the leads insert stores module leads and Created Time by day');
ok(byDay.config.module === 'leads' && byDay.config.grouping.field === 'createdAt' && byDay.config.grouping.bucket === 'day', 'adding the leads chart returns that grouping');

calls.length = 0;
const longName = 'N'.repeat(120);
const named = await surface.addCrmComponent(DASH, { ...chart('contacts', { field: 'relationshipStatus', bucket: 'day' }), name: longName });
ok(inserts()[0].payload.name.length === 100 && named.name.length === 100 && named.config.module === 'contacts', 'a component name longer than the check is stored at 100 characters');

calls.length = 0;
const tall = await surface.addCrmComponent(DASH, { ...chart('contacts', { field: 'ownerId' }), height: 'l', name: 'Tall chart' });
ok(inserts()[0].payload.height === 2 && tall.height === 'm' && inserts()[0].payload.module === 'contacts', 'tall height is stored as 2, which the height check allows');

const loaded = await surface.getCrmDashboard(DASH);
const statusCard = loaded.list.find((c) => c.id === byStatus.id);
const dayCard = loaded.list.find((c) => c.id === byDay.id);
ok(!!statusCard && statusCard.config.module === 'contacts' && statusCard.config.grouping.field === 'relationshipStatus' && statusCard.config.grouping.bucket === 'day' && statusCard.config.chartType === 'column' && statusCard.config.measure.fn === 'count' && statusCard.config.criteria.length === 0, 'opening the dashboard keeps the clients chart config for Edit');
ok(!!dayCard && dayCard.config.module === 'leads' && dayCard.config.grouping.field === 'createdAt' && dayCard.config.grouping.bucket === 'day', 'opening the dashboard keeps the leads Created Time grouping for Edit');

calls.length = 0;
const edited = await surface.updateCrmComponent(statusCard.id, { name: statusCard.name, type: statusCard.type, config: statusCard.config });
const edit = updates()[0];
ok(!!edit && edit.payload.module === 'contacts' && edit.payload.grouping.field === 'relationshipStatus' && edit.payload.grouping.bucket === 'day' && edit.payload.chart_type === 'column' && edit.payload.target === null && edit.payload.measure.fn === 'count' && edit.payload.measure.target == null, 'saving Edit writes the same module and grouping back');
ok(edited.config.module === 'contacts' && edited.config.grouping.field === 'relationshipStatus' && edited.config.chartType === 'column', 'Edit returns the config it saved');
const reloaded = await surface.getCrmDashboard(DASH);
const statusAgain = reloaded.list.find((c) => c.id === statusCard.id);
ok(statusAgain.config.module === statusCard.config.module && statusAgain.config.grouping.field === statusCard.config.grouping.field && statusAgain.config.grouping.bucket === statusCard.config.grouping.bucket && statusAgain.config.chartType === 'column', 'Edit round-trips the clients chart config');

calls.length = 0;
const editedDay = await surface.updateCrmComponent(dayCard.id, { name: dayCard.name, type: dayCard.type, config: dayCard.config });
ok(updates()[0].payload.module === 'leads' && updates()[0].payload.grouping.field === 'createdAt' && updates()[0].payload.grouping.bucket === 'day' && editedDay.config.grouping.field === 'createdAt', 'Edit round-trips the leads Created Time grouping');

calls.length = 0;
let editMissing = '';
try { await surface.updateCrmComponent(statusCard.id, { name: 'Client by Status', type: 'chart', config: { measure: { fn: 'count' }, grouping: { field: 'relationshipStatus' }, criteria: [], chartType: 'column' } }); } catch (e) { editMissing = e.message; }
ok(editMissing === 'Pick a module.' && updates().length === 0, 'Edit with no module is refused before update');

calls.length = 0;
const renamed = await surface.updateCrmComponent(statusCard.id, { name: 'M'.repeat(140), type: 'chart', config: statusAgain.config });
ok(updates()[0].payload.name.length === 100 && renamed.name.length === 100 && updates()[0].payload.module === 'contacts', 'renaming a component also stops at 100 characters');

const beforeLists = lists.contacts;
const preview = await surface.previewCrmComponent(chart('contacts', { field: 'relationshipStatus', bucket: 'day' }));
ok(preview.config.module === 'contacts' && preview.config.grouping.field === 'relationshipStatus' && preview.data.groups.length === 2 && lists.contacts === beforeLists + 1 && inserts().length === 0, 'preview groups Clients by Relationship Status and does not insert');
const leadsBeforePreview = lists.leads;
const previewDay = await surface.previewCrmComponent(chart('leads', { field: 'createdAt', bucket: 'day' }));
ok(previewDay.config.module === 'leads' && previewDay.config.grouping.field === 'createdAt' && previewDay.config.grouping.bucket === 'day' && previewDay.data.groups.length === 2 && lists.leads === leadsBeforePreview + 1, 'preview groups Leads by Created Time by day');
let previewMissing = '';
const leadsAfter = lists.leads;
try { await surface.previewCrmComponent({ name: 'Preview', type: 'chart', config: { measure: { fn: 'count' }, grouping: { field: 'createdAt', bucket: 'day' }, criteria: [], chartType: 'column' } }); } catch (e) { previewMissing = e.message; }
ok(previewMissing === 'Pick a module.' && lists.leads === leadsAfter && lists.contacts === beforeLists + 1, 'preview with no module is refused before it reads records');

calls.length = 0;
const stacked = await surface.addCrmComponent(DASH, { name: 'Stacked', type: 'chart', config: { module: 'deals', measure: { fn: 'sum', field: 'amount' }, grouping: { field: 'closingDate', bucket: 'month' }, grouping2: { field: 'stage' }, criteria: [], chartType: 'stacked' } });
const target = await surface.addCrmComponent(DASH, { name: 'Target', type: 'target', config: { module: 'deals', measure: { fn: 'count' }, criteria: [], target: 50 } });
ok(inserts()[0].payload.module === 'deals' && inserts()[0].payload.chart_type === 'stacked' && inserts()[0].payload.target === null && inserts()[0].payload.measure.fn === 'sum' && inserts()[0].payload.measure.field === 'amount' && inserts()[0].payload.measure.target == null && inserts()[0].payload.grouping.grouping2.field === 'stage' && !Object.prototype.hasOwnProperty.call(inserts()[0].payload, 'grouping2') && stacked.config.grouping.field === 'closingDate' && stacked.config.grouping2.field === 'stage' && !stacked.config.grouping.grouping2, 'a stacked chart keeps its second grouping inside the grouping JSON');
ok(inserts()[1].payload.target === 50 && inserts()[1].payload.chart_type === null && inserts()[1].payload.type === 'target' && inserts()[1].payload.measure.target == null && inserts()[1].payload.measure.fn === 'count' && target.config.target === 50 && target.config.measure.fn === 'count' && target.config.measure.target == null && target.config.chartType == null, 'a target meter stores target in its column and sends a null chart type');
const stackedAgain = await surface.updateCrmComponent(stacked.id, { name: stacked.name, type: stacked.type, config: stacked.config });
ok(stackedAgain.config.grouping2.field === 'stage' && stackedAgain.config.grouping.field === 'closingDate' && stackedAgain.config.module === 'deals' && stackedAgain.config.chartType === 'stacked', 'Edit round-trips the stacked grouping');
calls.length = 0;
const targetAgain = await surface.updateCrmComponent(target.id, { name: target.name, type: target.type, config: target.config });
ok(updates()[0].payload.target === 50 && updates()[0].payload.chart_type === null && updates()[0].payload.measure.target == null && targetAgain.config.target === 50, 'Edit writes the target column again and leaves it out of measure');
calls.length = 0;
const kpi = await surface.addCrmComponent(DASH, { name: 'Open leads', type: 'kpi', config: { module: 'leads', measure: { fn: 'count' }, criteria: [] } });
const funnel = await surface.addCrmComponent(DASH, { name: 'Stages', type: 'funnel', config: { module: 'deals', measure: { fn: 'count' }, grouping: { field: 'stage' }, criteria: [] } });
ok(kpi.config.chartType == null && inserts()[0].payload.chart_type === null && inserts()[0].payload.target === null && funnel.config.chartType == null && inserts()[1].payload.chart_type === null, 'a KPI and a funnel send a null chart type');
const odd = await surface.addCrmComponent(DASH, { name: 'Odd chart', type: 'chart', config: { module: 'contacts', measure: { fn: 'count' }, grouping: { field: 'relationshipStatus' }, criteria: [], chartType: 'nope' } });
ok(inserts()[2].payload.chart_type === 'column' && odd.config.chartType === 'column', 'a chart with an unknown type is stored as column');
let badTarget = '';
try { await surface.addCrmComponent(DASH, { name: 'Bad target', type: 'target', config: { module: 'deals', measure: { fn: 'count' }, criteria: [], target: -1 } }); } catch (e) { badTarget = e.message; }
ok(badTarget === 'Enter the target (a number that is 0 or more).' && inserts().length === 3, 'a negative target is refused before insert');

calls.length = 0;
const cloned = await surface.cloneCrmComponent(byStatus.id);
const cloneInsert = inserts()[0];
ok(!!cloneInsert && cloneInsert.payload.module === 'contacts' && cloneInsert.payload.grouping.field === 'relationshipStatus' && cloned.config.module === 'contacts' && cloned.config.grouping.field === 'relationshipStatus', 'clone still stores the module and grouping from the saved row');

calls.length = 0;
await surface.reorderCrmDashboard(DASH, [{ id: tall.id, width: 1, height: 'l' }, { id: byStatus.id, width: 1, height: 's' }]);
const heights = updates().map((c) => c.payload.height);
ok(heights.includes(2) && heights.includes(1) && heights.every((h) => h === 1 || h === 2), 'reordering a tall chart stays inside the height check');

const FILTERED = '00000000-0000-4000-8000-0000000000d2';
tables.crm_dashboards.set(FILTERED, { id: FILTERED, name: 'Filtered', description: '', owner_id: JANINE, visibility: 'me', share: { users: [], roles: [], departments: [] }, locked: false, builtin: false, created_by: JANINE, retired_at: null, filters: { ownerId: 'owner-a' } });
const prospectChart = await surface.addCrmComponent(FILTERED, { name: 'Prospects', type: 'chart', config: { module: 'contacts', measure: { fn: 'count' }, grouping: { field: 'relationshipStatus' }, criteria: [{ field: 'relationshipStatus', op: 'is', value: 'Prospecting' }], chartType: 'column' } });
const prospectKpi = await surface.addCrmComponent(FILTERED, { name: 'Prospect KPI', type: 'kpi', config: { module: 'contacts', measure: { fn: 'count' }, criteria: [{ field: 'relationshipStatus', op: 'is', value: 'Prospecting' }] } });
const visibleKpi = await surface.addCrmComponent(FILTERED, { name: 'Visible', type: 'kpi', config: { module: 'contacts', measure: { fn: 'count' }, criteria: [] } });
const readsBefore = lists.contacts;
const queriesBefore = calls.length;
const filteredDash = await surface.getCrmDashboard(FILTERED);
const prospectCard = filteredDash.list.find((c) => c.id === prospectChart.id);
const prospectMeter = filteredDash.list.find((c) => c.id === prospectKpi.id);
const visibleMeter = filteredDash.list.find((c) => c.id === visibleKpi.id);
ok(prospectCard.data.groups.length === 1 && prospectCard.data.groups[0].label === 'Prospecting' && prospectCard.data.groups[0].value === 1, 'a component criterion keeps only the matching clients');
ok(prospectMeter.data.value === 1 && prospectMeter.data.count === 1, 'a KPI uses the same component criterion');
ok(visibleMeter.data.value === 1 && visibleMeter.data.count === 1, 'the dashboard owner filter drops the other owner');
ok(lists.contacts === readsBefore + 3 && calls.length === queriesBefore + 2, 'criteria and dashboard filters add no list read and no extra query');
tables.crm_dashboards.get(FILTERED).filters = { period: 'prev_year' };
const lastYear = await surface.getCrmDashboard(FILTERED);
ok(lastYear.list.find((c) => c.id === visibleKpi.id).data.value === 0, 'a dashboard period drops clients created outside that year');
tables.crm_dashboards.get(FILTERED).filters = {};
const openDash = await surface.getCrmDashboard(FILTERED);
ok(openDash.list.find((c) => c.id === visibleKpi.id).data.value === 2 && openDash.list.find((c) => c.id === prospectKpi.id).data.value === 1, 'with no dashboard filter the component criterion still applies');

const big = Array.from({ length: 4000 }, (_, i) => ({ id: 'b' + i, relationshipStatus: i % 2 ? 'Prospecting' : 'Potential/Warm', ownerId: i % 4 === 0 ? 'owner-b' : 'owner-a', createdAt: '2026-06-01T12:00:00' }));
const kept = contacts.splice(0, contacts.length, ...big);
tables.crm_dashboards.get(FILTERED).filters = { ownerId: 'owner-a' };
const tAfter = performance.now();
const timed = await surface.getCrmDashboard(FILTERED);
const afterMs = performance.now() - tAfter;
contacts.splice(0, contacts.length, ...kept);
const timedKpi = timed.list.find((c) => c.id === prospectKpi.id);
const expectProspects = big.filter((r) => r.ownerId === 'owner-a' && r.relationshipStatus === 'Prospecting').length;
ok(timedKpi.data.value === expectProspects && afterMs < 500, 'a few thousand clients still load with both filters (' + afterMs.toFixed(2) + ' ms)');
console.log('dashboard-load-ms', Math.round(afterMs * 100) / 100);

const page = read('js/pages/crm-dashboards.js');
ok(page.includes('return { name: f.name.value, type, config }') && page.includes('maxlength="100"') && !page.includes('maxlength="120"'), 'the chart form still nests config and the name field stops at 100');

const want = new Map([
  ['js/data/supabase-crm-surface.js', '202611160500'],
  ['js/data/supabase-crm.js', '202611160500'],
  ['js/data/supabase-adapter.js', '202611162000'],
  ['js/data/adapter.js', '202611162000'],
  ['js/pages/crm-dashboards.js', '202611161500'],
  ['js/pages/crm.js', '202611161500'],
  ['js/app.js', '202611162100'],
]);
function walkDir(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'vendor' && name !== 'node_modules') walkDir(full, out); }
    else if (/\.(js|html)$/.test(name)) out.push(full);
  }
  return out;
}
const specRe = /(['"])([^'"\s]+?)\?v=([A-Za-z0-9]+)\1/g;
const hits = new Map();
for (const file of walkDir(path.join(root, 'js')).concat(readdirSync(root).filter((n) => n.endsWith('.html')).map((n) => path.join(root, n)))) {
  const rel = path.relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(specRe)) {
    if (!m[2].includes('/')) continue;
    const target = path.normalize(path.join(path.dirname(rel), m[2])).replace(/\\/g, '/');
    if (!hits.has(target)) hits.set(target, []);
    hits.get(target).push({ from: rel, stamp: m[3] });
  }
}
const issues = [];
const dual = [];
const unimported = [];
for (const [target, stamp] of want) {
  const list = hits.get(target) || [];
  const stamps = [...new Set(list.map((h) => h.stamp))];
  if (!list.length) unimported.push(target);
  if (stamps.length !== 1 || stamps[0] !== stamp) issues.push(target + ' ' + (stamps.join(',') || 'none'));
  if (stamps.length > 1) dual.push(target + ' ' + stamps.join(','));
}
function walkImports(file, missingMods, seen = new Set()) {
  const rel = file.replace(/\\/g, '/');
  if (seen.has(rel)) return seen;
  seen.add(rel);
  if (!existsSync(path.join(root, rel))) { missingMods.push(rel); return seen; }
  const text = readFileSync(path.join(root, rel), 'utf8');
  const specs = [...text.matchAll(/(?:from|import)\s*\(\s*['"](\.[^'"]+)['"]|from\s+['"](\.[^'"]+)['"]|['"](\.\/[^'"]+\.js)\?v=\d+['"]/g)].map((m) => m[1] || m[2] || m[3]);
  for (const spec of specs) {
    const bare = spec.split('?')[0];
    walkImports(path.normalize(path.join(path.dirname(rel), bare.endsWith('.js') ? bare : bare + '.js')).replace(/\\/g, '/'), missingMods, seen);
  }
  return seen;
}
const missingMods = [];
const seen = walkImports('js/app.js', missingMods);
ok(issues.length === 0, 'cache stamps agree' + (issues.length ? ': ' + issues.join('; ') : ''));
ok(dual.length === 0, 'dual-stamp scan ' + dual.length + (dual.length ? ': ' + dual.join('; ') : ''));
ok(unimported.length === 0 && missingMods.length === 0, 'recursive import check missing ' + (unimported.length + missingMods.length) + (unimported.length || missingMods.length ? ': ' + unimported.concat(missingMods).join('; ') : ''));
ok(seen.has('js/data/supabase-crm-surface.js') && seen.has('js/pages/crm-dashboards.js'), 'the chart save modules are on the import walk from app.js');
console.log('cache-stamp issues', issues.length);
console.log('dual-stamp', dual.length);
console.log('recursive-import missing', unimported.length + missingMods.length);

console.log(fail ? fail + ' failed' : 'crm dash component passed');
if (fail) process.exit(1);
