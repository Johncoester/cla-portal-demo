/* Select all matching records (JN-47). Fake data only. No network and no hosted database. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMAIL_DRAFT_BATCH, filterFromValues, inNyRange, matchBannerState, nyDay, rowMatches } from '../js/data/crm-match.js';
import { updateSelectedNotes } from '../js/data/crm-bulk.js';
import { createMockAdapter } from '../js/data/mock-adapter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

ok(EMAIL_DRAFT_BATCH === 500, 'email drafts are inserted 500 at a time, with no recipient cap');
ok(nyDay('2026-11-11T04:30:00Z') === '2026-11-10', 'a timestamp just after midnight UTC is still the previous day in New York');
ok(nyDay('2026-11-11T15:00:00Z') === '2026-11-11' && inNyRange('2026-11-11T15:00:00Z', '2026-11-11', '2026-11-11') && !inNyRange('2026-11-11T04:30:00Z', '2026-11-11', '2026-11-11'), 'a from/to date is the New York civil day');
ok(!inNyRange('', '2026-11-11', '2026-11-11') && inNyRange('2026-11-11', '2026-11-11', '2026-11-11'), 'a blank value does not match a date, and a date-only value stays that date');

const offer = matchBannerState({ allOnPage: true, pageCount: 100, matchCount: 1234, allMatching: false });
ok(offer && offer.mode === 'offer' && offer.matchCount === 1234 && offer.pageCount === 100, 'selecting the page offers every matching record');
ok(matchBannerState({ allOnPage: true, pageCount: 8, matchCount: 8, allMatching: false }) === null, 'no banner when the page already holds every match');
ok(matchBannerState({ allOnPage: true, pageCount: 100, matchCount: 1234, allMatching: true }).mode === 'all', 'after the click, the selection is every match');

const inside = { id: 'a', name: 'Ada', email: 'ada@example.test', createdAt: '2026-11-11T15:00:00Z', archived: false, converted: false, status: 'Potential/Warm' };
const outside = { id: 'b', name: 'Bea', email: 'bea@example.test', createdAt: '2026-11-11T04:30:00Z', archived: false, converted: false, status: 'Potential/Warm' };
const filter = filterFromValues({ q: 'ada', createdFrom: '2026-11-11', createdTo: '2026-11-11' });
ok(rowMatches(inside, filter) && !rowMatches(outside, filter), 'the filter keeps the New York day and the search words');

const mig = read('supabase/migrations/20261112120000_crm_match_mass.sql');
const rb = read('supabase/rollbacks/20261112120000_crm_match_mass.sql');
ok(mig.includes('crm_match_ids') && mig.includes('crm_mass_update') && mig.includes('crm_mass_email') && mig.includes('batch_size constant int := 500'), 'the migration adds match, update, and batched email');
ok(!/private\.[a-z_]/.test(mig), 'the migration does not call a private helper');
ok(mig.includes("at time zone 'America/New_York'") && mig.includes('l.created_at >= c_lo') && !mig.includes('created_at at time zone'), 'date bounds are computed once and the column stays bare');
ok(rb.includes('drop function if exists public.crm_match_ids') && rb.includes('drop index if exists public.crm_match_leads_created_idx') && rb.includes('did not exist before'), 'the rollback drops the new functions and indexes');
const migSha = createHash('sha256').update(readFileSync(path.join(root, 'supabase/migrations/20261112120000_crm_match_mass.sql'))).digest('hex');
const rbSha = createHash('sha256').update(readFileSync(path.join(root, 'supabase/rollbacks/20261112120000_crm_match_mass.sql'))).digest('hex');
console.log('crm-match-migration-sha256', migSha);
console.log('crm-match-rollback-sha256', rbSha);

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const leads = (await api.listCrmLeads()).filter((l) => l.email && !l.archived && !l.converted);
ok(leads.length >= 2, 'two open leads are available');
const ada = leads[0]; const bea = leads[1];
const plan = await api.crmMatchPlan({ module: 'lead', filter: { q: ada.email }, action: 'update' });
ok(plan.count >= 1 && plan.records === plan.count && !('rows' in plan) && !('drafts' in plan) && !Array.isArray(plan.records), 'the plan is a count and does not return rows');
const mailPlan = await api.crmMatchPlan({ module: 'lead', filter: { q: ada.email }, action: 'email' });
ok(mailPlan.recipients >= 1 && mailPlan.count === mailPlan.recipients && !('drafts' in mailPlan), 'the email plan counts addresses and does not list them');
const kept = (await api.getCrmLead(ada.id)).notes || '';
await api.updateCrmLead(ada.id, { notes: kept ? kept + '\nAlready here' : 'Already here' });
const before = (await api.getCrmLead(ada.id)).notes;
const updated = await api.crmMassUpdate({ module: 'lead', filter: { q: ada.email }, field: 'notes', value: 'Called all' });
ok(updated.updated >= 1 && updated.failed === 0 && !('rows' in updated), 'mass update reports how many saved and not the rows');
const after = (await api.getCrmLead(ada.id)).notes;
ok(after.startsWith(before) && after.includes('\n\n---\n') && after.includes('Called all') && after !== 'Called all' && (await api.getCrmLead(bea.id)).notes !== after, 'mass update appends notes and leaves the existing text');
const statusUpdate = await api.crmMassUpdate({ module: 'lead', filter: { q: ada.email }, field: 'relationshipStatus', value: 'Potential/Warm' });
ok(statusUpdate.updated >= 1 && (await api.getCrmLead(ada.id)).notes === after, 'a mass update of another field still replaces that field and does not rewrite notes');
const mailed = await api.crmMassEmail({ module: 'lead', filter: { q: ada.email }, subject: 'Hello', html: '<p>Hi</p>' });
ok(mailed.drafted >= 1 && mailed.count === mailed.drafted && !('rows' in mailed) && !('drafts' in mailed), 'mass email returns a draft count and not the messages');
const emails = await api.listCrmEmails('lead', ada.id);
ok(emails.some((e) => e.subject === 'Hello' && e.status !== 'sent'), 'the draft is saved on the lead and nothing is sent');

const ro = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await ro.signInDev('u-proc');
let refused = '';
try { await ro.crmMassUpdate({ module: 'lead', filter: { q: ada.email }, field: 'notes', value: 'no' }); } catch (e) { refused = e.message; }
ok(/read-only|Processor/i.test(refused), 'a read-only CRM user cannot mass-update');

const deals = await api.listCrmDeals({ status: 'All' });
ok(deals.length >= 2 && !('notes' in deals[0]) && !('notes' in deals[1]), 'deal list rows carry no notes field');
await api.updateDeal(deals[0].id, { notes: 'Existing deed note' });
await api.updateDeal(deals[1].id, { notes: 'Leave this note' });
const selected = await updateSelectedNotes(api, { module: 'deal', rows: [{ id: deals[0].id, name: deals[0].name }], value: 'Called the lender' });
const saved = await api.getCrmDeal(deals[0].id);
const untouched = await api.getCrmDeal(deals[1].id);
ok(selected.updated === 1 && saved.notes.startsWith('Existing deed note') && saved.notes.includes('\n\n---\n') && saved.notes.includes('Called the lender') && saved.notes !== 'Called the lender' && untouched.notes === 'Leave this note', 'selected deal notes keep the stored text when the list row has no notes field');

const appendSql = read('supabase/migrations/20261116030000_crm_notes_append.sql');
const appendRb = read('supabase/rollbacks/20261116030000_crm_notes_append.sql');
const appendBody = appendSql.split('do $readback$')[0];
ok(appendBody.includes("field = 'notes'") && appendBody.includes('\\n\\n---\\n') && !appendBody.includes('notes = val') && !appendBody.includes('crm_notes = val') && !/for\s+\w+\s+in\s+select/i.test(appendBody), 'the server appends notes in one update of the matched ids; the author is read once, not once per record');
ok((appendBody.match(/id = any\(p_ids\)/g) || []).length === 9 && appendBody.includes('p_ids uuid[]') && appendBody.includes('security invoker') && appendBody.includes('search_path = pg_catalog, public'), 'an id list selects leads, clients, companies, opportunities, and deals');
ok(appendRb.includes('notes = val') && appendRb.includes('crm_notes = val') && appendRb.includes('drop function if exists public.crm_mass_update(text, jsonb, text, text, uuid[])'), 'the rollback drops the id list and replaces notes again');
const page = read('js/pages/crm-bulk.js');
ok(page.includes('data-notes-append') && page.includes('Notes are appended') && page.includes('updateSelectedNotes') && !page.includes('appendCrmNote') && !page.includes('r.notes'), 'the confirmation says notes are appended, and the page does not build them');
ok(read('js/data/supabase-crm.js').includes('p_ids') && !read('js/data/supabase-crm.js').includes('appendCrmNote'), 'the hosted client sends the id list and does not build notes');
console.log('crm-notes-append-sha256', createHash('sha256').update(readFileSync(path.join(root, 'supabase/migrations/20261116030000_crm_notes_append.sql'))).digest('hex'));
console.log('crm-notes-append-rollback-sha256', createHash('sha256').update(readFileSync(path.join(root, 'supabase/rollbacks/20261116030000_crm_notes_append.sql'))).digest('hex'));

console.log(fail ? fail + ' failed' : 'crm select all passed');
if (fail) process.exit(1);
