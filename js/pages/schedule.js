// Public closing-time link (#/schedule/<token>). Works without signing in, like the old portal's scheduler links. Shows only that side's view.
import { html, raw, $, $$, guard, toast, formData } from '../ui.js';
import { slotText } from './dealclosing.js';

export async function render({ api, params }) {
  let s; try { s = await api.getSchedulingLink(params.token); } catch (e) { return { title: 'Closing time', body: shell(html`<h2>Link not valid</h2><p>${e.message}</p>`) }; }
  const signedIn = await api.getSession(); const mine = s.response ? s.response.picks : [];
  const inner = html`<div class="eyebrow">${s.side === 'buyer' ? 'BUYER SIDE' : 'SELLER SIDE'} &middot; ${s.fileNumber}</div><h2>Pick your closing time</h2>
    <p><strong>${s.street}, ${s.city}, ${s.state}</strong>${s.location ? html`<br>Where: ${s.location}` : ''}</p>${s.note ? html`<p class="muted">${s.note}</p>` : ''}
    ${s.status === 'confirmed' ? html`<p class="ok-box">Closing is confirmed for <strong>${slotText(s.slots[s.confirmedSlot])}</strong>. Thank you!</p>` : html`
    <form id="pick" class="pick-form"><p>Tick every time that works for your side:</p>${s.slots.map((sl, i) => html`<label class="check slot"><input type="checkbox" name="p${i}" ${mine.includes(i) ? raw('checked') : ''}> ${slotText(sl)}</label>`)}
      ${signedIn ? '' : html`<label>Your name *<input name="name" required maxlength="120"></label>`}<label>Note (optional)<textarea name="note" rows="2" maxlength="1000">${s.response ? s.response.note : ''}</textarea></label>
      <button class="m-btn" type="submit">${s.response ? 'Update answer' : 'Send answer'}</button>
      ${s.response ? html`<p class="muted small">Answered by ${s.response.responderName}. You can change it until the processor confirms.</p>` : ''}</form>`}
    <p class="muted small">FAKE DATA DEMO. One answer per side; the processor confirms the final time.</p>`;
  return { title: 'Closing time', body: shell(inner), mount(root) {
    const f = $('#pick', root); if (!f) return;
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const d = formData(f); const picks = s.slots.map((_, i) => (d['p' + i] ? i : -1)).filter((i) => i >= 0);
      await api.respondSettlement(params.token, { picks, note: d.note, name: d.name }); toast('Thank you, your answer was sent to the processor.'); location.reload(); }));
  } };
}
const shell = (inner) => html`<div class="login-page"><div class="login-card sched-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo">${inner}</div></div>`;
