/* crm-nov3b.js : seed + upgrade for the Nov 3 (b) CRM features (Zoho videos 7-10): email records (Send / Schedule are RECORDED ONLY, nothing is sent),
 * From aliases, recent items / searches, built-in dashboards, report folders and fake sample reports. PURE (works on the data object). FAKE DATA ONLY.
 * ensureNov3b(d) is idempotent: it adds what is missing and never changes or removes anything that exists (v21 -> v22 upgrade and the fresh seed). */
export const REPORT_FOLDER_SEED = ['Company and Client Reports', 'Dashboards', 'Lead Reports', 'Outside Reports', 'Campaign Reports', 'Lead and Deal Reports', 'Pipeline Reports'];   // video 10 (Contacts = Clients)
const T0 = '2026-11-03T12:00:00Z';
const comp = (id, dashboardId, name, type, config, position, width = 1) => ({ id, dashboardId, name, type, config, position, width, height: 'm', retiredAt: null, createdBy: null, createdAt: T0, modifiedAt: T0 });
const notArchived = { field: 'archived', op: 'is', value: 'no' };
export function builtinDashboards() {
  const dash = (id, builtin, name, description) => ({ id, builtin, name, description, visibility: 'all', shareUsers: [], shareRoles: [], shareDepts: [], locked: true, ownerId: null, filters: {}, retiredAt: null, createdBy: null, createdAt: T0, modifiedAt: T0 });
  const ds = [dash('dash-leads', 'leads', 'Lead Dashboards', 'Built in: leads by source, status and month.'), dash('dash-clients', 'clients', 'Company and Client Dashboards', 'Built in: clients and companies.'),
    dash('dash-deals', 'deals', 'Deal Dashboards', 'Built in: the portal orders as Zoho deals.'), dash('dash-tasks', 'tasks', 'Task Dashboards', 'Built in: open and overdue tasks.')];
  const cs = [
    comp('dc-l1', 'dash-leads', 'Leads by Lead Source', 'chart', { module: 'leads', measure: { fn: 'count' }, grouping: { field: 'leadSource' }, criteria: [notArchived], chartType: 'column' }, 1, 2),
    comp('dc-l2', 'dash-leads', 'Open Leads', 'kpi', { module: 'leads', measure: { fn: 'count' }, criteria: [notArchived, { field: 'converted', op: 'is', value: 'no' }] }, 2, 1),
    comp('dc-l3', 'dash-leads', 'Leads by Relationship Status', 'chart', { module: 'leads', measure: { fn: 'count' }, grouping: { field: 'relationshipStatus' }, criteria: [notArchived], chartType: 'pie' }, 3, 1),
    comp('dc-l4', 'dash-leads', 'Leads Created by Month', 'chart', { module: 'leads', measure: { fn: 'count' }, grouping: { field: 'createdAt', bucket: 'month' }, criteria: [], chartType: 'line' }, 4, 2),
    comp('dc-c1', 'dash-clients', 'Clients by Relationship Status', 'chart', { module: 'contacts', measure: { fn: 'count' }, grouping: { field: 'relationshipStatus' }, criteria: [notArchived], chartType: 'doughnut' }, 1, 1),
    comp('dc-c2', 'dash-clients', 'Total Clients', 'kpi', { module: 'contacts', measure: { fn: 'count' }, criteria: [notArchived] }, 2, 1),
    comp('dc-c3', 'dash-clients', 'Companies by Type', 'chart', { module: 'accounts', measure: { fn: 'count' }, grouping: { field: 'kind' }, criteria: [notArchived], chartType: 'bar' }, 3, 1),
    comp('dc-c4', 'dash-clients', 'Clients by Owner', 'chart', { module: 'contacts', measure: { fn: 'count' }, grouping: { field: 'ownerId' }, criteria: [notArchived], chartType: 'column' }, 4, 3),
    comp('dc-d1', 'dash-deals', 'Deals by Stage', 'funnel', { module: 'deals', measure: { fn: 'count' }, grouping: { field: 'stage' }, criteria: [] }, 1, 1),
    comp('dc-d2', 'dash-deals', 'Active Deal Amount', 'kpi', { module: 'deals', measure: { fn: 'sum', field: 'amount' }, criteria: [{ field: 'stage', op: 'is', value: 'Active' }] }, 2, 1),
    comp('dc-d3', 'dash-deals', 'Closed Deals This Year', 'target', { module: 'deals', measure: { fn: 'count' }, criteria: [{ field: 'stage', op: 'is', value: 'Closed' }, { field: 'closingDate', op: 'is', value: 'this_year' }], target: 50 }, 3, 1),
    comp('dc-d4', 'dash-deals', 'Deal Amount by Closing Month', 'chart', { module: 'deals', measure: { fn: 'sum', field: 'amount' }, grouping: { field: 'closingDate', bucket: 'month' }, grouping2: { field: 'stage' }, criteria: [], chartType: 'stacked' }, 4, 3),
    comp('dc-t1', 'dash-tasks', 'Open Tasks', 'chart', { module: 'tasks', measure: { fn: 'count' }, grouping: { field: 'dueDate', bucket: 'day' }, criteria: [{ field: 'status', op: 'isnt', value: 'Completed' }], chartType: 'column' }, 1, 2),
    comp('dc-t2', 'dash-tasks', 'Overdue Tasks', 'kpi', { module: 'tasks', measure: { fn: 'count' }, criteria: [{ field: 'status', op: 'isnt', value: 'Completed' }, { field: 'dueDate', op: 'before', value: 'today' }] }, 2, 1),
    comp('dc-t3', 'dash-tasks', 'Tasks by Status', 'chart', { module: 'tasks', measure: { fn: 'count' }, grouping: { field: 'status' }, criteria: [], chartType: 'pie' }, 3, 1),
    comp('dc-t4', 'dash-tasks', 'Open Tasks by Owner', 'chart', { module: 'tasks', measure: { fn: 'count' }, grouping: { field: 'ownerId' }, grouping2: { field: 'priority' }, criteria: [{ field: 'status', op: 'isnt', value: 'Completed' }], chartType: 'stacked' }, 4, 2),
    comp('dc-t5', 'dash-tasks', 'My Tasks Table', 'chart', { module: 'tasks', measure: { fn: 'count' }, grouping: { field: 'status' }, criteria: [], chartType: 'table' }, 5, 1)];
  return { ds, cs };
}
export function seedReports() {
  const folders = REPORT_FOLDER_SEED.map((name, i) => ({ id: `rf-${i + 1}`, name, createdBy: 'u-admin', createdAt: T0, modifiedAt: T0 }));
  const r = (id, name, description, folderId, module, columns, extra = {}) => ({ id, name, description, folderId, module, related: [], columns, rowGroups: [], aggregates: [], filters: [], logic: 'and', sort: null,
    share: { mode: 'all', users: [], roles: [] }, createdBy: 'u-admin', createdAt: T0, modifiedBy: 'u-admin', modifiedAt: T0, lastAccessedAt: null, retiredAt: null, ...extra });
  const reports = [
    r('rep-fl', 'FL Clients', 'Clients whose mailing state is Florida (fake sample, video 10).', 'rf-1', 'contacts', ['name', 'companyName', 'email', 'phone', 'relationshipStatus', 'state'], { filters: [{ field: 'state', op: 'is', value: 'FL' }], rowGroups: ['ownerId'] }),
    r('rep-md', 'MD Clients', 'Clients in Maryland, grouped by Client Owner.', 'rf-1', 'contacts', ['name', 'companyName', 'email', 'phone', 'relationshipStatus'], { filters: [{ field: 'state', op: 'is', value: 'MD' }], rowGroups: ['ownerId'] }),
    r('rep-closed', 'Closed Deals Last Month', 'Deals closed in the previous month, grouped by Deal Owner (video 10 example).', 'rf-6', 'deals', ['fileNumber', 'name', 'clientName', 'propertyAddress', 'amount'],
      { filters: [{ field: 'closingDate', op: 'is', value: 'prev_month' }, { field: 'stage', op: 'is', value: 'Closed' }], rowGroups: ['ownerId'], aggregates: [{ field: 'amount', fn: 'sum' }] }),
    r('rep-leads-src', 'Leads by Lead Source', 'Every lead, grouped by Lead Source.', 'rf-3', 'leads', ['name', 'company', 'email', 'relationshipStatus', 'ownerId'], { rowGroups: ['leadSource'] }),
    r('rep-open-tasks', 'Open Tasks by Owner', 'Tasks that are not Completed.', 'rf-7', 'tasks', ['subject', 'dueDate', 'status', 'priority', 'relatedTo', 'contactName'], { filters: [{ field: 'status', op: 'isnt', value: 'Completed' }], rowGroups: ['ownerId'] }),
  ];
  return { folders, reports };
}
export function ensureNov3b(d, { seed = true } = {}) {
  if (!d || typeof d !== 'object') return d;
  ['crmEmails', 'crmDashboards', 'crmDashComponents', 'crmReportFolders', 'crmReports'].forEach((k) => { d[k] ||= []; });
  ['crmEmailAliases', 'crmRecent', 'crmRecentSearches'].forEach((k) => { if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) d[k] = {}; });
  if (seed && !d.nov3bSeeded) {
    const { ds, cs } = builtinDashboards(); ds.forEach((x) => { if (!d.crmDashboards.some((z) => z.id === x.id)) d.crmDashboards.push(x); }); cs.forEach((x) => { if (!d.crmDashComponents.some((z) => z.id === x.id)) d.crmDashComponents.push(x); });
    const { folders, reports } = seedReports(); folders.forEach((x) => { if (!d.crmReportFolders.some((z) => z.id === x.id || z.name.toLowerCase() === x.name.toLowerCase())) d.crmReportFolders.push(x); });
    reports.forEach((x) => { if (!d.crmReports.some((z) => z.id === x.id)) d.crmReports.push(x); });
    d.nov3bSeeded = true;
  }
  return d;
}
