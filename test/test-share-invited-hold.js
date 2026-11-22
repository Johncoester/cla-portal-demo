/* FF-055 / MF-048 (Francis, Nov 11; John, Nov 13): Share Files to someone on the file who has no portal login yet.
 * Runs supabase/migrations/20261119030000_share_invited_hold.sql and its rollback on a throwaway Postgres with a small fixture:
 * the conversation is held for the contact, opens up when the contact gets a portal login, and refuses anyone who cannot be invited. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-share-invited-'));
const port = '55497';
const db = 'shareinvited';
const PROC = '11111111-1111-4111-8111-111111111111';     // Processor 1 (CLA staff, can invite)
const TC = '22222222-2222-4222-8222-222222222222';       // Transaction Coordinator (staff, cannot invite)
const OTHER = '33333333-3333-4333-8333-333333333333';    // a processor who is not in the conversation
const AGENTP = '44444444-4444-4444-8444-444444444444';   // an outside agent login on the file
const NEWLOGIN = '55555555-5555-4555-8555-555555555555'; // the login the invited buyer agent ends up with
const DEAL = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DEAL2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const C_AGENT = 'aaaaaaaa-0000-4000-8000-000000000001';  // Buyer Agent, email, no login
const C_LENDER = 'aaaaaaaa-0000-4000-8000-000000000002'; // Lender, email, no login (cannot be invited)
const C_NONAME = 'aaaaaaaa-0000-4000-8000-000000000003'; // Client-Buyer with no last name
const C_NOMAIL = 'aaaaaaaa-0000-4000-8000-000000000004'; // Client-Seller with no email
const C_HASLOGIN = 'aaaaaaaa-0000-4000-8000-000000000005'; // Listing Agent already linked to a login
const C_UNLINKED = 'aaaaaaaa-0000-4000-8000-000000000006'; // Client-Seller whose email already has a login, not linked
const C_OFFFILE = 'aaaaaaaa-0000-4000-8000-000000000007';  // a contact on another file only
const C_SELLER = 'aaaaaaaa-0000-4000-8000-000000000008';   // Client-Seller, email, no login; taken off the file before signing in
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, { allowFail = false } = {}) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 240000 });
  if (!allowFail && p.status !== 0) { console.error(p.stdout); console.error(p.stderr); throw new Error(args.slice(0, 2).join(' ') + ' failed'); }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
const psql = (sql, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql], opts);
const psqlFile = (file, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-f', file], opts);
// run as a signed-in person; returns { out, err }. Changes are kept (commit) so later steps see them.
function as(id, sql) {
  const p = psql(`begin; select set_config('request.jwt.claim.sub', '${id}', true); set local role authenticated; ${sql}; commit;`, { allowFail: true });
  return { out: p.stdout.trim().split('\n').filter((l) => l && l !== id).join('\n'), err: (p.stderr || '').trim(), failed: p.status !== 0 };
}
const one = (sql) => psql(sql).stdout.trim();

const FIXTURE = `
create role anon nologin; create role authenticated nologin;
create schema private; create extension if not exists pgcrypto;
grant usage on schema public, private to authenticated, anon;
create table public.profiles (id uuid primary key, first_name text, last_name text, email text, role text, status text not null default 'active', view_only boolean not null default false);
create table public.contacts (id uuid primary key, profile_id uuid, first_name text, last_name text, email text);
create table public.deals (id uuid primary key);
create table public.deal_participants (id uuid primary key default gen_random_uuid(), deal_id uuid, contact_id uuid, role text);
create table public.threads (id uuid primary key default gen_random_uuid(), deal_id uuid, subject text, created_by uuid);
create table public.thread_participants (thread_id uuid, profile_id uuid, last_read_at timestamptz);
create table public.messages (id uuid primary key default gen_random_uuid(), thread_id uuid, author_id uuid, body text);
create table public.activity (deal_id uuid, action text, detail text);
create function private.effective_uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function private.me_role() returns text language sql stable security definer as $$ select role from public.profiles where id = private.effective_uid() $$;
create function private.is_view_only() returns boolean language sql stable security definer as $$ select coalesce((select view_only from public.profiles where id = private.effective_uid()), false) $$;
create function private.can_invite_agents() returns boolean language sql stable security definer as $$ select coalesce(private.me_role() in ('Processor', 'Preprocessor', 'Sales Person', 'Sales Team', 'Admin'), false) $$;
create function private.can_access_deal(d uuid) returns boolean language sql stable security definer as $$
  select coalesce(private.me_role() <> 'Outside user', false)
      or exists (select 1 from public.deal_participants dp join public.contacts c on c.id = dp.contact_id where dp.deal_id = d and c.profile_id = private.effective_uid()) $$;
create function private.log_activity(p_deal uuid, p_action text, p_entity text, p_id uuid, p_detail text) returns void language sql security definer as $$ insert into public.activity values (p_deal, p_action, p_detail) $$;
grant execute on all functions in schema private to authenticated;
insert into public.profiles (id, first_name, last_name, email, role) values
  ('${PROC}', 'Proc', 'One', 'proc1@example.com', 'Processor'), ('${TC}', 'Tee', 'Cee', 'tc@example.com', 'Transaction Coordinator'),
  ('${OTHER}', 'Proc', 'Two', 'proc2@example.com', 'Processor'), ('${AGENTP}', 'Lia', 'Lister', 'lia@example.com', 'Outside user'),
  ('66666666-6666-4666-8666-666666666666', 'Una', 'Linked', 'una@example.com', 'Outside user');
insert into public.deals values ('${DEAL}'), ('${DEAL2}');
insert into public.contacts (id, profile_id, first_name, last_name, email) values
  ('${C_AGENT}', null, 'Pat', 'Agent', 'Pat.Agent@Example.com'), ('${C_LENDER}', null, 'Lou', 'Lender', 'lou@example.com'),
  ('${C_NONAME}', null, 'Bea', '', 'bea@example.com'), ('${C_NOMAIL}', null, 'Sam', 'Seller', ''),
  ('${C_HASLOGIN}', '${AGENTP}', 'Lia', 'Lister', 'lia@example.com'), ('${C_UNLINKED}', null, 'Una', 'Linked', 'UNA@example.com'),
  ('${C_OFFFILE}', null, 'Off', 'File', 'off@example.com'), ('${C_SELLER}', null, 'Sue', 'Seller', 'sue@example.com');
insert into public.deal_participants (deal_id, contact_id, role) values
  ('${DEAL}', '${C_AGENT}', 'Buyer Agent'), ('${DEAL}', '${C_LENDER}', 'Lender'), ('${DEAL}', '${C_NONAME}', 'Client-Buyer'),
  ('${DEAL}', '${C_NOMAIL}', 'Client-Seller'), ('${DEAL}', '${C_HASLOGIN}', 'Listing Agent'), ('${DEAL}', '${C_UNLINKED}', 'Client-Seller'),
  ('${DEAL2}', '${C_OFFFILE}', 'Buyer Agent'), ('${DEAL}', '${C_SELLER}', 'Client-Seller'), ('${DEAL2}', '${C_AGENT}', 'Buyer Agent');
`;

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', `create database ${db}`], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psql(FIXTURE);
  psqlFile(join(root, 'supabase/migrations/20261119030000_share_invited_hold.sql'));
  ok(true, 'the migration applies, and its own readback passes');
  psqlFile(join(root, 'supabase/migrations/20261119030000_share_invited_hold.sql'));
  ok(true, 'the migration can be run a second time');

  const share = (who, contact, deal = DEAL, body = 'Here is the CD.') => as(who, `select public.create_thread_invited('${deal}', 'Closing Disclosure', '${contact}', '${body}')`);

  // the case Francis hit: Processor 1 shares with the Buyer Agent, who has an email and no login
  const made = share(PROC, C_AGENT);
  const tid = made.out;
  ok(!made.failed && /^[0-9a-f-]{36}$/.test(tid), 'Processor 1 can share with a Buyer Agent who has no portal login (it used to say "Pick at least one recipient")');
  ok(one(`select string_agg(profile_id::text, ',') from public.thread_participants where thread_id = '${tid}'`) === PROC, 'the sender is the only participant while the agent has no login');
  ok(one(`select contact_id::text || '|' || added_by::text from public.thread_invitees where thread_id = '${tid}'`) === `${C_AGENT}|${PROC}`, 'the conversation is held for that contact');
  ok(one(`select subject || '|' || (select body from public.messages m where m.thread_id = t.id) from public.threads t where id = '${tid}'`) === 'Closing Disclosure|Here is the CD.', 'the subject and the message are kept');
  ok(one(`select count(*) from public.activity where deal_id = '${DEAL}' and action = 'message.thread_invited' and detail like 'Shared with Pat Agent (Buyer Agent)%'`) === '1', 'the file activity says who it is held for');
  ok(as(PROC, `select display_name || '|' || role from public.thread_invitees_list(array['${tid}'::uuid])`).out === 'Pat Agent|Buyer Agent', 'the sender sees who the conversation is waiting for');
  ok(as(OTHER, `select count(*) from public.thread_invitees_list(array['${tid}'::uuid])`).out === '0', 'someone who is not in the conversation is not told who it is waiting for');
  ok(as(PROC, `select count(*) from public.thread_invitees`).failed, 'the held list cannot be read directly');

  // who is refused, and what they are told
  const no = (r, re, m) => ok(r.failed && re.test(r.err), m);
  no(share(TC, C_AGENT), /Only CLA staff who can invite people/, 'a Transaction Coordinator (who cannot invite) cannot share this way');
  no(share(AGENTP, C_AGENT), /Only CLA staff who can invite people/, 'an outside agent cannot share this way');
  no(share(PROC, C_LENDER), /Lou Lender has no portal login, and only a buyer, seller, buyer agent or listing agent/, 'a lender contact cannot be invited, and the message says why');
  no(share(PROC, C_NONAME), /Add a first and last name/, 'a contact with no last name is refused with what to fix');
  no(share(PROC, C_NOMAIL), /Add a valid email for Sam Seller/, 'a contact with no email is refused with what to fix');
  no(share(PROC, C_HASLOGIN), /Lia Lister now has a portal login/, 'someone who already has a login is sent back to pick them normally');
  no(share(PROC, C_UNLINKED), /una@example\.com already has a portal login, but this contact is not linked/, 'an email that already has a login, on a contact that is not linked, is explained');
  no(share(PROC, C_OFFFILE), /That person is not on this order/, 'a contact from another file is refused');
  no(share(PROC, '99999999-9999-4999-8999-999999999999'), /That person is not on this order/, 'an unknown id is refused');
  no(share(PROC, C_AGENT, DEAL, '   '), /Write a message first/, 'an empty message is refused');
  psql(`update public.profiles set view_only = true where id = '${OTHER}'`);
  no(share(OTHER, C_AGENT), /Not allowed/, 'a view-only sign-in cannot share');
  psql(`update public.profiles set view_only = false where id = '${OTHER}'`);
  ok(one(`select count(*) from public.threads`) === '1', 'a refused share leaves nothing behind');

  // a second file's share for the same agent, and a seller who is taken off the file before signing in
  const tid2 = share(PROC, C_AGENT, DEAL2, 'Second file.').out;
  const tid3 = share(OTHER, C_SELLER).out;
  psql(`delete from public.deal_participants where deal_id = '${DEAL}' and contact_id = '${C_SELLER}'`);

  // an unrelated change to the contact does nothing
  psql(`update public.contacts set first_name = 'Patricia' where id = '${C_AGENT}'`);
  ok(one(`select count(*) from public.thread_invitees where contact_id = '${C_AGENT}'`) === '2', 'editing the contact does not release anything');

  // the agent accepts the invite: accept-invite sets contacts.profile_id
  psql(`insert into public.profiles (id, first_name, last_name, email, role) values ('${NEWLOGIN}', 'Pat', 'Agent', 'pat.agent@example.com', 'Outside user');
        update public.contacts set profile_id = '${NEWLOGIN}' where id = '${C_AGENT}'`);
  ok(one(`select count(*) from public.thread_participants where profile_id = '${NEWLOGIN}' and thread_id in ('${tid}', '${tid2}')`) === '2', 'when the agent gets a login, every conversation held for them opens up');
  ok(one(`select coalesce(last_read_at::text, 'unread') from public.thread_participants where profile_id = '${NEWLOGIN}' and thread_id = '${tid}'`) === 'unread', 'the conversation shows as unread for them');
  ok(one(`select count(*) from public.thread_invitees where contact_id = '${C_AGENT}'`) === '0', 'the held rows are cleared once they are in');
  ok(as(PROC, `select count(*) from public.thread_invitees_list(array['${tid}'::uuid])`).out === '0', 'the sender no longer sees anyone waiting');
  psql(`update public.contacts set profile_id = null where id = '${C_AGENT}'; update public.contacts set profile_id = '${NEWLOGIN}' where id = '${C_AGENT}'`);
  ok(one(`select count(*) from public.thread_participants where profile_id = '${NEWLOGIN}' and thread_id = '${tid}'`) === '1', 'linking the contact again does not add them twice');

  // the seller who was taken off the file signs in later: they get nothing
  psql(`insert into public.profiles (id, first_name, last_name, email, role) values ('77777777-7777-4777-8777-777777777777', 'Sue', 'Seller', 'sue@example.com', 'Outside user');
        update public.contacts set profile_id = '77777777-7777-4777-8777-777777777777' where id = '${C_SELLER}'`);
  ok(one(`select count(*) from public.thread_participants where thread_id = '${tid3}' and profile_id = '77777777-7777-4777-8777-777777777777'`) === '0', 'someone taken off the file before signing in is not added to the conversation');
  ok(one(`select count(*) from public.thread_invitees where contact_id = '${C_SELLER}'`) === '0', 'and nothing stays held for them');

  // rollback
  psqlFile(join(root, 'supabase/rollbacks/20261119030000_share_invited_hold.sql'));
  ok(one(`select (to_regclass('public.thread_invitees') is null and to_regprocedure('public.create_thread_invited(uuid,text,uuid,text)') is null
          and to_regprocedure('public.thread_invitees_list(uuid[])') is null and to_regprocedure('private.trg_release_thread_invitees()') is null
          and not exists (select 1 from pg_trigger where tgname = 'zz_release_thread_invitees'))::text`) === 'true', 'the rollback removes the table, the functions and the trigger');
  ok(one(`select count(*) from public.threads`) === '3' && one(`select count(*) from public.thread_participants where profile_id = '${NEWLOGIN}'`) === '2', 'the rollback keeps the conversations and the people already in them');
  psqlFile(join(root, 'supabase/migrations/20261119030000_share_invited_hold.sql'));
  ok(true, 'the migration applies again after a rollback');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

console.log(fail ? fail + ' failed' : 'share with an invited contact: hold and release passed');
if (fail) process.exit(1);
