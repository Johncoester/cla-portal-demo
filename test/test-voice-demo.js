/* Voice is a signed-in Live Test path. The public fake link cannot open it. */
import { routeAllowed } from '../js/data/locked-links.js';
import { acceptEphemeralToken, audioAppend, createVoiceAttempt, createVoiceSession, realtimeSocket, requestVoice, sessionUpdate, stopMic, textTurn, voicePassText, voiceRouteOk, withTimeout, VOICE_SIGN_IN, VOICE_TIMED_OUT, VOICE_URL, DEMO_INSTRUCTIONS } from '../js/data/voice-demo.js';
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
ok(sessionUpdate().session.audio.input.format.type === 'audio/pcm' && sessionUpdate().session.audio.input.format.rate === 24000 && sessionUpdate(44100).session.audio.output.format.rate === 44100, 'the session asks for PCM at a supported rate');
const hung = await withTimeout(new Promise(() => {}), 25);
ok(hung.status === 408 && hung.message === VOICE_TIMED_OUT, 'a pass that never returns becomes a visible timeout');
let timeoutTries = 0;
const once = await requestVoice(async () => { timeoutTries += 1; return hung; }, 'mint');
ok(timeoutTries === 1 && once.status === 408, 'a timed-out pass is not asked for again');
ok(voicePassText({ status: 401, message: 'Sign in is required.' }) === VOICE_SIGN_IN, 'an expired sign-in is not described as if the person had never signed in');
let opened = false;
const messages = [];
const attempt = createVoiceAttempt({
  live: { async start() { opened = true; }, stop() { return { retainedChunks: 0, tracksStopped: 0 }; } },
  show(message, state) { messages.push([state, message]); },
  requestPass: () => withTimeout(new Promise(() => {}), 20),
});
const timed = await attempt.start();
ok(timed.openedMic === false && opened === false && messages.some((m) => m[0] === 'error' && m[1] === VOICE_TIMED_OUT), 'Start shows the timeout and does not open the microphone');
let lateOpen = false;
let passWait;
const late = createVoiceAttempt({
  live: { async start() { lateOpen = true; }, stop() {} },
  show() {},
  requestPass: () => new Promise((resolve) => { passWait = resolve; }),
});
const pending = late.start();
late.stop();
passWait({ ok: true, data: { value: token } });
const cancelled = await pending;
ok(cancelled.cancelled === true && lateOpen === false, 'Stop ignores a pass that arrives afterwards');
let sentAudio = '';
const heard = createVoiceSession({
  WebSocket: class { constructor() { this.listeners = {}; this.readyState = 0; queueMicrotask(() => { this.readyState = 1; (this.listeners.open || []).forEach((fn) => fn({})); }); } addEventListener(n, fn) { (this.listeners[n] || (this.listeners[n] = [])).push(fn); } send(body) { sentAudio = body; } close() {} },
  getUserMedia: async () => ({ getTracks() { return [{ stop() {} }]; } }),
  audioContextFactory: () => ({ sampleRate: 24000, destination: {}, resume() {}, createMediaStreamSource() { return { connect() {} }; }, createGain() { return { gain: { value: 1 }, connect() {} }; }, createScriptProcessor() { const node = { connect() {} }; queueMicrotask(() => node.onaudioprocess && node.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array([0, 0.5]) } })); return node; } }),
  timeoutMs: 1000,
});
await heard.start(token);
await new Promise((r) => setTimeout(r, 20));
ok(sentAudio.includes('input_audio_buffer.append') && heard.state.chunks.length === 0, 'microphone samples are sent and are not kept');
ok(audioAppend(new Float32Array([0])).type === 'input_audio_buffer.append', 'an audio chunk uses the documented append event');
console.log(fail ? fail + ' failed' : 'voice demo passed');
if (fail) process.exit(1);
