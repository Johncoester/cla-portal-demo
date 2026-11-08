#!/usr/bin/env python3
"""BOX-only dedup ledger for the TEST webhook pilot. Stdlib only, no network.
events stores ids, status, and timestamps. prepared_replies stores one response key and body
for a later write-only retry. Never stores URLs or tokens.
Exit codes: 0 ok/claimed/new, 10 duplicate (quiet), 20 correlation conflict, 2 invalid input, 3 storage unsafe/busy/corrupt.
A duplicate does not reread and does not redeliver. This program never posts the webhook."""
import argparse, json, os, re, sqlite3, stat, sys, time
BASE = os.path.dirname(os.path.realpath(__file__))  # canonical, symlink-free
PROJECT = "aqcervntopidtcazcmlv"
EVENT_TYPES = {"cla.feedback.created", "cla.feedback.follow_up"}
REPORTERS = {"149e612a-6e14-4ee1-9890-0f29d6f89156": "John", "d02722a1-582b-42c0-b3d1-28d25adb758d": "Matt"}
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
VER = re.compile(r"^[0-9]{1,4}(\.[0-9]{1,4}){0,2}$")
class Unsafe(Exception): pass
class Invalid(Exception): pass

def safe_path(p):
    p = os.path.abspath(p); cur = "/"
    for part in p.strip("/").split("/"):
        cur = os.path.join(cur, part)
        if os.path.lexists(cur) and os.path.islink(cur): raise Unsafe("symlink in path: " + cur)
    return p

def open_db(db):
    db = safe_path(db); d = os.path.dirname(db)
    st = os.lstat(d)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700:
        raise Unsafe("directory must be owned dir with mode 0700")
    os.umask(0o077)
    if os.path.lexists(db):
        s = os.lstat(db)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o600:
            raise Unsafe("db must be owned regular file mode 0600")
    else:
        fd = os.open(db, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600); os.close(fd)
    try:
        c = sqlite3.connect(db, timeout=5, isolation_level=None)
        c.execute("PRAGMA foreign_keys=ON")
        c.execute("PRAGMA journal_mode=DELETE"); c.execute("PRAGMA synchronous=FULL")
        if c.execute("PRAGMA quick_check").fetchone()[0] != "ok": raise Unsafe("db corrupt")
        c.execute("""CREATE TABLE IF NOT EXISTS events(project TEXT NOT NULL, event_id TEXT NOT NULL,
          feedback_id TEXT NOT NULL, conversation_id TEXT NOT NULL, reporter_id TEXT NOT NULL,
          event_type TEXT NOT NULL, version TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN('claimed','completed','blocked_with_unknown_outcome')),
          claimed_at TEXT NOT NULL, finished_at TEXT, UNIQUE(project,event_id))""")
        c.execute("CREATE TRIGGER IF NOT EXISTS nodel BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'delete forbidden'); END")
        c.execute("""CREATE TABLE IF NOT EXISTS prepared_replies(project TEXT NOT NULL, event_id TEXT NOT NULL,
          response_key TEXT NOT NULL, body TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN('prepared','written','needs_review')),
          message_id TEXT, updated_at TEXT NOT NULL, UNIQUE(project,event_id), UNIQUE(project,response_key),
          FOREIGN KEY(project,event_id) REFERENCES events(project,event_id))""")
        c.execute("CREATE TRIGGER IF NOT EXISTS nodel_reply BEFORE DELETE ON prepared_replies BEGIN SELECT RAISE(ABORT,'delete forbidden'); END")
    except sqlite3.DatabaseError as e: raise Unsafe("sqlite: %s" % e)
    return c

def validate(a, need_full=True):
    if a.project != PROJECT: raise Invalid("project not allowed")
    for k in (["event_id","feedback_id","conversation_id","reporter_id"] if need_full else ["event_id"]):
        if not UUID.match(getattr(a,k) or ""): raise Invalid(k + " not a lowercase uuid")
    if need_full:
        if a.reporter_id not in REPORTERS: raise Invalid("reporter not pilot user")
        if a.event_type not in EVENT_TYPES: raise Invalid("event_type not allowed")
        if not VER.match(a.version or ""): raise Invalid("bad version")
        if a.expected_version and a.version != a.expected_version: raise Invalid("version mismatch")

def row(c, a):
    return c.execute("SELECT feedback_id,conversation_id,reporter_id,event_type,version,status FROM events WHERE project=? AND event_id=?", (a.project,a.event_id)).fetchone()

def reply_of(c, a):
    return c.execute("SELECT response_key,body,state,message_id FROM prepared_replies WHERE project=? AND event_id=?", (a.project,a.event_id)).fetchone()

def same(r, a): return r[:5] == (a.feedback_id,a.conversation_id,a.reporter_id,a.event_type,a.version)
def now(): return time.strftime("%Y-%m-%dT%H:%M:%S%z")
def out(**k): print(json.dumps(k)); return k
def two_way(a, rep): return a.event_type == "cla.feedback.follow_up" or rep is not None

def check_reply_args(a):
    if not UUID.match(a.response_key or ""): raise Invalid("response_key not a lowercase uuid")
    body = a.body if isinstance(a.body, str) else ""
    if body.strip() == "" or len(body) > 4000: raise Invalid("body missing or too long")

def main(argv=None):
    p = argparse.ArgumentParser(); p.add_argument("cmd", choices=["status","check","claim","finish","prepare","record-write"])
    p.add_argument("--db", default=os.path.join(BASE, "pilot_ledger.sqlite3"))
    p.add_argument("--project", default=PROJECT)
    for k in ["event-id","feedback-id","conversation-id","reporter-id","event-type","version","expected-version","response-key","body","message-id"]: p.add_argument("--"+k)
    p.add_argument("--outcome", choices=["completed","unknown"])
    p.add_argument("--write-state", choices=["prepared","written","unknown","conflict"])
    a = p.parse_args(argv)
    try:
        c = open_db(a.db)
        if a.cmd == "status":
            if a.event_id:
                validate(a, False); r = row(c,a); rep = reply_of(c,a) if r else None
                extra = {"reply_state": rep[2], "response_key": rep[0], "body": rep[1], "message_id": rep[3]} if rep else {}
                out(result="status", state=r[5] if r else "absent", **extra); return 0
            out(result="status", counts=dict(c.execute("SELECT status,count(*) FROM events GROUP BY status").fetchall())); return 0
        validate(a)
        if a.cmd == "prepare": check_reply_args(a)
        c.execute("BEGIN IMMEDIATE")
        try:
            r = row(c,a)
            if r and not same(r,a): c.execute("ROLLBACK"); out(result="conflict", state=r[5], repost=False); return 20
            if a.cmd == "check":
                c.execute("ROLLBACK"); out(result="duplicate" if r else "new", state=r[5] if r else None); return 10 if r else 0
            if a.cmd == "claim":
                if r: c.execute("ROLLBACK"); out(result="duplicate", state=r[5]); return 10
                c.execute("INSERT INTO events VALUES(?,?,?,?,?,?,?,'claimed',?,NULL)", (a.project,a.event_id,a.feedback_id,a.conversation_id,a.reporter_id,a.event_type,a.version,now()))
                c.execute("COMMIT"); out(result="claimed"); return 0
            if a.cmd == "prepare":
                if not r: c.execute("ROLLBACK"); raise Invalid("not claimed")
                if r[5] not in ("claimed", "blocked_with_unknown_outcome"):
                    c.execute("ROLLBACK"); out(result="conflict", state=r[5], repost=False); return 20
                rep = reply_of(c,a)
                if rep:
                    if rep[0] != a.response_key or rep[1] != a.body:
                        c.execute("ROLLBACK"); out(result="conflict", state=r[5], reply_state=rep[2], response_key=rep[0], repost=False); return 20
                    c.execute("ROLLBACK"); out(result="already", reply_state=rep[2], response_key=rep[0], repost=False); return 0
                state = "needs_review" if r[5] == "blocked_with_unknown_outcome" else "prepared"
                c.execute("INSERT INTO prepared_replies VALUES(?,?,?,?,?,NULL,?)", (a.project,a.event_id,a.response_key,a.body,state,now()))
                c.execute("COMMIT"); out(result="prepared", reply_state=state, response_key=a.response_key, repost=False); return 0
            if a.cmd == "record-write":
                if a.write_state not in ("prepared", "written", "unknown", "conflict"):
                    c.execute("ROLLBACK"); raise Invalid("--write-state required")
                if not r: c.execute("ROLLBACK"); raise Invalid("not claimed")
                rep = reply_of(c,a)
                if not rep: c.execute("ROLLBACK"); raise Invalid("no prepared reply")
                if a.write_state == "conflict":
                    c.execute("ROLLBACK"); out(result="conflict", reply_state=rep[2], response_key=rep[0], repost=False); return 20
                if a.write_state == "prepared":
                    c.execute("ROLLBACK"); out(result="prepared", reply_state=rep[2], response_key=rep[0], repost=False); return 0
                if a.write_state == "unknown":
                    if r[5] == "completed": c.execute("ROLLBACK"); out(result="conflict", state="completed", repost=False); return 20
                    c.execute("UPDATE prepared_replies SET state='needs_review', updated_at=? WHERE project=? AND event_id=?", (now(),a.project,a.event_id))
                    if r[5] == "claimed":
                        c.execute("UPDATE events SET status='blocked_with_unknown_outcome', finished_at=? WHERE project=? AND event_id=? AND status='claimed'", (now(),a.project,a.event_id))
                    c.execute("COMMIT"); out(result="needs_review", state="blocked_with_unknown_outcome", response_key=rep[0], repost=False); return 0
                if not UUID.match(a.message_id or ""): c.execute("ROLLBACK"); raise Invalid("message_id not a lowercase uuid")
                if rep[2] == "written" and rep[3] not in (None, a.message_id):
                    c.execute("ROLLBACK"); out(result="conflict", reply_state="written", response_key=rep[0], repost=False); return 20
                c.execute("UPDATE prepared_replies SET state='written', message_id=?, updated_at=? WHERE project=? AND event_id=?", (a.message_id,now(),a.project,a.event_id))
                if r[5] != "completed":
                    n = c.execute("UPDATE events SET status='completed', finished_at=? WHERE project=? AND event_id=? AND status IN ('claimed','blocked_with_unknown_outcome')", (now(),a.project,a.event_id)).rowcount
                    if n != 1: c.execute("ROLLBACK"); out(result="conflict", state=r[5], repost=False); return 20
                c.execute("COMMIT"); out(result="written", state="completed", message_id=a.message_id, response_key=rep[0], repost=False); return 0
            # finish
            if not a.outcome: raise Invalid("--outcome required")
            tgt = "completed" if a.outcome == "completed" else "blocked_with_unknown_outcome"
            if not r: c.execute("ROLLBACK"); raise Invalid("not claimed")
            if r[5] == tgt: c.execute("ROLLBACK"); out(result="already", state=tgt); return 0
            if r[5] != "claimed": c.execute("ROLLBACK"); out(result="conflict", state=r[5]); return 20
            rep = reply_of(c,a)
            if a.outcome == "completed" and two_way(a, rep) and not (rep and rep[2] == "written" and rep[3]):
                c.execute("ROLLBACK"); out(result="conflict", error="written message id required", repost=False); return 20
            if a.outcome == "unknown" and rep and rep[2] == "prepared":
                c.execute("UPDATE prepared_replies SET state='needs_review', updated_at=? WHERE project=? AND event_id=? AND state='prepared'", (now(),a.project,a.event_id))
            c.execute("UPDATE events SET status=?,finished_at=? WHERE project=? AND event_id=? AND status='claimed'", (tgt,now(),a.project,a.event_id))
            c.execute("COMMIT"); out(result="finished", state=tgt); return 0
        except sqlite3.IntegrityError:
            try: c.execute("ROLLBACK")
            except Exception: pass
            out(result="conflict", error="reply key", repost=False); return 20
        except sqlite3.DatabaseError:
            try: c.execute("ROLLBACK")
            except Exception: pass
            raise
    except Invalid as e: out(result="invalid", error=str(e)); return 2
    except (Unsafe, sqlite3.DatabaseError, OSError) as e: out(result="unsafe", error=type(e).__name__ + ": " + str(e)[:200]); return 3
if __name__ == "__main__": sys.exit(main())
