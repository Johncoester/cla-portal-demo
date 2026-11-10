/* FF-030 / JN-42 phase 1. Company lookup is the shared list. Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { companyKey } from '../js/data/crm.js';
import { companyDuplicateFromLookup } from '../js/pages/crm-janine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const mig = read('supabase/migrations/20261112080000_company_lookup.sql');
const migSql = mig.replace(/--[^\n]*/g, '');
const rb = read('supabase/rollbacks/20261112080000_company_lookup.sql');
const preview = read('supabase/scripts/company_lookup_backfill_preview.sql');
const page = read('js/pages/crm-janine.js');
const form = read('js/pages/crm.js');
const hosted = read('js/data/supabase-crm.js');

ok(mig.includes('public.company_lookup(p_q text, p_limit integer default 20)') && mig.includes('security definer') && mig.includes("set search_path to 'pg_catalog', 'public'"), 'company_lookup is security definer with a pinned search_path');
ok(mig.includes('((select private.is_processor()) or (select private.crm_user()))'), 'the role check is hoisted once per call');
ok(mig.includes('least(25, greatest(1, coalesce(p_limit, 20)))') && mig.includes('a.archived_at is null') && mig.includes("like v_key || '%'"), 'lookup returns active rows, prefix-matches the normalized key, and caps at 25');
ok(mig.includes('id, name, kind, city, state, phone') || mig.includes('a.id, a.name, a.kind, a.city, a.state, a.phone'), 'lookup returns only id, name, kind, city, state, and phone');
ok(mig.includes('v_owner_private boolean := false') && mig.includes('private.crm_all()') && mig.includes('No per-row private.* helper'), 'owner privacy is off by default and the cost of turning it on is written down');
ok(!/like\s+'%'\s*\|\|/i.test(migSql) && mig.includes('Contains search'), 'the contains fallback is not in the function');
ok(mig.includes('text_pattern_ops') && mig.includes('where archived_at is null') && /CONCURRENTLY/.test(mig), 'the active-name index is text_pattern_ops and production is told to build it concurrently');
ok(mig.includes('((select private.is_processor()) and not (select private.is_preprocessor()))') && mig.includes('private.crm_editor()') && mig.includes('owner_id null') && mig.includes('crm_accounts_name_uq'), 'find-or-create is gated once and inserts with a null owner');
ok(mig.includes('after update of name') && mig.includes('c.account_id = new.id') && mig.includes('new.name is not distinct from old.name'), 'the rename trigger updates linked contacts only when the name changed');
ok(!/create\s+policy/i.test(migSql) && !/pg_trgm/i.test(migSql) && !/create\s+(or\s+replace\s+)?function\s+private\./i.test(migSql), 'the migration adds no policy, no pg_trgm, and no private helper');
ok(!/alter\s+policy/i.test(migSql) && !/on\s+public\.deals/i.test(migSql) && !/on\s+public\.tasks/i.test(migSql) && !/on\s+public\.profiles/i.test(migSql), 'deals, tasks, and profiles policies are untouched');
ok(mig.includes('revoke all on function public.company_lookup(text, integer) from public, anon') && mig.includes('grant execute on function public.company_lookup(text, integer) to authenticated'), 'lookup is revoked from public and anon and granted to authenticated');
ok(rb.includes('drop function public.company_lookup(text, integer)') && rb.includes('drop function public.company_find_or_create(text, text, text)') && rb.includes('drop trigger crm_accounts_name_sync') && rb.includes('drop index public.crm_accounts_company_key_active_idx'), 'the rollback drops the same objects');
ok(!/insert\s+into/i.test(rb) && !/update\s+public/i.test(rb), 'the rollback does not rewrite company or contact rows');

const previewBody = preview.replace(/--[^\n]*/g, '');
ok(preview.includes('begin read only') && preview.includes('step_a_would_link') && preview.includes('ambiguous_matches') && preview.includes('unmatched_keys') && preview.includes('unmatched_keys_empty_state') && preview.includes('contacts_with_company_text') && preview.includes('distinct_keys'), 'the preview prints the backfill counts');
ok(!/\b(insert|update|delete|truncate|alter|create|drop|grant|copy)\b/i.test(previewBody), 'the preview query writes nothing');

ok(page.includes('api.lookupCompanies(name.value, 25)') && form.includes('wireCompanyDup(f, api'), 'the company form warning goes through company_lookup');
ok(hosted.includes("rpc('company_lookup'") && !read('js/data/supabase-crm-janine.js').includes('crm_company_duplicate'), 'the hosted adapter calls company_lookup and not the old duplicate RPC');

const harbor = companyDuplicateFromLookup(
  [{ id: 'acc-harbor', name: 'Harbor Realty (fake)', kind: 'brokerage', city: 'Rockville', state: 'MD', phone: '301-555-0170' },
   { id: 'acc-other', name: 'Harbor View Realty', kind: 'brokerage', city: 'Bethesda', state: 'MD', phone: '' }],
  'HARBOR REALTY (FAKE) INC.',
);
ok(harbor && harbor.id === 'acc-harbor' && harbor.archived === false && harbor.link === '#/crm/accounts/acc-harbor' && companyKey('HARBOR REALTY (FAKE) INC.') === companyKey('Harbor Realty (fake)'), 'an exact normalized name is the duplicate, a longer prefix is not');
ok(companyDuplicateFromLookup([{ id: 'acc-harbor', name: 'Harbor Realty (fake)', state: 'MD' }], 'Harbor Realty (fake)', 'acc-harbor') === null, 'editing a company does not warn about itself');

const api = createMockAdapter({ storage: mem(), sessionStorage: mem() });
await api.signInDev('u-admin');
const made = await api.createCrmAccount({ name: 'Lookup Only Realty', kind: 'brokerage', state: 'MD', ownerId: 'u-team', city: 'Rockville', phone: '301-555-0199' });
await api.createCrmAccount({ name: 'Lookup Only Realty Group', kind: 'brokerage', state: 'VA', ownerId: 'u-team' });
const prefix = await api.lookupCompanies('Lookup Only Realty', 20);
ok(prefix.some((r) => r.id === made.id) && prefix.every((r) => r.city !== undefined && r.phone !== undefined && r.kind && !('notes' in r) && !('ownerId' in r)), 'lookup returns the shared columns and the prefix match');
ok(prefix.length >= 2 && prefix[0].id === made.id, 'the exact key sorts before a longer name');
ok((await api.lookupCompanies('only realty', 20)).length === 0, 'a contains-only query is not the fallback');
const dup = await api.findCrmCompanyDuplicate({ name: 'lookup only realty, llc' });
ok(dup && dup.id === made.id && dup.canOpen === true && dup.archived === false, 'the duplicate check uses the lookup and the normalized key');
await api.archiveCrmRecord('account', made.id, true);
ok(!(await api.lookupCompanies('Lookup Only Realty', 20)).some((r) => r.id === made.id), 'an archived company is not in the lookup');
await api.archiveCrmRecord('account', made.id, false);

const caps = [];
for (let i = 1; i <= 30; i++) caps.push(api.createCrmAccount({ name: `Cap Realty ${String(i).padStart(2, '0')}`, kind: 'other', state: 'MD', ownerId: 'u-team' }));
await Promise.all(caps);
ok((await api.lookupCompanies('Cap Realty', 100)).length === 25, 'lookup never returns more than 25 rows');
ok((await api.lookupCompanies('', 20)).length === 0, 'a blank query does not scan the list');

await api.signInDev('u-sp');
const seenBySales = await api.lookupCompanies('Lookup Only Realty', 20);
const listed = await api.listCrmAccounts();
ok(seenBySales.some((r) => r.id === made.id) && !listed.some((r) => r.id === made.id), 'owner privacy is off, so a salesperson sees a company the CRM list hides');

await api.signInDev('u-proc');
ok((await api.lookupCompanies('Lookup Only', 5)).some((r) => r.name === 'Lookup Only Realty'), 'a processor can look companies up');

await api.signInDev('u-admin');
const client = await api.createCrmContact({ firstName: 'Casey', lastName: 'Lookup', roleInCompany: 'Realtor', relationshipStatus: 'Prospecting', state: 'MD', company: 'Typed Co', accountId: made.id, email: 'casey.lookup@example.test' });
const other = await api.createCrmContact({ firstName: 'Riley', lastName: 'Unlinked', roleInCompany: 'Realtor', relationshipStatus: 'Prospecting', state: 'MD', company: 'Typed Co', email: 'riley.unlinked@example.test' });
await api.updateCrmAccount(made.id, { name: 'Lookup Only Realty Renamed' });
const after = await api.getCrmContact(client.id);
const untouched = await api.getCrmContact(other.id);
ok(after.company === 'Lookup Only Realty Renamed' && untouched.company === 'Typed Co', 'renaming a company updates linked contacts only');
await api.updateCrmAccount(made.id, { name: 'Lookup Only Realty Renamed', city: 'Bethesda' });
ok((await api.getCrmContact(client.id)).company === 'Lookup Only Realty Renamed', 'setting the same name does not rewrite the contact');

let denied = false;
try { await api.signInDev('u-buyer'); await api.lookupCompanies('Lookup', 5); } catch (e) { denied = /CRM is for CLA staff only/.test(e.message); }
ok(denied, 'a client cannot look up companies');

console.log(fail ? fail + ' failed' : 'company lookup passed');
if (fail) process.exit(1);
