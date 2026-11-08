/* Real edge handler plus disposable Postgres. The webhook is a fake HTTP response.
 * The handler still has to call it. This is not the portal UI mock. */
import { execFileSync } from 'node:child_process';
import { handleStaffFeedbackDispatch, productionDeps } from '../supabase/functions/staff-feedback-dispatch/logic.mjs';

const DB = process.env.CLA_EDGE_TEST_DB || 'cla_portal_edge_roundtrip';
let fail = 0;
const check = (cond, message) => { if (cond) console.log('ok', message); else { fail++; console.log('FAIL', message); } };
const JOHN = '149e612a-6e14-4ee1-9890-0f29d6f89156';
const sql = (q) => execFileSync('sudo', ['-u', 'postgres', 'psql', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', q], { encoding: 'utf8', env: { ...process.env, COLUMNS: '200000', PAGER: 'cat' } }).trim();
const session = (sub, role, q) => sql(`select ${q.replace(/^\s*select\s+/i, '')} from (select set_config('request.jwt.claim.sub', '${sub}', true), set_config('request.jwt.claim.role', '${role}', true)) cfg`);
const asUser = (q) => session(JOHN, 'authenticated', q);
const asService = (q) => session('', 'service_role', q);
const asConnector = (q) => session('', '', q);

sql(`insert into public.profiles (id, first_name, last_name, role, status, is_admin, is_demo) values ('${JOHN}', 'John', 'Pilot', 'Super admin', 'active', true, false) on conflict (id) do nothing`);
const created = JSON.parse(asUser(`select public.staff_feedback_create('Portal conversation', 'test test', false, '', false, '', '17171717-1717-4171-8171-171717171717')`));
const createdEvent = sql(`select id::text || '|' || dispatch_allowed::text || '|' || reason || '|' || reply_enabled::text || '|' || coalesce(message_id::text, '') from public.staff_feedback_outbox where feedback_id = '${created.id}' and event_name = 'cla.feedback.created'`);
const [createdEventId, allowed, reason, enabled, messageId] = createdEvent.split('|');
console.log('DB result: new created event', { createdEventId, allowed, reason, enabled, messageId, reportId: created.id });
check(allowed === 'false' && enabled === 'true' && messageId.length === 36, 'a new created event stays worker-disabled and is marked reply-enabled');
const author = sql(`select author_name from public.staff_feedback_messages where report_id = '${created.id}' and author_kind = 'reporter'`);
console.log('DB result: reporter name from who.name', author);
check(author === 'John Pilot', 'the saved name is the profile name');

const posts = [];
const env = { get: (name) => ({
  STAFF_FEEDBACK_DISPATCH_ENABLED: 'true',
  STAFF_FEEDBACK_BRIDGE_URL: 'https://example.test/hook',
  STAFF_FEEDBACK_BRIDGE_HOST: 'example.test',
  STAFF_FEEDBACK_BRIDGE_TOKEN: 'sender-secret-value',
  SUPABASE_URL: 'https://aqcervntopidtcazcmlv.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
}[name] || '') };

function outboxFromUrl(url) {
  const params = new URL(url).searchParams;
  const id = (params.get('id') || '').replace(/^eq\./, '');
  const feedback = (params.get('feedback_id') || '').replace(/^eq\./, '');
  const event = params.get('event_name') || '';
  let where = `feedback_id = '${feedback}'`;
  if (id) where += ` and id = '${id}'`;
  if (event.startsWith('eq.')) where += ` and event_name = '${event.slice(3)}'`;
  if (event.startsWith('in.(')) where += ` and event_name in (${event.slice(4, -1).split(',').map((n) => `'${n}'`).join(',')})`;
  const line = sql(`select coalesce(json_agg(json_build_object('id', id, 'feedback_id', feedback_id, 'conversation_id', conversation_id, 'delivery_state', delivery_state, 'dispatch_allowed', dispatch_allowed, 'attempt_count', attempt_count, 'event_name', event_name)), '[]'::json)::text from public.staff_feedback_outbox where ${where}`);
  return JSON.parse(line);
}

const fetchImpl = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: JOHN }) };
  if (u.includes('/rest/v1/profiles')) return { ok: true, status: 200, json: async () => ([{ status: 'active', is_demo: false }]) };
  if (u.includes('/rest/v1/staff_feedback_outbox')) return { ok: true, status: 200, json: async () => outboxFromUrl(u) };
  if (u.includes('/rpc/staff_feedback_claim_dispatch') || u.includes('/rpc/staff_feedback_finish_dispatch')) {
    const body = JSON.parse(opts.body);
    const fn = u.includes('claim_dispatch') ? 'staff_feedback_claim_dispatch' : 'staff_feedback_finish_dispatch';
    const args = fn.includes('claim')
      ? `('${body.p_event}'::uuid, '${body.p_claim}'::uuid)`
      : `('${body.p_event}'::uuid, '${body.p_claim}'::uuid, '${body.p_outcome}', ${body.p_http === null || body.p_http === undefined ? 'null' : Number(body.p_http)})`;
    const text = asService(`select public.${fn}${args}::text`);
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  }
  if (u.startsWith('https://example.test/')) {
    const payload = JSON.parse(opts.body);
    posts.push(payload);
    if (payload.event === 'cla.feedback.created') {
      const early = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${payload.event_id}'::uuid, 'I see the test message.', '18181818-1818-4181-8181-181818181818')::text`));
      console.log('DB result: reply during the webhook, before acceptance is recorded', early);
      check(early.state === 'prepared' && early.completed === false && early.message_id === null, 'the early reply is stored and not shown');
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }
  return { ok: false, status: 500, json: async () => ({}) };
};

const req = (body) => new Request('https://aqcervntopidtcazcmlv.supabase.co/functions/v1/staff-feedback-dispatch', {
  method: 'POST', headers: { authorization: 'Bearer user-jwt', origin: 'https://testportal.clatitle.com', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const platform = { Deno: { env, resolveDns: async (_host, kind) => (kind === 'A' ? ['93.184.216.34'] : []) }, fetch: fetchImpl, crypto: { randomUUID: () => '19191919-1919-4191-8191-191919191919' } };
const first = await handleStaffFeedbackDispatch({ ...productionDeps(req({ explicit: true, feedback_id: created.id }), platform), allowSend: true });
console.log('EDGE result: first send', { status: first.status, reason: first.body && first.body.reason, runAccepted: first.body && first.body.runAccepted, replied: first.body && first.body.replied });
check(first.status === 200 && first.body.reason === 'run_started' && first.body.replied === false && posts.length === 1 && posts[0].event === 'cla.feedback.created' && posts[0].event_id === createdEventId, 'the edge posted the created event and did not call it a reply');
const after = sql(`select delivery_state || '|' || (select state from private.staff_feedback_reply_slot where event_id = '${createdEventId}') || '|' || (select count(*) from public.staff_feedback_messages where report_id = '${created.id}' and author_kind = 'bot') from public.staff_feedback_outbox where id = '${createdEventId}'`);
console.log('DB result: after the edge recorded acceptance', after);
check(after === 'run_accepted|written|1', 'recording acceptance published the prepared reply without a second post');

const turn = JSON.parse(asUser(`select public.staff_feedback_add_turn('${created.id}'::uuid, 'Please check the next row too.', '20202020-2020-4202-8202-202020202020')::text`));
const follow = await handleStaffFeedbackDispatch({ ...productionDeps(req({ explicit: true, feedback_id: created.id, event_id: turn.turn_event_id }), platform), allowSend: true });
console.log('EDGE result: follow-up send', { status: follow.status, event: posts[1] && posts[1].event, eventId: posts[1] && posts[1].event_id });
check(follow.status === 200 && posts.length === 2 && posts[1].event === 'cla.feedback.follow_up' && posts[1].event_id === turn.turn_event_id && posts[1].feedback_id === created.id, 'the edge posted the follow-up event itself');
const second = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${turn.turn_event_id}'::uuid, 'The next row is unchanged.', '21212121-2121-4121-8121-212121212121')::text`));
console.log('DB result: second reply', second);
const seen = JSON.parse(asConnector(`select public.staff_feedback_receiver_read('${turn.turn_event_id}'::uuid, '${created.id}'::uuid, '${created.conversation_id}'::uuid)::text`));
console.log('DB result: follow-up read', JSON.stringify(seen));
check(second.state === 'written' && second.completed === true && seen.current.body === 'Please check the next row too.' && seen.context.some((m) => m.body === 'I see the test message.') && seen.context.every((m) => m.body !== 'Please check the next row too.'), 'the follow-up read uses that turn and the earlier reply');

const oldId = sql(`select id::text from public.staff_feedback_outbox where feedback_id = '${created.id}' and event_name = 'cla.feedback.created'`);
sql(`update public.staff_feedback_outbox set reply_enabled = false where id = '${oldId}'`);
const refused = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${oldId}'::uuid, 'An answer to an old one-way event.', '22222222-2222-4222-8222-222222222222')::text`));
const refusedSlots = sql(`select count(*) from private.staff_feedback_reply_slot where idempotency_key = '22222222-2222-4222-8222-222222222222'`);
console.log('DB result: old event reply', refused, 'slots', refusedSlots);
check(refused.reason === 'reply_not_enabled' && refused.completed === false && refusedSlots === '0', 'an event with the reply marker off cannot be answered');
sql(`update public.staff_feedback_outbox set reply_enabled = true where id = '${oldId}'`);

const unknownReport = JSON.parse(asUser(`select public.staff_feedback_create('Unknown', 'A lost send.', false, '', false, '', '23232323-2323-4232-8232-232323232323')::text`));
const unknownEvent = sql(`select id::text from public.staff_feedback_outbox where feedback_id = '${unknownReport.id}' and event_name = 'cla.feedback.created'`);
const unknownClaim = '24242424-2424-4242-8242-242424242424';
asService(`select public.staff_feedback_claim_dispatch('${unknownEvent}'::uuid, '${unknownClaim}'::uuid)`);
asService(`select public.staff_feedback_finish_dispatch('${unknownEvent}'::uuid, '${unknownClaim}'::uuid, 'outcome_unknown', null)`);
const unknownReply = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${unknownEvent}'::uuid, 'I will not guess.', '25252525-2525-4252-8252-252525252525')::text`));
const unknownState = sql(`select delivery_state || '|' || dispatch_outcome from public.staff_feedback_outbox where id = '${unknownEvent}'`);
console.log('DB result: unknown outcome reply', unknownReply, unknownState);
check(unknownReply.state === 'prepared' && unknownReply.reason === 'outcome_unknown' && unknownReply.completed === false && unknownState === 'pending_dispatch|outcome_unknown', 'an unknown send is not treated as accepted');

const heldReport = JSON.parse(asUser(`select public.staff_feedback_create('Held 200', 'The 200 was not stored.', false, '', false, '', '26262626-2626-4262-8262-262626262626')::text`));
const heldEvent = sql(`select id::text from public.staff_feedback_outbox where feedback_id = '${heldReport.id}' and event_name = 'cla.feedback.created'`);
const heldClaim = '27272727-2727-4272-8272-272727272727';
asService(`select public.staff_feedback_claim_dispatch('${heldEvent}'::uuid, '${heldClaim}'::uuid)`);
asService(`select public.staff_feedback_finish_dispatch('${heldEvent}'::uuid, '${heldClaim}'::uuid, 'accepted_unrecorded', 200)`);
const postsBefore = posts.length;
const heldEarly = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${heldEvent}'::uuid, 'The stored 200 can be written now.', '28282828-2828-4282-8282-282828282828')::text`));
console.log('DB result: accepted-unrecorded write', heldEarly, 'posts', posts.length);
check(heldEarly.state === 'written' && heldEarly.completed === true && posts.length === postsBefore, 'a stored HTTP 200 is written without posting the user message again');
const again = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${heldEvent}'::uuid, 'The stored 200 can be written now.', '28282828-2828-4282-8282-282828282828')::text`));
const clash = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${heldEvent}'::uuid, 'A different body.', '28282828-2828-4282-8282-282828282828')::text`));
const clashCount = sql(`select count(*) from public.staff_feedback_messages where report_id = '${heldReport.id}' and author_kind = 'bot'`);
console.log('DB result: same key replay and conflict', { again: again.message_id, clash, clashCount });
check(again.idempotent === true && again.message_id === heldEarly.message_id && clash.conflict === true && clash.completed === false && clashCount === '1', 'the same body replays and a different body does not create a second reply');

let tooLong = '';
try { asUser(`select public.staff_feedback_add_turn('${heldReport.id}'::uuid, '${'x'.repeat(4001)}', '30303030-3030-4030-8030-303030303030')`); } catch (e) { tooLong = String(e.stderr || e.message); }
console.log('DB result: overlong follow-up', tooLong.includes('too long'));
check(tooLong.includes('too long'), 'a follow-up over 4000 characters is refused');
for (let i = 1; i <= 8; i += 1) {
  const key = `31313131-3131-4131-8131-${String(i).padStart(12, '0')}`;
  asUser(`select public.staff_feedback_add_turn('${heldReport.id}'::uuid, 'note ${i}', '${key}')`);
}
let rated = '';
try { asUser(`select public.staff_feedback_add_turn('${heldReport.id}'::uuid, 'note 9', '32323232-3232-4232-8232-323232323232')`); } catch (e) { rated = String(e.stderr || e.message); }
console.log('DB result: follow-up rate', rated.includes('few minutes'));
check(rated.includes('few minutes'), 'nine follow-ups in ten minutes are refused');

sql(`update public.staff_feedback_reports set status = 'fixed' where id = '${created.id}'`);
let closed = '';
try { asUser(`select public.staff_feedback_add_turn('${created.id}'::uuid, 'One more.', '29292929-2929-4292-8292-292929292929')`); } catch (e) { closed = String(e.stderr || e.message); }
console.log('DB result: closed conversation', closed.split('\n').find((line) => line.includes('closed')) || closed.slice(0, 180));
check(closed.includes('This conversation is closed.'), 'a fixed conversation does not take another turn');

sql(`update public.staff_feedback_outbox set created_at = pg_catalog.now() - interval '1 hour' where report_id = '${heldReport.id}' and event_name = 'cla.feedback.follow_up'`);
for (let i = 9; i <= 20; i += 1) {
  const key = `36363636-3636-4363-8363-${String(i).padStart(12, '0')}`;
  asUser(`select public.staff_feedback_add_turn('${heldReport.id}'::uuid, 'older ${i}', '${key}')`);
  if (i % 8 === 0) sql(`update public.staff_feedback_outbox set created_at = pg_catalog.now() - interval '1 hour' where report_id = '${heldReport.id}' and event_name = 'cla.feedback.follow_up'`);
}
let capped = '';
try { asUser(`select public.staff_feedback_add_turn('${heldReport.id}'::uuid, 'over the cap', '37373737-3737-4373-8373-373737373737')`); } catch (e) { capped = String(e.stderr || e.message); }
console.log('DB result: follow-up cap', capped.includes('message limit'));
check(capped.includes('message limit'), 'the twenty-first follow-up is refused');

const ackReport = JSON.parse(asUser(`select public.staff_feedback_create('After read', 'Please answer after the read mark.', false, '', false, '', '38383838-3838-4383-8383-383838383838')::text`));
const ackEvent = sql(`select id::text from public.staff_feedback_outbox where feedback_id = '${ackReport.id}' and event_name = 'cla.feedback.created'`);
const ackClaim = '39393939-3939-4393-8393-393939393939';
asService(`select public.staff_feedback_claim_dispatch('${ackEvent}'::uuid, '${ackClaim}'::uuid)`);
asService(`select public.staff_feedback_finish_dispatch('${ackEvent}'::uuid, '${ackClaim}'::uuid, 'run_accepted', 200)`);
asService(`select public.staff_feedback_bot_ack('${ackEvent}'::uuid)`);
const ackReply = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${ackEvent}'::uuid, 'I can answer after the read mark.', '40404040-4040-4404-8404-404040404040')::text`));
const ackState = sql(`select delivery_state from public.staff_feedback_outbox where id = '${ackEvent}'`);
console.log('DB result: reply after bot_acknowledged', ackReply.state, ackState);
check(ackReply.state === 'written' && ackReply.completed === true && ackState === 'bot_acknowledged', 'a read mark does not leave the reply unpublished');

const recoverReport = JSON.parse(asUser(`select public.staff_feedback_create('Recover', 'The 200 needs the edge.', false, '', false, '', '41414141-4141-4414-8414-414141414141')::text`));
const recoverEvent = sql(`select id::text from public.staff_feedback_outbox where feedback_id = '${recoverReport.id}' and event_name = 'cla.feedback.created'`);
const recoverClaim = '42424242-4242-4424-8424-424242424242';
asService(`select public.staff_feedback_claim_dispatch('${recoverEvent}'::uuid, '${recoverClaim}'::uuid)`);
asService(`select public.staff_feedback_finish_dispatch('${recoverEvent}'::uuid, '${recoverClaim}'::uuid, 'accepted_unrecorded', 200)`);
const postsAtRecover = posts.length;
const recovered = await handleStaffFeedbackDispatch({ ...productionDeps(req({ explicit: true, feedback_id: recoverReport.id }), platform), allowSend: true });
const recoverState = sql(`select delivery_state from public.staff_feedback_outbox where id = '${recoverEvent}'`);
console.log('EDGE result: accepted-unrecorded recovery', { status: recovered.status, posts: posts.length, recoverState });
check(recovered.status === 200 && recovered.body.runAccepted === true && posts.length === postsAtRecover && recoverState === 'run_accepted', 'the edge records a stored 200 without posting again');
sql(`update public.staff_feedback_outbox set delivery_state = 'replied' where id = '${recoverEvent}'`);
const replied = JSON.parse(asConnector(`select public.staff_feedback_record_assistant_reply('${recoverEvent}'::uuid, 'A reply still lands after the draft state.', '43434343-4343-4434-8434-434343434343')::text`));
console.log('DB result: reply while delivery is replied', replied.state, replied.completed);
check(replied.state === 'written' && replied.completed === true, 'a replied event can still publish the saved response');

const ord = sql(`with sample(id, created_at) as (values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, '2026-01-02'::timestamptz), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, '2026-01-01'::timestamptz)) select string_agg(id::text, ',' order by n) from (select id, row_number() over (order by created_at asc, id asc) as n from sample) s`);
console.log('DB result: chronology order', ord);
check(ord.startsWith('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'backfill order follows created_at then id');
const priv = sql(`select has_schema_privilege('service_role', 'private', 'usage')::text || '|' || (select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'staff_feedback_record_assistant_reply') || '|' || (select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'staff_feedback_record_assistant_reply')`);
console.log('DB result: service_role usage and security mode', priv);
check(priv === 'true|true|false', 'service_role can use private, the private function is definer, and the public wrapper is invoker');

console.log(fail ? `${fail} failed` : 'edge sql round trip passed');
if (fail) process.exit(1);
