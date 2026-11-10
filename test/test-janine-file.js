/* FF-042 through FF-045 and the lender-already-on-file note. Local mock only. */
import { createHash } from 'node:crypto';
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { yourAgentHtml, withContactPhone } from '../js/pages/your-agent.js';
import { lenderSavedOnFile, tasksWithLenderOnFile, renderClientOverview } from '../js/pages/client-overview.js';
import { CITIZENSHIP_OPTS } from '../js/data/templates.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const css = read('css/portal.css', 'utf8');
const app = read('js/app.js', 'utf8');
const dealPage = read('js/pages/deal.js', 'utf8');
ok(/\.order-header \{[^}]*position:\s*sticky/.test(css) && css.includes('top: var(--topbar-h)'), 'the staff file header sticks under the top bar');
ok(app.includes('data-oh-purchase') && app.includes('data-oh-parties') && !dealPage.includes('noOrderHeader'), 'every file tab, including the overview, shows purchase and parties from the deal already loaded');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-buyer');
const profile = await api.getMyProfile();
const user = { ...profile, role: 'Client-Buyer', roles: ['Client-Buyer'] };
const deal = await api.getDeal('deal-1');
const view = await renderClientOverview({ api, user, go() {}, refresh() {}, wireModal() {}, shareModal() {} }, deal, []);
const html = toText(view.body);
ok(!html.includes('(you)') && !html.includes('data-co-you"') && !html.includes('data-co-person="Ben Buyer"'), 'the closing team does not list the viewing client');
ok(html.includes('301-555-0105') || html.includes('data-agent-tel'), 'the Your Agent card shows the phone already on the file');

const card = toText(yourAgentHtml(withContactPhone(
  [{ firstName: 'Danny', lastName: 'Lowery', email: 'danny@example.test', cellPhone: '', officePhone: '', side: 'buyer', brokerage: 'Compass' }],
  { participants: [{ contact: { email: 'danny@example.test', phone: '240-555-0199' } }] },
)));
ok(card.includes('240-555-0199') && card.includes('data-agent-tel') && card.includes('danny@example.test'), 'a card that loaded email only picks up the contact phone already on the deal');

const openLender = { id: 't-lender', templateCode: 'lender_info', title: 'Lender information', status: 'todo', mine: true };
const kept = tasksWithLenderOnFile([openLender], { participants: [{ role: 'Lender', contact: { company: 'CrossCountry Mortgage LLC', firstName: 'Jordan', lastName: 'Dobbs' } }] });
ok(kept.length === 1 && kept[0].templateCode === 'lender_info' && kept[0].lenderOnFile && kept[0].status === 'done' && kept[0].completedByLabel === 'Already on the file', 'a lender task stays, and the buyer sees it as already on the file');
ok(!lenderSavedOnFile({ participants: [], lenderName: '' }), 'a file with no lender still asks');
const stillOpen = tasksWithLenderOnFile([openLender], { participants: [] });
ok(stillOpen[0].status === 'todo' && !stillOpen[0].lenderOnFile, 'without a lender on the file the task stays open');

await api.signInDev('u-admin');
const placed = await api.createDeal({ street: '16 Buyer Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(placed.id, 'c-buyer', 'Client-Buyer');
await api.signInDev('u-buyer');
const personal = (await api.listTasks(placed.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
const opened = await api.getTask(personal.id);
const field = opened.fields.find((f) => f.k === 'citizenship');
ok(field && field.type === 'select' && CITIZENSHIP_OPTS.every((o) => field.opts.includes(o)), 'citizenship is a dropdown with the four choices');
const legacy = toText(intakeFormHtml({ ...opened, formData: { ...opened.formData, citizenship: 'US Citizen' } }, { page: true, state: 'MD' }));
ok(legacy.includes('<select name="citizenship"') && legacy.includes('US Citizen') && legacy.includes('U.S. Citizen') && legacy.includes('selected'), 'an answer already saved stays selected');
const saved = await api.saveTaskForm(personal.id, { ...(opened.formData || {}), citizenship: 'US Citizen' });
ok(saved.formData.citizenship === 'US Citizen', 'saving keeps the citizenship already on the file');

const sql = read('supabase/migrations/20261112060400_citizenship_and_agent_phone.sql', 'utf8');
const roll = read('supabase/rollbacks/20261112060400_citizenship_and_agent_phone.sql', 'utf8');
ok(sql.includes("'U.S. Citizen'") && sql.includes('c.mobile') && !/create policy|security definer function private\./i.test(sql), 'the migration updates the dropdown and the card query without a new per-row policy');
ok(roll.includes("jsonb_build_object('type', 'text')") && roll.includes('coalesce(nullif(a.cell_phone, \'\'), c.phone)'), 'the rollback restores the text box and the previous phone expression');
console.log('citizenship-migration-sha256', createHash('sha256').update(read('supabase/migrations/20261112060400_citizenship_and_agent_phone.sql')).digest('hex'));
console.log('citizenship-rollback-sha256', createHash('sha256').update(roll).digest('hex'));

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('janine file checks passed');
