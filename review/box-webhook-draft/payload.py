#!/usr/bin/env python3
"""Validate inbound webhook payload JSON (stdin). Exact set of 5 keys, any order (output normalized); version int 1 (not bool/str).
Prints validated ids as JSON; exit 0 valid, 2 invalid. No storage, no network.
Allows cla.feedback.created and cla.feedback.follow_up. No other event name."""
import json, re, sys
KEYS = ["event", "version", "event_id", "feedback_id", "conversation_id"]
EVENTS = {"cla.feedback.created", "cla.feedback.follow_up"}
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
def validate(text):
    def no_dup(pairs):
        ks = [k for k, _ in pairs]
        if len(ks) != len(set(ks)): raise ValueError("duplicate keys")
        return dict(pairs)
    d = json.loads(text, object_pairs_hook=no_dup)
    if not isinstance(d, dict) or set(d.keys()) != set(KEYS): raise ValueError("fields must be exactly the set " + ",".join(KEYS))
    if d["event"] not in EVENTS: raise ValueError("bad event")
    v = d["version"]
    if type(v) is not int or v != 1: raise ValueError("version must be integer 1")
    for k in KEYS[2:]:
        if not isinstance(d[k], str) or not UUID.match(d[k]): raise ValueError(k + " not lowercase uuid")
    return {k: d[k] for k in KEYS}
if __name__ == "__main__":
    try: d = validate(sys.stdin.read()); print(json.dumps({"result": "valid", **d})); sys.exit(0)
    except Exception as e: print(json.dumps({"result": "invalid", "error": str(e)[:120]})); sys.exit(2)
