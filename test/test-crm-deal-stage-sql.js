/* Scratch Postgres only. Applies the CRM stage-label migration, rolls it back, and applies it again.
 * Does not connect to TEST or production. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const bin = '/usr/lib/postgresql/16/bin';
const data = mkdtempSync(join(tmpdir(), 'cla-deal-stage-'));
const port = '55491';
const db = 'dealstage';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail += 1; console.log('FAIL', m); } };

function run(args) {
  const p = spawnSync(args[0], args.slice(1), { encoding: 'utf8', timeout: 120000 });
  if (p.status !== 0) { console.error(p.stdout); console.error(p.stderr); throw new Error(args.slice(0, 2).join(' ') + ' failed'); }
  return p;
}
const psqlArgs = ['-h', data, '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X', '-q'];
const psql = (sql) => run([`${bin}/psql`, ...psqlArgs, '-t', '-A', '-c', sql]);
const psqlFile = (file) => run([`${bin}/psql`, ...psqlArgs, '-f', file]);
const one = (sql) => psql(sql).stdout.trim();

const FIXTURE = `
create table public.deals (
  id uuid primary key,
  file_number text not null,
  street text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  status text not null default 'Open',
  stage smallint not null default 0,
  purchase_price numeric,
  loan_amount numeric,
  closing_date date,
  created_at timestamptz not null default now()
);
insert into public.deals (id, file_number, status, stage) values
  ('11111111-1111-4111-8111-111111111111', 'MD-OPEN', 'Open', 0),
  ('22222222-2222-4222-8222-222222222222', 'MD-CLOSED', 'Closed', 9),
  ('33333333-3333-4333-8333-333333333333', 'MD-HOLD', 'On Hold', 2),
  ('44444444-4444-4444-8444-444444444444', 'MD-CANCEL', 'Cancelled', 1);
create function private.crm_deal_row(g public.deals) returns jsonb
language sql stable as $$
  select jsonb_build_object('stage', case g.status when 'Open' then 'Active' else g.status end, 'status', g.status, 'orderStage', g.stage)
$$;
create function public.crm_search(p_q text, p_module text default null, p_limit integer default 5) returns jsonb
language sql stable as $$
  select jsonb_build_object('stage', case g.status when 'Open' then 'Active' else g.status end, 'status', g.status)
  from public.deals g where g.file_number = p_q
$$;
create table public.crm_dash_components (id int primary key, module text, criteria jsonb);
insert into public.crm_dash_components values
  (1, 'deals', '[{"field":"stage","op":"is","value":"Active"}]'),
  (2, 'opportunities', '[{"field":"stage","op":"is","value":"Active"}]');
create table public.crm_reports (id int primary key, module text, filters jsonb);
insert into public.crm_reports values (1, 'deals', '[{"field":"stage","op":"is","value":"Cancelled"},{"field":"closingDate","op":"is","value":"this_year"}]');
create table public.crm_views (id uuid primary key, module text);
create table public.crm_view_criteria (view_id uuid, field_key text, value_text text, value2_text text default '');
insert into public.crm_views values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deals'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'leads');
insert into public.crm_view_criteria values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'stage', 'Active', ''),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'stage', 'Active', '');
create table public.crm_saved_filters (id uuid primary key, module text);
create table public.crm_saved_filter_values (filter_id uuid, field_name text, value_text text);
insert into public.crm_saved_filters values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'deals');
insert into public.crm_saved_filter_values values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'stage', 'Cancelled');
`;

run([`${bin}/initdb`, '-D', data, '-U', 'postgres', '--auth-local=trust', '--no-instructions']);
const start = spawnSync(`${bin}/pg_ctl`, ['-D', data, '-o', `-p ${port} -k ${data}`, '-w', 'start'], { encoding: 'utf8', timeout: 60000 });
if (start.status !== 0) throw new Error(start.stderr || 'pg_ctl start failed');

try {
  run([`${bin}/psql`, '-h', data, '-p', port, '-U', 'postgres', '-d', 'postgres', '-c', `create database ${db}`]);
  psql('create schema private;');
  psql(FIXTURE);
  const before = one(`select status || ':' || stage::text from public.deals order by file_number`);
  ok(one(`select private.crm_deal_row(d)->>'stage' from public.deals d where file_number = 'MD-OPEN'`) === 'Active', 'before the file, an open order reads as Active');

  psqlFile(join(root, 'supabase/migrations/20261125100000_crm_deal_stage_labels.sql'));
  ok(true, 'the migration applies, and its own readback passes');
  ok(one(`select private.crm_deal_row(d)->>'stage' from public.deals d where file_number = 'MD-OPEN'`) === 'Opened', 'an open order reads as Opened');
  ok(one(`select private.crm_deal_row(d)->>'status' from public.deals d where file_number = 'MD-OPEN'`) === 'Open', 'the order status stays Open');
  ok(one(`select private.crm_deal_row(d)->>'orderStage' from public.deals d where file_number = 'MD-CLOSED'`) === '9', 'the numeric order stage is not rewritten');
  ok(one(`select (public.crm_search('MD-CANCEL', null, 5)->>'stage')`) === 'Canceled', 'search reads Cancelled as Canceled');
  ok(one(`select public.crm_search('MD-HOLD', null, 5)->>'stage'`) === 'On Hold', 'On Hold is unchanged');
  ok(one(`select status || ':' || stage::text from public.deals order by file_number`) === before, 'no deal row was updated');
  ok(one(`select criteria->0->>'value' from public.crm_dash_components where id = 1`) === 'Opened', 'the deal dashboard filter Active is now Opened');
  ok(one(`select criteria->0->>'value' from public.crm_dash_components where id = 2`) === 'Active', 'an opportunity stage of Active is left alone');
  ok(one(`select filters->0->>'value' || '|' || (filters->1->>'value') from public.crm_reports where id = 1`) === 'Canceled|this_year', 'only the deal stage word in a report filter changes');
  ok(one(`select value_text from public.crm_view_criteria where view_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`) === 'Opened', 'a deal custom view Active value is now Opened');
  ok(one(`select value_text from public.crm_view_criteria where view_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'`) === 'Active', 'a lead custom view stage is left alone');
  ok(one(`select value_text from public.crm_saved_filter_values`) === 'Canceled', 'a saved deal stage filter Cancelled is now Canceled');

  psqlFile(join(root, 'supabase/migrations/20261125100000_crm_deal_stage_labels.sql'));
  ok(true, 'the migration can be run a second time');
  ok(one(`select private.crm_deal_row(d)->>'stage' from public.deals d where file_number = 'MD-OPEN'`) === 'Opened', 'a second run still reads Opened');

  psqlFile(join(root, 'supabase/rollbacks/20261125100000_crm_deal_stage_labels.sql'));
  ok(true, 'the rollback applies, and its own readback passes');
  ok(one(`select position($e$then 'Active'$e$ in pg_get_functiondef('private.crm_deal_row(public.deals)'::regprocedure)) > 0`) === 't', 'the rollback puts the Active label back in crm_deal_row');
  ok(one(`select criteria->0->>'value' from public.crm_dash_components where id = 1`) === 'Active', 'the rollback restores the dashboard word Active');
  ok(one(`select value_text from public.crm_saved_filter_values`) === 'Cancelled', 'the rollback restores Cancelled on the saved filter');
  ok(one(`select status || ':' || stage::text from public.deals order by file_number`) === before, 'the rollback does not change deal rows');

  psqlFile(join(root, 'supabase/migrations/20261125100000_crm_deal_stage_labels.sql'));
  ok(true, 'the migration applies again after a rollback');
  ok(one(`select position($e$then 'Opened'$e$ in pg_get_functiondef('public.crm_search(text,text,integer)'::regprocedure)) > 0`) === 't', 'search uses Opened again after the second apply');
} finally {
  spawnSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  rmSync(data, { recursive: true, force: true });
}

console.log(fail ? fail + ' failed' : 'crm deal stage sql passed');
if (fail) process.exit(1);
