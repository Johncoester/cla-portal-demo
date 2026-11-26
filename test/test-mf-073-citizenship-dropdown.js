/* MF-073 (Matt, Nov 25 2026): Citizenship is a dropdown. Leftover typed answers stay until edited. */
import { createHash } from 'node:crypto';
import { readFileSync as read } from 'node:fs';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { intakeFormHtml } from '../js/pages/dealtaskform.js';
import { spouseSectionHtml } from '../js/pages/spouse.js';
import { TEMPLATE_DEFS, applyCitizenshipDropdown, CITIZENSHIP_OPTS, CITIZENSHIP_KEEP, validateForm } from '../js/data/templates.js';
import { toText } from '../js/ui.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

ok(CITIZENSHIP_OPTS.join('|') === 'U.S. Citizen|U.S. National|Lawful Permanent Resident|Non-Citizen Authorized to Work', 'Matt\'s four official options');
const v9 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 9);
const field = v9.fields.find((f) => f.k === 'citizenship');
ok(field.type === 'select' && field.opts.join('|') === CITIZENSHIP_OPTS.join('|') && CITIZENSHIP_KEEP.includes('US Citizen') && field.keep.includes('US Citizen') && field.roles.includes('Client-Buyer') && field.roles.includes('Client-Seller') && field.req === false, 'personal_info v9 uses the dropdown for buyers and sellers, and it is not required');

const leftover = { k: 'citizenship', label: 'Citizenship', type: 'select', req: false, opts: CITIZENSHIP_OPTS, keep: CITIZENSHIP_KEEP };
ok(validateForm([leftover], { citizenship: 'US Citizen' }, false).errors.length === 0, 'a leftover historical answer still validates');
ok(validateForm([leftover], { citizenship: 'Born in Canada' }, false).errors.some((e) => /pick one of the options/i.test(e.msg)), 'a new value that is not in the list is refused');
ok(validateForm([leftover], { citizenship: 'U.S. National' }, false).data.citizenship === 'U.S. National', 'an official option validates');
ok(!validateForm([leftover], { citizenship: '   ' }, false).data.citizenship, 'a blank answer is allowed');

const api = createMockAdapter({ storage: mem() });
await api.signInDev('u-admin');
const deal = await api.createDeal({ street: '17 Citizen Lane', city: 'Rockville', state: 'MD', zip: '20850', processorId: 'u-proc' });
await api.addParticipant(deal.id, 'c-buyer', 'Client-Buyer');
await api.signInDev('u-buyer');
const personal = (await api.listTasks(deal.id)).find((t) => t.templateCode === 'personal_info' && t.assignedRole === 'Client-Buyer' && t.mine);
const opened = await api.getTask(personal.id);
const markup = toText(intakeFormHtml({ ...opened, formData: { ...(opened.formData || {}), citizenship: 'US' } }, { page: true, state: 'MD' }));
ok(markup.includes('<select name="citizenship">') && markup.includes('>US<') && markup.includes('selected') && CITIZENSHIP_OPTS.every((o) => markup.includes(o)) && !markup.includes('>Maybe<'), 'the form shows the official options plus the leftover answer, and not other leftovers');
const kept = await api.saveTaskForm(personal.id, { ...(opened.formData || {}), citizenship: 'US' });
ok(kept.formData.citizenship === 'US', 'saving the leftover value leaves it as typed until someone edits');
const official = await api.saveTaskForm(personal.id, { ...kept.formData, citizenship: 'U.S. Citizen' });
ok(official.formData.citizenship === 'U.S. Citizen', 'picking an official option replaces the leftover');

const spouse = toText(spouseSectionHtml({ participantId: 'p1', citizenship: 'Canada', fullName: 'Sam Spouse' }, false));
ok(spouse.includes('<select name="spouseCitizenship">') && spouse.includes('Canada') && !spouse.includes('<input name="spouseCitizenship"'), 'spouse leftover citizenship is a selected option');

const d = { taskTemplates: [{ code: 'personal_info', fields: [{ k: 'citizenship', type: 'text' }, { k: 'gender', type: 'select', opts: ['Female'] }] }], tasks: [{ formData: { citizenship: 'Maybe' } }], spouseInfo: [{ citizenship: 'Canada' }] };
ok(applyCitizenshipDropdown(d).changed === 1 && d.taskTemplates[0].fields[0].opts.join('|') === CITIZENSHIP_OPTS.join('|') && d.taskTemplates[0].fields[0].keep.includes('Maybe') && d.taskTemplates[0].fields[0].keep.includes('Canada') && d.taskTemplates[0].fields[1].type === 'select' && d.tasks[0].formData.citizenship === 'Maybe', 'the helper adds leftover answers to keep and does not rewrite the saved value');
ok(applyCitizenshipDropdown(d).changed === 0, 'the helper is idempotent once the official options and leftovers are in place');

const sql = read('supabase/migrations/20261131250000_citizenship_dropdown.sql', 'utf8');
const roll = read('supabase/rollbacks/20261131250000_citizenship_dropdown.sql', 'utf8');
const free = read('supabase/migrations/20261125180000_citizenship_free_text.sql', 'utf8');
ok(!/create or replace function/i.test(sql) && !/create policy|security definer/i.test(sql) && !/alter table public\.spouse_info/i.test(sql), 'the migration does not change a function, a policy, or the spouse column');
ok(sql.includes('U.S. National') && sql.includes('does not edit 20261125180000_citizenship_free_text.sql'), 'the migration is a new forward file and names the four official options');
ok(roll.includes("jsonb_build_object('type', 'text')"), 'the rollback returns citizenship to a typed line');
ok(free.includes("jsonb_build_object('type', 'text')") && !free.includes('20261131250000'), 'JN-CITIZEN-1\'s file is untouched');
console.log('citizenship-dropdown-sha256', createHash('sha256').update(sql).digest('hex'));
console.log('citizenship-dropdown-rollback-sha256', createHash('sha256').update(roll).digest('hex'));

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('mf-073 citizenship dropdown passed');
