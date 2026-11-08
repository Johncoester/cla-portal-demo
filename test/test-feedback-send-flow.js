/* Initial form, save, selected report, then explicit send. No network and no hosted rows. */
import { readFileSync } from 'node:fs';
import { addFollowUp, createReport, emptyBag, getReport, isFeedbackPilot, listReports, noteLocalDemoDispatch, PENDING_SEND_NOTICE, recordLocalDemoReply, reportNotice } from '../js/data/staff-feedback.js';
import { DISPATCH_HTTP_ENABLED } from '../js/data/staff-feedback-dispatch.js';
import { launcherAllowed } from '../js/data/staff-feedback-widget-state.js';
import { staffFeedbackSupabase } from '../js/data/supabase-staff-feedback.js';
import { syncStaffFeedbackWidget } from '../js/pages/staff-feedback-widget.js';

let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail++; console.log('FAIL', message); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156';
const MATT = 'd02722a1-582b-42c0-b3d1-28d25adb758d';
const OTHER = '33333333-3333-4333-8333-333333333333';
const john = { id: JOHN, role: 'Super admin', isAdmin: true, status: 'active', isDemo: false, firstName: 'Label', lastName: 'Ignored' };
const matt = { id: MATT, role: 'Super admin', isAdmin: true, status: 'active', isDemo: false };
const other = { id: OTHER, role: 'Super admin', isAdmin: true, status: 'active', isDemo: false, firstName: 'Ada', lastName: 'Admin' };
const buyer = { id: 'u-buyer', role: 'Buyer', status: 'active', isDemo: false };

check(DISPATCH_HTTP_ENABLED === false, 'the browser send constant stays off');
check(!isFeedbackPilot(other) && !isFeedbackPilot(buyer) && !isFeedbackPilot(john, { demoActive: true }) && !isFeedbackPilot(matt, { viewingAs: true }) && !launcherAllowed(other, {}) && launcherAllowed(john, {}) && launcherAllowed(matt, {}), 'role and demo gates stay on the two accounts');
const stale = 'Saved in the portal. Pending dispatch. Not delivered. The webhook URL and Bearer key are not configured.';
check(reportNotice({ deliveryState: 'pending_dispatch', deliveryReason: 'bridge_unconfigured', notice: stale }) === PENDING_SEND_NOTICE && !/bearer|not configured/i.test(PENDING_SEND_NOTICE), 'a saved pending report does not repeat the server configuration claim');

function makeNode(tag) {
  const node = { tag: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, listeners: {}, className: '', hidden: false, value: '', checked: false, _text: '' };
  Object.defineProperty(node, 'textContent', {
    get() { return node._text; },
    set(v) { node._text = v == null ? '' : String(v); node.children = []; },
  });
  node.classList = {
    add: (c) => { node.className = `${node.className} ${c}`.trim(); },
    remove: (c) => { node.className = node.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
    toggle: (c, on) => { if (on) node.classList.add(c); else node.classList.remove(c); },
  };
  node.setAttribute = (k, v) => { node.attrs[k] = String(v); };
  node.getAttribute = (k) => (k in node.attrs ? node.attrs[k] : null);
  node.hasAttribute = (k) => k in node.attrs;
  node.appendChild = (child) => { node.children.push(child); child.parent = node; return child; };
  node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node); };
  node.addEventListener = (type, fn) => { (node.listeners[type] ||= []).push(fn); };
  node.removeEventListener = () => {};
  node.focus = () => {};
  node.querySelector = (sel) => query(node, sel)[0] || null;
  node.querySelectorAll = (sel) => query(node, sel);
  return node;
}
function query(root, sel) {
  const all = [];
  const walk = (n) => { all.push(n); (n.children || []).forEach(walk); };
  walk(root);
  return all.filter((n) => matches(n, sel));
}
function matches(n, sel) {
  if (sel.startsWith('#')) return n.id === sel.slice(1);
  if (sel.startsWith('.')) return String(n.className || '').split(/\s+/).includes(sel.slice(1));
  if (sel.startsWith('[') && sel.endsWith(']')) return sel.slice(1, -1) in (n.attrs || {});
  return n.tag === sel.toUpperCase();
}
function installDom() {
  const body = makeNode('body');
  const document = {
    body,
    createElement: makeNode,
    createElementNS: () => makeNode('svg'),
    createTextNode: (text) => { const n = makeNode('#text'); n.textContent = text; return n; },
    getElementById: (id) => query(body, `#${id}`)[0] || null,
    querySelector: (sel) => query(body, sel)[0] || null,
    addEventListener: () => {},
    removeEventListener: () => {},
    activeElement: null,
  };
  globalThis.document = document;
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.location = { hash: '#/dashboard' };
  const mem = new Map();
  globalThis.sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  return document;
}
const buttons = (node) => query(node, 'button').map((b) => b.textContent);

installDom();
const bag = emptyBag();
const sent = [];
const api = {
  async listStaffFeedback() { return listReports(bag, john); },
  async getStaffFeedback(id) { return getReport(bag, john, id); },
  async createStaffFeedback(input) { return createReport(bag, john, input, { now: () => '2026-11-07T23:50:00.000Z' }); },
  async addStaffFeedbackTurn(id, input) { return addFollowUp(bag, john, id, input, { now: () => '2026-11-07T23:51:00.000Z' }); },
  async requestStaffFeedbackDispatch(id, eventId) { sent.push({ id, eventId: eventId || null }); return noteLocalDemoDispatch(bag, john, id, eventId); },
  async recordLocalDemoReply(id, input) { return recordLocalDemoReply(bag, john, id, input, { now: () => '2026-11-07T23:52:00.000Z' }); },
};
syncStaffFeedbackWidget({ user: other, getApi: async () => api });
await new Promise((r) => setTimeout(r, 20));
check(!document.getElementById('claStaffFeedbackRoot'), 'another account does not get the panel');
syncStaffFeedbackWidget({ user: john, getApi: async () => api });
await new Promise((r) => setTimeout(r, 30));
const root = document.getElementById('claStaffFeedbackRoot');
const notice = () => query(root, 'p').find((n) => n.className === 'claSfQuiet');
check(root && buttons(root).includes('Send') && !buttons(root).includes('Save report') && !buttons(root).includes('Save follow-up'), 'the initial form has one Send control');
check((query(root, 'p').find((n) => n.className === 'claSfEmpty') || {}).textContent.includes('when you want me to see it'), 'the empty thread does not claim a reply');
const body = query(root, 'textarea').find((n) => n.attrs['aria-label'] === 'Message');
body.value = 'The orders list hides the file number.';
const form = query(root, 'form')[0];
await form.listeners.submit[0]({ preventDefault() {} });
check(query(root, 'article').length === 1 && !query(root, 'article').some((n) => String(n.className).includes('assistant')), 'the first send keeps one user message');
check(notice().textContent.includes('Local demo only') && !/bearer|not configured/i.test(notice().textContent), 'the local send does not invent an assistant reply');
await window.__claLocalDemoReply('Local demo reply. The file number is a column, not a command.');
const allText = () => query(root, 'p').map((n) => n.textContent).join('\n');
check(query(root, 'article').length === 2 && allText().includes('Not a real reply'), 'a marked local demo reply stays in the same thread');
body.value = 'Please look at the next row too.';
await form.listeners.submit[0]({ preventDefault() {} });
check(sent.length === 2 && sent[0].eventId == null && sent[1].eventId && sent[1].eventId !== bag.reports[0].id && query(root, 'article').length === 3, 'the next turn dispatches its own event id');

const calls = [];
const hosted = staffFeedbackSupabase({
  sb: { functions: { invoke: async (name, opts) => { calls.push({ name, body: opts.body }); return { data: { reason: 'run_started', runAccepted: true, recorded: true } }; } } },
  ok: async (x) => x,
  camel: (x) => x,
});
const accepted = await hosted.requestStaffFeedbackDispatch(sent[0].id);
const follow = await hosted.requestStaffFeedbackDispatch(sent[1].id, sent[1].eventId);
check(calls[0].body.feedback_id === sent[0].id && !calls[0].body.event_id && calls[1].body.event_id === sent[1].eventId && calls[1].body.feedback_id === sent[1].id && accepted.replied === false && follow.replied === false, 'the production adapter keeps the report id and the event id apart');
const refused = await staffFeedbackSupabase({
  sb: { functions: { invoke: async () => ({ error: new Error('network'), data: null }) } },
  ok: async (x) => x,
  camel: (x) => x,
}).requestStaffFeedbackDispatch(sent[0].id);
check(refused.runAccepted === false && refused.replied === false && !/bearer|not configured/i.test(refused.error) && !hosted.recordLocalDemoReply, 'a transport failure is not described as a missing key and the hosted adapter cannot write a reply');
const widgetSrc = readFileSync(new URL('../js/pages/staff-feedback-widget.js', import.meta.url), 'utf8');
const browserSrc = readFileSync(new URL('../js/data/staff-feedback-dispatch.js', import.meta.url), 'utf8');
check(!widgetSrc.includes('STAFF_FEEDBACK_BRIDGE') && browserSrc.includes('DISPATCH_HTTP_ENABLED = false'), 'the browser still has no webhook secret');

console.log(fail ? `${fail} failed` : 'feedback send flow passed');
if (fail) process.exit(1);
