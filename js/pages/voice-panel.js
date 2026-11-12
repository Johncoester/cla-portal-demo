/* Voice test panel in the header (its own control, separate from the Bots menu). Start is a separate click;
 * Hide, Stop, another file, another person/role, sign-out and page hide all release the microphone. */
import { html, $ } from '../ui.js?v=202611161500';
import { EMPTY_REPLY, appendTranscript, voiceFileFacts, voiceInstructions, voiceOpenPlan, voiceShellPlan } from '../data/voice-file.js?v=202611091110';
import { createVoiceAttempt, createVoiceSession, requestVoice, withTimeout, VOICE_PASS_MS } from '../data/voice-demo.js?v=202611102100';

const shell = { userId: '', dealId: '', open: false, transcript: '' };
let live = null;
let attempt = null;
let currentFacts = voiceFileFacts(null);
let apiRef = null;

export function prepareVoiceShell(next) {
  const plan = voiceShellPlan(shell, next || {});
  if (plan.stop) stopVoiceNow();
  if (plan.clearTranscript) shell.transcript = '';
  shell.open = plan.keepOpen;
  shell.userId = (next && next.userId) || '';
  shell.dealId = (next && next.dealId) || '';
  return plan;
}

export function stopVoiceNow() {
  if (attempt) attempt.stop();
  shell.open = false;
  shell.transcript = '';
}

export function voiceMenuHtml(deal) {
  const facts = voiceFileFacts(deal);
  return html`<div class="ws-wrap voice-wrap" data-voice-wrap data-bot-slot="voice-test"><button type="button" class="ws-btn" data-voice-btn aria-haspopup="dialog" aria-expanded="false" aria-controls="voice-panel"><span class="ws-k">Voice test</span> <strong data-voice-current>Closed</strong> &#9662;</button>
    <div class="ws-dd voice-panel" id="voice-panel" data-voice-panel hidden role="dialog" aria-label="Voice test">${panelBody(facts)}</div></div>`;
}

function panelBody(facts) {
  const note = facts.connected
    ? `Read-only test for ${facts.fileLabel}. Answers can use only the order header already on this screen. Documents, prices, loans, wires, and contacts are not sent.`
    : 'Not connected to a file. This test will not invent a file number, an address, or a price.';
  return html`<p class="notice info" data-voice-note>${note}</p>
    <p class="muted" data-voice-status role="status">Press Start to connect. The microphone stays off until Grok accepts the pass.</p>
    <div class="voice-controls"><button type="button" class="m-btn" data-voice-start>Start</button> <button type="button" class="ghost" data-voice-stop>Stop</button> <button type="button" class="ghost" data-voice-hide>Hide</button></div>
    <p class="muted small">Stop releases the microphone. Hide closes this panel and releases it too. The transcript stays here until you hide the panel, leave this file, or sign out. It is not saved.</p>
    <form data-voice-text class="form-grid"><label class="span2">Or type instead<textarea name="text" rows="3" maxlength="500" data-voice-input placeholder="Type a message"></textarea></label><div class="span2"><button type="submit" class="m-btn">Send</button></div></form>
    <p data-voice-reply class="voice-reply" role="log" aria-live="polite">${EMPTY_REPLY}</p>`;
}

function show(message, state) {
  const root = document.querySelector('[data-voice-panel]');
  const el = root && $('[data-voice-status]', root);
  if (el) { el.textContent = message; el.className = state === 'error' ? 'err-text' : 'muted'; }
  if (root) root.setAttribute('data-voice-state', state);
}

function paint(wrap) {
  const panel = $('[data-voice-panel]', wrap);
  const btn = $('[data-voice-btn]', wrap);
  if (!panel || !btn) return;
  panel.hidden = !shell.open;
  btn.setAttribute('aria-expanded', shell.open ? 'true' : 'false');
  const current = $('[data-voice-current]', wrap);
  if (current) current.textContent = shell.open ? (currentFacts.connected ? currentFacts.fileLabel : 'Not connected') : 'Closed';
  const reply = $('[data-voice-reply]', panel);
  if (reply) reply.textContent = shell.transcript || EMPTY_REPLY;
  if (shell.open && live && live.canSend && live.canSend()) show('Connected. The microphone is on. A spoken reply plays here when Grok sends audio. Stop turns the microphone off.', 'live');
}

function ensure(api) {
  apiRef = api || apiRef;
  if (live) return;
  live = createVoiceSession({
    WebSocket: typeof WebSocket !== 'undefined' ? WebSocket : null,
    getUserMedia: (opts) => navigator.mediaDevices.getUserMedia(opts),
    audioContextFactory: () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('This browser cannot play voice audio.');
      try { return new Ctx({ sampleRate: 24000 }); } catch (e) { return new Ctx(); }
    },
    instructionsFor: () => voiceInstructions(currentFacts),
    timeoutMs: 8000,
    onAudioError(message) { show(message, 'error'); },
    onMessage(ev) {
      let event = null;
      try { event = JSON.parse(ev.data); } catch (e) { return; }
      const next = appendTranscript(shell.transcript, event);
      if (next === shell.transcript) return;
      shell.transcript = next;
      document.querySelectorAll('[data-voice-reply]').forEach((el) => { el.textContent = next; });
    },
  });
  attempt = createVoiceAttempt({
    live,
    show,
    requestPass: () => withTimeout(requestVoice((action) => apiRef.requestVoicePass(action), 'mint'), VOICE_PASS_MS),
  });
}

export function mountVoiceChrome(root, { api, deal, enabled } = {}) {
  currentFacts = voiceFileFacts(deal);
  const wrap = root && root.querySelector('[data-voice-wrap]');
  if (!enabled || !wrap || !api || !api.requestVoicePass) {
    if (!enabled) stopVoiceNow();
    return;
  }
  ensure(api);
  paint(wrap);
  const btn = $('[data-voice-btn]', wrap);
  const panel = $('[data-voice-panel]', wrap);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const plan = voiceOpenPlan(shell.open);
    if (plan.stop) { stopVoiceNow(); paint(wrap); return; }
    shell.open = plan.open;
    paint(wrap);
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  $('[data-voice-hide]', panel).addEventListener('click', () => { stopVoiceNow(); paint(wrap); });
  $('[data-voice-stop]', panel).addEventListener('click', () => { attempt.stop(); show('Stopped. The microphone is off. The transcript is still on this panel until you hide it or leave the file.', 'ready'); });
  $('[data-voice-start]', panel).addEventListener('click', () => attempt.start());
  $('[data-voice-text]', panel).addEventListener('submit', (e) => {
    e.preventDefault();
    try { live.sendText($('[data-voice-input]', panel).value); }
    catch (err) { show(err.message, panel.getAttribute('data-voice-state') === 'live' ? 'live' : 'ready'); }
  });
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => stopVoiceNow());
