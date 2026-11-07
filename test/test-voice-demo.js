/* Voice is a signed-in Live Test path. The public fake link cannot open it. */
import { readFileSync } from 'node:fs';
import { routeAllowed } from '../js/data/locked-links.js';
import { acceptEphemeralToken, audioAppend, createVoiceAttempt, createVoiceSession, isSpokenAudioEvent, pcm16Base64ToFloat32, realtimeSocket, requestVoice, sessionUpdate, stopMic, textTurn, voicePassText, voiceRouteOk, withTimeout, VOICE_SIGN_IN, VOICE_TIMED_OUT, VOICE_URL, DEMO_INSTRUCTIONS } from '../js/data/voice-demo.js';
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
let micCalls = 0;
const resumeHang = createVoiceSession({
  WebSocket: class { constructor() { throw new Error('socket should not open'); } },
  getUserMedia: async () => { micCalls += 1; return { getTracks() { return []; } }; },
  audioContextFactory: () => ({ sampleRate: 24000, state: 'suspended', destination: {}, resume: () => new Promise(() => {}), close() {} }),
  audioWaitMs: 30,
  timeoutMs: 50,
});
let resumeMsg = '';
try { await resumeHang.start(token); } catch (e) { resumeMsg = e.message; }
ok(/did not start audio/.test(resumeMsg) && micCalls === 0, 'a pass that returns still cannot wait forever on audio, and the microphone stays closed');
let socketOpened = false;
let micAfterStop = 0;
let lateStream = null;
const midMic = createVoiceSession({
  WebSocket: class { constructor() { socketOpened = true; this.listeners = {}; this.readyState = 1; queueMicrotask(() => (this.listeners.open || []).forEach((fn) => fn({}))); } addEventListener(n, fn) { (this.listeners[n] || (this.listeners[n] = [])).push(fn); } send() {} close() { (this.listeners.close || []).forEach((fn) => fn({})); } },
  getUserMedia: () => new Promise((resolve) => { lateStream = resolve; }),
  audioContextFactory: () => ({ sampleRate: 24000, state: 'running', destination: {}, resume: () => Promise.resolve(), close() {}, createMediaStreamSource() { return { connect() {} }; }, createGain() { return { gain: { value: 1 }, connect() {} }; }, createScriptProcessor() { return { connect() {}, disconnect() {} }; } }),
  audioWaitMs: 50,
  micWaitMs: 40,
  timeoutMs: 50,
});
const mid = midMic.start(token);
await new Promise((r) => setTimeout(r, 15));
midMic.stop();
lateStream({ getTracks() { return [{ stop() { micAfterStop += 1; } }]; } });
await mid;
ok(socketOpened === true && micAfterStop === 1, 'Stop during a late microphone answer releases that microphone');
const pcm = (bytes) => btoa(String.fromCharCode.apply(null, bytes));
const half = pcm16Base64ToFloat32(pcm([0x00, 0x40]));
const neg = pcm16Base64ToFloat32(pcm([0x00, 0x80]));
ok(half && half.length === 1 && Math.abs(half[0] - 0.5) < 0.0001, 'a spoken PCM chunk is little-endian 16-bit audio');
ok(neg && neg.length === 1 && neg[0] === -1, 'a negative PCM sample stays negative');
ok(pcm16Base64ToFloat32('not base64') == null, 'a broken audio chunk is refused');
ok(isSpokenAudioEvent({ type: 'response.output_audio.delta' }) && isSpokenAudioEvent({ type: 'response.audio.delta' }) && !isSpokenAudioEvent({ type: 'response.output_audio_transcript.delta' }), 'only the spoken audio events are played');
let voiceSock = null;
const played = [];
const shown = [];
const audioErrors = [];
let contexts = 0;
const speaker = createVoiceSession({
  WebSocket: class { constructor() { voiceSock = this; this.listeners = {}; this.readyState = 1; queueMicrotask(() => (this.listeners.open || []).forEach((fn) => fn({}))); } addEventListener(n, fn) { (this.listeners[n] || (this.listeners[n] = [])).push(fn); } send() {} close() { this.closed = true; } },
  getUserMedia: async () => ({ getTracks() { return [{ stop() {} }]; } }),
  audioContextFactory() { contexts += 1; return { sampleRate: 24000, state: 'running', destination: { name: 'speakers' }, currentTime: 0, resume() { this.resumed = true; return Promise.resolve(); }, close() { this.state = 'closed'; }, createMediaStreamSource() { return { connect() {}, disconnect() {} }; }, createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }, createScriptProcessor() { return { connect() {}, disconnect() {} }; }, createBuffer(ch, len, rate) { return { channels: ch, length: len, sampleRate: rate, duration: len / rate, copyToChannel(data) { this.data = data; } }; }, createBufferSource() { const src = { connect(dest) { src.dest = dest; }, start(t) { src.at = t; played.push(src); }, stop() { src.stopped = true; } }; return src; } }; },
  onMessage(ev) { shown.push(JSON.parse(ev.data).type); },
  onAudioError(message) { audioErrors.push(message); },
  timeoutMs: 1000,
});
await speaker.start(token);
const say = (event) => (voiceSock.listeners.message || []).forEach((fn) => fn({ data: JSON.stringify(event) }));
say({ type: 'response.output_audio_transcript.delta', delta: 'The closing is Tuesday.' });
say({ type: 'response.output_audio.delta', delta: pcm([0x00, 0x40]) });
say({ type: 'response.audio.delta', delta: pcm([0x00, 0x40, 0x00, 0x40]) });
ok(contexts === 1 && shown.includes('response.output_audio_transcript.delta') && played.length === 2, 'the transcript stays text and both audio event names are scheduled on the Start context');
ok(played[0].dest.name === 'speakers' && played[0].buffer.sampleRate === 24000 && Math.abs(played[0].buffer.data[0] - 0.5) < 0.0001 && played[0].at === 0, 'the first spoken chunk plays at the configured rate');
ok(played[1].at === played[0].buffer.duration && played[1].at > 0, 'the next chunk waits so the words do not play on top of each other');
say({ type: 'input_audio_buffer.speech_started' });
ok(played[0].stopped === true && played[1].stopped === true, 'a new spoken turn stops audio that was already queued');
say({ type: 'response.output_audio.delta', delta: '@@@' });
say({ type: 'response.output_audio.delta', delta: '@@@' });
ok(audioErrors.length === 1 && played.length === 2, 'one bad chunk is reported once and is not played');
const stoppedSpeaker = speaker.stop();
ok(stoppedSpeaker.retainedChunks === 0 && voiceSock.closed === true && speaker.state.context == null, 'Stop still drops the microphone and does not keep the audio');
const pageSrc = readFileSync(new URL('../js/pages/voice-demo.js', import.meta.url), 'utf8');
ok(pageSrc.includes("/transcript/i.test(event.type || '')") && pageSrc.includes('onAudioError') && !pageSrc.includes('speechSynthesis'), 'the page still shows transcript text and does not speak with the browser voice');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const htmlSrc = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
ok(htmlSrc.includes('js/app.js?v=202611071715') && appSrc.includes("voice-demo.js?v=202611071632") && appSrc.includes("pages/voice-demo.js?v=202611071632") && pageSrc.includes("voice-demo.js?v=202611071632"), 'the shell and both voice imports use the new playback stamp');
console.log(fail ? fail + ' failed' : 'voice demo passed');
if (fail) process.exit(1);
