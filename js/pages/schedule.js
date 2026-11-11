// Public closing-time link (#/schedule/<token>). Works without signing in, like the old portal's scheduler links. Shows only that side's view.
// Each side picks a closing location (default: the closest CLA Title office) and the dates and times that work. The processor sees both answers on the file.
import { html, raw, $, guard, toast, formData } from '../ui.js?v=202611070139';
import { slotText } from './dealclosing.js?v=202611121300';
import { CLOSING_LOCATIONS } from '../data/constants.js?v=202611101015';
import { OFFICE_LOCATION } from '../data/cla-offices.js?v=202611101015';

export async function render({ api, params }) {
  let s; try { s = await api.getSchedulingLink(params.token); } catch (e) { return { title: 'Closing time', body: shell(html`<h2>Link not valid</h2><p>${e.message}</p>`) }; }
  const signedIn = await api.getSession(); const mine = s.response ? s.response.picks : [];
  const offices = Array.isArray(s.offices) ? s.offices : [];
  const chosenOffice = (s.response && s.response.officeId) || s.officeId || s.defaultOfficeId || '';
  const storedLoc = (s.response && s.response.location) || '';
  const chosenLoc = CLOSING_LOCATIONS.includes(storedLoc) ? storedLoc : (CLOSING_LOCATIONS.includes(s.location) ? s.location : (chosenOffice ? OFFICE_LOCATION : ''));
  const where = offices.length ? html`<label>Where will you close? *<select name="location" required data-closing-where>${CLOSING_LOCATIONS.map((l) => html`<option ${l === chosenLoc ? raw('selected') : ''}>${l}</option>`)}</select></label>
    <label data-office-wrap>Which CLA Title office *<select name="officeId" data-closing-office>${offices.map((o) => html`<option value="${o.id}" ${o.id === chosenOffice ? raw('selected') : ''}>${o.name}</option>`)}</select>
      <span class="muted small" data-office-address>${(offices.find((o) => o.id === chosenOffice) || offices[0] || {}).address || ''}</span></label>` : '';
  const inner = html`<div class="eyebrow">${s.side === 'buyer' ? 'BUYER SIDE' : 'SELLER SIDE'} &middot; ${s.fileNumber}</div><h2>Pick your closing time</h2>
    <p><strong>${s.street}, ${s.city}, ${s.state}</strong>${s.location ? html`<br>Offered location: ${s.location}` : ''}</p>${s.note ? html`<p class="muted">${s.note}</p>` : ''}
    ${s.status === 'confirmed' ? html`<p class="ok-box">Closing is confirmed for <strong>${slotText(s.slots[s.confirmedSlot])}</strong>. Thank you!</p>` : html`
    <form id="pick" class="pick-form">${where}<p>Tick every date and time that works for your side:</p>${s.slots.map((sl, i) => html`<label class="check slot" data-slot="${sl}"><input type="checkbox" name="p${i}" ${mine.includes(i) ? raw('checked') : ''}> ${slotText(sl)}</label>`)}
      ${signedIn ? '' : html`<label>Your name *<input name="name" required maxlength="120"></label>`}<label>Note (optional)<textarea name="note" rows="2" maxlength="1000">${s.response ? s.response.note : ''}</textarea></label>
      <button class="m-btn" type="submit">${s.response ? 'Update answer' : 'Send answer'}</button>
      ${s.response ? html`<p class="muted small">Answered by ${s.response.responderName}. You can change it until the processor confirms.</p>` : ''}</form>`}
    <p class="muted small">FAKE DATA DEMO. One answer per side; the processor confirms the final time.</p>`;
  return { title: 'Closing time', body: shell(inner), mount(root) {
    const f = $('#pick', root); if (!f) return;
    const wrap = $('[data-office-wrap]', f); const offSel = $('[data-closing-office]', f);
    if (wrap && offSel) { const sync = () => { const on = f.location.value === OFFICE_LOCATION; wrap.hidden = !on; offSel.required = on; };
      f.location.addEventListener('change', sync); sync();
      offSel.addEventListener('change', () => { const addr = $('[data-office-address]', f); if (addr) addr.textContent = (offices.find((o) => o.id === offSel.value) || {}).address || ''; }); }
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const d = formData(f); const picks = s.slots.map((_, i) => (d['p' + i] ? i : -1)).filter((i) => i >= 0);
      const location = d.location; const officeId = location === OFFICE_LOCATION ? d.officeId : '';
      await api.respondSettlement(params.token, { picks, note: d.note, name: d.name, location, officeId }); toast('Thank you, your answer was sent to the processor.'); globalThis.location.reload(); }));
  } };
}
const shell = (inner) => html`<div class="login-page"><div class="login-card sched-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo">${inner}</div></div>`;
