/* Initial form, save, selected report, then explicit send. No network and no hosted rows. */
import { readFileSync } from 'node:fs';
import { createReport, COMPOSE_NOTICE, emptyBag, getReport, isFeedbackPilot, listReports, PENDING_SEND_NOTICE, reportNotice } from '../js/data/staff-feedback.js';
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
  const node = { tag: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, listeners: {}, className: '', hidden: false, value: '', checked: false };
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
  async requestStaffFeedbackDispatch(id) { sent.push(id); return { reason: 'run_started', runAccepted: true, recorded: true, error: '' }; },
};
syncStaffFeedbackWidget({ user: other, getApi: async () => api });
await new Promise((r) => setTimeout(r, 20));
check(!document.getElementById('claStaffFeedbackRoot'), 'another account does not get the panel');
syncStaffFeedbackWidget({ user: john, getApi: async () => api });
await new Promise((r) => setTimeout(r, 30));
const root = document.getElementById('claStaffFeedbackRoot');
check(root && buttons(root).includes('Save report') && !buttons(root).includes('Send to the tech assistant'), 'the initial form can save and cannot send yet');
const notice = query(root, 'p').find((n) => n.className === 'claSfNotice');
check(notice && notice.textContent === COMPOSE_NOTICE && !/bearer|not configured/i.test(notice.textContent), 'the blank form does not say the webhook key is missing');
const title = query(root, 'input').find((n) => n.attrs['aria-label'] === 'Title');
const body = query(root, 'textarea').find((n) => n.attrs['aria-label'] === 'What happened');
title.value = 'TEST ONLY text note';
body.value = 'A local note for the save then send path.';
const form = query(root, 'form')[0];
await form.listeners.submit[0]({ preventDefault() {} });
check(buttons(root).includes('Send to the tech assistant') && !query(root, 'form').some((f) => f.hidden === false && buttons(f).includes('Save report')), 'saving selects the report and shows Send');
check(notice.textContent === PENDING_SEND_NOTICE, 'the saved report says to send and does not claim a reply');
const send = query(root, 'button').find((b) => b.textContent === 'Send to the tech assistant');
await send.listeners.click[0]();
check(sent.length === 1 && sent[0] === bag.reports[0].id && notice.textContent.includes('not a reply'), 'Send asks for that saved report and a 200 is not a reply');

const calls = [];
const hosted = staffFeedbackSupabase({
  sb: { functions: { invoke: async (name, opts) => { calls.push({ name, body: opts.body }); return { data: { reason: 'run_started', runAccepted: true, recorded: true } }; } } },
  ok: async (x) => x,
  camel: (x) => x,
});
const accepted = await hosted.requestStaffFeedbackDispatch(sent[0]);
check(calls.length === 1 && calls[0].name === 'staff-feedback-dispatch' && JSON.stringify(calls[0].body) === JSON.stringify({ explicit: true, feedback_id: sent[0] }) && accepted.runAccepted === true && accepted.replied === false, 'the production adapter sends only the explicit ids');
const refused = await staffFeedbackSupabase({
  sb: { functions: { invoke: async () => ({ error: new Error('network'), data: null }) } },
  ok: async (x) => x,
  camel: (x) => x,
}).requestStaffFeedbackDispatch(sent[0]);
check(refused.runAccepted === false && refused.replied === false && !/bearer|not configured/i.test(refused.error), 'a transport failure is not described as a missing key');
const widgetSrc = readFileSync(new URL('../js/pages/staff-feedback-widget.js', import.meta.url), 'utf8');
const browserSrc = readFileSync(new URL('../js/data/staff-feedback-dispatch.js', import.meta.url), 'utf8');
check(widgetSrc.includes("shot.accept = ACCEPT") && widgetSrc.includes('image/png') && !widgetSrc.includes('STAFF_FEEDBACK_BRIDGE') && browserSrc.includes('DISPATCH_HTTP_ENABLED = false'), 'the image chooser stays and the browser still has no webhook secret');

console.log(fail ? `${fail} failed` : 'feedback send flow passed');
if (fail) process.exit(1);
