/* John / Francis, Nov 9 (option B): every Transaction Coordinator sees every file, like a Processor; each file also carries an
   informational TC (deals.tc_user_id): auto-assigned, set / changed by staff, logged as 'deal.tc' with one in-app notification.
   Static checks on the migration + rollback and the file page. No hosted project, no secrets. Run: node test/test-tc-assign.js */
import { readFileSync } from 'node:fs';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mig = read('supabase/migrations/20261109190000_tc_assignment_visibility.sql');
const rb = read('supabase/rollbacks/20261109190000_tc_assignment_visibility.sql');
const code = mig.replace(/^\s*--.*$/gm, '');

ok(/alter table public\.deals add column tc_user_id uuid references public\.profiles\(id\) on delete set null/.test(mig), 'deals.tc_user_id: nullable, references profiles');
ok(/p\.role = 'Transaction Coordinator' and p\.status = 'active'/.test(mig) && mig.includes('is_demo is not distinct from coalesce(new.is_demo, false)'), 'guard: only an active TC in the same demo scope');
ok(/after update of tc_user_id on public\.deals\s+for each row when \(old\.tc_user_id is distinct from new\.tc_user_id\)/.test(mig), 'activity trigger fires only on a real change');
ok(mig.includes("'deal.tc'") && mig.includes("'Transaction Coordinator set to '") && mig.includes("'Transaction Coordinator unassigned'"), 'activity wording');
ok(/private\.notify\(array\[new\.tc_user_id\], 'tc'/.test(mig), 'one in-app notification to the new TC');
ok(/case p\.role when 'Buyer Agent' then 2 else 3 end/.test(mig) && /order by x\.pri, x\.created_at, x\.pid/.test(mig), 'auto rule: TC on file, then buyer agent team, then listing agent team; deterministic');
ok(/after insert on public\.deal_participants\s+for each row when \(new\.role in \('Buyer Agent', 'Listing Agent', 'Transaction Coordinator'\)\)/.test(mig) && /tc_user_id is null;/.test(mig), 'participant trigger fills a blank TC only');
ok(/me_role\(\) in \('Processor', 'Sales Team', 'Transaction Coordinator'\)/.test(code) && !/my_team_agents/.test(code), 'can_access_deal: TC = Processor, no per-file team scan');
const pol = code.slice(code.indexOf('alter policy deals_select'), code.indexOf('-- 6.') > 0 ? code.length : code.length);
ok((pol.match(/array\['Processor'::text, 'Sales Team'::text, 'Transaction Coordinator'::text\]/g) || []).length === 2, 'deals_select / tasks_select: TC added inside the one-time role check');
ok(!/create policy/i.test(code) && !/tc_candidate/.test(pol.slice(0, pol.indexOf('-- 6.') > 0 ? pol.indexOf('-- 6.') : pol.length).replace(/update public\.deals d set tc_user_id[\s\S]*$/, '')), 'no new policy and no new per-row helper in a policy');
ok(!/\b(outbox|net\.http|pg_net|sms)\b/i.test(code), 'in-app only: no email / SMS / outbox');
ok(/raise exception 'drift:/.test(mig) && mig.includes('ffdd9206deae6033a59982ed51406975'), 'guarded against drift');
ok(/set local cla\.tc_backfill = 'on';\s*update public\.deals d set tc_user_id = private\.tc_candidate\(d\.id\) where d\.tc_user_id is null/.test(mig), 'backfill uses the same rule, no notifications');
ok(rb.includes("c.profile_id in (select private.my_team_agents())") && /alter table public\.deals drop column if exists tc_user_id/.test(rb)
  && ['participants_tc_assign', 'deals_tc_activity', 'deals_tc_guard'].every((t) => rb.includes(`drop trigger if exists ${t}`)), 'rollback restores the old TC scope and removes everything added');

const deal = read('js/pages/deal.js'); const sa = read('js/data/supabase-adapter.js'); const mock = read('js/data/mock-part-deals.js'); const core = read('js/data/mock-adapter.js');
ok(deal.includes('data-tc-name') && deal.includes('data-tc-none') && deal.includes('name="tcUserId"'), 'file header shows the TC; Edit order details can set / change / clear it');
ok(sa.includes("tcUserId: 'tc_user_id'") && sa.includes("col === 'tc_user_id' ? (v || null)") && sa.includes('d.tcName'), 'hosted adapter writes tc_user_id (blank = null) and reads the name');
ok(mock.includes("'deal.tc'") && mock.includes("kind: 'tc'"), 'mock adapter mirrors activity + notification');
ok(/if \(u\.role === 'Transaction Coordinator'\) return d\.deals;/.test(core), 'mock: a TC sees every file');
console.log(fail ? fail + ' failed' : 'tc assign passed');
if (fail) process.exit(1);
