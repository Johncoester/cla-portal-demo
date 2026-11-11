/* Select all matching records (JN-47). Fake data only. No network and no hosted database. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMAIL_DRAFT_BATCH, filterFromValues, inNyRange, matchBannerState, nyDay, rowMatches } from '../js/data/crm-match.js';
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
const updated = await api.crmMassUpdate({ module: 'lead', filter: { q: ada.email }, field: 'notes', value: 'Called all' });
ok(updated.updated >= 1 && updated.failed === 0 && !('rows' in updated), 'mass update reports how many saved and not the rows');
ok((await api.getCrmLead(ada.id)).notes === 'Called all' && (await api.getCrmLead(bea.id)).notes !== 'Called all', 'only the leads that match the filter change');
const mailed = await api.crmMassEmail({ module: 'lead', filter: { q: ada.email }, subject: 'Hello', html: '<p>Hi</p>' });
ok(mailed.drafted >= 1 && mailed.count === mailed.drafted && !('rows' in mailed) && !('drafts' in mailed), 'mass email returns a draft count and not the messages');
const emails = await api.listCrmEmails('lead', ada.id);
ok(emails.some((e) => e.subject === 'Hello' && e.status !== 'sent'), 'the draft is saved on the lead and nothing is sent');

const ro = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await ro.signInDev('u-proc');
let refused = '';
try { await ro.crmMassUpdate({ module: 'lead', filter: { q: ada.email }, field: 'notes', value: 'no' }); } catch (e) { refused = e.message; }
ok(/read-only|Processor/i.test(refused), 'a read-only CRM user cannot mass-update');

console.log(fail ? fail + ' failed' : 'crm select all passed');
if (fail) process.exit(1);
