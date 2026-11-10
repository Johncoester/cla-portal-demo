"""Client-Buyer and Client-Seller JWT checks for 20261110101500. Local Postgres only. Nothing is applied to the hosted project."""
import subprocess, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PG = Path('/usr/lib/postgresql/16/bin')
DATA = Path('/tmp/pg-client-portal')
PORT = '55453'
FWD = ROOT / 'supabase/migrations/20261110101500_client_task_docs_share.sql'
RB = ROOT / 'supabase/rollbacks/20261110101500_client_task_docs_share.sql'
FIX = Path(__file__).resolve().parent / 'fixture.sql'
BUYER = '11111111-1111-4111-8111-111111111111'
SELLER = '22222222-2222-4222-8222-222222222222'
AGENT = '33333333-3333-4333-8333-333333333333'
DEMO = '99999999-9999-4999-8999-999999999999'
OPEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
SET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
DEMO_DEAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
TPL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
TASK = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
fail = 0

def check(c, m):
    global fail
    print(('ok ' if c else 'FAIL ') + m)
    fail += (not c)

def psql(sql=None, file=None, ok=True, db='client'):
    cmd = [str(PG / 'psql'), '-h', '/tmp', '-p', PORT, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A']
    cmd += ['-f', str(file)] if file else ['-c', sql]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if ok and p.returncode:
        raise SystemExit(p.stderr or p.stdout)
    return p

subprocess.run([str(PG / 'pg_ctl'), '-D', str(DATA), 'stop', '-m', 'fast'], capture_output=True)
shutil.rmtree(DATA, ignore_errors=True)
subprocess.check_call([str(PG / 'initdb'), '-D', str(DATA), '-U', 'postgres', '--auth-local=trust', '--no-instructions'], stdout=subprocess.DEVNULL)
subprocess.check_call([str(PG / 'pg_ctl'), '-D', str(DATA), '-o', f'-p {PORT} -k /tmp', '-w', 'start'], stdout=subprocess.DEVNULL)
psql('create database client', db='postgres')
psql(file=FIX)

def local_hash(sql):
    return psql(sql).stdout.strip()

vis_hash = local_hash("select md5(prosrc) from pg_proc where oid = to_regprocedure('private.visibility_allowed(uuid,text)')")
doc_hash = local_hash("select md5(coalesce(with_check,'')) from pg_policies where policyname='documents_insert'")
mig = FWD.read_text().replace('4d4f1b4c4c00f5511f7d76b80188f690', vis_hash).replace('37e27c9b0e4d0be52ff1f2a6153ce957', doc_hash)
mig_path = Path('/tmp/client-portal-fwd.sql')
mig_path.write_text(mig)

def as_user(uid, sql):
    wrapped = f"begin; select set_config('request.jwt.claim.sub','{uid}',true); select set_config('request.jwt.claim.role','authenticated',true); set local role authenticated; {sql}; rollback;"
    return psql(wrapped, ok=False)

def last_line(p):
    lines = [ln.strip() for ln in (p.stdout or '').splitlines() if ln.strip()]
    return lines[-1] if lines else ''

def ids(uid, deal):
    p = as_user(uid, f"select coalesce(string_agg(id::text, ',' order by id), '') from private.rpc_message_recipients('{deal}')")
    if p.returncode:
        raise SystemExit(p.stderr)
    return set(filter(None, last_line(p).split(',')))

def insert_vis(uid, deal, vis, name):
    p = as_user(uid, f"""
      do $$ declare v text; doc uuid := gen_random_uuid(); begin
        insert into public.documents (id, deal_id, name, visibility, uploaded_by, doc_type)
        values (doc, '{deal}', '{name}', '{vis}', '{uid}', '');
        select d.visibility into v from public.documents d where d.id = doc;
        raise exception 'STORED %', v;
      exception when others then
        if sqlerrm like 'STORED %' then raise exception '%', sqlerrm; end if;
        raise exception 'FAIL %', sqlerrm;
      end $$;
    """)
    err = (p.stderr or '') + (p.stdout or '')
    if 'STORED ' in err:
        return err.split('STORED ', 1)[1].splitlines()[0].strip()
    return 'FAIL ' + err.replace('\n', ' ')[:300]

psql(file=mig_path)
buyer_open = ids(BUYER, OPEN)
check('33333333-3333-4333-8333-333333333333' in buyer_open, 'buyer share list includes the buyer agent')
check('66666666-6666-4666-8666-666666666666' in buyer_open, 'buyer share list includes the assigned transaction coordinator')
check('55555555-5555-4555-8555-555555555555' in buyer_open and '77777777-7777-4777-8777-777777777777' in buyer_open, 'an unassigned file offers the live processors')
check('22222222-2222-4222-8222-222222222222' not in buyer_open and '44444444-4444-4444-8444-444444444444' not in buyer_open, 'buyer share list excludes the seller and the listing agent')
check('88888888-8888-4888-8888-888888888888' not in buyer_open, 'a live file does not offer a demo processor')
seller_open = ids(SELLER, OPEN)
check('44444444-4444-4444-8444-444444444444' in seller_open and '66666666-6666-4666-8666-666666666666' in seller_open, 'seller share list includes the listing agent and the coordinator')
check('11111111-1111-4111-8111-111111111111' not in seller_open and '33333333-3333-4333-8333-333333333333' not in seller_open, 'seller share list excludes the buyer and the buyer agent')
assigned = ids(BUYER, SET)
check('55555555-5555-4555-8555-555555555555' in assigned and '77777777-7777-4777-8777-777777777777' not in assigned, 'once a processor is assigned, the other processors are not added')
demo_ids = ids(DEMO, DEMO_DEAL)
check('88888888-8888-4888-8888-888888888888' in demo_ids and '55555555-5555-4555-8555-555555555555' not in demo_ids, 'a demo file offers demo processors only')

fields = as_user(BUYER, f"select coalesce(jsonb_array_length(fields), -1)::text from public.task_templates where id = '{TPL}'")
check(fields.returncode == 0 and last_line(fields) == '1', 'buyer JWT can read the template fields on their task')
rpc = as_user(BUYER, f"select coalesce(jsonb_array_length(private.rpc_task_template('{TASK}') -> 'fields'), -1)::text")
check(rpc.returncode == 0 and last_line(rpc) == '1', 'get_task_template returns the field definitions when the buyer owns the task')
hidden = as_user(SELLER, f"select case when private.rpc_task_template('{TASK}') is null then 'hidden' else 'shown' end")
check(hidden.returncode == 0 and last_line(hidden) == 'hidden', 'the seller does not receive the buyer task template through the fallback')

thread = as_user(BUYER, f"select private.rpc_create_thread('{OPEN}', 'ID', array['66666666-6666-4666-8666-666666666666']::uuid[], 'Please review')::text")
check(thread.returncode == 0 and len(last_line(thread)) > 10, 'buyer can open a portal thread with the coordinator')
blocked = as_user(BUYER, f"select private.rpc_create_thread('{OPEN}', 'Nope', array['44444444-4444-4444-8444-444444444444']::uuid[], 'Hello')::text")
check(blocked.returncode != 0 and 'own side' in (blocked.stderr or ''), 'buyer cannot open a thread with the listing agent')
check(insert_vis(BUYER, OPEN, 'staff', 'buyer-staff.pdf') == 'buyer', 'buyer Share with CLA Title is stored as buyer (own side plus staff)')
check(insert_vis(SELLER, OPEN, 'staff', 'seller-staff.pdf') == 'seller', 'seller Share with CLA Title is stored as seller')
check(insert_vis(AGENT, OPEN, 'staff', 'agent-staff.pdf') == 'staff', 'a buyer agent staff upload stays staff')
other = insert_vis(BUYER, OPEN, 'seller', 'buyer-other.pdf')
check(other.startswith('FAIL') and 'row-level security' in other, 'a buyer cannot store the seller side')

psql(file=RB)
check(insert_vis(BUYER, OPEN, 'staff', 'buyer-after-rollback.pdf').startswith('FAIL'), 'rollback stops rewriting a client staff upload')
after = ids(BUYER, OPEN)
check('77777777-7777-4777-8777-777777777777' not in after and '55555555-5555-4555-8555-555555555555' not in after, 'rollback drops the unassigned processor list')
check('33333333-3333-4333-8333-333333333333' in after, 'rollback still lists the buyer agent')

psql(file=mig_path)
again = psql(file=mig_path, ok=False)
check(again.returncode != 0 and 'drift' in again.stderr, 'a second forward refuses on drift')
psql(file=RB)
again_rb = psql(file=RB, ok=False)
check(again_rb.returncode != 0 and 'drift' in again_rb.stderr, 'a second rollback refuses on drift')

subprocess.run([str(PG / 'pg_ctl'), '-D', str(DATA), 'stop', '-m', 'fast'], capture_output=True)
print('FAILED' if fail else 'client portal jwt passed')
sys.exit(1 if fail else 0)
