import { html, $ } from '../ui.js?v=202611070139';
import { createVoiceAttempt, createVoiceSession, requestVoice, withTimeout, VOICE_PASS_MS } from '../data/voice-demo.js?v=202611071632';

const live = createVoiceSession({
  WebSocket: typeof WebSocket !== 'undefined' ? WebSocket : null,
  getUserMedia: (opts) => navigator.mediaDevices.getUserMedia(opts),
  audioContextFactory: () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This browser cannot play voice audio.');
    try { return new Ctx({ sampleRate: 24000 }); } catch (e) { return new Ctx(); }
  },
  timeoutMs: 8000,
  onAudioError(message) {
    const status = document.querySelector('[data-voice-status]');
    if (status) { status.textContent = message; status.className = 'err-text'; }
  },
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
  if (el) { el.textContent = message; el.className = state === 'error' ? 'err-text' : 'muted'; }
  root.setAttribute('data-voice-state', state);
}

let detachVoice = null;
function wire(root, api) {
  if (detachVoice) detachVoice();
  const attempt = createVoiceAttempt({
    live,
    show: (message, state) => show(root, message, state),
    requestPass: () => withTimeout(requestVoice((next) => api.requestVoicePass(next), 'mint'), VOICE_PASS_MS),
  });
  const start = $('[data-voice-start]', root);
  if (!start) { show(root, 'Start could not be wired. Reload this page.', 'error'); return; }
  start.addEventListener('click', () => attempt.start());
  $('[data-voice-stop]', root).addEventListener('click', () => { attempt.stop(); show(root, 'Stopped. The microphone is off and nothing was kept.', 'ready'); });
  $('[data-voice-text]', root).addEventListener('submit', (e) => {
    e.preventDefault();
    try { live.sendText($('[data-voice-input]', root).value); }
    catch (err) { show(root, err.message, root.getAttribute('data-voice-state') === 'live' ? 'live' : 'ready'); }
  });
  const onHide = () => attempt.stop();
  const onHash = () => { if (!location.hash.startsWith('#/voice-demo')) attempt.stop(); };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('hashchange', onHash);
  detachVoice = () => { window.removeEventListener('pagehide', onHide); window.removeEventListener('hashchange', onHash); };
}
