/* Signed-in voice test. The browser asks the TEST function for a short-lived pass.
 * It never holds the xAI key. File text is only the order header already on screen,
 * passed in by instructionsFor. This module does not read the database. */
import { VOICE_GENERIC } from './voice-file.js?v=202611091110';
export const VOICE_NOT_CONFIGURED = 'Grok voice is not configured on the server yet.';
export const VOICE_DENIED = 'Voice is not available on this sign-in.';
export const VOICE_PASS_MS = 12000;
export const VOICE_AUDIO_MS = 4000;
export const VOICE_MIC_MS = 10000;
export const VOICE_TIMED_OUT = 'Voice did not answer in time. Nothing was recorded. The microphone was not opened.';
export const VOICE_AUDIO_TIMED_OUT = 'This browser did not start audio in time. The microphone was not opened.';
export const VOICE_SIGN_IN = 'This sign-in expired before voice could start. Sign in again, then press Start. The microphone was not opened.';
export const VOICE_NOT_CONNECTED = 'Start voice before sending a typed message.';
export const VOICE_DROPPED = 'Voice disconnected before the message was sent. Press Start to connect again.';
const PCM_RATES = new Set([8000, 16000, 22050, 24000, 32000, 44100, 48000]);
export const VOICE_MODEL = 'grok-voice-latest';
export const VOICE_URL = 'wss://api.x.ai/v1/realtime?model=grok-voice-latest';
export const DEMO_INSTRUCTIONS = VOICE_GENERIC;

export function voiceRouteOk(u, { locked = false, demo = null, mode = 'mock' } = {}) {
  return mode === 'supabase' && !!u && !locked && !(demo && demo.active);
}

/* The function allows two accounts and answers every other sign-in with 403.
 * That 403 is a failed resource in the browser. Only a Super admin is asked,
 * which is the role those two accounts use. Every other role skips the call. */
export function canRequestVoice(u) {
  return !!(u && u.role === 'Super admin' && u.isAdmin && !u.accountRole && (u.status || 'active') === 'active');
}

export function acceptEphemeralToken(value) {
  const s = String(value == null ? '' : value).trim();
  if (!/^xai-realtime-client-secret-[A-Za-z0-9_-]{8,}$/.test(s) || s.length > 400) {
    throw new Error('The voice pass was not a short-lived Grok pass.');
  }
  return s;
}

export function realtimeSocket(token, WebSocketImpl) {
  const secret = acceptEphemeralToken(token);
  if (VOICE_URL.includes(secret)) throw new Error('The voice pass must not be in the address.');
  if (!WebSocketImpl) throw new Error(VOICE_NOT_CONFIGURED);
  return new WebSocketImpl(VOICE_URL, [`xai-client-secret.${secret}`]);
}

export function sessionUpdate(sampleRate = 24000, instructions = DEMO_INSTRUCTIONS) {
  const rate = PCM_RATES.has(sampleRate) ? sampleRate : 24000;
  const script = typeof instructions === 'string' && instructions.trim() ? instructions : DEMO_INSTRUCTIONS;
  return { type: 'session.update', session: { voice: 'eve', instructions: script, turn_detection: { type: 'server_vad' }, audio: { input: { format: { type: 'audio/pcm', rate } }, output: { format: { type: 'audio/pcm', rate } } }, tools: [] } };
}

export function float32ToBase64Pcm16(samples) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function audioAppend(samples) {
  return { type: 'input_audio_buffer.append', audio: float32ToBase64Pcm16(samples) };
}

/* Grok speaks as base64 PCM16 little-endian on these two event names. The transcript events are text only. */
export function isSpokenAudioEvent(event) {
  const type = event && event.type;
  return type === 'response.output_audio.delta' || type === 'response.audio.delta';
}

export function pcm16Base64ToFloat32(b64) {
  if (typeof b64 !== 'string' || !b64) return new Float32Array(0);
  let bin = '';
  try { bin = atob(b64); } catch (e) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 255;
  const n = Math.floor(bytes.length / 2);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function stopPlayback(state) {
  (state && state.playing || []).forEach((src) => { try { if (src.stop) src.stop(); } catch (e) { /* already ended */ } });
  if (state) { state.playing = []; state.nextPlay = 0; }
}

function queueSpokenPcm(state, samples) {
  const ctx = state && state.context;
  const rate = state && state.outputRate || 24000;
  if (!ctx || ctx.state === 'closed' || !samples || !samples.length || !ctx.createBuffer || !ctx.createBufferSource) return false;
  try {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    const buffer = ctx.createBuffer(1, samples.length, rate);
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
    const startAt = Math.max(now, state.nextPlay || 0);
    src.start(startAt);
    const dur = typeof buffer.duration === 'number' ? buffer.duration : samples.length / rate;
    state.nextPlay = startAt + dur;
    (state.playing || (state.playing = [])).push(src);
    return true;
  } catch (e) { return false; }
}

function noteAudioFailure(state, deps) {
  if (!state || state.audioErrorSent) return;
  state.audioErrorSent = true;
  if (deps && deps.onAudioError) deps.onAudioError('This browser could not play the spoken reply. The typed reply is still shown. Stop turns the microphone off.');
}

function playSocketMessage(state, deps, ev) {
  let event = null;
  try { event = JSON.parse(ev && ev.data); } catch (e) { return; }
  if (!event) return;
  if (event.type === 'input_audio_buffer.speech_started') { stopPlayback(state); return; }
  if (!isSpokenAudioEvent(event)) return;
  const samples = pcm16Base64ToFloat32(event.delta);
  if (samples == null || (samples.length && !queueSpokenPcm(state, samples))) noteAudioFailure(state, deps);
}

export function voicePassText(result) {
  if (!result) return VOICE_NOT_CONFIGURED;
  if (result.status === 401) return VOICE_SIGN_IN;
  if (result.status === 408) return result.message || VOICE_TIMED_OUT;
  return result.message || VOICE_NOT_CONFIGURED;
}

/* One budget for the whole pass, including a retry. A late answer is ignored. */
export function withTimeout(promise, ms = VOICE_PASS_MS) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, status: 408, message: VOICE_TIMED_OUT }); } }, ms);
    Promise.resolve(promise).then(
      (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } },
      () => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, status: 0, message: 'Grok voice could not be reached. Nothing was recorded.' }); } },
    );
  });
}

export function rejectAfter(promise, ms, message) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error(message)); } }, ms);
    Promise.resolve(promise).then(
      (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } },
      (error) => { if (!done) { done = true; clearTimeout(timer); reject(error); } },
    );
  });
}

export function textTurn(text) {
  const t = String(text == null ? '' : text).trim().slice(0, 500);
  if (!t) throw new Error('Type a message first.');
  return [
    { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: t }] } },
    { type: 'response.create' },
  ];
}

export function stopMic(state) {
  const tracks = state && state.stream && state.stream.getTracks ? state.stream.getTracks() : [];
  tracks.forEach((t) => { try { t.stop(); } catch (e) { /* already stopped */ } });
  if (state && state.context && state.context.close) { try { state.context.close(); } catch (e) { /* already closed */ } }
  if (state && state.socket && state.socket.close) { try { state.socket.close(); } catch (e) { /* already closed */ } }
  ['processor', 'source', 'mute'].forEach((k) => { const n = state && state[k]; if (n && n.disconnect) { try { n.disconnect(); } catch (e) { /* already disconnected */ } } });
  stopPlayback(state);
  if (state) { state.stream = null; state.chunks = []; state.socket = null; state.context = null; state.processor = null; state.source = null; state.mute = null; state.outputRate = 0; }
  return { retainedChunks: 0, tracksStopped: tracks.length };
}

/* Retry a failed reach. A refusal, a pause, or a missing key is final. */
export async function requestVoice(ask, action) {
  let last = null;
  for (let i = 0; i < 2; i++) {
    try { last = await ask(action); }
    catch (e) { last = { ok: false, status: 0, message: 'Grok voice could not be reached. Nothing was recorded.' }; }
    if (!last || last.ok || last.status === 401 || last.status === 403 || last.status === 408 || last.status === 429 || last.status === 503) return last;
  }
  return last;
}

function wireMic(state, socket) {
  const ctx = state.context;
  if (!ctx || !ctx.createMediaStreamSource || !ctx.createScriptProcessor) return;
  const source = ctx.createMediaStreamSource(state.stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain ? ctx.createGain() : null;
  if (mute && mute.gain) mute.gain.value = 0;
  proc.onaudioprocess = (ev) => {
    if (!socket || socket.readyState !== 1 || !ev.inputBuffer) return;
    const copy = new Float32Array(ev.inputBuffer.getChannelData(0));
    socket.send(JSON.stringify(audioAppend(copy)));
  };
  source.connect(proc);
  if (mute) { proc.connect(mute); mute.connect(ctx.destination); }
  state.source = source; state.processor = proc; state.mute = mute;
}

function socketIsOpen(socket) {
  return !!socket && (typeof socket.readyState !== 'number' || socket.readyState === 1);
}

export function createVoiceSession(deps) {
  const state = { stream: null, chunks: [], socket: null, context: null, source: null, processor: null, mute: null, abandoned: false, resumePromise: null, ended: false, epoch: 0 };
  let opened = false;
  const audioWait = deps.audioWaitMs || VOICE_AUDIO_MS;
  const micWait = deps.micWaitMs || VOICE_MIC_MS;
  const leave = () => state.abandoned;
  const current = (epoch) => epoch === state.epoch && !state.abandoned;
  return {
    state,
    /* A new Start click. Clears a previous Stop so this click can open audio during the gesture. */
    begin() {
      state.abandoned = false;
      state.epoch += 1;
      opened = false;
      state.ended = false;
      if (state.stream && state.stream.getTracks) state.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* already stopped */ } });
      state.stream = null;
      if (state.socket && state.socket.close) { try { state.socket.close(); } catch (e) { /* already closed */ } }
      state.socket = null;
      if (state.context && state.context.state === 'closed') state.context = null;
      this.primeAudio();
    },
    primeAudio() {
      if (state.abandoned || !deps.audioContextFactory) return;
      if (state.context && state.context.state !== 'closed') return;
      state.context = deps.audioContextFactory();
      const resume = state.context && state.context.resume ? state.context.resume() : Promise.resolve();
      state.resumePromise = Promise.resolve(resume).catch(() => {});
    },
    canSend() { return opened && !!state.stream && socketIsOpen(state.socket) && !state.ended && !state.abandoned; },
    async start(token) {
      acceptEphemeralToken(token);
      const epoch = state.epoch;
      const stale = () => !current(epoch);
      const dropOwn = (socket, stream) => {
        if (stream && stream.getTracks) stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* already stopped */ } });
        if (state.stream === stream) state.stream = null;
        if (socket && socket.close) { try { socket.close(); } catch (e) { /* already closed */ } }
        if (state.socket === socket) state.socket = null;
        opened = false;
      };
      if (stale()) return state;
      this.primeAudio();
      if (state.resumePromise) {
        await rejectAfter(state.resumePromise, audioWait, VOICE_AUDIO_TIMED_OUT);
        if (stale()) return state;
        if (state.context && state.context.state === 'closed') throw new Error(VOICE_AUDIO_TIMED_OUT);
      }
      const rate = state.context && PCM_RATES.has(state.context.sampleRate) ? state.context.sampleRate : 24000;
      state.outputRate = rate;
      const socket = realtimeSocket(token, deps.WebSocket);
      state.socket = socket;
      state.ended = false;
      socket.addEventListener('message', (ev) => { if (deps.onMessage) deps.onMessage(ev); playSocketMessage(state, deps, ev); });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Grok voice could not be reached. Nothing was recorded.')), deps.timeoutMs || 8000);
        const fail = () => { clearTimeout(t); reject(new Error('Grok voice could not be reached. Nothing was recorded.')); };
        socket.addEventListener('open', () => { clearTimeout(t); if (stale()) { resolve(); return; } opened = true; const script = typeof deps.instructionsFor === 'function' ? deps.instructionsFor() : DEMO_INSTRUCTIONS; socket.send(JSON.stringify(sessionUpdate(rate, script))); resolve(); });
        socket.addEventListener('error', fail);
        socket.addEventListener('close', () => { if (state.socket === socket) state.ended = true; if (!opened) fail(); });
      });
      if (stale() || !opened) { dropOwn(socket, null); if (stale()) return state; throw new Error('Grok voice could not be reached. Nothing was recorded.'); }
      let stream = null;
      try { stream = await rejectAfter(deps.getUserMedia({ audio: { channelCount: 1 } }), micWait, 'The microphone was not opened. Nothing was recorded.'); }
      catch (e) {
        dropOwn(socket, null);
        if (stale()) return state;
        throw new Error('The microphone was not opened. Nothing was recorded.');
      }
      if (stale()) { dropOwn(socket, stream); return state; }
      state.stream = stream;
      wireMic(state, socket);
      if (!this.canSend()) { dropOwn(socket, stream); throw new Error('Grok voice could not be reached. Nothing was recorded.'); }
      return state;
    },
    sendText(text) {
      if (!state.socket || !opened) throw new Error(VOICE_NOT_CONNECTED);
      if (state.ended || !socketIsOpen(state.socket)) throw new Error(VOICE_DROPPED);
      for (const msg of textTurn(text)) state.socket.send(JSON.stringify(msg));
    },
    stop() { state.abandoned = true; state.epoch += 1; opened = false; return stopMic(state); },
  };
}

/* Stop bumps the attempt so a pass that arrives later cannot open the microphone. */
export function createVoiceAttempt({ live, show, requestPass }) {
  let generation = 0;
  return {
    stop() { generation += 1; return live.stop(); },
    async start() {
      const mine = ++generation;
      if (live.begin) live.begin(); else if (live.primeAudio) live.primeAudio();
      show('Connecting…', 'wait');
      const ready = await requestPass();
      if (mine !== generation) return { openedMic: false, cancelled: true };
      if (!ready || !ready.ok || !ready.data || typeof ready.data.value !== 'string') {
        live.stop();
        show(voicePassText(ready), 'error');
        return { openedMic: false, cancelled: false };
      }
      try {
        await live.start(ready.data.value);
        if (mine !== generation) return { openedMic: false, cancelled: true };
        if (!live.canSend || !live.canSend()) {
          live.stop();
          show('Voice is not connected. Press Start to connect again. Nothing was kept.', 'error');
          return { openedMic: false, cancelled: false };
        }
        show('Connected. The microphone is on. A spoken reply plays in this browser when Grok sends audio. Stop turns the microphone off.', 'live');
        return { openedMic: true, cancelled: false };
      } catch (e) {
        if (mine !== generation) return { openedMic: false, cancelled: true };
        live.stop();
        show(e.message || 'Grok voice could not be reached. Nothing was recorded.', 'error');
        return { openedMic: false, cancelled: false };
      }
    },
  };
}
