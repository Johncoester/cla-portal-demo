/* Signed-in voice test. The browser asks the TEST function for a short-lived pass.
 * It never holds the xAI key, and it does not read or change a file. */
export const VOICE_NOT_CONFIGURED = 'Grok voice is not configured on the server yet.';
export const VOICE_DENIED = 'Voice is not available on this sign-in.';
export const VOICE_MODEL = 'grok-voice-latest';
export const VOICE_URL = 'wss://api.x.ai/v1/realtime?model=grok-voice-latest';
export const DEMO_INSTRUCTIONS = 'You are the voice test on CLA Portal Live Test. Speak only about this pretend file: 145 Main Street, Rockville, purchase, buyer Ben Buyer, file MD-26-97183. These names are fake. Do not ask for a real account, a password, or a document. You cannot email, upload, change a file, or look anyone up. If asked to do any of that, say this test cannot take actions.';

export function voiceRouteOk(u, { locked = false, demo = null, mode = 'mock' } = {}) {
  return mode === 'supabase' && !!u && !locked && !(demo && demo.active);
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

export function sessionUpdate() {
  return { type: 'session.update', session: { voice: 'eve', instructions: DEMO_INSTRUCTIONS, turn_detection: { type: 'server_vad' }, input_audio_format: 'pcm16', output_audio_format: 'pcm16', tools: [] } };
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
  if (state) { state.stream = null; state.chunks = []; state.socket = null; state.context = null; }
  return { retainedChunks: 0, tracksStopped: tracks.length };
}

/* Retry a failed reach. A refusal, a pause, or a missing key is final. */
export async function requestVoice(ask, action) {
  let last = null;
  for (let i = 0; i < 2; i++) {
    try { last = await ask(action); }
    catch (e) { last = { ok: false, status: 0, message: 'Grok voice could not be reached. Nothing was recorded.' }; }
    if (!last || last.ok || last.status === 401 || last.status === 403 || last.status === 429 || last.status === 503) return last;
  }
  return last;
}

export function createVoiceSession(deps) {
  const state = { stream: null, chunks: [], socket: null, context: null };
  let opened = false;
  return {
    state,
    async start(token) {
      const socket = realtimeSocket(token, deps.WebSocket);
      state.socket = socket;
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Grok voice could not be reached. Nothing was recorded.')), deps.timeoutMs || 8000);
        socket.addEventListener('open', () => { clearTimeout(t); opened = true; socket.send(JSON.stringify(sessionUpdate())); resolve(); });
        socket.addEventListener('error', () => { clearTimeout(t); reject(new Error('Grok voice could not be reached. Nothing was recorded.')); });
      });
      if (deps.onMessage) socket.addEventListener('message', (ev) => deps.onMessage(ev));
      try { state.stream = await deps.getUserMedia({ audio: { channelCount: 1 } }); }
      catch (e) { stopMic(state); opened = false; throw new Error('The microphone was not opened. Nothing was recorded.'); }
      return state;
    },
    sendText(text) {
      if (!state.socket || !opened) throw new Error('Start voice before sending a typed message.');
      for (const msg of textTurn(text)) state.socket.send(JSON.stringify(msg));
    },
    stop() { opened = false; return stopMic(state); },
  };
}
