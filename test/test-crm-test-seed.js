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
const phones = seed.match(/\b\d{3}-\d{3}-\d{4}\b/g) || [];
const deletes = [...back.matchAll(/delete\s+from\s+[\s\S]*?;/gi)].map((m) => m[0]);
const deleteAt = (table) => back.search(new RegExp('delete\\s+from\\s+public\\.' + table + '\\b', 'i'));

ok(emails.length === 10 && emails.every((e) => e.endsWith('@example.com')), 'the seed has 10 emails and every one is @example.com');
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
