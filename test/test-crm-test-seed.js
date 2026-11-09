/* Network-free check of the unapplied TEST CRM seed. Reads the SQL files only. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = readFileSync(path.join(root, 'supabase/review/20261109_crm_test_seed.sql'), 'utf8');
const back = readFileSync(path.join(root, 'supabase/review/20261109_crm_test_seed_rollback.sql'), 'utf8');
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

const emails = seed.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
const rowEmails = emails.filter((e) => e !== 'johncoester@gmail.com');
const phones = seed.match(/\b\d{3}-\d{3}-\d{4}\b/g) || [];
const deletes = [...back.matchAll(/delete\s+from\s+[\s\S]*?;/gi)].map((m) => m[0]);
const deleteAt = (table) => back.search(new RegExp('delete\\s+from\\s+public\\.' + table + '\\b', 'i'));

// Mirrors the seed's allowed-value guard: only a whole check of the form
// col = ANY (ARRAY[...]) or col IN (...) supplies literals. Anything else is ignored.
function allowedList(def, col) {
  let clean = def.replace(/::\s*(character varying|double precision|timestamp with time zone|timestamp without time zone|[A-Za-z_][A-Za-z0-9_.]*)(\s*\[\s*\])?/gi, '');
  clean = clean.replace(/\s+/g, ' ').trim().replace(/^CHECK\s*/i, '').trim();
  for (;;) {
    if (clean.length < 2 || clean[0] !== '(' || clean.at(-1) !== ')') break;
    let depth = 0;
    let wrapped = true;
    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (depth === 0 && i < clean.length - 1) { wrapped = false; break; }
    }
    if (!wrapped || depth !== 0) break;
    clean = clean.slice(1, -1).trim();
  }
  clean = clean.replace(/^\(([A-Za-z_][A-Za-z0-9_]*)\)/, '$1');
  let list = null;
  if (new RegExp('^' + col + '\\s*=\\s*ANY\\s*\\(.*ARRAY\\s*\\[', 'i').test(clean)) list = (clean.match(/ARRAY\s*\[(.*)\]/i) || [])[1];
  else if (new RegExp('^' + col + '\\s+IN\\s*\\(', 'i').test(clean)) list = (clean.match(/IN\s*\((.*)\)/i) || [])[1];
  if (list == null) return null;
  return [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
}
const refuses = (def, col, val) => {
  const lits = allowedList(def, col);
  return !!lits && lits.length >= 1 && !lits.includes(val);
};
const kindCheck = "CHECK ((kind = ANY (ARRAY['task'::text, 'note'::text, 'email'::text, 'call'::text])))";
const callCheck = "CHECK (((kind = 'call'::text) OR ((call_direction IS NULL) AND (call_outcome IS NULL))) AND ((call_direction IS NULL) OR (call_direction = ANY (ARRAY['Outbound'::text, 'Inbound'::text, 'Missed'::text]))))";
const fieldsCheck = "CHECK (((kind <> 'task'::text) OR ((due_date IS NOT NULL) AND (owner_id IS NOT NULL))) AND ((kind <> 'call'::text) OR (status IS NOT NULL)) AND ((priority IS NULL) OR (priority = priority)))";
const statusCheck = "CHECK ((status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Waiting for input'::text, 'done'::text])))";
const inCheck = "CHECK ((kind IN ('task', 'note')))";

ok(rowEmails.length === 10 && rowEmails.every((e) => e.endsWith('@example.com')), 'the seed has 10 row emails and every one is @example.com');
ok(seed.includes("p.email = 'johncoester@gmail.com'") && seed.includes("left(p.id::text, 8) = '149e612a'") && seed.includes("John''s profile was not found"), 'the seed looks up John by email and the id prefix, and raises if he is missing');
ok(seed.includes('update _crm_seed_activities set owner_id = v_john') && seed.includes('update _crm_seed_leads set owner_id = v_john') && seed.includes('update _crm_seed_accounts set owner_id = v_john') && seed.includes('update _crm_seed_opps set owner_id = v_john'), 'seeded leads, companies, opportunities, and activities use that looked-up owner');
ok(!/set owner_id = '[0-9a-f-]{36}'/i.test(seed), 'owner_id is not a hard-coded person');
ok(seed.includes('Only a simple allowed-value check counts') && seed.includes("regexp_matches(list_src,") && !seed.includes('regexp_matches(chk,'), 'the allowed-value guard reads the list text, not every quote in the constraint');
ok((seed.match(/as u\(colname\)/g) || []).length === 4 && !/\) as col\b/.test(seed) && !/quote_ident\(col\)/.test(seed), 'insert column lists use u.colname so they do not clash with the col variable');
ok(!refuses(kindCheck, 'kind', 'task') && !refuses(callCheck, 'kind', 'task') && !refuses(fieldsCheck, 'kind', 'note') && !refuses(fieldsCheck, 'kind', 'email') && !refuses(statusCheck, 'status', 'Not Started') && refuses(statusCheck, 'status', 'nope') && !refuses(inCheck, 'kind', 'task') && refuses(inCheck, 'kind', 'email'), 'simple ANY and IN lists are enforced, and call-only or field checks are ignored');
ok(phones.length === 15 && phones.every((p) => /555-01\d\d$/.test(p)), 'the seed has 15 phones and every one is 555-01xx');
ok((seed.match(/'TEST Lead /g) || []).length === 10, 'the seed names 10 leads');
ok((seed.match(/https:\/\/example\.com\/TEST-SEED-CRM\//g) || []).length === 5, 'the seed names 5 companies');
ok((seed.match(/TEST Opportunity /g) || []).length === 5, 'the seed names 5 opportunities');
ok((seed.match(/TEST-SEED-CRM fake QA activity/g) || []).length === 10, 'the seed names 10 activities');
ok(/\bbegin\s*;/i.test(seed) && /\bcommit\s*;/i.test(seed) && (seed.match(/\bbegin\s*;/gi) || []).length === 1, 'the seed is one transaction');
ok(/set\s+local\s+lock_timeout\s*=\s*'3s'\s*;/i.test(seed), 'the seed sets lock_timeout to 3s');
ok(seed.includes('aqcervntopidtcazcmlv') && /raise exception 'refusing:/.test(seed), 'the seed refuses unless it recognizes the TEST project');
ok(seed.includes('TEST-SEED-CRM') && seed.includes('149e612a-6e14-4ee1-9890-0f29d6f89156'), 'the seed carries the marker and the known TEST staff id');
ok(!/create\s+policy|enable\s+row\s+level\s+security|drop\s+policy|insert\s+into\s+public\.profiles/i.test(seed), 'the seed does not change RLS, policies, or profiles');
ok(!seed.includes('supabase/migrations/20261109_crm_test_seed.sql'), 'the seed is not named as a migration');
ok(!seed.replace(/--[^\n]*/g, '').includes('last_activity_at'), 'the seed SQL does not require or write last_activity_at');

ok(deletes.length === 4 && deletes.every((sql) => sql.includes('TEST-SEED-CRM')), 'the rollback has four deletes and each one requires the marker');
ok(deleteAt('crm_activities') < deleteAt('crm_opportunities') && deleteAt('crm_opportunities') < deleteAt('crm_leads') && deleteAt('crm_leads') < deleteAt('crm_accounts'), 'the rollback deletes activities, opportunities, leads, then companies');
ok(!/delete\s+from\s+public\.(profiles|contacts|deals|tasks|crm_emails|crm_attachments)\b/i.test(back), 'the rollback does not delete other tables');
ok(/\bbegin\s*;/i.test(back) && /\bcommit\s*;/i.test(back) && /set\s+local\s+lock_timeout\s*=\s*'3s'\s*;/i.test(back), 'the rollback is one transaction with lock_timeout 3s');
ok(/raise exception 'refusing:/.test(back) && back.includes('aqcervntopidtcazcmlv'), 'the rollback refuses unless it recognizes the TEST project');

console.log(fail ? `${fail} failed` : 'crm test seed passed');
if (fail) process.exit(1);
