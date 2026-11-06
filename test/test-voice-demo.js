/* Voice is a signed-in Live Test path. The public fake link cannot open it. */
import { routeAllowed } from '../js/data/locked-links.js';
import { acceptEphemeralToken, createVoiceSession, realtimeSocket, requestVoice, sessionUpdate, stopMic, textTurn, voiceRouteOk, VOICE_URL, DEMO_INSTRUCTIONS } from '../js/data/voice-demo.js';
let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const buyer = { id: 'u-buyer', role: 'Outside user', status: 'active' };
const admin = { id: 'u-admin', role: 'Super admin', status: 'active', isAdmin: true };
const signed = { locked: false, demo: null, mode: 'supabase' };
ok(voiceRouteOk(admin, signed) === true, 'a signed-in Live Test account can reach the page');
ok(voiceRouteOk(buyer, { ...signed, locked: true }) === false, 'the public fake link cannot reach voice');
ok(voiceRouteOk(admin, { ...signed, mode: 'mock' }) === false, 'mock mode cannot reach voice');
ok(voiceRouteOk(null, signed) === false, 'a signed-out visitor cannot reach voice');
ok(voiceRouteOk(admin, { ...signed, demo: { active: true } }) === false, 'demo view cannot reach voice');
ok(routeAllowed(buyer, { page: 'voice-demo' }, { locked: true }) === false, 'the route guard blocks the fake link');
ok(routeAllowed(admin, { page: 'voice-demo' }, { locked: false, demo: { active: true } }) === false, 'the route guard blocks demo view');
let bad = '';
try { acceptEphemeralToken('xai-secret-key'); } catch (e) { bad = e.message; }
ok(bad.includes('short-lived'), 'a long-lived key is refused');
const token = 'xai-realtime-client-secret-demoPass1';
let seen = null;
realtimeSocket(token, function WS(url, protocols) { seen = { url, protocols }; });
ok(seen.url === VOICE_URL && !seen.url.includes(token) && seen.protocols[0] === `xai-client-secret.${token}`, 'the pass is a socket protocol, not part of the address');
ok(sessionUpdate().session.instructions === DEMO_INSTRUCTIONS && sessionUpdate().session.tools.length === 0, 'the canned script cannot use tools');
ok(!/getDeal|listContacts|sendEmail|localStorage/.test(DEMO_INSTRUCTIONS), 'the script does not ask the portal for records');
let tries = 0;
const retried = await requestVoice(async () => { tries += 1; return { ok: false, status: 502, message: 'down' }; }, 'mint');
ok(tries === 2 && retried.status === 502, 'a failed reach is tried once more');
let refusals = 0;
await requestVoice(async () => { refusals += 1; return { ok: false, status: 403, message: 'no' }; }, 'mint');
ok(refusals === 1, 'a refusal is not retried');
let sock = null;
let mic = null;
const session = createVoiceSession({
  WebSocket: class { constructor() { sock = this; this.sent = []; this.listeners = {}; queueMicrotask(() => (this.listeners.open || []).forEach((fn) => fn({}))); } addEventListener(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); } send(body) { this.sent.push(body); } close() { this.closed = true; } },
  getUserMedia: async () => { mic = { tracks: [{ stop() { this.stopped = true; } }], getTracks() { return this.tracks; } }; return mic; },
  timeoutMs: 1000,
});
await session.start(token);
ok(sock.sent[0].includes(DEMO_INSTRUCTIONS) && mic, 'the socket opens before the microphone');
session.sendText('Is the closing Tuesday?');
ok(sock.sent.some((s) => s.includes('Is the closing Tuesday?')), 'typed text goes to Grok, not a local answer');
const stopped = session.stop();
ok(stopped.retainedChunks === 0 && stopped.tracksStopped === 1 && mic.tracks[0].stopped === true && sock.closed === true, 'stop releases the microphone and keeps nothing');
const store = { n: 0, setItem() { this.n += 1; } };
stopMic({ stream: null, chunks: ['audio'] });
ok(store.n === 0 && session.state.chunks.length === 0, 'nothing is written to storage');
console.log(fail ? fail + ' failed' : 'voice demo passed');
if (fail) process.exit(1);
