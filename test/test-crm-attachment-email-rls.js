/* Text check for the crm_attachments email RLS fix. No network and no database. */
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261109163000_crm_attachment_email_rls.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261109163000_crm_attachment_email_rls.sql', import.meta.url), 'utf8');
const check = readFileSync(new URL('../supabase/checks/crm_attachment_email_rls.sql', import.meta.url), 'utf8');

let pass = 0, fails = 0;
const ok = (c, name) => { if (c) { pass++; console.log('ok', name); } else { fails++; console.log('FAIL', name); } };
const stripComments = (sql) => sql.replace(/--.*$/gm, '');
const alterStmts = (sql) => stripComments(sql).split(/alter policy/i).slice(1).map((part) => part.split(';')[0]);
const body = (sql) => stripComments(sql);

const oldSelect = `((entity = 'email'::text) AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = e.entity_id) AND private.crm_email_record_visible(e.entity, e.entity_id)))))`;
const oldInsert = `((entity = 'email'::text) AND private.crm_editor() AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = e.entity_id) AND (e.created_by = private.effective_uid())))))`;
const newSelect = `((entity = 'email'::text) AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = crm_attachments.entity_id) AND private.crm_email_record_visible(e.entity, e.entity_id)))))`;
const newInsert = `((entity = 'email'::text) AND private.crm_editor() AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = crm_attachments.entity_id) AND (e.created_by = private.effective_uid())))))`;

ok((migration.match(/\bbegin\s*;/gi) || []).length === 1 && (migration.match(/\bcommit\s*;/gi) || []).length === 1, 'the migration is one transaction');
ok(/set local lock_timeout = '3s';/.test(migration) && /set local lock_timeout = '3s';/.test(rollback), 'migration and rollback set a 3s lock timeout');
ok(migration.includes(oldSelect) && migration.includes(oldInsert), 'the migration refuses unless the self-compare is still the policy text');
ok(migration.includes(newSelect) && migration.includes(newInsert), 'the migration readback expects the attachment entity_id join');
ok(alterStmts(migration).length === 2 && alterStmts(migration).every((part) => part.includes('crm_attachments.entity_id') && !part.includes('e.id = e.entity_id')), 'the two alterations join crm_attachments.entity_id and do not keep the self-compare');
ok(alterStmts(migration).some((part) => part.includes('crm_att_select_email') && part.includes('crm_email_record_visible(e.entity, e.entity_id)')) && alterStmts(migration).some((part) => part.includes('crm_att_insert_email') && part.includes('crm_editor()') && part.includes('effective_uid()')), 'the new policies keep the helpers the old policies already called');
ok(!/crm_entity_visible/.test(alterStmts(migration).join('\n')), 'the email alterations do not add a crm_entity_visible call');
ok(!/create\s+(or\s+replace\s+)?function/i.test(body(migration)) && !/drop\s+policy/i.test(body(migration)) && !/drop\s+function/i.test(body(migration)), 'the migration does not replace a helper or drop a policy');
ok(!/alter policy (?!crm_att_select_email|crm_att_insert_email)/i.test(body(migration)), 'only the two email policies are altered');
ok((rollback.match(/\bbegin\s*;/gi) || []).length === 1 && (rollback.match(/\bcommit\s*;/gi) || []).length === 1, 'the rollback is one transaction');
ok(rollback.includes(newSelect) && rollback.includes(newInsert) && rollback.includes(oldSelect) && rollback.includes(oldInsert), 'the rollback checks the corrected text and restores the preimage');
ok(alterStmts(rollback).length === 2 && alterStmts(rollback).every((part) => part.includes('e.id = e.entity_id') && !part.includes('crm_attachments.entity_id')), 'the rollback alterations put the self-compare back');
ok(!/create\s+(or\s+replace\s+)?function/i.test(body(rollback)) && !/drop\s+policy/i.test(body(rollback)), 'the rollback does not replace a helper or drop a policy');

ok((check.match(/\bbegin\s*;/gi) || []).length === 1 && !/\bcommit\s*;/i.test(check) && /rollback\s*;\s*$/i.test(check.trim()), 'the check script is one transaction that ends in rollback and never commits');
ok(/set local role authenticated/i.test(check) && /request\.jwt\.claims/.test(check), 'the check uses set local role authenticated and request.jwt.claims');
ok(check.includes("'Sales Person'") && check.includes("'Outside user'"), 'the check signs in a CLA staff user and a non-staff user');
ok(check.includes("entity = 'email'") && check.includes('STAFF select') && check.includes('NONSTAFF select') && check.includes('STAFF insert linked') && check.includes('NONSTAFF insert linked'), 'the check reports email-attachment selects and inserts for both personas');
ok(!/create\s+(or\s+replace\s+)?function/i.test(body(check)), 'the check does not create a helper');

console.log(fails ? `crm-attachment-email-rls: ${fails} failed` : `crm-attachment-email-rls: ${pass} passed`);
if (fails) process.exit(1);
