/* CRM report grouping no longer offers fiscal week, quarter, or year.
 * A saved report or chart that still uses those codes loads as the calendar bucket and does not fail. Fake data only. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUCKETS, bucketOf, calendarBucket, chartData, moduleFields, runReport, DATE_PRESETS, presetKey, presetLabel, presetRange, criteriaText, applyCriteria } from '../js/data/crm-analytics.js';
import { createMockAdapter, STORAGE_KEY } from '../js/data/mock-adapter.js';
import { crmSurfaceSupabase } from '../js/data/supabase-crm-surface.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const pass = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);

const labels = BUCKETS.map(([code, label]) => `${code}=${label}`).join('|');
ok(labels === 'day=By Day|week=By Calendar Week|month=By Month|quarter=By Quarter|year=By Year', 'grouping is day, calendar week, month, quarter, and year');
ok(!BUCKETS.some(([code, label]) => /fiscal|fweek|fquarter|fyear/i.test(code + label)), 'the grouping list has no fiscal choice');
ok(calendarBucket('fweek') === 'week' && calendarBucket('fquarter') === 'quarter' && calendarBucket('fyear') === 'year', 'an old fiscal code loads as the matching calendar bucket');
ok(calendarBucket('week') === 'week' && calendarBucket('quarter') === 'quarter' && calendarBucket('year') === 'year', 'calendar buckets stay as they are');
ok(calendarBucket('nope') === 'day' && calendarBucket('') === 'day' && calendarBucket(undefined) === 'day', 'a blank or unknown grouping loads as day');

const day = '2026-03-15';
ok(bucketOf(day, 'fweek').join('|') === bucketOf(day, 'week').join('|'), 'fiscal week groups like calendar week');
ok(bucketOf(day, 'fquarter').join('|') === bucketOf(day, 'quarter').join('|'), 'fiscal quarter groups like calendar quarter');
ok(bucketOf(day, 'fyear').join('|') === bucketOf(day, 'year').join('|'), 'fiscal year groups like calendar year');
ok(bucketOf(day, 'nope').join('|') === bucketOf(day, 'day').join('|'), 'an unknown grouping groups by day and does not fail');

const fields = moduleFields('deals', {});
const rows = [
  { id: 'a', name: '1 Main', closingDate: '2026-03-15', createdAt: '2026-01-04T15:00:00Z' },
  { id: 'b', name: '2 Oak', closingDate: '2026-11-02', createdAt: '2026-11-02T15:00:00Z' },
  { id: 'c', name: 'No date', closingDate: '', createdAt: '' },
];
const reportOf = (bucket) => runReport(rows, { columns: ['name', 'closingDate'], rowGroups: ['closingDate'], filters: [], bucket }, fields, {}, { today: '2026-11-17' });
ok(JSON.stringify(reportOf('fweek')) === JSON.stringify(reportOf('week')), 'a saved report grouped by fiscal week runs as calendar week');
ok(JSON.stringify(reportOf('fquarter')) === JSON.stringify(reportOf('quarter')), 'a saved report grouped by fiscal quarter runs as calendar quarter');
ok(JSON.stringify(reportOf('fyear')) === JSON.stringify(reportOf('year')), 'a saved report grouped by fiscal year runs as calendar year');
const chartOf = (bucket) => chartData(rows, { grouping: { field: 'closingDate', bucket }, grouping2: { field: 'createdAt', bucket: bucket === 'fquarter' ? 'fyear' : 'year' }, measure: { fn: 'count' } }, fields, {});
const fiscalChart = chartOf('fquarter');
const calendarChart = chartData(rows, { grouping: { field: 'closingDate', bucket: 'quarter' }, grouping2: { field: 'createdAt', bucket: 'year' }, measure: { fn: 'count' } }, fields, {});
ok(JSON.stringify(fiscalChart.groups) === JSON.stringify(calendarChart.groups) && fiscalChart.groupLabel.includes('By Quarter') && !/fiscal/i.test(fiscalChart.groupLabel), 'a saved chart that used a fiscal bucket draws the calendar groups');

function crmFiles() {
  const out = [];
  for (const dir of ['js/pages', 'js/data']) {
    for (const name of readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.js')) continue;
      if (dir === 'js/data' && name === 'vendor') continue;
      if (/^crm|^mock-part-crm|^supabase-crm|^mock-part-feedback-nov4|^supabase-feedback-nov4/.test(name)) out.push(path.join(dir, name));
    }
  }
  return out;
}
const fiscalHits = crmFiles().filter((rel) => /fiscal/i.test(readFileSync(path.join(root, rel), 'utf8')));
ok(fiscalHits.length === 0, 'CRM pages and data files do not say fiscal' + (fiscalHits.length ? ': ' + fiscalHits.join(', ') : ''));
const fyLabels = crmFiles().filter((rel) => /Previous FY|Current FY|Next FY/.test(readFileSync(path.join(root, rel), 'utf8')));
ok(fyLabels.length === 0, 'CRM pages and data files do not say Previous FY, Current FY, or Next FY' + (fyLabels.length ? ': ' + fyLabels.join(', ') : ''));
const presetLabels = DATE_PRESETS.map(([k, l]) => `${k}=${l}`).join('|');
ok(presetLabels.includes('prev_year=Previous Year') && presetLabels.includes('cur_year=Current Year') && presetLabels.includes('next_year=Next Year') && !presetLabels.includes('FY'), 'date presets say Previous Year, Current Year, and Next Year');
ok(presetKey('prev_fy') === 'prev_year' && presetKey('cur_fy') === 'cur_year' && presetKey('next_fy') === 'next_year', 'an old FY preset loads as the renamed year preset');
const presetToday = '2026-11-17';
ok(presetRange('prev_fy', presetToday).join() === presetRange('prev_year', presetToday).join() && presetRange('cur_fy', presetToday).join() === presetRange('cur_year', presetToday).join() && presetRange('cur_year', presetToday).join() === presetRange('this_year', presetToday).join() && presetRange('next_fy', presetToday).join() === presetRange('next_year', presetToday).join(), 'the old FY presets still cover the same calendar year');
ok(presetLabel('prev_fy') === 'Previous Year' && presetLabel('cur_fy') === 'Current Year' && presetLabel('next_fy') === 'Next Year', 'a saved FY choice is described with the year name');
ok(criteriaText([{ field: 'closingDate', op: 'is', value: 'prev_fy' }], fields, {}, 'and').includes('Previous Year') && !/FY/.test(criteriaText([{ field: 'closingDate', op: 'is', value: 'cur_fy' }], fields, {}, 'and')), 'a report filter that still says FY is shown as the year preset');
const dated = [{ id: 'in', closingDate: '2026-03-15' }, { id: 'out', closingDate: '2025-03-15' }];
const matched = (value) => applyCriteria(dated, [{ field: 'closingDate', op: 'is', value }], fields, { today: presetToday }).map((r) => r.id).join();
ok(matched('cur_fy') === matched('cur_year') && matched('prev_fy') === matched('prev_year') && matched('next_fy') === matched('next_year'), 'a saved FY filter still matches the same deals as the year preset');

const storage = mem();
const session = mem();
const api = createMockAdapter({ storage, sessionStorage: session });
await api.signInDev('u-admin');
const made = await api.createCrmReport({ name: 'Closings', module: 'deals', columns: ['name', 'closingDate'], rowGroups: ['closingDate'], bucket: 'fweek', filters: [], logic: 'and' });
ok(made.bucket === 'week', 'saving a report that still posts fiscal week stores calendar week');
const data = JSON.parse(storage.getItem(STORAGE_KEY));
const stored = data.crmReports.find((r) => r.id === made.id);
stored.bucket = 'fyear';
const byId = Object.fromEntries([['dc-l4', 'fweek'], ['dc-d4', 'fquarter'], ['dc-t1', 'fyear']]);
data.crmDashComponents.forEach((c) => { if (byId[c.id]) c.config.grouping.bucket = byId[c.id]; });
storage.setItem(STORAGE_KEY, JSON.stringify(data));
const again = createMockAdapter({ storage, sessionStorage: session });
await again.signInDev('u-admin');
const loaded = await again.getCrmReport(made.id);
const ran = await again.runCrmReport(made.id);
const yearRun = await again.runCrmReport({ name: 'Closings', module: 'deals', columns: ['name', 'closingDate'], rowGroups: ['closingDate'], bucket: 'year', filters: [], logic: 'and' });
ok(loaded.bucket === 'year' && JSON.stringify(ran.groups) === JSON.stringify(yearRun.groups), 'a saved report that still says fiscal year loads and runs as calendar year');
const still = JSON.parse(storage.getItem(STORAGE_KEY)).crmReports.find((r) => r.id === made.id);
ok(still.bucket === 'fyear', 'loading that report does not rewrite the saved copy');
const leads = await again.getCrmDashboard('dash-leads');
const deals = await again.getCrmDashboard('dash-deals');
const tasks = await again.getCrmDashboard('dash-tasks');
const card = (dash, id) => dash.list.find((c) => c.id === id);
ok(card(leads, 'dc-l4').config.grouping.bucket === 'week' && !card(leads, 'dc-l4').error, 'a saved chart that used fiscal week loads as calendar week');
ok(card(deals, 'dc-d4').config.grouping.bucket === 'quarter' && !card(deals, 'dc-d4').error, 'a saved chart that used fiscal quarter loads as calendar quarter');
ok(card(tasks, 'dc-t1').config.grouping.bucket === 'year' && !card(tasks, 'dc-t1').error, 'a saved chart that used fiscal year loads as calendar year');
const yearView = await again.createCrmView({ module: 'deals', name: 'FY view', visibility: 'me', criteria: [{ field: 'closingDate', op: 'is', value: 'cur_fy' }] });
ok(yearView.criteria[0].value === 'cur_year', 'saving a view that still posts Current FY stores Current Year');
const viewRaw = JSON.parse(storage.getItem(STORAGE_KEY));
viewRaw.crmViews.find((v) => v.id === yearView.id).criteria[0].value = 'prev_fy';
viewRaw.crmDashboards.find((d) => d.id === 'dash-leads').filters = { period: 'next_fy' };
storage.setItem(STORAGE_KEY, JSON.stringify(viewRaw));
const loadedViews = createMockAdapter({ storage, sessionStorage: session });
await loadedViews.signInDev('u-admin');
const foundView = (await loadedViews.listCrmViews('deals')).find((v) => v.id === yearView.id);
const ranView = await loadedViews.runCrmView(yearView.id);
ok(foundView.criteria[0].value === 'prev_year' && ranView.view.criteria[0].value === 'prev_year' && ranView.total >= 0, 'a saved view that still uses Previous FY loads as Previous Year');
const leadDash = await loadedViews.getCrmDashboard('dash-leads');
ok(leadDash.filters.period === 'next_year', 'a saved dashboard filter that still uses Next FY loads as Next Year');

const JANINE = '00000000-0000-4000-8000-0000000000aa';
const tables = {
  crm_dashboards: [{ id: 'd1', name: 'Saved', owner_id: JANINE, visibility: 'me', share: {}, locked: false, builtin: false, retired_at: null, filters: {} }],
  crm_dash_components: [{ id: 'c1', dashboard_id: 'd1', name: 'Closings', type: 'chart', module: 'deals', chart_type: 'column', measure: { fn: 'count' }, grouping: { field: 'closingDate', bucket: 'fquarter', grouping2: { field: 'createdAt', bucket: 'fyear' } }, criteria: [], width: 2, height: 2, retired_at: null }],
  crm_report_folders: [],
  crm_reports: [{ id: 'r1', name: 'Old year', description: '', module: 'deals', related: [], columns: ['name', 'closingDate'], row_groups: ['closingDate'], aggregates: [], filters: [], logic: 'and', sort: null, share_mode: 'all', share: { mode: 'all' }, bucket: 'fweek', created_by: JANINE, retired_at: null }],
};
function from(table) {
  const q = { filters: [] };
  const exec = (mode) => {
    let list = (tables[table] || []).filter((row) => q.filters.every(([k, v]) => row[k] === v));
    if (mode === 'many') return Promise.resolve({ data: list.map((row) => ({ ...row })), error: null });
    const row = list[0] || null;
    if (!row) return Promise.resolve({ data: null, error: mode === 'maybe' ? null : { message: 'missing' } });
    return Promise.resolve({ data: { ...row }, error: null });
  };
  const apiQ = {
    select() { return apiQ; }, eq(k, v) { q.filters.push([k, v]); return apiQ; }, order() { return apiQ; }, is() { return apiQ; },
    maybeSingle() { return exec('maybe'); }, single() { return exec('single'); }, then(resolve, reject) { return exec('many').then(resolve, reject); },
  };
  return apiQ;
}
const surface = crmSurfaceSupabase({
  sb: { from }, ok: pass, camel, me: async () => ({ id: JANINE, role: 'Super admin', isAdmin: true, email: 'janine@example.test' }), on() {},
  self: { getCrmSettings: async () => ({ picklists: {}, fields: [] }), listCrmDeals: async () => rows },
});
const hostedDash = await surface.getCrmDashboard('d1');
const hostedCard = hostedDash.list[0];
ok(hostedCard.config.grouping.bucket === 'quarter' && hostedCard.config.grouping2.bucket === 'year' && !hostedCard.error && hostedCard.data.groups.length === calendarChart.groups.length, 'a hosted saved chart loads fiscal quarter and fiscal year as calendar buckets');
const hostedReport = await surface.getCrmReport('r1');
const hostedRun = await surface.runCrmReport('r1');
ok(hostedReport.bucket === 'week' && JSON.stringify(hostedRun.groups) === JSON.stringify(reportOf('week').groups), 'a hosted saved report that says fiscal week loads and runs as calendar week');
let hostedBlank = '';
try { await surface.runCrmReport({ name: 'Unsaved', module: 'deals', columns: ['name'], rowGroups: ['closingDate'], bucket: 'fyear', filters: [], related: [] }); } catch (e) { hostedBlank = e.message; }
ok(hostedBlank === '', 'running an unsaved report with fiscal year does not fail');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div><div id="toasts"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { reportsHome } = await import('../js/pages/crm-reports.js');
const { dashboardsPage } = await import('../js/pages/crm-dashboards.js');
const host = document.getElementById('app');
const reportApi = {
  getCrmReport: async () => ({ id: 'rep-old', name: 'Old week', description: '', module: 'deals', related: [], columns: ['name', 'closingDate'], rowGroups: ['closingDate'], aggregates: [], filters: [], logic: 'and', sort: null, share: { mode: 'all', users: [], roles: [] }, bucket: 'fweek', folderId: 'mine' }),
  listCrmReportFolders: async () => ({ canCreate: false, folders: [{ id: 'mine', name: 'My reports', kind: 'personal' }] }),
  listCrmShareTargets: async () => ({ users: [], roles: [] }),
};
for (const [code, want] of [['fweek', 'week'], ['fquarter', 'quarter'], ['fyear', 'year']]) {
  reportApi.getCrmReport = async () => ({ id: 'rep-old', name: 'Old', description: '', module: 'deals', related: [], columns: ['name', 'closingDate'], rowGroups: ['closingDate'], aggregates: [], filters: [], logic: 'and', sort: null, share: { mode: 'all', users: [], roles: [] }, bucket: code, folderId: 'mine' });
  const page = await reportsHome({ api: reportApi, me: { canEdit: true, isAdmin: true }, owners: [], cfg: {}, params: { id: 'rep-old', sub: 'edit' } });
  host.innerHTML = ''; host.append(page.body instanceof window.Node ? page.body : document.createTextNode(''));
  if (typeof page.body === 'object' && page.body && page.body.nodeType) host.replaceChildren(page.body);
  else host.innerHTML = String(page.body);
  page.mount(host);
  const sel = host.querySelector('[data-bucket]');
  const texts = [...sel.options].map((o) => `${o.value}:${o.textContent}`).join('|');
  ok(sel.value === want && texts === 'day:By Day|week:By Calendar Week|month:By Month|quarter:By Quarter|year:By Year', `the report date grouping shows ${want} for a saved ${code} and lists no fiscal option`);
}
const dashApi = {
  listCrmDashboards: async () => [{ id: 'd1', name: 'Mine', retired: false }],
  getCrmDashboard: async () => ({ id: 'd1', name: 'Mine', description: '', retired: false, canEdit: true, builtin: false, mine: true, ownerName: 'Ada', visibility: 'me', locked: false, filters: { period: 'prev_fy' }, retiredComponents: [], list: [{ id: 'c1', name: 'Closings', type: 'chart', width: 1, height: 'm', config: { module: 'deals', measure: { fn: 'count' }, grouping: { field: 'closingDate', bucket: 'fquarter' }, grouping2: { field: 'createdAt', bucket: 'fyear' }, criteria: [{ field: 'closingDate', op: 'is', value: 'next_fy' }], chartType: 'stacked' }, data: { groups: [], measureLabel: 'Record Count', series: [] } }] }),
};
const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
  configurable: true,
  get() { return selectValue.get.call(this); },
  set(v) {
    const want = String(v);
    const opts = [...this.options];
    opts.forEach((o) => { o.selected = o.getAttribute('value') === want; });
    const hit = opts.find((o) => o.getAttribute('value') === want);
    opts.forEach((o) => { if (o === hit) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
  },
});
const htmlDesc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
const nameForms = (root) => { const forms = []; if (root.matches && root.matches('form')) forms.push(root); if (root.querySelectorAll) root.querySelectorAll('form').forEach((f) => forms.push(f)); const parent = root.closest && root.closest('form'); if (parent) forms.push(parent); forms.forEach((f) => f.querySelectorAll('[name]').forEach((el) => { f[el.getAttribute('name')] = el; })); };
Object.defineProperty(window.Element.prototype, 'innerHTML', { configurable: true, get() { return htmlDesc.get.call(this); }, set(v) { htmlDesc.set.call(this, v); nameForms(this); } });
const dash = await dashboardsPage({ api: dashApi, me: { canEdit: true, isAdmin: true, canConfigure: false }, owners: [], cfg: {}, params: { id: 'd1' }, refresh() {} });
host.innerHTML = String(dash.body);
dash.mount(host);
const menu = host.querySelector('[data-comp-menu]');
menu.value = 'edit';
menu.dispatchEvent(new window.Event('change'));
const g1 = document.querySelector('[name=groupingBucket]');
const g2 = document.querySelector('[name=grouping2Bucket]');
ok(g1 && g1.value === 'quarter' && g2 && g2.value === 'year' && ![...g1.options, ...g2.options].some((o) => /fiscal/i.test(o.textContent)), 'editing a saved chart shows calendar quarter and calendar year for the old fiscal choices');
ok(host.textContent.includes('created Previous Year'), 'the dashboard says Previous Year for a saved Previous FY filter');
host.querySelector('[data-dash-action="filters"]').click();
const period = document.querySelector('[name=period]');
ok(period && period.value === 'prev_year' && ![...period.options].some((o) => /FY/.test(o.textContent)), 'the dashboard date filter shows Previous Year for a saved Previous FY choice');
const { criteriaEditor } = await import('../js/pages/crm-criteria.js');
const { toText } = await import('../js/ui.js');
const editor = criteriaEditor('view', fields, [{ field: 'closingDate', op: 'is', value: 'cur_fy' }, { field: 'createdAt', op: 'is', value: 'prev_fy' }], { logic: 'and', cfg: {} });
host.innerHTML = toText(editor.body);
const mounted = editor.mount(host);
const presets = [...host.querySelectorAll('[data-crit-value-preset]')];
ok(presets.length === 2 && presets[0].value === 'cur_year' && presets[1].value === 'prev_year' && presets.every((s) => ![...s.options].some((o) => /FY/.test(o.textContent))), 'a saved view filter shows Current Year and Previous Year for the old FY choices');
const saved = mounted.get();
ok(saved.criteria[0].value === 'cur_year' && saved.criteria[1].value === 'prev_year', 'saving that view keeps the renamed year presets');

console.log(fail ? fail + ' failed' : 'crm fiscal grouping passed');
if (fail) process.exit(1);
