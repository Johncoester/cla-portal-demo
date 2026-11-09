// The agent's account / profile form (John, Nov 4): used by the invite sign-up page and by Profile Setting (edit later).
// Required: first name, last name, email, cell phone. Optional: date of birth as MONTH + DAY (no year), profile picture (image only, max 5 MB picked,
// cropped in the browser to a 320 x 320 picture shown as a circle or a square), brokerage, license number, office phone, address, other contact info.
import { html, raw, $, $$ } from '../ui.js?v=202611070139';
import { MONTHS, PHOTO_MAX_BYTES, PHOTO_TYPES, initialsOf, cleanMonthDay } from '../data/agent-profile.js?v=202611090935';
const sel = (v, x) => (String(v) === String(x) ? raw(' selected') : '');
export function avatarHtml(p, cls = '') {
  const shape = p.photoShape === 'square' ? 'square' : 'circle';
  return p.photo ? html`<img class="ap-avatar ${shape} ${cls}" src="${p.photo}" alt="Photo of ${p.firstName} ${p.lastName}" data-avatar-img>`
    : html`<span class="ap-avatar initials ${shape} ${cls}" aria-hidden="true" data-avatar-initials>${initialsOf(p.firstName, p.lastName)}</span>`;
}
export function agentFormHtml(p = {}, { emailLocked = false, submitLabel = 'Save' } = {}) {
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  return html`<form class="card ap-form" data-agent-form novalidate>
    <div class="apf-grid">
      <fieldset class="ap-photo-col"><legend>Profile picture <span class="muted small">(optional)</span></legend>
        <div class="ap-photo-now" data-photo-now>${avatarHtml(p, 'xl')}</div>
        <div class="ap-shape" role="radiogroup" aria-label="Picture shape"><label><input type="radio" name="photoShape" value="circle"${p.photoShape !== 'square' ? raw(' checked') : ''}> Circle</label><label><input type="radio" name="photoShape" value="square"${p.photoShape === 'square' ? raw(' checked') : ''}> Square</label></div>
        <label class="ghost ap-file">Choose a picture<input type="file" accept="${PHOTO_TYPES.join(',')}" data-photo-file></label>
        <button type="button" class="linkish" data-photo-remove ${p.photo ? '' : raw('hidden')}>Remove picture</button>
        <p class="field-hint">PNG, JPG, WEBP or GIF, up to 5 MB. Zoom, drag, and pick a circle or a square.</p>
        <div class="ap-crop" data-crop hidden>
          <canvas width="240" height="240" class="ap-crop-canvas ${p.photoShape === 'square' ? 'square' : 'circle'}" data-crop-canvas aria-label="Crop preview: drag to move"></canvas>
          <label class="ap-zoom">Zoom<input type="range" min="1" max="3" step="0.01" value="1" data-crop-zoom></label>
          <div><button type="button" class="m-btn" data-crop-apply>Use this picture</button> <button type="button" class="ghost" data-crop-cancel>Cancel</button></div>
        </div>
        <input type="hidden" name="photo" value="${p.photo || ''}" data-photo-value>
      </fieldset>
      <div class="form-grid ap-fields">
        <h4 class="span2">Your details <span class="muted small">(* required)</span></h4>
        <label>First name *<input name="firstName" required maxlength="80" autocomplete="given-name" value="${p.firstName || ''}"></label>
        <label>Last name *<input name="lastName" required maxlength="80" autocomplete="family-name" value="${p.lastName || ''}"></label>
        <label>Email *<input name="email" type="email" required maxlength="160" autocomplete="email" value="${p.email || ''}"${emailLocked ? raw(' disabled') : ''}>${emailLocked ? html`<span class="field-hint">Your sign-in email. CLA Title can change it for you.</span>` : ''}</label>
        <label>Cell phone *<input name="cellPhone" type="tel" required inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone autocomplete="tel" value="${p.cellPhone || ''}"></label>
        <div class="ap-dob span2" data-dob><span class="ap-dob-label">Date of birth <span class="muted small">(optional: month and day only, no year)</span></span>
          <select name="birthMonth" aria-label="Birth month"><option value="">Month</option>${MONTHS.map((m, i) => html`<option value="${i + 1}"${sel(p.birthMonth, i + 1)}>${m}</option>`)}</select>
          <select name="birthDay" aria-label="Birth day"><option value="">Day</option>${days.map((d) => html`<option value="${d}"${sel(p.birthDay, d)}>${d}</option>`)}</select>
          <span class="field-hint">Seen only by you and CLA Title staff.</span></div>
        <h4 class="span2">Brokerage and office <span class="muted small">(optional)</span></h4>
        <label>Brokerage name<input name="brokerage" maxlength="120" value="${p.brokerage || ''}"></label>
        <label>License number<input name="licenseNumber" maxlength="40" value="${p.licenseNumber || ''}"></label>
        <label>Office phone<input name="officePhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone value="${p.officePhone || ''}"></label>
        <label>Other contact info<input name="otherContact" maxlength="200" placeholder="Website, fax, assistant..." value="${p.otherContact || ''}"></label>
        <label class="span2">Office street address<input name="street" maxlength="120" autocomplete="street-address" value="${p.street || ''}"></label>
        <label>City<input name="city" maxlength="60" value="${p.city || ''}"></label>
        <div class="ap-row2"><label>State<input name="state" maxlength="2" value="${p.state || ''}"></label><label>ZIP<input name="zip" maxlength="10" inputmode="numeric" value="${p.zip || ''}"></label></div>
        <p class="err-text span2" data-form-err role="alert" hidden></p>
        <div class="span2"><button class="m-btn" type="submit" data-agent-submit>${submitLabel}</button></div>
      </div>
    </div></form>`;
}
// wires the picture picker / cropper; values() returns the fields (throws a readable error for a missing required field or a bad month / day)
export function mountAgentForm(root) {
  const f = $('[data-agent-form]', root); const file = $('[data-photo-file]', f); const crop = $('[data-crop]', f); const cv = $('[data-crop-canvas]', f); const zoom = $('[data-crop-zoom]', f);
  const val = $('[data-photo-value]', f); const now = $('[data-photo-now]', f); const rm = $('[data-photo-remove]', f); const err = $('[data-form-err]', f);
  let img = null; let ox = 0; let oy = 0; let drag = null; let z = 1;
  const shape = () => (($('[name=photoShape]:checked', f) || {}).value === 'square' ? 'square' : 'circle');
  const showErr = (m) => { err.textContent = m || ''; err.hidden = !m; };
  const scale = () => Math.max(cv.width / img.width, cv.height / img.height) * z;
  const draw = () => { if (!img) return; const c = cv.getContext('2d'); const W = cv.width; const s = scale(); const w = img.width * s; const h = img.height * s;
    ox = Math.min(0, Math.max(W - w, ox)); oy = Math.min(0, Math.max(W - h, oy)); c.fillStyle = '#fff'; c.fillRect(0, 0, W, W); c.drawImage(img, ox, oy, w, h); };
  file.addEventListener('change', () => { const x = file.files && file.files[0]; showErr(''); if (!x) return;
    if (!PHOTO_TYPES.includes(x.type)) { file.value = ''; showErr('Profile picture must be an image (PNG, JPG, WEBP or GIF).'); return; }
    if (x.size > PHOTO_MAX_BYTES) { file.value = ''; showErr('Profile picture is too large (max 5 MB).'); return; }
    const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { img = im; z = 1; zoom.value = '1'; const s = scale(); ox = (cv.width - im.width * s) / 2; oy = (cv.height - im.height * s) / 2; draw(); crop.hidden = false; };
      im.onerror = () => showErr('That file could not be read as a picture.'); im.src = r.result; }; r.readAsDataURL(x); });
  zoom.addEventListener('input', () => { if (!img) return; const W = cv.width / 2; const k = Number(zoom.value) / z; ox = W - (W - ox) * k; oy = W - (W - oy) * k; z = Number(zoom.value); draw(); });
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ } });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; const k = cv.width / cv.getBoundingClientRect().width; ox = drag.ox + (e.clientX - drag.x) * k; oy = drag.oy + (e.clientY - drag.y) * k; draw(); });
  cv.addEventListener('pointerup', () => { drag = null; });
  const setShape = (el) => { if (!el) return; el.classList.toggle('square', shape() === 'square'); el.classList.toggle('circle', shape() === 'circle'); };
  $$('[name=photoShape]', f).forEach((r) => r.addEventListener('change', () => { setShape(cv); setShape($('.ap-avatar', now)); }));
  $('[data-crop-cancel]', f).addEventListener('click', () => { crop.hidden = true; file.value = ''; img = null; });
  $('[data-crop-apply]', f).addEventListener('click', () => { if (!img) return; const out = document.createElement('canvas'); out.width = 320; out.height = 320; const k = 320 / cv.width; const c = out.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 320, 320); const s = scale() * k; c.drawImage(img, ox * k, oy * k, img.width * s, img.height * s);
    const url = out.toDataURL('image/jpeg', 0.86); val.value = url; now.innerHTML = ''; const im = document.createElement('img'); im.className = `ap-avatar ${shape()} xl`; im.src = url; im.alt = 'Your profile picture'; im.dataset.avatarImg = '';
    now.appendChild(im); crop.hidden = true; rm.hidden = false; file.value = ''; });
  rm.addEventListener('click', () => { val.value = ''; const sp = document.createElement('span'); sp.className = `ap-avatar initials ${shape()} xl`; sp.dataset.avatarInitials = '';
    sp.textContent = initialsOf($('[name=firstName]', f).value, $('[name=lastName]', f).value); now.innerHTML = ''; now.appendChild(sp); rm.hidden = true; });
  return { form: f, showErr, values() { const o = Object.fromEntries(new FormData(f).entries()); o.photoShape = shape(); o.photo = val.value || null;
    for (const [k, label] of [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['cellPhone', 'Cell phone']]) if (k in o && !String(o[k] || '').trim()) throw new Error(label + ' is required.');
    cleanMonthDay(o.birthMonth, o.birthDay); return o; } };
}
