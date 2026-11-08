"""Draft SQLite ledger for the portal webhook receiver.

This is not the live agent helper. The saved receiver is created-only and was
not edited. Old completed rows are left as they are. A new wake that is already
claimed, completed, or unknown is not reclaimed and is not posted again.
A prepared reply keeps its response key and body for a later write-only retry.
"""

import sqlite3

PAYLOAD_KEYS = ("event", "version", "event_id", "feedback_id", "conversation_id")
ALLOWED_EVENTS = ("cla.feedback.created", "cla.feedback.follow_up")


def connect(path=":memory:"):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("pragma foreign_keys = on")
    con.executescript(
        """
        create table if not exists wakes (
          event_id text primary key,
          event_name text not null,
          feedback_id text not null,
          conversation_id text not null,
          version integer not null,
          status text not null check (status in ('claimed', 'completed', 'unknown')),
          detail text not null default ''
        );
        create table if not exists prepared_replies (
          event_id text primary key references wakes(event_id),
          response_key text not null unique,
          body text not null,
          state text not null check (state in ('prepared', 'written', 'needs_review')),
          message_id text
        );
        """
    )
    return con


def validate_payload(payload):
    if not isinstance(payload, dict) or tuple(payload.keys()) != PAYLOAD_KEYS:
        raise ValueError("payload")
    if payload["event"] not in ALLOWED_EVENTS or payload["version"] != 1:
        raise ValueError("payload")
    if not all(isinstance(payload[key], str) and payload[key] for key in PAYLOAD_KEYS[2:]):
        raise ValueError("payload")
    return payload


def claim_wake(con, payload):
    """Claim a new wake. An existing row is returned unchanged and must not be posted again."""
    row = validate_payload(payload)
    found = con.execute("select * from wakes where event_id = ?", (row["event_id"],)).fetchone()
    if found is not None:
        return {"ok": False, "duplicate": True, "repost": False, "status": found["status"], "event_id": found["event_id"]}
    con.execute(
        "insert into wakes (event_id, event_name, feedback_id, conversation_id, version, status) values (?, ?, ?, ?, ?, 'claimed')",
        (row["event_id"], row["event"], row["feedback_id"], row["conversation_id"], row["version"]),
    )
    con.commit()
    return {"ok": True, "duplicate": False, "repost": False, "status": "claimed", "event_id": row["event_id"]}


def mark_unknown(con, event_id, detail):
    """Label the wake unknown. This does not accept it and does not delete a prepared reply."""
    changed = con.execute(
        "update wakes set status = 'unknown', detail = ? where event_id = ? and status = 'claimed'",
        (detail, event_id),
    ).rowcount
    con.commit()
    if changed != 1:
        found = con.execute("select status from wakes where event_id = ?", (event_id,)).fetchone()
        return {"ok": False, "repost": False, "status": found["status"] if found else "missing"}
    return {"ok": True, "repost": False, "status": "unknown", "needs_operator_review": True}


def save_prepared(con, event_id, response_key, body):
    """Store one reply for a claimed or unknown wake. A completed wake is not changed."""
    wake = con.execute("select status from wakes where event_id = ?", (event_id,)).fetchone()
    if wake is None or wake["status"] == "completed":
        return {"ok": False, "repost": False, "reason": "wake_closed" if wake else "missing"}
    prior = con.execute("select * from prepared_replies where event_id = ? or response_key = ?", (event_id, response_key)).fetchone()
    if prior is not None:
        if prior["event_id"] != event_id or prior["response_key"] != response_key or prior["body"] != body:
            return {"ok": False, "conflict": True, "repost": False, "response_key": prior["response_key"], "state": prior["state"]}
        return {"ok": True, "idempotent": True, "repost": False, "state": prior["state"], "response_key": prior["response_key"]}
    con.execute(
        "insert into prepared_replies (event_id, response_key, body, state) values (?, ?, ?, 'prepared')",
        (event_id, response_key, body),
    )
    con.commit()
    return {"ok": True, "idempotent": False, "repost": False, "state": "prepared", "response_key": response_key}


def retry_write(con, event_id, write_fn):
    """Retry the stored reply only. write_fn performs the portal write and must not post the wake."""
    slot = con.execute("select * from prepared_replies where event_id = ?", (event_id,)).fetchone()
    wake = con.execute("select * from wakes where event_id = ?", (event_id,)).fetchone()
    if slot is None or wake is None:
        return {"ok": False, "repost": False, "reason": "missing"}
    if wake["status"] == "completed" and slot["state"] == "written":
        return {"ok": True, "idempotent": True, "repost": False, "completed": True, "message_id": slot["message_id"], "response_key": slot["response_key"]}
    try:
        result = write_fn(event_id, slot["body"], slot["response_key"])
    except Exception:
        return {"ok": False, "repost": False, "reason": "bookkeeping_failed", "state": slot["state"], "response_key": slot["response_key"]}
    if not isinstance(result, dict):
        return {"ok": False, "repost": False, "reason": "bookkeeping_failed", "state": slot["state"]}
    if result.get("conflict") is True:
        return {"ok": False, "conflict": True, "repost": False, "response_key": slot["response_key"], "completed": False}
    if result.get("state") == "written" and result.get("message_id"):
        con.execute(
            "update prepared_replies set state = 'written', message_id = ? where event_id = ?",
            (result["message_id"], event_id),
        )
        con.execute("update wakes set status = 'completed', detail = '' where event_id = ? and status != 'completed'", (event_id,))
        con.commit()
        return {"ok": True, "repost": False, "completed": True, "message_id": result["message_id"], "response_key": slot["response_key"]}
    con.execute("update prepared_replies set state = 'needs_review' where event_id = ? and state = 'prepared'", (event_id,))
    con.commit()
    return {
        "ok": True,
        "repost": False,
        "completed": False,
        "state": "needs_review",
        "reason": result.get("reason") or "needs_operator_review",
        "response_key": slot["response_key"],
        "body": slot["body"],
    }
