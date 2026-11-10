"""Throwaway local Postgres parity for 20261111060000_task_board_owner_lookup. No network, no hosted SQL. Fake rows only.
task_board must return the same rows (owner names included) for every persona before and after, and the rollback must restore it.
Run: python3 test/sql/agent-docs/test-task-board-owner-pg.py   (PG_BIN=/path/to/postgres/bin if pg_ctl is not on PATH)"""
import subprocess, shutil, sys, os, time
from pathlib import Path
R = Path(__file__).resolve().parent; ROOT = R.parents[2]; DATA = Path('/tmp/pg-task-board-owner'); PORT = '55462'
PG = Path(os.environ.get('PG_BIN') or (Path(shutil.which('pg_ctl')).parent if shutil.which('pg_ctl') else '/usr/lib/postgresql/16/bin'))
FWD = ROOT/'supabase/migrations/20261111060000_task_board_owner_lookup.sql'; RB = ROOT/'supabase/rollbacks/20261111060000_task_board_owner_lookup.sql'
fail = 0
def check(c, m):
    global fail; print(('ok ' if c else 'FAIL ') + m); fail += (not c)
def psql(sql=None, file=None, ok=True, db='board'):
    cmd = [str(PG/'psql'), '-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A']
    cmd += ['-f', str(file)] if file else ['-c', sql]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(R))
    if ok and p.returncode: raise SystemExit(p.stderr)
    return p
subprocess.run([str(PG/'pg_ctl'), '-D', str(DATA), 'stop', '-m', 'fast'], capture_output=True); shutil.rmtree(DATA, ignore_errors=True)
subprocess.check_call([str(PG/'initdb'), '-D', str(DATA), '-U', 'postgres', '--auth-local=trust', '--no-instructions'], stdout=subprocess.DEVNULL)
subprocess.check_call([str(PG/'pg_ctl'), '-D', str(DATA), '-o', f'-p {PORT} -k /tmp', '-w', 'start'], stdout=subprocess.DEVNULL)
try:
    psql('create database board', db='postgres')
    psql(file=R/'rls-hoist-fixture.sql')
    # more owners: a hidden-side participant, a second file's participant, and a task pointing at another file's participant
    psql("""insert into public.tasks (id, deal_id, title, assigned_role, status, participant_id) values
      ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'Seller copy', 'Client-Seller', 'todo', '00000000-0000-0000-0000-0000000000cd'),
      ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', 'Listing copy', 'Listing Agent', 'todo', '00000000-0000-0000-0000-0000000000cc'),
      ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d1', 'Lender copy', 'Lender', 'done', '00000000-0000-0000-0000-0000000000ce'),
      ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000d4', 'Wrong file participant', 'Buyer Agent', 'todo', '00000000-0000-0000-0000-0000000000c5'),
      ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000d1', 'Missing participant', 'Buyer Agent', 'todo', '00000000-0000-0000-0000-0000000000ff')""")
    P = {'admin': 'a1', 'superviewas': 'a9', 'processor': 'b1', 'salesperson': 'a2', 'salesteam': 'a7', 'preprocessor': 'a8',
         'buyagent': 'a3', 'buyerclient': 'a4', 'purebuyer': 'aa', 'disabledadmin': 'a5', 'demo': 'a6'}
    def board(who, status='All'):
        uid = '00000000-0000-0000-0000-0000000000' + P[who]
        return psql(f"begin; select set_config('request.jwt.claim.sub','{uid}',true); set local role authenticated; "
                    f"select string_agg(b::text, E'\\n') from public.task_board('{status}') b; rollback;").stdout.strip()
    def matrix(): return {(w, s): board(w, s) for w in P for s in ('All', 'Open', 'Closed')}
    pre = matrix()
    check(any('Pat Agent' in v for v in pre.values()) and any('Sam Sell' in v for v in pre.values()), 'the fixture shows owner names before the change')
    check(not any('Pat Agent' in l for l in pre[('admin', 'All')].split('\n') if 'Wrong file participant' in l), 'a participant from another file gives no name before the change')
    psql(file=FWD); post = matrix()
    diff = [k for k in pre if pre[k] != post[k]]
    check(not diff, 'every persona and file status gets exactly the same task_board rows and owner names' + (f' (differs: {diff})' if diff else ''))
    check(psql("select prosrc not like '%deal_contacts%' from pg_proc where oid = 'public.task_board(text)'::regprocedure").stdout.strip() == 't', 'task_board no longer calls deal_contacts per row')
    check(psql("select has_function_privilege('anon', 'private.task_owner_name(uuid,uuid)', 'execute')").stdout.strip() == 'f'
          and psql("select has_function_privilege('authenticated', 'private.task_owner_name(uuid,uuid)', 'execute')").stdout.strip() == 't', 'the new helper runs for authenticated only')
    r = psql(file=FWD, ok=False); check(r.returncode != 0 and 'drift' in r.stderr, 'a second forward refuses on drift')

    # scale: one busy file, many participants and tasks; same answer, less time
    psql("""insert into public.contacts (id, first_name, last_name, email)
              select ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'F' || g, 'L' || g, 'c' || g || '@example.test' from generate_series(1, 40) g;
            insert into public.deal_participants (id, deal_id, contact_id, role)
              select ('20000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-0000000000d1',
                     ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, (array['Buyer Agent','Listing Agent','Client-Buyer','Client-Seller','Lender'])[1 + g % 5]
              from generate_series(1, 40) g;
            insert into public.tasks (id, deal_id, title, assigned_role, status, participant_id)
              select gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', 'Bulk ' || g, 'Buyer Agent', 'todo',
                     case when g % 3 = 0 then null else ('20000000-0000-0000-0000-' || lpad((1 + g % 40)::text, 12, '0'))::uuid end
              from generate_series(1, 250) g;
            analyze;""")
    def timed(who):
        t = time.perf_counter(); out = board(who); return out, time.perf_counter() - t
    new_admin, new_t = timed('admin'); new_proc, _ = timed('processor')
    psql(file=RB)
    old_admin, old_t = timed('admin'); old_proc, _ = timed('processor')
    check(new_admin == old_admin and new_proc == old_proc, 'with 250 more tasks on a 46-person file the rows and names still match')
    check(new_t < old_t, f'the busy board is faster (old {old_t*1000:.0f} ms, new {new_t*1000:.0f} ms)')

    check(psql("select md5(prosrc) from pg_proc where oid = 'public.task_board(text)'::regprocedure").stdout.strip() == 'a21d3d37bed7cacf08a5ef62ad1a72d1'
          and psql("select to_regprocedure('private.task_owner_name(uuid,uuid)') is null").stdout.strip() == 't', 'rollback restores the captured task_board body and drops the helper')
    r = psql(file=RB, ok=False); check(r.returncode != 0 and 'drift' in r.stderr, 'a second rollback refuses on drift')
finally:
    subprocess.run([str(PG/'pg_ctl'), '-D', str(DATA), 'stop', '-m', 'fast'], capture_output=True); shutil.rmtree(DATA, ignore_errors=True)
print('FAILED' if fail else 'all passed'); sys.exit(1 if fail else 0)
