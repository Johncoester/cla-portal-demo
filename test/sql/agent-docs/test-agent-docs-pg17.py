"""Throwaway PG17 parity for 20261109140000_agent_document_staff_insert. No network, no hosted SQL. Fake rows only."""
import subprocess, shutil, json, itertools, sys
from pathlib import Path
R=Path(__file__).resolve().parent; ROOT=R.parents[2]; PG=Path('/workspace/review-policy-v3/pg17bin'); DATA=Path('/tmp/pg-francis-docs'); PORT='55452'
FWD=ROOT/'supabase/migrations/20261109140000_agent_document_staff_insert.sql'; RB=ROOT/'supabase/rollbacks/20261109140000_agent_document_staff_insert.sql'
fail=0
def check(c,m):
    global fail; print(('ok ' if c else 'FAIL ')+m); fail+= (not c)
def psql(sql=None,file=None,ok=True,db='docs'):
    cmd=[str(PG/'psql'),'-h','/tmp','-p',PORT,'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-X','-q','-t','-A']
    cmd+= ['-f',str(file)] if file else ['-c',sql]
    p=subprocess.run(cmd,capture_output=True,text=True,cwd=str(ROOT/'test/sql/agent-docs'))
    if ok and p.returncode: raise SystemExit(p.stderr)
    return p
subprocess.run([str(PG/'pg_ctl'),'-D',str(DATA),'stop','-m','fast'],capture_output=True); shutil.rmtree(DATA,ignore_errors=True)
subprocess.check_call([str(PG/'initdb'),'-D',str(DATA),'-U','postgres','--auth-local=trust','--no-instructions'],stdout=subprocess.DEVNULL)
subprocess.check_call([str(PG/'pg_ctl'),'-D',str(DATA),'-o',f'-p {PORT} -k /tmp','-w','start'],stdout=subprocess.DEVNULL)
psql('create database docs',db='postgres')
psql(file=R/'rls-hoist-fixture.sql'); psql(file=R/'docs-extra.sql')
psql("grant execute on all functions in schema private to authenticated")
local_md5=psql("select md5(with_check) from pg_policies where policyname='documents_insert'").stdout.strip()
print('local documents_insert md5',local_md5)
def mig(path):
    s=path.read_text().replace('37e27c9b0e4d0be52ff1f2a6153ce957',local_md5); t=Path('/tmp')/('tmp_'+path.name); t.write_text(s); return t
P={'listagent':'f1','nofile':'f2','sellerclient':'f3','demoagent':'f4','disabledagent':'f5','buyagent':'f6','processor':'b1','admin':'a1','salesperson':'a2','buyerclient':'a4','superviewas':'a9'}
D1='00000000-0000-0000-0000-0000000000d1'; D2='00000000-0000-0000-0000-0000000000d2'
cases=[]
for who,vis,name,wire,folder,deal in itertools.product(P,['staff','seller','buyer','all'],['a.pdf','a.exe'],[False,True],[None,'f001','f002'],[D1,D2]):
    if name=='a.exe' and (wire or folder): continue
    if wire and folder: continue
    cases.append((who,vis,name,wire,folder,deal))
def run_matrix():
    out={}
    for c in cases:
        who,vis,name,wire,folder,deal=c; uid='00000000-0000-0000-0000-0000000000'+P[who]
        f='null' if not folder else f"'00000000-0000-0000-0000-00000000{folder}'"
        sql=f"begin; select set_config('request.jwt.claim.sub','{uid}',true); set local role authenticated; insert into public.documents(deal_id,name,visibility,uploaded_by,wire_instructions,folder_id) values ('{deal}','{name}','{vis}','{uid}',{str(wire).lower()},{f}); rollback;"
        out[c]=psql(sql,ok=False).returncode==0
    # read visibility (select policy unchanged): count rows per persona
    return out
def pols(): return psql("select string_agg(policyname||':'||cmd||':'||permissive||':'||md5(coalesce(qual,'')||'|'||coalesce(with_check,'')),',' order by policyname) from pg_policies where tablename='documents'").stdout.strip()
pre=run_matrix(); pre_p=pols()
psql(file=mig(FWD)); post=run_matrix(); post_p=pols()
diff=[c for c in cases if pre[c]!=post[c]]
newly=[c for c in diff if post[c]]
check(all(post[c] for c in diff), 'the change only allows inserts, never refuses one that worked before')
check(all(c[1]=='staff' and ((c[0] in ('listagent','buyagent') and c[5]==D1) or (c[0]=='demoagent' and c[5]==D2)) and c[2]=='a.pdf' and not c[3] and c[4]!='f002' for c in newly), 'only an active agent on their own file (same live/demo world) gains a staff-only, non-wire, allowed-type upload outside a staff folder')
check(any(c[0]=='listagent' for c in newly) and any(c[0]=='buyagent' for c in newly), 'both the listing and buyer agent gain the staff-only upload')
check(not any(c[0]=='demoagent' and c[5]==D1 for c in newly) and not any(c[0]!='demoagent' and c[5]==D2 for c in newly),'live and demo stay separate')
for who in ['nofile','sellerclient','disabledagent','buyerclient','salesperson']:
    check(not any(c[0]==who for c in newly), f'{who} gains nothing')
check(len(post_p.split(','))==5 and all(p in post_p for p in pre_p.split(',')),'the four existing policies are byte-identical; one is added')
r=psql(file=mig(FWD),ok=False); check(r.returncode!=0 and 'drift' in r.stderr,'a second forward refuses on drift')
psql(file=mig(RB)); back=run_matrix(); check(back==pre and pols()==pre_p,'rollback restores the exact earlier result and policies')
r=psql(file=mig(RB),ok=False); check(r.returncode!=0 and 'drift' in r.stderr,'a second rollback refuses on drift')
print('cases',len(cases),'changed',len(diff),'newly allowed',[ (c[0],c[4]) for c in newly])
subprocess.run([str(PG/'pg_ctl'),'-D',str(DATA),'stop','-m','fast'],capture_output=True)
pass
print('FAILED' if fail else 'all passed'); sys.exit(1 if fail else 0)
