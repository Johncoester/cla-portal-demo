/* Public scheduling link for a buyer or seller (#/schedule-party/<token>). No sign-in.
 * The link is queued in the outbox. This page does not send email. */
import { html, raw, $, guard, toast, formData } from '../ui.js?v=202611161500';
import { SCHEDULE_TIMES, scheduleTimeLabel, OTHER_LABEL, RON_LABEL, PLACE_OFFICE, PLACE_OTHER, PLACE_RON } from '../data/scheduling-details.js?v=202611245600';

const shell = (inner) => html`<div class="login-page"><div class="login-card sched-card"><img src="assets/img/login-logo-new.png" alt="C.L.A. Title &amp; Escrow" class="sched-logo">${inner}</div></div>`;

export async function render({ api, params }) {
  let s;
  try { s = await api.getPartySchedule(params.token); }
  catch (e) { return { title: 'Schedule the settlement', body: shell(html`<h2>Link not valid</h2><p>${e.message}</p>`) }; }
  const a = s.answers || {};
  const place = a.placeKind || PLACE_OFFICE;
  const officeId = a.officeId || s.defaultOfficeId || '';
  const seller = s.side === 'seller';
  const inner = html`<div class="eyebrow">${seller ? 'SELLER' : 'BUYER'} &middot; ${s.fileNumber}</div><h2>Schedule the settlement</h2>
    <p><strong>${s.street}, ${s.city}, ${s.state} ${s.zip}</strong></p>
    <form id="party-sched" class="form-grid" novalidate>
      <label data-k="date">Settlement date *<input type="date" name="date" value="${a.date || s.closingDate || ''}" required><span class="ferr"></span></label>
      <label data-k="time">Time *<select name="time" required><option value="">Choose a time…</option>${SCHEDULE_TIMES.map((t) => html`<option value="${t}" ${t === a.time ? raw('selected') : ''}>${scheduleTimeLabel(t)}</option>`)}</select><span class="ferr"></span></label>
      <label class="span2" data-k="placeKind">Where *<select name="placeKind" data-party-place><option value="${PLACE_OFFICE}" ${place === PLACE_OFFICE ? raw('selected') : ''}>CLA office</option><option value="${PLACE_OTHER}" ${place === PLACE_OTHER ? raw('selected') : ''}>${OTHER_LABEL}</option>${seller ? html`<option value="${PLACE_RON}" ${place === PLACE_RON ? raw('selected') : ''}>${RON_LABEL}</option>` : ''}</select><span class="ferr"></span></label>
      <label class="span2" data-k="officeId" data-party-office>CLA office *<select name="officeId">${(s.offices || []).map((o) => html`<option value="${o.id}" ${o.id === officeId ? raw('selected') : ''}>${o.name}</option>`)}</select><span class="muted small">${s.officeHint || ''}</span><span class="ferr"></span></label>
      <div class="span2 form-grid" data-party-other hidden><label data-k="street">Street *<input name="street" maxlength="120" value="${a.street || ''}"><span class="ferr"></span></label><label>City *<input name="city" maxlength="80" value="${a.city || ''}"></label><label>State *<input name="state" maxlength="2" value="${a.state || ''}" placeholder="MD"></label><label>ZIP *<input name="zip" maxlength="10" value="${a.zip || ''}"></label></div>
      <label class="span2" data-k="notes">Notes<textarea name="notes" rows="3" maxlength="1000">${a.notes || ''}</textarea><span class="ferr"></span></label>
      <div class="span2"><button class="m-btn" type="submit">Send my answer</button></div>
    </form>
    <p class="muted small">TEST PORTAL. This answer is saved on the file. Nothing is emailed.</p>`;
  return { title: 'Schedule the settlement', body: shell(inner), mount(root) {
    const f = $('#party-sched', root); if (!f) return;
    const sync = () => {
      const kind = f.placeKind.value;
      const office = root.querySelector('[data-party-office]');
      const other = root.querySelector('[data-party-other]');
      if (office) office.hidden = kind !== PLACE_OFFICE;
      if (other) other.hidden = kind !== PLACE_OTHER;
    };
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      root.querySelectorAll('.ferr').forEach((x) => { x.textContent = ''; });
      const v = formData(f);
      try {
        await api.submitPartySchedule(params.token, { ...v, askParty: false });
        toast('Thank you. CLA Title has your settlement details.');
        f.querySelector('[type=submit]').disabled = true;
      } catch (err) {
        (err.fieldErrors || []).forEach((fe) => { const el = f.querySelector(`[data-k="${fe.k}"]`); if (el) { const fx = el.querySelector('.ferr'); if (fx) fx.textContent = fe.msg; } });
        toast(err.fieldErrors ? err.fieldErrors[0].msg : (err.message || 'Your answer was not saved. It is still in the form. Try again.'), 'err');
      }
    }));
  } };
}
