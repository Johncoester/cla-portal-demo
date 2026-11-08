import os, subprocess, sys, tempfile, json, sqlite3, unittest
from concurrent.futures import ThreadPoolExecutor
H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.py")
J="149e612a-6e14-4ee1-9890-0f29d6f89156"; M="d02722a1-582b-42c0-b3d1-28d25adb758d"
E="11111111-1111-4111-8111-111111111111"; F="22222222-2222-4222-8222-222222222222"; C="33333333-3333-4333-8333-333333333333"
KEY="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; MID="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
def run(db, cmd, **kw):
    a=dict(event_id=E,feedback_id=F,conversation_id=C,reporter_id=J,event_type="cla.feedback.created",version="1"); a.update(kw)
    args=[sys.executable,H,cmd,"--db",db]+sum([["--"+k.replace("_","-"),v] for k,v in a.items() if v is not None],[])
    p=subprocess.run(args,capture_output=True,text=True)
    try: body=json.loads(p.stdout)
    except Exception: body={"raw":p.stdout,"err":p.stderr}
    return p.returncode, body
class T(unittest.TestCase):
    def setUp(self):
        self.d=tempfile.mkdtemp(prefix="FAKE_ledger_"); os.chmod(self.d,0o700); self.db=os.path.join(self.d,"fake.sqlite3")
    def test_flow_and_perms(self):
        self.assertEqual(run(self.db,"check")[0],0); self.assertEqual(run(self.db,"claim")[0],0)
        self.assertEqual(oct(os.stat(self.db).st_mode&0o777),"0o600")
        self.assertEqual(run(self.db,"claim")[0],10)  # fresh process dedup
        self.assertEqual(run(self.db,"finish",outcome="completed")[1]["state"],"completed")
        self.assertEqual(run(self.db,"finish",outcome="unknown")[0],20)
        self.assertEqual(run(self.db,"claim")[0],10)
    def test_unknown_never_reclaim(self):
        run(self.db,"claim"); self.assertEqual(run(self.db,"finish",outcome="unknown")[0],0)
        self.assertEqual(run(self.db,"claim")[0],10); self.assertEqual(run(self.db,"finish",outcome="completed")[0],20)
    def test_conflict(self):
        run(self.db,"claim"); self.assertEqual(run(self.db,"claim",conversation_id="44444444-4444-4444-8444-444444444444")[0],20)
        self.assertEqual(run(self.db,"check",reporter_id=M)[0],20)
    def test_invalid(self):
        for kw in [dict(reporter_id="55555555-5555-4555-8555-555555555555"),dict(event_type="x"),dict(event_id="abc"),
                   dict(version="1",expected_version="2"),dict(project="other"),dict(feedback_id="AAAAAAAA-2222-4222-8222-222222222222")]:
            self.assertEqual(run(self.db,"claim",**kw)[0],2,kw)
        self.assertEqual(run(self.db,"finish",outcome="completed")[0],2)
    def test_concurrent(self):
        with ThreadPoolExecutor(40) as ex: rs=list(ex.map(lambda _: run(self.db,"claim")[0], range(40)))
        self.assertEqual(rs.count(0),1); self.assertEqual(rs.count(10),39)
    def test_unsafe(self):
        os.chmod(self.d,0o755); self.assertEqual(run(self.db,"status")[0],3); os.chmod(self.d,0o700)
        link=os.path.join(self.d,"l.sqlite3"); os.symlink(self.db,link); self.assertEqual(run(link,"status")[0],3)
        with open(self.db,"w") as fh: fh.write("garbage"*1000)
        os.chmod(self.db,0o600); self.assertEqual(run(self.db,"status")[0],3)
    def test_busy(self):
        run(self.db,"status"); c=sqlite3.connect(self.db,isolation_level=None); c.execute("BEGIN EXCLUSIVE")
        self.assertEqual(run(self.db,"claim")[0],3); c.execute("ROLLBACK")
    def test_no_delete(self):
        run(self.db,"claim"); c=sqlite3.connect(self.db)
        with self.assertRaises(sqlite3.DatabaseError): c.execute("DELETE FROM events")
    def test_upgrade_keeps_old_rows(self):
        c=sqlite3.connect(self.db)
        c.execute("""CREATE TABLE events(project TEXT NOT NULL, event_id TEXT NOT NULL,
          feedback_id TEXT NOT NULL, conversation_id TEXT NOT NULL, reporter_id TEXT NOT NULL,
          event_type TEXT NOT NULL, version TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN('claimed','completed','blocked_with_unknown_outcome')),
          claimed_at TEXT NOT NULL, finished_at TEXT, UNIQUE(project,event_id))""")
        c.execute("CREATE TRIGGER nodel BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'delete forbidden'); END")
        rows=[
            (E,F,C,"claimed",None),
            ("12121212-1212-4121-8121-121212121212","22222222-2222-4222-8222-222222222222","32323232-3232-4323-8323-323232323232","completed","t"),
            ("13131313-1313-4131-8131-131313131313","22222222-2222-4222-8222-222222222222","34343434-3434-4343-8343-343434343434","blocked_with_unknown_outcome","t"),
        ]
        for event_id,feedback,conversation,status,finished in rows:
            c.execute("INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?)", ("aqcervntopidtcazcmlv",event_id,feedback,conversation,J,"cla.feedback.created","1",status,"2026-01-01T00:00:00+0000",finished))
        c.commit(); c.close(); os.chmod(self.db,0o600)
        snap=sqlite3.connect(self.db); before=snap.execute("SELECT event_id,status,finished_at,version,event_type FROM events ORDER BY event_id").fetchall(); snap.close()
        self.assertEqual(run(self.db,"status",event_id=E)[1]["state"],"claimed")
        snap=sqlite3.connect(self.db); after=snap.execute("SELECT event_id,status,finished_at,version,event_type FROM events ORDER BY event_id").fetchall(); nreply=snap.execute("SELECT count(*) FROM prepared_replies").fetchone()[0]; snap.close()
        self.assertEqual(before, after)
        self.assertEqual(nreply, 0)
        self.assertEqual(run(self.db,"claim",event_id="12121212-1212-4121-8121-121212121212",conversation_id="32323232-3232-4323-8323-323232323232")[0], 10)
        self.assertEqual(run(self.db,"claim",event_id="13131313-1313-4131-8131-131313131313",conversation_id="34343434-3434-4343-8343-343434343434")[0], 10)
        self.assertEqual(run(self.db,"prepare",response_key=KEY,body="kept for review")[0], 0)
        still=sqlite3.connect(self.db).execute("SELECT status FROM events WHERE event_id=?", ("12121212-1212-4121-8121-121212121212",)).fetchone()[0]
        unknown=sqlite3.connect(self.db).execute("SELECT status FROM events WHERE event_id=?", ("13131313-1313-4131-8131-131313131313",)).fetchone()[0]
        self.assertEqual(still, "completed"); self.assertEqual(unknown, "blocked_with_unknown_outcome")
    def test_prepare_and_write_only(self):
        self.assertEqual(run(self.db,"claim",event_type="cla.feedback.follow_up")[0], 0)
        self.assertEqual(run(self.db,"finish",outcome="completed",event_type="cla.feedback.follow_up")[0], 20)
        self.assertEqual(run(self.db,"status",event_id=E)[1]["state"], "claimed")
        self.assertEqual(run(self.db,"prepare",event_type="cla.feedback.follow_up",response_key=KEY,body="I see the next row.")[0], 0)
        waiting=run(self.db,"record-write",event_type="cla.feedback.follow_up",write_state="prepared")
        self.assertEqual(waiting[0], 0); self.assertEqual(waiting[1]["reply_state"], "prepared"); self.assertFalse(waiting[1]["repost"])
        self.assertEqual(run(self.db,"claim",event_type="cla.feedback.follow_up")[0], 10)
        self.assertEqual(run(self.db,"status",event_id=E)[1]["state"], "claimed")
        bad=run(self.db,"record-write",event_type="cla.feedback.follow_up",write_state="written")
        self.assertEqual(bad[0], 2)
        self.assertEqual(sqlite3.connect(self.db).execute("SELECT state,body FROM prepared_replies").fetchone(), ("prepared","I see the next row."))
        clash=run(self.db,"prepare",event_type="cla.feedback.follow_up",response_key=KEY,body="a different body")
        self.assertEqual(clash[0], 20); self.assertFalse(clash[1]["repost"])
        self.assertEqual(sqlite3.connect(self.db).execute("SELECT count(*),body FROM prepared_replies").fetchone(), (1,"I see the next row."))
        unknown=run(self.db,"record-write",event_type="cla.feedback.follow_up",write_state="unknown")
        self.assertEqual(unknown[0], 0); self.assertEqual(unknown[1]["result"], "needs_review"); self.assertFalse(unknown[1]["repost"])
        self.assertEqual(run(self.db,"claim",event_type="cla.feedback.follow_up")[0], 10)
        self.assertEqual(run(self.db,"check",event_type="cla.feedback.follow_up")[0], 10)
        st=run(self.db,"status",event_id=E)[1]
        self.assertEqual(st["state"], "blocked_with_unknown_outcome"); self.assertEqual(st["reply_state"], "needs_review"); self.assertEqual(st["body"], "I see the next row.")
        recovered=run(self.db,"record-write",event_type="cla.feedback.follow_up",write_state="written",message_id=MID)
        self.assertEqual(recovered[0], 0); self.assertEqual(recovered[1]["state"], "completed"); self.assertEqual(recovered[1]["message_id"], MID); self.assertFalse(recovered[1]["repost"])
        self.assertEqual(run(self.db,"claim",event_type="cla.feedback.follow_up")[0], 10)
    def test_prepare_race(self):
        run(self.db,"claim")
        def one(i):
            return run(self.db,"prepare",response_key=KEY,body="body-%d"%i)[0]
        with ThreadPoolExecutor(20) as ex: rs=list(ex.map(one, range(20)))
        self.assertEqual(rs.count(0), 1); self.assertEqual(rs.count(20), 19)
        n, body=sqlite3.connect(self.db).execute("SELECT count(*), body FROM prepared_replies").fetchone()
        self.assertEqual(n, 1); self.assertTrue(body.startswith("body-"))
if __name__=="__main__": unittest.main(verbosity=2)
