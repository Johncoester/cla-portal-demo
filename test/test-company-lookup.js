/* FF-030 / JN-42 phase 1. Company lookup is the shared list. Fake data only. No hosted project. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockAdapter } from '../js/data/mock-adapter.js';
import { companyLookupFlags } from '../js/data/mock-part-crm.js';
import { ACCOUNT_KINDS, companyKey } from '../js/data/crm.js';
import { ensureSettings } from '../js/data/crm-config.js';
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
ok(/v_owner_private boolean := false/.test(migSql) && mig.includes('private.crm_all()') && mig.includes('No per-row private.* helper'), 'owner privacy is off by default and the true path is still in the function');
ok(mig.includes('public.company_match_active(p_name text)') && mig.includes("= 'Outside user'") && mig.includes('limit 2') && !mig.includes('from public.deals'), 'exact auto-link returns one id and does not read a deal');
ok(mig.includes('payoff_lender') && mig.includes("'hoa'") && mig.includes("'utility'") && !migSql.includes('other_companies'), 'payoff lender, HOA, and utility join the company list only');
ok(rb.includes('drop function public.company_match_active(text)') && rb.includes('ff030-kind-prev:'), 'the rollback drops the match function and restores the kind check');
ok(!/like\s+'%'\s*\|\|/i.test(migSql) && mig.includes('Contains search'), 'the contains fallback is not in the function');
ok(mig.includes('text_pattern_ops') && mig.includes('where archived_at is null') && /CONCURRENTLY/.test(mig), 'the active-name index is text_pattern_ops and production is told to build it concurrently');
ok(mig.includes('((select private.is_processor()) and not (select private.is_preprocessor()))') && mig.includes('private.crm_editor()') && mig.includes('owner_id null') && mig.includes("to_regclass('public.crm_accounts_name_uq')") && mig.includes('CREATE UNIQUE INDEX crm_accounts_name_uq ON public.crm_accounts USING btree (lower(btrim(name))) WHERE (archived_at IS NULL)') && !mig.includes('unique constraint crm_accounts_name_uq') && !/on conflict/i.test(migSql), 'find-or-create is gated once, inserts with a null owner, and guards the partial name index');
ok(mig.includes('does not include archived rows') && !mig.includes('which still includes'), 'archived rows are outside the partial unique index');
ok(mig.includes('after update of name') && mig.includes('c.account_id = new.id') && mig.includes('new.name is not distinct from old.name'), 'the rename trigger updates linked contacts only when the name changed');
ok(!/create\s+policy/i.test(migSql) && !/pg_trgm/i.test(migSql) && !/create\s+(or\s+replace\s+)?function\s+private\./i.test(migSql), 'the migration adds no policy, no pg_trgm, and no private helper');
ok(!/alter\s+policy/i.test(migSql) && !/on\s+public\.deals/i.test(migSql) && !/on\s+public\.tasks/i.test(migSql) && !/on\s+public\.profiles/i.test(migSql), 'deals, tasks, and profiles policies are untouched');
ok(mig.includes('revoke all on function public.company_lookup(text, integer) from public, anon') && mig.includes('grant execute on function public.company_lookup(text, integer) to authenticated'), 'lookup is revoked from public and anon and granted to authenticated');
ok(rb.includes('drop function public.company_lookup(text, integer)') && rb.includes('drop function public.company_find_or_create(text, text, text)') && rb.includes('drop trigger crm_accounts_name_sync') && rb.includes('drop index public.crm_accounts_company_key_active_idx'), 'the rollback drops the same objects');
ok(!/insert\s+into/i.test(rb) && !/update\s+public/i.test(rb), 'the rollback does not rewrite company or contact rows');

const previewBody = preview.replace(/--[^\n]*/g, '');
ok(preview.includes('begin read only') && preview.includes('step_a_would_link') && preview.includes('ambiguous_matches') && preview.includes('unmatched_keys') && preview.includes('unmatched_keys_empty_state') && preview.includes('contacts_with_company_text') && preview.includes('distinct_keys'), 'the preview prints the backfill counts');
ok(!/\b(insert|update|delete|truncate|alter|create|drop|grant|copy)\b/i.test(previewBody), 'the preview query writes nothing');

ok(ACCOUNT_KINDS.map(([c]) => c).join(',') === 'brokerage,lender,payoff_lender,hoa,utility,other', 'the company form list is brokerage, lender, payoff lender, HOA, utility, other');
const grown = ensureSettings({ picklists: { accountKind: [{ value: 'brokerage', label: 'Brokerage', retired: false }] } });
ok(grown.picklists.accountKind[0].value === 'brokerage' && ['payoff_lender', 'hoa', 'utility'].every((c) => grown.picklists.accountKind.some((o) => o.value === c)), 'an older company-type list gains the three kinds without dropping Brokerage');
ok(page.includes('api.lookupCompanies(name.value, 25)') && form.includes('wireCompanyDup(f, api') && form.includes('l.state || \'\''), 'the company form warning uses company_lookup, and a new company state starts from the lead, not a property');
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

const kinds = [];
for (const kind of ['payoff_lender', 'hoa', 'utility']) kinds.push(api.createCrmAccount({ name: `Kind ${kind}`, kind, state: 'MD', ownerId: 'u-team' }));
const madeKinds = await Promise.all(kinds);
ok(madeKinds.map((a) => a.kind).join(',') === 'payoff_lender,hoa,utility', 'payoff lender, HOA, and utility can be saved as companies');
const mine = await api.createCrmAccount({ name: 'Sam Private Realty', kind: 'brokerage', state: 'MD', ownerId: 'u-sp' });
const twin = await api.createCrmAccount({ name: 'Twin Key Holdings LLC', kind: 'other', state: 'MD', ownerId: 'u-team' });
await api.signInDev('u-sp');
const seenByDefault = await api.lookupCompanies('Lookup Only Realty', 20);
const listed = await api.listCrmAccounts();
ok(seenByDefault.some((r) => r.id === made.id) && !listed.some((r) => r.id === made.id), 'by default a sales person sees every company name, including one the CRM list hides');
companyLookupFlags.ownerPrivate = true;
try {
  await api.signInDev('u-team');
  ok((await api.lookupCompanies('Sam Private', 20)).some((r) => r.id === mine.id), 'with owner privacy on, sales team still sees a salesperson-owned company');
  await api.signInDev('u-sp');
  const hidden = await api.lookupCompanies('Lookup Only Realty', 20);
  const own = await api.lookupCompanies('Sam Private', 20);
  ok(!hidden.some((r) => r.id === made.id) && own.some((r) => r.id === mine.id), 'with owner privacy on, a sales person does not see another owner and still sees their own');
} finally {
  companyLookupFlags.ownerPrivate = false;
}
ok((await api.lookupCompanies('Lookup Only Realty', 20)).some((r) => r.id === made.id), 'the privacy switch is back off after the test');
await api.signInDev('u-buyer');
let outsideLookup = false;
try { await api.lookupCompanies('Harbor', 5); } catch (e) { outsideLookup = /CRM is for CLA staff only/.test(e.message); }
let outsideCreate = false;
try { await api.createCrmAccount({ name: 'Buyer Created Realty', kind: 'brokerage', state: 'MD' }); } catch (e) { outsideCreate = /CRM is for CLA staff only|read-only|cannot/.test(e.message); }
const harborId = await api.matchCrmCompany('Harbor Realty (fake)');
const twinId = await api.matchCrmCompany('Twin Key Holdings, LLC');
const prefixMiss = await api.matchCrmCompany('Harbor');
ok(outsideLookup && outsideCreate && harborId === 'acc-harbor' && twinId === twin.id && prefixMiss === null, 'an outside user auto-links only an exact unique company and cannot search or create');
await api.signInDev('u-admin');

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
