import { html, $ } from '../ui.js?v=202611062210';
import { createVoiceSession, requestVoice, stopMic, VOICE_NOT_CONFIGURED } from '../data/voice-demo.js?v=202611062210';

const live = createVoiceSession({
  WebSocket: typeof WebSocket !== 'undefined' ? WebSocket : null,
  getUserMedia: (opts) => navigator.mediaDevices.getUserMedia(opts),
  timeoutMs: 8000,
  onMessage(ev) {
    const reply = document.querySelector('[data-voice-reply]');
    if (!reply) return;
    let event = null;
    try { event = JSON.parse(ev.data); } catch (e) { return; }
    const bit = event && (event.delta || event.transcript);
    if (typeof bit === 'string' && /transcript/i.test(event.type || '')) reply.textContent = (reply.textContent === 'No reply yet. A reply appears only after Grok voice is connected.' ? '' : reply.textContent) + bit;
  },
});

export async function render({ api } = {}) {
  const closed = !api || api.mode !== 'supabase' || !api.requestVoicePass;
  return {
    title: 'Voice test',
    crumbs: [['Voice test']],
    body: html`<section data-voice-demo data-voice-state="${closed ? 'closed' : 'ready'}">
      <div class="box-title"><h2>Voice test</h2></div>
      <p class="notice info" data-voice-note>This talks about a pretend file only. It does not open contacts, files, or documents, and it cannot send anything.</p>
      <p class="${closed ? 'err-text' : 'muted'}" data-voice-status role="status">${closed ? 'Voice is not available on this sign-in.' : 'Press Start to connect. The microphone stays off until Grok accepts the pass.'}</p>
      <div class="voice-controls">
        <button type="button" class="m-btn" data-voice-start ${closed ? 'disabled' : ''}>Start</button>
        <button type="button" class="ghost" data-voice-stop>Stop</button>
      </div>
      <p class="muted small">Stop releases the microphone. This page does not keep a recording or a transcript.</p>
      <form data-voice-text class="form-grid">
        <label class="span2">Or type instead<textarea name="text" rows="3" maxlength="500" data-voice-input placeholder="Type a message" ${closed ? 'disabled' : ''}></textarea></label>
        <div class="span2"><button type="submit" class="m-btn" ${closed ? 'disabled' : ''}>Send</button></div>
      </form>
      <p data-voice-reply class="muted">No reply yet. A reply appears only after Grok voice is connected.</p>
    </section>`,
    mount(root) { if (!closed) wire(root, api); },
  };
}

function show(root, message, state) {
  const el = $('[data-voice-status]', root);
  if (el) { el.textContent = message; el.className = state === 'live' ? 'muted' : 'err-text'; }
  root.setAttribute('data-voice-state', state);
}

async function pass(api, action) {
  return requestVoice((next) => api.requestVoicePass(next), action);
}

function wire(root, api) {
  const stop = () => { live.stop(); show(root, 'Stopped. The microphone is off and nothing was kept.', 'ready'); };
  $('[data-voice-start]', root).addEventListener('click', async () => {
    show(root, 'Connecting…', 'ready');
    const ready = await pass(api, 'mint');
    if (!ready || !ready.ok || !ready.data || !ready.data.value) { live.stop(); show(root, (ready && ready.message) || VOICE_NOT_CONFIGURED, 'ready'); return; }
    try {
      await live.start(ready.data.value);
      show(root, 'Connected. Speak, or type below. Stop ends the microphone.', 'live');
    } catch (e) { live.stop(); show(root, e.message || 'Grok voice could not be reached. Nothing was recorded.', 'ready'); }
  });
  $('[data-voice-stop]', root).addEventListener('click', stop);
  $('[data-voice-text]', root).addEventListener('submit', (e) => {
    e.preventDefault();
    try { live.sendText($('[data-voice-input]', root).value); }
    catch (err) { show(root, err.message, root.getAttribute('data-voice-state') === 'live' ? 'live' : 'ready'); }
  });
  window.addEventListener('pagehide', () => { stopMic(live.state); });
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/voice-demo')) stopMic(live.state); });
}
