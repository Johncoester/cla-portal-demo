"""Local checks for the draft ledger. Uses sqlite in memory. No network and no live helper."""

from ledger import claim_wake, connect, mark_unknown, retry_write, save_prepared, validate_payload

fail = 0

def check(cond, message):
    global fail
    print("ok" if cond else "FAIL", message)
    if not cond:
        fail += 1

created = {"event": "cla.feedback.created", "version": 1, "event_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "feedback_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "conversation_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc"}
con = connect()
first = claim_wake(con, created)
again = claim_wake(con, created)
check(first["status"] == "claimed" and again["duplicate"] is True and again["repost"] is False and again["status"] == "claimed", "a second wake is not reclaimed and is not reposted")
con.execute("update wakes set status = 'completed' where event_id = ?", (created["event_id"],))
con.commit()
before = dict(con.execute("select * from wakes where event_id = ?", (created["event_id"],)).fetchone())
left = claim_wake(con, created)
after = dict(con.execute("select * from wakes where event_id = ?", (created["event_id"],)).fetchone())
check(left["status"] == "completed" and before == after, "an old completed wake is untouched")

follow = {**created, "event": "cla.feedback.follow_up", "event_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd"}
claimed = claim_wake(con, follow)
saved = save_prepared(con, follow["event_id"], "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "I see the next row.")
unknown = mark_unknown(con, follow["event_id"], "the portal could not tell whether the routine started")
kept = con.execute("select body, response_key, state from prepared_replies where event_id = ?", (follow["event_id"],)).fetchone()
check(claimed["status"] == "claimed" and saved["state"] == "prepared" and unknown["status"] == "unknown" and unknown["repost"] is False and kept["body"] == "I see the next row." and kept["state"] == "prepared", "an unknown wake keeps the prepared reply and is not accepted")
review = retry_write(con, follow["event_id"], lambda event_id, body, key: {"state": "prepared", "reason": "outcome_unknown"})
wake = con.execute("select status from wakes where event_id = ?", (follow["event_id"],)).fetchone()
check(review["completed"] is False and review["repost"] is False and review["reason"] == "outcome_unknown" and wake["status"] == "unknown", "a write retry without evidence stays unknown and does not post")

def bookkeeping_fails(event_id, body, key):
    raise RuntimeError("bookkeeping")

failed = retry_write(con, follow["event_id"], bookkeeping_fails)
status = con.execute("select status from wakes where event_id = ?", (follow["event_id"],)).fetchone()["status"]
check(failed["reason"] == "bookkeeping_failed" and failed["repost"] is False and status == "unknown", "failed bookkeeping does not repost or complete the wake")

accepted = {**created, "event_id": "ffffffff-ffff-4fff-8fff-ffffffffffff"}
claim_wake(con, accepted)
save_prepared(con, accepted["event_id"], "99999999-9999-4999-8999-999999999999", "The stored 200 can be written.")
written = retry_write(con, accepted["event_id"], lambda event_id, body, key: {"state": "written", "message_id": "12121212-1212-4121-8121-121212121212"})
done = con.execute("select status from wakes where event_id = ?", (accepted["event_id"],)).fetchone()
check(written["completed"] is True and written["repost"] is False and done["status"] == "completed", "a known written result completes the wake once")
clash = save_prepared(con, accepted["event_id"], "99999999-9999-4999-8999-999999999999", "A different body.")
check(clash["ok"] is False and clash["reason"] == "wake_closed", "a completed wake does not take a new body")

try:
    validate_payload({"event": "cla.feedback.created", "version": 1, "event_id": "x", "note": "secret"})
    check(False, "extra payload field was accepted")
except ValueError:
    check(True, "the payload stays the five fields")

print("box ledger draft failed" if fail else "box ledger draft passed")
raise SystemExit(1 if fail else 0)
