/* FF-042 through FF-045 and the lender-already-on-file note. Local mock only. */
import { createHash } from 'node:crypto';
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { yourAgentHtml, withContactPhone } from '../js/pages/your-agent.js';
import { lenderSavedOnFile, tasksWithLenderOnFile, renderClientOverview, closingTeamSelf } from '../js/pages/client-overview.js';
import { TEMPLATE_DEFS, applyCitizenshipFreeText } from '../js/data/templates.js';
import { spouseSectionHtml } from '../js/pages/spouse.js';
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
ok(closingTeamSelf({ contact: { email: 'ben.buyer@example.test' } }, { id: 'other', email: 'Ben.Buyer@example.test' }), 'a buyer row with no portal id still matches their email');
ok(!closingTeamSelf({ contact: { email: 'ada@example.test' } }, { id: 'u-buyer', email: 'ben.buyer@example.test' }), 'another person on the file stays on the closing team');
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
const sellerField = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 8).fields.find((f) => f.k === 'citizenship');
ok(field && field.type === 'text' && !field.opts && sellerField && sellerField.type === 'text' && sellerField.roles.includes('Client-Seller'), 'citizenship is a single line for the buyer and the seller');
const legacy = toText(intakeFormHtml({ ...opened, formData: { ...opened.formData, citizenship: 'US Citizen' } }, { page: true, state: 'MD' }));
ok(legacy.includes('<input type="text" name="citizenship" value="US Citizen"') && !legacy.includes('<select name="citizenship"'), 'an answer already saved shows in the line');
const saved = await api.saveTaskForm(personal.id, { ...(opened.formData || {}), citizenship: 'US Citizen' });
ok(saved.formData.citizenship === 'US Citizen', 'saving keeps the citizenship already on the file');
const typed = await api.saveTaskForm(personal.id, { ...saved.formData, citizenship: 'Born in Canada', gender: 'Female' });
ok(typed.formData.citizenship === 'Born in Canada' && typed.formData.gender === 'Female', 'a typed answer that is not one of the old choices is saved');
const cleared = await api.saveTaskForm(personal.id, { ...typed.formData, citizenship: '   ' });
ok(!cleared.formData.citizenship && cleared.formData.gender === 'Female', 'a blank citizenship is left empty and the other answers stay');
const spouse = toText(spouseSectionHtml({ participantId: 'p1', citizenship: 'Canada', fullName: 'Sam Spouse' }, false));
ok(spouse.includes('<input name="spouseCitizenship" value="Canada"') && !spouse.includes('<select name="spouseCitizenship"'), 'the spouse citizenship line stays a text box and shows the saved answer');
const oldTpl = { taskTemplates: [{ code: 'personal_info', fields: [{ k: 'citizenship', type: 'select', opts: ['U.S. Citizen'], keep: ['US Citizen'] }, { k: 'gender', type: 'select', opts: ['Female'] }] }], tasks: [{ formData: { citizenship: 'US Citizen' } }] };
ok(applyCitizenshipFreeText(oldTpl).changed === 1 && oldTpl.taskTemplates[0].fields[0].type === 'text' && !oldTpl.taskTemplates[0].fields[0].opts && oldTpl.taskTemplates[0].fields[1].type === 'select' && oldTpl.tasks[0].formData.citizenship === 'US Citizen', 'a stored dropdown becomes a line and the saved answer stays');
ok(applyCitizenshipFreeText(oldTpl).changed === 0, 'running the rewrite again changes nothing');

const sql = read('supabase/migrations/20261112060400_citizenship_and_agent_phone.sql', 'utf8');
const roll = read('supabase/rollbacks/20261112060400_citizenship_and_agent_phone.sql', 'utf8');
ok(sql.includes("'U.S. Citizen'") && sql.includes('c.mobile') && !/create policy|security definer function private\./i.test(sql), 'the earlier migration that made the dropdown is unchanged');
ok(roll.includes("jsonb_build_object('type', 'text')") && roll.includes('coalesce(nullif(a.cell_phone, \'\'), c.phone)'), 'the earlier rollback still restores the text box and the previous phone expression');
const free = read('supabase/migrations/20261125180000_citizenship_free_text.sql', 'utf8');
const freeRoll = read('supabase/rollbacks/20261125180000_citizenship_free_text.sql', 'utf8');
ok(free.includes("jsonb_build_object('type', 'text')") && free.includes('spouse_info.citizenship') && !/alter table public\.spouse_info/i.test(free) && !/create type|create policy/i.test(free), 'the new file sets the question back to text and does not change the column');
ok(freeRoll.includes("'type', 'select'") && freeRoll.includes('US Citizen') && !/alter table public\.spouse_info/i.test(freeRoll), 'the rollback puts the dropdown back and leaves the column alone');
console.log('citizenship-migration-sha256', createHash('sha256').update(read('supabase/migrations/20261112060400_citizenship_and_agent_phone.sql')).digest('hex'));
console.log('citizenship-rollback-sha256', createHash('sha256').update(roll).digest('hex'));
console.log('citizenship-free-text-sha256', createHash('sha256').update(free).digest('hex'));
console.log('citizenship-free-text-rollback-sha256', createHash('sha256').update(freeRoll).digest('hex'));

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('janine file checks passed');
