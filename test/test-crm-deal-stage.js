/* CRM deal Stage choices: Opened, Closed, On Hold, Canceled. Active still matches Opened. */
import { DEAL_STAGES, dealStageOf, statusForDealStage, moduleFields, applyCriteria, display, groupOf } from '../js/data/crm-analytics.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const labels = DEAL_STAGES.map(([v, l]) => `${v}=${l}`);
ok(labels.join('|') === 'Opened=Opened|Closed=Closed|On Hold=On Hold|Canceled=Canceled', 'stage choices are exactly Opened, Closed, On Hold, Canceled');
ok(!DEAL_STAGES.some(([v]) => v === 'Active' || v === 'Cancelled' || v === 'Open'), 'Active, Cancelled, and Open are not offered as stage choices');

ok(dealStageOf('Open') === 'Opened' && dealStageOf('Active') === 'Opened' && dealStageOf('Opened') === 'Opened', 'Open and the old word Active both read as Opened');
ok(dealStageOf('Cancelled') === 'Canceled' && dealStageOf('Canceled') === 'Canceled', 'Cancelled reads as Canceled');
ok(dealStageOf('Closed') === 'Closed' && dealStageOf('On Hold') === 'On Hold' && dealStageOf('') === '', 'Closed and On Hold stay as they are');
ok(statusForDealStage('Opened') === 'Open' && statusForDealStage('Active') === 'Open', 'saving Opened writes the order status Open');
ok(statusForDealStage('Canceled') === 'Cancelled' && statusForDealStage('Cancelled') === 'Cancelled', 'saving Canceled writes the order status Cancelled');
ok(statusForDealStage('Closed') === 'Closed' && statusForDealStage('On Hold') === 'On Hold' && statusForDealStage('Won') === '', 'Closed and On Hold save as themselves, and an unknown word is refused');

const fields = moduleFields('deals', {});
const stage = fields.find((f) => f.key === 'stage');
ok(stage && stage.dealStage && stage.options.map(([v]) => v).join('|') === 'Opened|Closed|On Hold|Canceled', 'the deal Stage field uses those four choices');
const opp = moduleFields('opportunities', {}).find((f) => f.key === 'stage');
ok(opp && !opp.dealStage, 'an opportunity stage is not rewritten by the deal mapping');

const rows = [
  { id: 'open', stage: 'Active', amount: 10 },
  { id: 'opened', stage: 'Opened', amount: 20 },
  { id: 'hold', stage: 'On Hold', amount: 5 },
  { id: 'old-cancel', stage: 'Cancelled', amount: 1 },
  { id: 'cancel', stage: 'Canceled', amount: 2 },
  { id: 'closed', stage: 'Closed', amount: 8 },
];
const ids = (criteria) => applyCriteria(rows, criteria, fields, { logic: 'and', today: '2026-11-17' }).map((r) => r.id).sort().join(',');
ok(ids([{ field: 'stage', op: 'is', value: 'Opened' }]) === 'open,opened', 'a custom view for Opened includes rows still labeled Active');
ok(ids([{ field: 'stage', op: 'is', value: 'Active' }]) === 'open,opened', 'an old custom view that says Active still matches Opened');
ok(ids([{ field: 'stage', op: 'is', value: 'Canceled' }]) === 'cancel,old-cancel', 'Canceled matches the old spelling Cancelled');
ok(ids([{ field: 'stage', op: 'is', value: 'Cancelled' }]) === 'cancel,old-cancel', 'an old Cancelled filter still matches Canceled');
ok(ids([{ field: 'stage', op: 'is', value: 'Closed' }]) === 'closed', 'Closed stays Closed');
ok(ids([{ field: 'stage', op: 'isnt', value: 'Opened' }]) === 'cancel,closed,hold,old-cancel', 'is not Opened leaves out Active and Opened');

ok(display(stage, { stage: 'Active' }, {}) === 'Opened' && display(stage, { stage: 'Cancelled' }, {}) === 'Canceled', 'the list shows Opened and Canceled for the old words');
ok(groupOf(stage, { stage: 'Active' }, {}, null)[0] === 'Opened' && groupOf(stage, { stage: 'Opened' }, {}, null)[0] === 'Opened', 'Active and Opened count as one stage on a chart');
ok(groupOf(stage, { stage: 'Cancelled' }, {}, null).join('|') === 'Canceled|Canceled', 'a chart labels Cancelled as Canceled');

const { parseHTML } = await import('/tmp/domtest/node_modules/linkedom/worker.js');
const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { toText } = await import('../js/ui.js');
const { criteriaEditor } = await import('../js/pages/crm-criteria.js');
const { dealsPage } = await import('../js/pages/crm-deals.js');

const ce = criteriaEditor('view', fields, [{ field: 'stage', op: 'is', value: 'Active' }], { logic: 'and', cfg: {}, users: [] });
const host = document.getElementById('app');
host.innerHTML = toText(ce.body);
const mounted = ce.mount(host);
const opts = [...host.querySelectorAll('[data-crit-value] option')].map((o) => o.value);
ok(opts.join('|') === 'Opened|Closed|On Hold|Canceled', 'the custom view Stage value list is those four choices');
ok(host.querySelector('[data-crit-value]').value === 'Opened', 'a saved Active value is shown as Opened in the dropdown');
const got = mounted.get();
ok(got.criteria[0].field === 'stage' && got.criteria[0].value === 'Opened', 'saving that row keeps Opened, not Active');

const cancelEditor = criteriaEditor('view', fields, [{ field: 'stage', op: 'is', value: 'Cancelled' }], { logic: 'and' });
host.innerHTML = toText(cancelEditor.body);
cancelEditor.mount(host);
ok(host.querySelector('[data-crit-value]').value === 'Canceled', 'a saved Cancelled value is shown as Canceled');

const deal = { id: 'd1', name: '1 Main St', fileNumber: 'MD-1', propertyAddress: '1 Main St', stage: 'Active', status: 'Open', amount: 1, people: [], emails: [] };
const sales = await dealsPage({ api: { getCrmDeal: async () => deal }, me: { id: 'u', role: 'Sales Person', isAdmin: false }, params: { id: 'd1' }, refresh() {} });
const salesHtml = toText(sales.body);
ok(salesHtml.includes('data-deal-stage') && salesHtml.includes('disabled') && salesHtml.includes('value="Opened"') && salesHtml.includes('selected'), 'the deal record shows the four stages, with Opened selected, when the order is still Active');
ok(salesHtml.includes('>Closed<') && salesHtml.includes('>On Hold<') && salesHtml.includes('>Canceled<') && !salesHtml.includes('>Active<') && !salesHtml.includes('>Cancelled<'), 'the deal record does not offer Active or Cancelled');

let saved = null;
const proc = await dealsPage({
  api: { getCrmDeal: async () => deal, setDealStatus: async (id, status) => { saved = { id, status }; } },
  me: { id: 'p', role: 'Processor', isAdmin: false }, params: { id: 'd1' }, refresh() {},
});
host.innerHTML = toText(proc.body);
proc.mount(host);
const sel = host.querySelector('[data-deal-stage]');
ok(sel && !sel.disabled && sel.value === 'Opened', 'someone who runs orders can change the stage on the deal');
const picked = sel.querySelector('option[value="Canceled"]');
picked.selected = true;
sel.dispatchEvent(new window.Event('change', { bubbles: true }));
await new Promise((r) => setTimeout(r, 0));
ok(saved && saved.id === 'd1' && saved.status === 'Cancelled', 'picking Canceled saves the order status Cancelled');

console.log(fail ? fail + ' failed' : 'crm deal stage passed');
if (fail) process.exit(1);
