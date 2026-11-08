import json, unittest
from payload import validate
G = '{"event":"cla.feedback.created","version":1,"event_id":"11111111-1111-4111-8111-111111111111","feedback_id":"22222222-2222-4222-8222-222222222222","conversation_id":"33333333-3333-4333-8333-333333333333"}'
class P(unittest.TestCase):
    def test_ok(self): self.assertEqual(validate(G)["version"], 1)
    def test_reordered(self):
        R = '{"conversation_id":"33333333-3333-4333-8333-333333333333","version":1,"feedback_id":"22222222-2222-4222-8222-222222222222","event_id":"11111111-1111-4111-8111-111111111111","event":"cla.feedback.created"}'
        self.assertEqual(list(validate(R).keys()), ["event","version","event_id","feedback_id","conversation_id"])
        self.assertEqual(validate(R), validate(G))
    def test_follow_up_reordered(self):
        R = '{"version":1,"conversation_id":"33333333-3333-4333-8333-333333333333","event_id":"11111111-1111-4111-8111-111111111111","feedback_id":"22222222-2222-4222-8222-222222222222","event":"cla.feedback.follow_up"}'
        got = validate(R)
        self.assertEqual(list(got.keys()), ["event","version","event_id","feedback_id","conversation_id"])
        self.assertEqual(got["event"], "cla.feedback.follow_up")
        self.assertIs(type(got["version"]), int)
    def test_bad(self):
        bad = [G.replace('"version":1','"version":true'), G.replace('"version":1','"version":"1"'),
               G.replace('"version":1','"version":2'), G.replace('"version":1','"version":1.0'),
               G.replace('cla.feedback.created','x'), G.replace('11111111-1111','AAAAAAAA-1111'),
               G[:-1]+',"reporter_id":"149e612a-6e14-4ee1-9890-0f29d6f89156"}', G[:-1]+',"project":"aqcervntopidtcazcmlv"}',
               G.replace(',"conversation_id":"33333333-3333-4333-8333-333333333333"',''),
               G[:-1]+',"event":"cla.feedback.created"}', '[]', 'not json',
               G.replace('cla.feedback.created','cla.feedback.staff_reply')]
        for b in bad:
            with self.assertRaises(Exception, msg=b): validate(b)
if __name__ == "__main__": unittest.main(verbosity=1)
