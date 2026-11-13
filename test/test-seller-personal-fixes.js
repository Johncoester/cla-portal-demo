/* FF-068 #8/#9/#11/#12 (Janine's Nov 12 video; Francis confirm-back Nov 12 6:14 PM ET). Fake numbers only. */
import { readFileSync } from 'node:fs';
import { parseHTML } from '/tmp/domtest/node_modules/linkedom/worker.js';
import { TEMPLATE_DEFS, fieldsForRole, applyPersonalV8, SELLER_PRIMARY_LABEL } from '../js/data/templates.js';
import { ssnDash, bindSsnDash, showSsnMask, spouseSectionHtml } from '../js/pages/spouse.js';
import { buyerSsnHtml } from '../js/pages/dealtaskform.js';

let fail = 0; const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const v8 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 8);
const seller = fieldsForRole(v8.fields, 'Client-Seller'); const buyer = fieldsForRole(v8.fields, 'Client-Buyer');
// #8 EIN/Tax ID for entities
const ein = v8.fields.find((f) => f.k === 'entity_tax_id');
ok(ein && ein.label === 'EIN/Tax ID' && ein.req === true && JSON.stringify(ein.when) === '["is_entity",true]', 'EIN/Tax ID is asked (required) once "Add entity" is ticked');
ok(seller.some((f) => f.k === 'entity_tax_id') && buyer.some((f) => f.k === 'entity_tax_id'), 'buyers and sellers selling or buying as an entity both see it');
ok(v8.fields.findIndex((f) => f.k === 'entity_tax_id') === v8.fields.findIndex((f) => f.k === 'entity_state') + 1, 'it sits after the state the entity was formed in');
// #11 seller wording
ok(seller.find((f) => f.k === 'primary_residence').label === SELLER_PRIMARY_LABEL && SELLER_PRIMARY_LABEL === 'Is the property your primary residence?', 'sellers read "Is the property your primary residence?"');
ok(buyer.find((f) => f.k === 'primary_residence').label === 'Will the property be your primary residence?', 'buyers keep their wording');
// #12 water meter
ok(!v8.fields.some((f) => f.k === 'water_meter_where') && seller.some((f) => f.k === 'water_meter'), '"Where is the water meter?" is gone; the location question stays');
// #9 SSN visible with dashes, masked after save
ok(ssnDash('900123456') === '900-12-3456' && ssnDash('9001') === '900-1' && ssnDash('900-12-34567') === '900-12-3456' && ssnDash('90') === '90', 'dashes are added as you type');
const { document } = parseHTML(`<form>${buyerSsnHtml('', false)}${spouseSectionHtml({ participantId: 'p1', taskId: 't1', ssn: '' }, false)}</form>`);
const inputs = [...document.querySelectorAll('[data-ssn-dash]')];
ok(inputs.length === 2 && inputs.every((i) => i.getAttribute('type') === 'text'), 'the seller and spouse SSN boxes show the digits (not a password box)');
bindSsnDash(document);
inputs[0].value = '900123456'; inputs[0].dispatchEvent(new document.defaultView.Event('input'));
ok(inputs[0].value === '900-12-3456', 'typing 9 digits shows 900-12-3456');
showSsnMask(inputs[0]);
ok(inputs[0].value === '' && document.querySelector('[data-buyer-ssn-box] [data-ssn-mask]').textContent === '***-**-3456', 'after saving, only ***-**-3456 is shown');
const src = readFileSync(new URL('../js/pages/dealtaskform.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/pages/spouse.js', import.meta.url), 'utf8');
ok(!/data-(buyer-ssn|spouse-ssn-input) type="password"/.test(src) && (src.match(/showSsnMask\(/g) || []).length >= 5, 'every SSN save masks the number afterwards');
// existing answers stay
const v7 = TEMPLATE_DEFS.find((t) => t.code === 'personal_info' && t.version === 7);
const d = { taskTemplates: [{ ...v7, id: 'tt-personal_info-v7', active: true }], tasks: [
  { id: 'a', templateCode: 'personal_info', templateId: 'tt-personal_info-v7', kind: 'form', status: 'todo', savedAt: 'x', formData: { water_meter_where: 'By the steps' } },
  { id: 'b', templateCode: 'personal_info', templateId: 'tt-personal_info-v7', kind: 'form', status: 'todo', savedAt: null, formData: {} }] };
const r = applyPersonalV8(d);
ok(r.added.length === 1 && r.moved === 1 && d.tasks[0].templateId === 'tt-personal_info-v7' && d.tasks[0].formData.water_meter_where === 'By the steps' && d.tasks[1].templateVersion === 8, 'only the untouched copy moves; saved answers stay');
ok(applyPersonalV8(d).added.length === 0, 'running it again changes nothing');
const sql = readFileSync(new URL('../supabase/migrations/20261117150000_personal_info_v8.sql', import.meta.url), 'utf8');
ok(/drift/.test(sql) && /entity_tax_id/.test(sql) && /roleLabels/.test(sql) && /water_meter_where/.test(sql) && /task\.saved_at is null/.test(sql), 'the database file publishes the same version and moves only untouched copies');
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('seller personal fixes passed');
