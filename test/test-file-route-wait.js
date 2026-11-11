/* File-tab critical path. Local DOM and timed fakes. No hosted project and no secrets. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const local = mem(); const session = mem();
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.CLA_PORTAL_CONFIG = { mode: 'mock' };
window.CLA_WS_DEFAULT = 'everything';
const location = { hash: '#/deals/deal-1/documents', search: '', pathname: '/', href: 'http://localhost/' };
window.location = location;
globalThis.location = location;
window.history = { replaceState() {} };
globalThis.history = window.history;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms || 0);
window.setTimeout = globalThis.setTimeout;

let fail = 0;
const check = (cond, msg) => { if (cond) console.log('ok', msg); else { fail += 1; console.log('FAIL', msg); } };
const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));
const hold = () => { let go; const p = new Promise((r) => { go = r; }); return { p, go }; };

const started = [];
const gate = (name, fn) => async (...args) => {
  const item = { name, ...hold() };
  started.push(item);
  await item.p;
  return fn(...args);
};

const { getAdapter } = await import('../js/data/adapter.js?v=202611160500');
const api = await getAdapter();
await api.signInDev('u-admin');
const orig = {
  getDeal: api.getDeal.bind(api),
  listTasks: api.listTasks.bind(api),
  listDocuments: api.listDocuments.bind(api),
  getOrderOverview: api.getOrderOverview.bind(api),
};
api.getDeal = gate('deal', orig.getDeal);
api.listTasks = gate('tasks', orig.listTasks);
api.listDocuments = gate('documents', orig.listDocuments);
let overviewN = 0;
api.getOrderOverview = async () => {
  const item = { name: 'overview', n: ++overviewN, ...hold() };
  started.push(item);
  await item.p;
  return { counts: { tasks: 5000 + item.n, inbox: 0, documents: 0, activity: 0 }, parties: [], outstanding: 0, progress: { phaseName: 'Open' }, recentActivity: [], conversations: [], canRequestUpdate: false, canShareAccess: false, canAnswerUpdates: false, updateTopics: [], permissions: [] };
};
const app = await import('../js/app.js');

const release = async (name) => {
  for (let i = 0; i < 50 && !started.some((x) => x.name === name && !x.done); i += 1) await wait(10);
  const item = started.find((x) => x.name === name && !x.done);
  if (!item) throw new Error('missing ' + name + ' ' + started.map((x) => x.name + (x.done ? ':done' : '')).join(','));
  item.done = true;
  item.go();
  await wait(15);
};
const viewText = () => (document.querySelector('#view') || document.body).textContent || '';

await wait(10);
check(document.querySelector('[data-loading-note]') && viewText().includes('Loading this page.'), 'the first file page shows the loading line before the file read');
check(!document.querySelector('[data-content-ready]'), 'the loading line is not marked ready');
check(!viewText().includes('Documents & Files'), 'documents are not claimed before the file read');
await release('deal');
await release('documents');
await release('overview');
await wait(30);
check(viewText().includes('Documents & Files') && document.querySelector('#app').getAttribute('data-content-ready') === 'documents', 'documents render after their own read');

started.length = 0;
location.hash = '#/deals/deal-1/tasks';
const toTasks = app.render();
await wait(15);
check(viewText().includes('Loading this page.') && !document.querySelector('[data-content-ready]'), 'a file tab shows the loading line in the open page');
check(!viewText().includes('Documents & Files'), 'the documents page is cleared when Tasks is chosen');
check(!viewText().includes('All Tasks'), 'tasks are not claimed while the file is still loading');
await release('deal');
await wait(10);
check(!viewText().includes('All Tasks'), 'tasks stay behind their own read');
await release('tasks');
await wait(20);
check(viewText().includes('All Tasks') && document.querySelector('#app').getAttribute('data-content-ready') === 'tasks', 'tasks render without waiting for the order overview');
check(started.some((x) => x.name === 'overview' && !x.done), 'the overview count is still loading after the tasks page is visible');
const staleOverview = started.find((x) => x.name === 'overview' && !x.done);

location.hash = '#/deals/deal-1/documents';
const toDocs = app.render();
await wait(15);
check(viewText().includes('Loading this page.'), 'Documents shows the loading line on the way back');
check(!viewText().includes('All Tasks'), 'the tasks page is cleared when Documents is chosen');
staleOverview.go();
staleOverview.done = true;
await wait(15);
check(!document.body.textContent.includes(String(5000 + staleOverview.n)), 'a late overview from the tasks route does not write into Documents');
await release('deal');
await release('documents');
await wait(20);
check(viewText().includes('Documents & Files'), 'documents render after the tasks page was cleared');
const lateDocsOverview = started.find((x) => x.name === 'overview' && !x.done);
if (lateDocsOverview) { lateDocsOverview.go(); lateDocsOverview.done = true; }
await Promise.allSettled([toTasks, toDocs]);

const { render: docsRender } = await import('../js/pages/dealdocs.js');
const marks = [];
const slowDoc = (name) => async () => { marks.push(name); await wait(30); return name === 'docs' ? [] : name === 'folders' ? [] : name === 'sigs' ? [] : []; };
const docApi = {
  listDocuments: slowDoc('docs'),
  listDealFolders: slowDoc('folders'),
  listSignatureRequests: slowDoc('sigs'),
  listEntityDocRequests: slowDoc('ents'),
};
const docUser = { id: 'u-admin', role: 'Super admin', isAdmin: true, firstName: 'A', lastName: 'B' };
const docDeal = { id: 'deal-1', fileNumber: 'MD-26-97183' };
const t0 = Date.now();
await docsRender({ api: docApi, user: docUser, deal: docDeal, refresh() {} });
const docMs = Date.now() - t0;
check(marks.join(',') === 'docs,folders,sigs,ents' && docMs < 80, 'the documents tab starts its four reads together');

const { render: dealRender } = await import('../js/pages/deal.js');
const ovMarks = [];
const slowOv = (name, value) => async () => { ovMarks.push(name); await wait(25); return value; };
const staff = { id: 'u-admin', role: 'Super admin', isAdmin: true, firstName: 'Ada', lastName: 'Admin', accountRole: null };
const file = {
  id: 'deal-1', fileNumber: 'MD-26-97183', street: '145 Main Street', city: 'Rockville', state: 'MD', zip: '20850', county: 'Montgomery',
  transactionType: 'Purchase', stage: 1, status: 'Open', openDate: '2026-11-01', closingDate: '2026-11-17', salesPeople: [], salesPersonIds: [],
  participants: [{ role: 'Client-Buyer', contact: { firstName: 'Ada', lastName: 'Buyer' } }],
  myRole: 'Processor', myRoles: ['Processor'], purchasePrice: 1, loanAmount: 1, emdAmount: null, emdDueDate: null, notes: '', unread: 0,
};
const ovApi = {
  readDeal: async () => file,
  getDeal: async () => file,
  listAgreements: slowOv('agreements', { pending: 0 }),
  listOrderNotes: slowOv('notes', []),
  listSalesStaff: slowOv('sales', []),
  readOverview: slowOv('overview', { counts: {}, parties: [], outstanding: 0, progress: { phaseName: 'Open' }, orderDetails: {}, recentActivity: [], conversations: [], canRequestUpdate: false, canShareAccess: false, canAnswerUpdates: false, updateTopics: [], permissions: [] }),
  listUpdateRequests: slowOv('updates', []),
  listSharedAccess: slowOv('access', []),
  closingLocationFlags: slowOv('flags', []),
  closingLocationPrompt: slowOv('prompt', []),
  listUnderwriterSplits: slowOv('splits', { rows: [] }),
  demoViewStatus: slowOv('demo', { active: false }),
  features: {},
};
const ov0 = Date.now();
const ovView = await dealRender({ api: ovApi, user: staff, params: { id: 'deal-1', tab: 'overview' }, refresh() {}, go() {} });
const ovMs = Date.now() - ov0;
check(ovView && ovView.body && ovMarks.length >= 8 && ovMs < 90, 'the overview starts its file reads together');
const overviewNeeds = ['agreements', 'notes', 'sales', 'overview', 'updates', 'access', 'flags', 'prompt', 'splits', 'demo'];
check(overviewNeeds.every((name) => ovMarks.includes(name)) && !ovMarks.includes('listDeals') && !ovMarks.includes('getWorkQueue'), 'overview waits on the sections it shows and not on the order list');

const earlyMarks = [];
let releaseFile;
const fileHeld = new Promise((r) => { releaseFile = r; });
const earlyOv = {
  readDeal: () => fileHeld.then(() => file),
  getDeal: () => fileHeld.then(() => file),
  listAgreements: async () => { earlyMarks.push('agreements'); return { pending: 0 }; },
  listOrderNotes: async () => { earlyMarks.push('notes'); return []; },
  listSalesStaff: async () => { earlyMarks.push('sales'); return []; },
  readOverview: async () => { earlyMarks.push('overview'); return { counts: {}, parties: [], outstanding: 0, progress: { phaseName: 'Open' }, orderDetails: {}, recentActivity: [], conversations: [], canRequestUpdate: false, canShareAccess: false, canAnswerUpdates: false, updateTopics: [], permissions: [] }; },
  listUpdateRequests: async () => { earlyMarks.push('updates'); return []; },
  listSharedAccess: async () => { earlyMarks.push('access'); return []; },
  closingLocationFlags: async () => { earlyMarks.push('flags'); return []; },
  closingLocationPrompt: async () => { earlyMarks.push('prompt'); return []; },
  listUnderwriterSplits: async () => { earlyMarks.push('splits'); return { rows: [] }; },
  demoViewStatus: async () => { earlyMarks.push('demo'); return { active: false }; },
  features: {},
};
const earlyView = dealRender({ api: earlyOv, user: staff, params: { id: 'deal-1', tab: 'overview' }, refresh() {}, go() {} });
await wait(20);
check(overviewNeeds.every((name) => earlyMarks.includes(name)), 'overview section reads start before the file read finishes');
releaseFile();
const earlyDone = await earlyView;
check(earlyDone && earlyDone.body && String(earlyDone.body).includes('data-file-buyers') && String(earlyDone.body).includes('Ada Buyer'), 'overview still waits for the file and shows the buyers line once the file is ready');

let shellCalls = 0;
let fullCalls = 0;
const shellDeal = { ...file, participants: [] };
const shellApi = {
  readFileShell: async () => { shellCalls += 1; return shellDeal; },
  readDeal: async () => { fullCalls += 1; return file; },
  getDeal: async () => { fullCalls += 1; return file; },
  listTasks: async () => [],
  features: {},
};
await dealRender({ api: shellApi, user: staff, params: { id: 'deal-1', tab: 'tasks' }, refresh() {}, go() {} });
check(shellCalls === 1 && fullCalls === 0, 'staff tasks use the file row and do not wait for the full party read');
await dealRender({ api: shellApi, user: staff, params: { id: 'deal-1', tab: 'overview' }, refresh() {}, go() {} }).catch(() => null);
check(fullCalls >= 1 && shellCalls === 1, 'overview still reads the whole file');

console.log(fail ? fail + ' failed' : 'file route wait passed');
process.exit(fail ? 1 : 0);
