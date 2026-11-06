import { html, $ } from '../ui.js?v=202611062120';
import { prepareVoice, stopMic, textTurn, VOICE_NOT_CONFIGURED } from '../data/voice-demo.js?v=202611062120';

const session = { stream: null, chunks: [], socket: null, context: null };

export async function render() {
  return {
    title: 'Voice demo',
    crumbs: [['Voice demo']],
    body: html`<section data-voice-demo data-voice-state="not-configured">
      <div class="box-title"><h2>Voice demo</h2></div>
      <p class="notice info" data-voice-note>This is a fake preview. It does not open contacts, files, or documents, and it cannot send anything.</p>
      <p class="err-text" data-voice-status role="status">${VOICE_NOT_CONFIGURED}</p>
      <div class="voice-controls">
        <button type="button" class="m-btn" data-voice-start>Start</button>
        <button type="button" class="ghost" data-voice-stop>Stop</button>
      </div>
      <p class="muted small">Start asks for a short-lived Grok pass before the microphone opens. Stop releases the microphone. This page does not keep a recording.</p>
      <form data-voice-text class="form-grid">
        <label class="span2">Or type instead<textarea name="text" rows="3" maxlength="500" data-voice-input placeholder="Type a message"></textarea></label>
        <div class="span2"><button type="submit" class="m-btn">Send</button></div>
      </form>
      <p data-voice-reply class="muted">No reply yet. A reply appears only after Grok voice is connected.</p>
    </section>`,
    mount(root) { wire(root); },
  };
}

function show(root, message) {
  const el = $('[data-voice-status]', root);
  if (el) el.textContent = message;
  root.setAttribute('data-voice-state', 'not-configured');
}

function wire(root) {
  const start = $('[data-voice-start]', root);
  const stop = $('[data-voice-stop]', root);
  start.addEventListener('click', async () => {
    const ready = await prepareVoice();
    if (!ready.ok) { show(root, ready.message); return; }
    show(root, VOICE_NOT_CONFIGURED);
  });
  stop.addEventListener('click', () => {
    const done = stopMic(session);
    show(root, done.tracksStopped ? 'Stopped. The microphone is off and nothing was kept.' : VOICE_NOT_CONFIGURED);
  });
  $('[data-voice-text]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('[data-voice-input]', root);
    try { textTurn(input.value); }
    catch (err) { show(root, err.message); return; }
    const ready = await prepareVoice();
    $('[data-voice-reply]', root).textContent = 'No reply yet. A reply appears only after Grok voice is connected.';
    show(root, ready.ok ? VOICE_NOT_CONFIGURED : ready.message);
  });
}
