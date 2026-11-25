/* JN-CRM-CC-1 (tracker row 470). Janine Santos, Nov 24 2026, 6:06 PM ET.
 * On a Client she clicked Send Email, then Insert Template, and the toast said
 * there are no report templates. Same window for Leads, Companies, Opportunities, and Deals.
 * Cc typed in that window must be stored and shown on the record's email history.
 * Fake client only. No network and no database.
 * Run: unshare -rn node --import ./test/register-supabase-fake.mjs test/test-crm-send-email-template.js */
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';

const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
window.getSelection = () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {}, getRangeAt() { return null; } });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.confirm = () => false;
document.execCommand = () => false;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };
const local = mem(); const session = mem();
window.localStorage = local; window.sessionStorage = session;
globalThis.window = window; globalThis.document = document;
globalThis.localStorage = local; globalThis.sessionStorage = session;
globalThis.HTMLElement = window.HTMLElement; globalThis.Node = window.Node;
globalThis.confirm = window.confirm;

const { crmSupabase } = await import('../js/data/supabase-crm.js');
const { sendEmailBtn, wireSendEmail, composeOverlay, closeCompose, emailsCard, wireEmails } = await import('../js/pages/crm-compose.js');
const { toText, closeModal } = await import('../js/ui.js');

const CONTACT = 'c1';
const LEAD = 'lead-1';
const ACCOUNT = 'co-1';
const OPP = 'opp-1';
const DEAL = 'deal-1';
const REPORT = 'rpt-1';
const ME = { id: 'u-sales', role: 'Sales Person', isAdmin: false, canEdit: true, email: 'janine@example.test', firstName: 'Janine', lastName: 'Santos' };

const contact = { id: CONTACT, name: 'Ada Buyer', firstName: 'Ada', lastName: 'Buyer', email: 'ada@example.test', phone: '3015550100', orders: [], salesReps: [], tags: [], accountId: ACCOUNT };
const lead = { id: LEAD, first_name: 'Rio', last_name: 'Seller', email: 'rio@example.test', phone: '', owner_id: ME.id, company: 'Harbor', source: 'Website', status: 'New' };
const account = { id: ACCOUNT, name: 'Harbor Realty', kind: 'brokerage', phone: '3015550199', website: 'https://harbor.example.test', city: 'Rockville', state: 'MD', owner_id: ME.id, ownerName: 'Janine Santos' };
const templates = [
  { id: 'tpl-lead', name: 'Lead hello', module: 'lead', folder_id: 'fold-1', personal_owner: null, subject: 'Hello lead', kind: 'html', status: 'active', retired_at: null, body: '<p>Lead note</p>', blocks: [], page_bg: '', created_by: ME.id, created_at: '2026-11-01T00:00:00Z', modified_by: ME.id, modified_at: '2026-11-01T00:00:00Z' },
  { id: 'tpl-contact', name: 'Client hello', module: 'contact', folder_id: 'fold-1', personal_owner: null, subject: 'Hello client', kind: 'html', status: 'active', retired_at: null, body: '<p>Client note</p>', blocks: [], page_bg: '', created_by: ME.id, created_at: '2026-11-01T00:00:00Z', modified_by: ME.id, modified_at: '2026-11-01T00:00:00Z' },
  { id: 'tpl-account', name: 'Company hello', module: 'account', folder_id: 'fold-1', personal_owner: null, subject: 'Hello company', kind: 'html', status: 'active', retired_at: null, body: '<p>Company note</p>', blocks: [], page_bg: '', created_by: ME.id, created_at: '2026-11-01T00:00:00Z', modified_by: ME.id, modified_at: '2026-11-01T00:00:00Z' },
  { id: 'tpl-opp', name: 'Opportunity hello', module: 'opportunity', folder_id: 'fold-1', personal_owner: null, subject: 'Hello opportunity', kind: 'html', status: 'active', retired_at: null, body: '<p>Opportunity note</p>', blocks: [], page_bg: '', created_by: ME.id, created_at: '2026-11-01T00:00:00Z', modified_by: ME.id, modified_at: '2026-11-01T00:00:00Z' },
];

let fail = 0;
const check = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const camel = (o) => (Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
  ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o);
const unwrap = (r) => { if (r && r.error) throw new Error(r.error.message); return r ? r.data : r; };

function client() {
  const db = {
    crm_emails: [],
    crm_email_templates: templates.map((t) => ({ ...t })),
    crm_email_folders: [{ id: 'fold-1', name: 'Welcome' }],
    crm_email_favorites: [],
    crm_email_template_files: [],
    crm_user_signatures: [],
    crm_leads: [{ ...lead }],
    crm_opportunities: [{ id: OPP, name: 'Harbor referrals', stage: 'Qualification', contact_id: CONTACT, account_id: ACCOUNT, owner_id: ME.id, est_volume: 120000, expected_close: '2026-12-15' }],
    crm_activities: [],
    crm_attachments: [],
    contacts: [{ id: CONTACT, first_name: 'Ada', last_name: 'Buyer' }],
    crm_accounts: [{ id: ACCOUNT, name: 'Harbor Realty' }],
  };
  let n = 0;
  const from = (table) => {
    const q = { filters: [], order: null, inserted: null };
    const matched = () => {
      let rows = (db[table] || []).slice();
      for (const f of q.filters) {
        if (f.type === 'eq') rows = rows.filter((r) => r[f.col] === f.val);
        if (f.type === 'in') rows = rows.filter((r) => (f.val || []).includes(r[f.col]));
      }
      if (q.order) {
        const { col, asc } = q.order;
        rows.sort((a, b) => String(a[col] || '').localeCompare(String(b[col] || '')) * (asc ? 1 : -1));
      }
      return rows;
    };
    const api = {
      select() { return api; },
      eq(col, val) { q.filters.push({ type: 'eq', col, val }); return api; },
      in(col, val) { q.filters.push({ type: 'in', col, val }); return api; },
      is() { return api; },
      order(col, opts = {}) { q.order = { col, asc: opts.ascending !== false }; return api; },
      insert(row) {
        const saved = { id: 'em-' + (++n), created_at: '2026-11-24T23:06:00Z', ...row };
        (db[table] ||= []).push(saved);
        q.inserted = saved;
        return api;
      },
      maybeSingle() { const rows = q.inserted ? [q.inserted] : matched(); return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { const rows = q.inserted ? [q.inserted] : matched(); return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'No row' } }); },
      then(res, rej) { return Promise.resolve({ data: q.inserted ? [q.inserted] : matched(), error: null }).then(res, rej); },
    };
    return api;
  };
  const sb = {
    from,
    rpc: async (name, args = {}) => {
      if (name === 'crm_contact_list') return { data: [{ ...contact }], error: null };
      if (name === 'crm_contact_detail') return { data: { ...contact, orders: [] }, error: null };
      if (name === 'crm_account_list') return { data: [{ ...account }], error: null };
      if (name === 'crm_account_detail') return { data: { contactList: [], orders: [] }, error: null };
      if (name === 'crm_owners' || name === 'crm_assignees') return { data: [{ id: ME.id, name: 'Janine Santos', role: ME.role }], error: null };
      if (name === 'crm_settings') return { data: null, error: null };
      if (name === 'crm_invited_meetings') return { data: [], error: null };
      if (name === 'deal_contacts') return { data: [{ role: 'Client', first_name: 'Ada', last_name: 'Buyer', email: 'ada@example.test', contact_id: CONTACT, contact_hidden: false }], error: null };
      if (name === 'crm_deals') return { data: [{ id: DEAL, name: '1 Main St', fileNumber: 'MD-1', stage: 'Open', status: 'Open' }], error: null };
      return { data: [], error: null, args };
    },
  };
  return { sb, db };
}

function apiFrom() {
  const made = client();
  const me = async () => ({ ...ME });
  const api = crmSupabase({ sb: made.sb, ok: unwrap, camel, me, flags: { crm: true } });
  return { api, db: made.db };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }
const toastText = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent || '').join(' | ');
function clearUi() {
  closeCompose(); closeModal();
  const box = document.getElementById('toasts'); if (box) box.remove();
  document.body.innerHTML = '';
}

const REPORT_TOAST = 'there are no report templates yet';
const DEAL_TOAST = 'there are no Deal templates yet';

async function openSend(api, entity, id) {
  clearUi();
  const host = document.createElement('div');
  host.innerHTML = toText(sendEmailBtn(entity, id, ME));
  document.body.appendChild(host);
  wireSendEmail(host, api, ME, () => {});
  const btn = host.querySelector('[data-send-email]');
  check(btn && btn.getAttribute('data-send-email') === `${entity}:${id}`, `Send Email on a ${entity} record is labeled ${entity}:${id}`);
  btn.click();
  await settle();
  return document.getElementById('compose-overlay');
}

async function insertTemplate(overlay, { pick, label, absent }) {
  overlay.querySelector('[data-insert-template]').click();
  await settle();
  const said = toastText();
  const modal = document.getElementById('modal');
  const text = modal ? modal.textContent : '';
  check(!said.includes(REPORT_TOAST) && !!modal && text.includes(label) && text.includes(pick) && !text.includes(absent), `Insert Template on ${label} opens that module's templates (${said || 'no toast'})`);
  const link = modal && [...modal.querySelectorAll('[data-pick-tpl]')].find((a) => a.getAttribute('data-pick-tpl'));
  if (link) { link.click(); await settle(); }
  return overlay.querySelector('[data-compose-subject]');
}

const { api, db } = apiFrom();

const clientWindow = await openSend(api, 'contact', CONTACT);
check(!!clientWindow && clientWindow.textContent.includes('Ada Buyer'), 'Send Email on a Client opens that client');
clientWindow.querySelector('[data-add-cc]').click();
const ccRow = clientWindow.querySelector('[data-cc-row]');
check(ccRow && ccRow.hidden === false, 'Add Cc shows the Cc box');
clientWindow.querySelector('[data-pill-entry="cc"]').value = 'boss@example.test';
const subject = await insertTemplate(clientWindow, { pick: 'Client hello', label: 'Clients templates', absent: 'Lead hello' });
check(subject && subject.value === 'Hello client', 'the Client template fills the subject');
clientWindow.querySelector('[data-send-now]').click();
await settle();
check(!toastText().includes('not a valid email') && !document.getElementById('compose-overlay'), `Send closes the window (${toastText() || 'no toast'})`);
const saved = db.crm_emails.find((r) => r.entity === 'contact' && r.entity_id === CONTACT);
check(saved && saved.cc_emails.includes('boss@example.test') && saved.to_emails.includes('ada@example.test') && saved.status === 'drafted', 'the saved Client email keeps the Cc address and is not sent');
const listed = await api.listCrmEmails('contact', CONTACT);
check(listed.length === 1 && listed[0].cc.includes('boss@example.test') && listed[0].statusLabel === 'Drafted (not sent)', 'the Client email list returns the Cc');
const history = document.createElement('div');
history.innerHTML = toText(emailsCard(listed));
document.body.appendChild(history);
check(history.textContent.includes('Cc: boss@example.test') && history.textContent.includes('Hello client'), 'the Client email history shows the Cc under the subject');
wireEmails(history, api, listed);
const view = history.querySelector('[data-view-email]');
if (view) { view.click(); await settle(); }
const opened = document.getElementById('modal');
check(!!view && opened && opened.textContent.includes('Cc: boss@example.test') && opened.textContent.includes('Drafted (not sent)'), 'opening that email shows the Cc');

for (const [entity, id, pick, label, absent] of [
  ['lead', LEAD, 'Lead hello', 'Leads templates', 'Client hello'],
  ['account', ACCOUNT, 'Company hello', 'Companies templates', 'Client hello'],
]) {
  const box = await openSend(api, entity, id);
  const sub = await insertTemplate(box, { pick, label, absent });
  check(sub && sub.value.startsWith('Hello'), `the ${entity} template fills the subject`);
}

const opp = await (async () => { clearUi(); const m = await composeOverlay(api, ME, 'opportunity', OPP); return m; })();
const oppSub = await insertTemplate(opp, { pick: 'Opportunity hello', label: 'Opportunities templates', absent: 'Client hello' });
check(oppSub && oppSub.value === 'Hello opportunity', 'an Opportunity uses its own templates');

const deal = await openSend(api, 'deal', DEAL);
deal.querySelector('[data-insert-template]').click();
await settle();
check(toastText().includes(DEAL_TOAST) && !toastText().includes(REPORT_TOAST) && !document.getElementById('modal'), `a Deal still has no templates, and the message says Deal (${toastText()})`);

clearUi();
const report = await composeOverlay(api, ME, 'report', REPORT);
report.querySelector('[data-insert-template]').click();
await settle();
check(toastText().includes(REPORT_TOAST) && !document.getElementById('modal'), 'a report still says there are no report templates');

for (const [entity, id, cc] of [['lead', LEAD, 'lead-cc@example.test'], ['account', ACCOUNT, 'co-cc@example.test'], ['deal', DEAL, 'deal-cc@example.test']]) {
  const row = await api.saveCrmEmail({ entity, entityId: id, to: ['ada@example.test'], cc: [cc], bcc: ['hidden@example.test'], subject: 'With a copy', html: '<p>Hi</p>', mode: 'send' });
  check(row.status === 'drafted' && row.emailed === false, `sending a ${entity} email still does not send it`);
  const rows = await api.listCrmEmails(entity, id);
  const hit = rows.find((r) => r.subject === 'With a copy');
  const card = toText(emailsCard(rows.filter((r) => r.subject === 'With a copy')));
  check(hit && hit.cc.includes(cc) && hit.bcc.includes('hidden@example.test') && card.includes('Cc: ' + cc), `${entity} keeps Cc through send and shows it in the email history`);
}

let oppSave = '';
try { await api.saveCrmEmail({ entity: 'opportunity', entityId: OPP, to: ['ada@example.test'], cc: ['x@example.test'], subject: 'Nope', html: '<p>Hi</p>', mode: 'send' }); }
catch (e) { oppSave = e.message; }
check(oppSave.includes('opportunity draft is stored on its client'), 'an Opportunity email is still not stored as its own draft');

clearUi();
console.log(fail ? fail + ' failed' : 'crm send email templates passed');
if (fail) process.exit(1);
