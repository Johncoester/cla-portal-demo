/* Grok voice for the fake locked demo only.
 * The browser never holds an xAI API key. A short-lived pass would come from a server
 * John controls. Until that server exists, this stays "not configured" and does not speak. */
export const VOICE_NOT_CONFIGURED = 'Grok voice is not configured. A server has to hand this page a short-lived pass. The microphone stays off, and nothing is saved.';
export const VOICE_MODEL = 'grok-voice-latest';
export const VOICE_URL = 'wss://api.x.ai/v1/realtime?model=grok-voice-latest';
export const DEMO_INSTRUCTIONS = 'You are the voice demo on CLA Title\'s fake test portal. Speak only about this pretend file: 145 Main Street, Rockville, purchase, buyer Ben Buyer, file MD-26-97183. These names are fake. Do not ask for a real account, a password, or a document. You cannot email, upload, change a file, or look anyone up. If asked to do any of that, say this demo cannot take actions.';

export function voiceConfigured(w = globalThis) {
  const c = (w && w.CLA_PORTAL_CONFIG) || {};
  return c.voiceToken === true;
}

/* Official ephemeral values look like xai-realtime-client-secret-... A long-lived API key is refused. */
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
  const WS = WebSocketImpl;
  if (!WS) throw new Error(VOICE_NOT_CONFIGURED);
  return new WS(VOICE_URL, [`xai-client-secret.${secret}`]);
}

export function sessionUpdate() {
  return { type: 'session.update', session: { voice: 'eve', instructions: DEMO_INSTRUCTIONS, turn_detection: { type: 'server_vad' }, tools: [] } };
}

export function textTurn(text) {
  const t = String(text == null ? '' : text).trim().slice(0, 500);
  if (!t) throw new Error('Type a message first.');
  return [
    { type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: t }] } },
    { type: 'response.create' },
  ];
}

/* Stop drops the microphone, the socket, and any audio chunks. Nothing is written to storage. */
export function stopMic(state) {
  const tracks = state && state.stream && state.stream.getTracks ? state.stream.getTracks() : [];
  tracks.forEach((t) => { try { t.stop(); } catch (e) { /* already stopped */ } });
  if (state && state.context && state.context.close) { try { state.context.close(); } catch (e) { /* already closed */ } }
  if (state && state.socket && state.socket.close) { try { state.socket.close(); } catch (e) { /* already closed */ } }
  if (state) { state.stream = null; state.chunks = []; state.socket = null; state.context = null; }
  return { retainedChunks: 0, tracksStopped: tracks.length };
}

export async function prepareVoice(env = {}) {
  if (!voiceConfigured(env.window || globalThis)) return { ok: false, message: VOICE_NOT_CONFIGURED };
  const ask = env.fetch;
  if (!ask) return { ok: false, message: VOICE_NOT_CONFIGURED };
  let res;
  try { res = await ask('/api/voice-token', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  catch (e) { return { ok: false, message: 'Grok voice could not be reached. Nothing was recorded.' }; }
  if (!res || !res.ok) return { ok: false, message: 'Grok voice could not be reached. Nothing was recorded.' };
  let body = {};
  try { body = await res.json(); } catch (e) { return { ok: false, message: 'Grok voice could not be reached. Nothing was recorded.' }; }
  try { return { ok: true, token: acceptEphemeralToken(body.value) }; }
  catch (e) { return { ok: false, message: e.message }; }
}
