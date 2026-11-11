/* Local equivalence and timing for the one-pass document read rule.
   Throwaway Postgres only. No hosted database and no secrets. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-doc-read-'));
const port = '55464';
const deal = 'a0e00000-0000-4000-8000-00000000000a';
const buyer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const listing = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args, { allowFail = false, timeout = 180000 } = {}) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout });
  if (!allowFail && p.status !== 0) {
    console.error(p.stdout);
    console.error(p.stderr);
    throw new Error(args.join(' ') + ' failed');
  }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', 'docread', '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
const psql = (sql, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql], opts);
const psqlFile = (file, opts = {}) => run([`${bin}/psql`, ...psqlArgs, '-f', file], opts);

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  const created = spawnSync(`${bin}/psql`, ['-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', 'create database docread'], { encoding: 'utf8' });
  if (created.status !== 0) throw new Error(created.stderr || 'create database failed');
  psqlFile(join(root, 'test/sql/document-readable/fixture.sql'));

  const oldHash = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.document_readable(uuid)'::regprocedure`).stdout.trim();
  ok(oldHash === '4625479cd07eeb7fe2355cbe3fe5ed502981d270d22a36df41fbd369a6ec93c3', 'fixture installs the captured document_readable body');

  psqlFile(join(root, 'supabase/migrations/20261111050000_document_readable_one_pass.sql'));
  const newHash = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.document_readable(uuid)'::regprocedure`).stdout.trim();
  ok(newHash === 'ba16cbd650a3322dd0f300c09d1aa8cd0e3b8b390591e3cac8f712cc2c58b7fc', 'migration lands the one-pass body');
  const grants = psql(`select has_function_privilege('authenticated', 'private.document_readable(uuid)', 'execute')::text || ',' || has_function_privilege('anon', 'private.document_readable(uuid)', 'execute')::text || ',' || has_function_privilege('public', 'private.document_readable(uuid)', 'execute')::text`).stdout.trim();
  ok(grants === 'true,false,false', 'authenticated keeps execute and anon/public do not');
  const qual = psql(`select qual from pg_policies where schemaname = 'public' and tablename = 'documents' and policyname = 'documents_select'`).stdout.trim();
  ok(qual === 'private.document_readable(id)', 'documents_select still calls document_readable');

  const mismatches = psql(`
    create table public.cmp (viewer uuid, doc uuid, old_ok boolean, new_ok boolean);
    do $$
    declare v record;
    begin
      for v in select id from public.viewer_case loop
        perform set_config('request.jwt.claim.sub', v.id::text, true);
        insert into public.cmp (viewer, doc, old_ok, new_ok)
        select v.id, d.id, private.document_readable_old(d.id), private.document_readable(d.id)
        from public.documents d;
      end loop;
    end $$;
    select count(*) filter (where old_ok is distinct from new_ok) || '/' || count(*) from public.cmp;
  `).stdout.trim().split('\n').pop();
  ok(mismatches === '0/18430', 'one-pass matches the helper chain for every viewer and document (' + mismatches + ')');
  if (mismatches !== '0/18430') {
    console.log(psql(`select v.label || ' ' || d.name || ' vis=' || d.visibility || ' wire=' || d.wire_instructions || ' old=' || c.old_ok || ' new=' || c.new_ok from public.cmp c join public.viewer_case v on v.id = c.viewer join public.documents d on d.id = c.doc where c.old_ok is distinct from c.new_ok limit 15`).stdout);
  }

  const span = (fn) => {
    const lines = psql(`
      select set_config('request.jwt.claim.sub', '${buyer}', false);
      select (extract(epoch from clock_timestamp()) * 1000)::bigint;
      select count(*) filter (where ${fn}(id)) from public.documents where deal_id = '${deal}';
      select (extract(epoch from clock_timestamp()) * 1000)::bigint;
    `).stdout.trim().split('\n').filter((line) => /^\d+$/.test(line));
    return Number(lines[2]) - Number(lines[0]);
  };
  const oldMs = span('private.document_readable_old');
  const newMs = span('private.document_readable');
  console.log('timing buyer-agent deal list: old helper chain', oldMs + 'ms, one-pass', newMs + 'ms');
  ok(oldMs > 0 && newMs > 0 && newMs * 2 < oldMs && newMs < 2000, 'one-pass stays under 2s and is at least twice as fast as the helper chain');

  const policyCount = (who) => psql(`
    begin;
    select set_config('request.jwt.claim.sub', '${who}', true);
    set local role authenticated;
    set local statement_timeout = '8s';
    select count(*) from public.documents where deal_id = '${deal}';
    rollback;
  `).stdout.trim().split('\n').pop();
  const buyerPolicy = policyCount(buyer);
  const listingPolicy = policyCount(listing);
  const buyerFn = psql(`select set_config('request.jwt.claim.sub', '${buyer}', false); select count(*) filter (where private.document_readable(id)) from public.documents where deal_id = '${deal}';`).stdout.trim().split('\n').pop();
  const listingFn = psql(`select set_config('request.jwt.claim.sub', '${listing}', false); select count(*) filter (where private.document_readable(id)) from public.documents where deal_id = '${deal}';`).stdout.trim().split('\n').pop();
  ok(buyerPolicy === buyerFn && buyerPolicy === '153', 'buyer-agent RLS select finishes inside 8s and matches the function (' + buyerPolicy + ')');
  ok(listingPolicy === listingFn && Number(listingPolicy) > 0, 'listing-agent RLS select finishes inside 8s and matches the function (' + listingPolicy + ')');

  const again = psqlFile(join(root, 'supabase/migrations/20261111050000_document_readable_one_pass.sql'), { allowFail: true });
  ok(again.status !== 0 && /drift: private.document_readable/.test(again.stderr), 'a second apply refuses because the captured body is gone');
  const stillNew = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.document_readable(uuid)'::regprocedure`).stdout.trim();
  ok(stillNew === newHash, 'the refused second apply rolls back and leaves the one-pass body');

  psqlFile(join(root, 'supabase/rollbacks/20261111050000_document_readable_one_pass.sql'));
  const restored = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.document_readable(uuid)'::regprocedure`).stdout.trim();
  ok(restored === oldHash, 'rollback restores the captured helper-chain body');
  const restoredAgree = psql(`
    select set_config('request.jwt.claim.sub', '${buyer}', false);
    select count(*) filter (where private.document_readable(id) is distinct from private.document_readable_old(id))
    from public.documents where deal_id = '${deal}';
  `).stdout.trim().split('\n').pop();
  ok(restoredAgree === '0', 'restored body agrees with the helper-chain copy');

  psqlFile(join(root, 'supabase/migrations/20261111050000_document_readable_one_pass.sql'));
  const reapplied = psql(`select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid = 'private.document_readable(uuid)'::regprocedure`).stdout.trim();
  ok(reapplied === newHash, 'migration applies again after rollback');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

if (fail) {
  console.log(fail + ' failed');
  process.exit(1);
}
console.log('document read one-pass checks passed');
