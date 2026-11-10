import { html } from '../ui.js?v=202611070139';
import { VOICE_GENERIC } from '../data/voice-file.js?v=202611091110';

export async function render() {
  return {
    title: 'Voice test',
    crumbs: [['Voice test']],
    body: html`<section data-voice-demo data-voice-state="closed">
      <div class="box-title"><h2>Voice test</h2></div>
      <p class="notice info" data-voice-note>${VOICE_GENERIC}</p>
      <p class="muted">This page is not a file. Open Voice test from the header while a file is on screen. The microphone does not start on this page.</p>
    </section>`,
  };
}
