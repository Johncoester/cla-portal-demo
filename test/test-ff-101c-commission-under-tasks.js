/* FF-101c (Francis Nov 18 11 AM notes, confirmed by John Nov 18 2:13 PM ET):
 * Commission / Agent fees move off File Overview and under the buyer-agent and listing-agent task sections.
 * Fields are unchanged (FF-101b is separate). Accounting still shows the read-only summary. Fake data only. */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { readFileSync } from 'node:fs';
import { toText } from '../js/ui.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { render as renderDeal } from '../js/pages/deal.js';
import { render as renderTasks } from '../js/pages/dealtasks.js';
import { embedSideHtml, FEE_SIDE_TASK_BOX, agentFeesPointer, agentFeesSummaryHtml } from '../js/pages/agent-fees-box.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window; globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node; globalThis.Event = window.Event;
globalThis.location = { hash: '#/deals/x/tasks', search: '', pathname: '/' };

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok(FEE_SIDE_TASK_BOX.buyer === 'buyer-agent' && FEE_SIDE_TASK_BOX.listing === 'listing-agent', 'each fee side maps to its agent task section');
const emb = toText(embedSideHtml('listing', { commission: { percent: 3, amount: 12000, payer: 'seller' }, admin: null, other: [] }, 'edit', { kind: 'staff' }));
ok(emb.includes('data-agent-fees') && emb.includes('data-agent-fees-side="listing"') && emb.includes('data-agent-fee-side="listing"') && emb.includes('$12,000'), 'a reusable side embed keeps the walkthrough selectors and the commission fields');

const pointer = toText(agentFeesPointer('link', 'd1'));
ok(pointer.includes('#/deals/d1/tasks') && /task sections on Tasks/.test(pointer) && !/file overview/i.test(pointer), 'pointers send people to Tasks, not File Overview');
const summary = toText(agentFeesSummaryHtml({ sides: { listing: 'read' }, fees: { listing: { commission: { percent: 3, amount: 12000, payer: 'seller' }, admin: null, other: [] } } }, 'd1'));
ok(summary.includes('data-agent-fees-summary') && summary.includes('$12,000') && summary.includes('#/deals/d1/tasks'), 'Accounting still shows commissions read only and links to Tasks');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem(), features: { accounting: true } });
await api.signInDev('u-proc');
const deal = await api.createDeal({ street: '9 Commission Nest Way', city: 'Rockville', state: 'MD', zip: '20850', openDate: '2026-11-01', purchasePrice: '400000' });
await api.saveAgentFees(deal.id, 'listing', { commission: { basis: 'percent', percent: 3, amount: 12000, payer: 'seller' }, admin: { amount: 100, payer: 'seller' }, other: [] }, '');
await api.saveAgentFees(deal.id, 'buyer', { commission: { basis: 'percent', percent: 2, amount: 8000, payer: 'buyer' }, admin: { amount: 395, payer: 'buyer' }, other: [] }, '');
const full = await api.getDeal(deal.id);
const ctx = { api, user: await api.getSession(), refresh() {}, go() {} };

const overview = await renderDeal({ ...ctx, params: { id: full.id, tab: 'overview' } });
const ovHtml = toText(overview.body);
ok(!ovHtml.includes('data-agent-fees') && !ovHtml.includes('data-agent-fee-side'), 'File Overview no longer shows the Agent fees box');

globalThis.location.hash = `#/deals/${full.id}/tasks`;
const tasks = await renderTasks({ ...ctx, deal: full });
const taskHtml = toText(tasks.body);
ok(taskHtml.includes('data-sidebox="listing-agent"') && taskHtml.includes('data-agent-fees-side="listing"'), 'listing commission sits under Listing Agent tasks');
ok(taskHtml.includes('data-sidebox="buyer-agent"') && taskHtml.includes('data-agent-fees-side="buyer"'), 'buyer agent commission sits under Buyer\'s Agent tasks');
ok(/data-sidebox="listing-agent"[\s\S]*data-agent-fees-side="listing"/.test(taskHtml), 'listing fees are nested inside the listing-agent section');
ok(/data-sidebox="buyer-agent"[\s\S]*data-agent-fees-side="buyer"/.test(taskHtml), 'buyer fees are nested inside the buyer-agent section');

const buyerUser = { id: 'u-buyer', role: 'Client-Buyer', roles: ['Client-Buyer'], accountRole: 'Outside user' };
const buyerApi = { ...api, listTasks: async () => [], listAgreements: async () => ({ agreements: [] }), getAgentFees: async () => { throw new Error('buyers must not read agent fees'); } };
const buyerTasks = await renderTasks({ api: buyerApi, user: buyerUser, deal: full, refresh() {}, go() {} });
ok(!toText(buyerTasks.body).includes('data-agent-fees'), 'a buyer never sees Agent fees on Tasks');

const dealSrc = readFileSync(new URL('../js/pages/deal.js', import.meta.url), 'utf8');
ok(!dealSrc.includes('agentFeesPanel') && dealSrc.includes('agentFeesPointer'), 'deal.js no longer mounts the overview panel; Edit order details still points to Agent fees');
const tasksSrc = readFileSync(new URL('../js/pages/dealtasks.js', import.meta.url), 'utf8');
ok(tasksSrc.includes('agentFeesPanel') && tasksSrc.includes('FEE_SIDE_TASK_BOX'), 'dealtasks mounts the reusable Agent fees embeds under the agent task sections');

console.log(fail ? fail + ' failed' : 'FF-101c commission under tasks passed');
if (fail) process.exit(1);
