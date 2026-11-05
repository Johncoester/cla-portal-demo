// OFFICES (John, Nov 4: "In the admin section create a way for us to add offices so we can add them in that show in the scheduling section").
// Admin / Super admin page in the Admin / Settings workspace (next to Users, Teams and Modules): add, edit, reorder, retire or reactivate a CLA Title
// office and pick the counties it serves. The closing "Which CLA Title office" picker lists the ACTIVE offices in this order and defaults to the
// office that serves the property's county, else the state's main office. Offices are never deleted: Retire hides one from new closings only.
import { html, raw, $, $$, guard, toast, modal, closeModal, fmtDateTime } from '../ui.js?v=202611051216';
import { canManageOffices, cleanOffice, countiesFor, OFFICE_STATES, SAMPLE_IDS } from '../data/offices.js?v=202611051216';
const STATE_NAMES = { MD: 'Maryland', VA: 'Virginia', DC: 'District of Columbia', FL: 'Florida' };

export async function render({ api, user, refresh }) {
  if (!canManageOffices(user)) throw new Error('Only an Admin or Super admin can see the Offices page.');
  const { offices } = await api.listOffices({ includeRetired: true });
  const active = offices.filter((o) => o.active); const retired = offices.filter((o) => !o.active);
  const anySample = offices.some((o) => SAMPLE_IDS.includes(o.id) && o.active);
  const row = (o, i, list) => html`<tr data-office-row="${o.id}" data-office-active="${o.active ? 'yes' : 'no'}" class="${o.active ? '' : 'off-retired'}">
    <td class="nowrap">${o.active ? html`<button type="button" class="ghost small" data-office-up="${o.id}" aria-label="Move ${o.name} up" ${i === 0 ? raw('disabled') : ''}>&uarr;</button>
      <button type="button" class="ghost small" data-office-down="${o.id}" aria-label="Move ${o.name} down" ${i === list.length - 1 ? raw('disabled') : ''}>&darr;</button>` : ''}</td>
    <td><strong data-office-name>${o.name}</strong>${o.isMainOfficeForState && o.active ? html` <span class="off-chip" data-office-main>Main office for ${o.state}</span>` : ''}
      ${o.active ? '' : html` <span class="off-chip off-chip-retired" data-office-retired-tag>Retired</span>`}</td>
    <td data-office-address>${o.address}</td>
    <td class="nowrap">${o.phone || html`<span class="muted">none</span>`}${o.email ? html`<br><span class="small">${o.email}</span>` : ''}</td>
    <td data-office-counties>${o.counties.length ? html`<span class="small">${o.countyText}</span>` : html`<span class="muted small">No counties yet</span>`}</td>
    <td class="small muted">${fmtDateTime(o.updatedAt)}<br>${o.updatedByName}</td>
    <td class="nowrap"><button type="button" class="m-btn small" data-office-edit="${o.id}">Edit</button>
      ${o.active ? html`<button type="button" class="ghost small" data-office-retire="${o.id}">Retire</button>` : html`<button type="button" class="ghost small" data-office-reactivate="${o.id}">Reactivate</button>`}</td></tr>`;
  const head = html`<thead><tr><th>Order</th><th>Office</th><th>Address</th><th>Phone / email</th><th>Counties served</th><th>Last change</th><th></th></tr></thead>`;
  const body = html`<section class="offices-page" data-offices-page>
    <div class="page-head"><div><p class="eyebrow">Admin</p><h2 class="page-title">Offices</h2>
      <p class="muted off-intro">The CLA Title offices people can pick when they propose or schedule a closing "at a CLA Title office". The picker lists the active offices in the order below,
      and starts on the office that serves the property's county, or else the state's main office. Retire an office to stop new closings there: closings that already use it keep showing it.
      Nothing is deleted. Only Admins and Super admins see this page.</p></div>
      <button class="m-btn" type="button" data-office-add>+ Add office</button></div>
    ${anySample ? html`<div class="notice info" data-office-sample-note><strong>Sample data.</strong> The offices marked "(sample)" are made-up placeholders, not real CLA Title addresses.
      Replace them with the real offices (edit them, or add the real ones and retire the samples).</div>` : ''}
    <div class="card off-card"><h3>Active offices <span class="muted small">(${active.length})</span></h3>
      ${active.length ? html`<table class="tbl off-tbl" data-office-table>${head}<tbody>${active.map(row)}</tbody></table>` : html`<p class="muted">No active offices. Add one, or reactivate a retired one: until then the closing picker has no office to offer.</p>`}</div>
    <div class="card off-card"><h3>Retired offices <span class="muted small">(${retired.length})</span></h3>
      ${retired.length ? html`<table class="tbl off-tbl" data-office-retired-table>${head}<tbody>${retired.map(row)}</tbody></table>` : html`<p class="muted small">None. A retired office can be reactivated at any time.</p>`}</div></section>`;
  return { title: 'Offices', crumbs: [['Offices']], body, mount(root) {
    $('[data-office-add]', root).addEventListener('click', () => officeForm(null));
    $$('[data-office-edit]', root).forEach((b) => b.addEventListener('click', () => officeForm(offices.find((o) => o.id === b.dataset.officeEdit))));
    $$('[data-office-retire]', root).forEach((b) => b.addEventListener('click', guard(async () => { const o = offices.find((z) => z.id === b.dataset.officeRetire);
      if (!confirm(`Retire ${o.name}? It will no longer be offered for new closings. Closings that already use it keep showing it. You can reactivate it later.`)) return;
      await api.setOfficeActive(o.id, false); toast(`${o.name} retired`); refresh(); })));
    $$('[data-office-reactivate]', root).forEach((b) => b.addEventListener('click', guard(async () => { const r = await api.setOfficeActive(b.dataset.officeReactivate, true);
      toast(r.note || `${r.name} is active again`); refresh(); })));
    const move = (id, dir) => guard(async () => { const ids = active.map((o) => o.id); const i = ids.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; await api.reorderOffices([...ids, ...retired.map((o) => o.id)]); toast('Order saved'); refresh(); });
    $$('[data-office-up]', root).forEach((b) => b.addEventListener('click', move(b.dataset.officeUp, -1)));
    $$('[data-office-down]', root).forEach((b) => b.addEventListener('click', move(b.dataset.officeDown, 1)));
  } };

  function officeForm(o) {
    const v = o || { name: '', addressLine1: '', addressLine2: '', city: '', state: '', zip: '', phone: '', email: '', isMainOfficeForState: false, counties: [] };
    const m = modal(o ? `Edit office: ${o.name}` : 'Add an office', html`<form id="of" class="form-grid off-form" novalidate data-office-form>
      <label class="span2">Office name *<input name="name" maxlength="120" required value="${v.name}" placeholder="e.g. CLA Title - Rockville, MD office"><span class="field-err" data-err="name"></span></label>
      <label class="span2">Address line 1 *<input name="addressLine1" maxlength="120" required value="${v.addressLine1}" autocomplete="address-line1"><span class="field-err" data-err="addressLine1"></span></label>
      <label class="span2">Address line 2 <span class="muted small">(optional: suite, floor)</span><input name="addressLine2" maxlength="120" value="${v.addressLine2}" autocomplete="address-line2"></label>
      <label>City *<input name="city" maxlength="80" required value="${v.city}" autocomplete="address-level2"><span class="field-err" data-err="city"></span></label>
      <label>State *<select name="state" required data-office-state><option value="">Choose&hellip;</option>${OFFICE_STATES.map((s) => html`<option value="${s}" ${s === v.state ? raw('selected') : ''}>${s} - ${STATE_NAMES[s]}</option>`)}</select><span class="field-err" data-err="state"></span></label>
      <label>ZIP code *<input name="zip" maxlength="10" required inputmode="numeric" value="${v.zip}" placeholder="20850" autocomplete="postal-code"><span class="field-err" data-err="zip"></span></label>
      <label>Main phone<input name="phone" type="tel" data-phone maxlength="12" value="${v.phone}" placeholder="xxx-xxx-xxxx"><span class="field-err" data-err="phone"></span></label>
      <label class="span2">Email <span class="muted small">(optional)</span><input name="email" type="email" maxlength="200" value="${v.email}"><span class="field-err" data-err="email"></span></label>
      <label class="span2 off-check"><input type="checkbox" name="isMainOfficeForState" ${v.isMainOfficeForState ? raw('checked') : ''} data-office-main-box> Main office for this state
        <span class="muted small">(used when no office serves the property's county; one per state, so ticking it here moves it from the current main office)</span></label>
      <fieldset class="span2 off-counties" data-office-counties-box><legend>Counties served</legend>
        <p class="muted small" data-county-hint>Pick the state first.</p>
        <div class="off-county-tools" hidden><input type="search" data-county-filter placeholder="Filter counties" aria-label="Filter counties"> <button type="button" class="ghost small" data-county-clear>Clear all</button> <span class="small muted" data-county-count></span></div>
        <div class="off-county-list" data-county-list></div></fieldset>
      <p class="span2 err-text" data-office-errors hidden></p>
      <div class="span2"><button class="m-btn" type="submit" data-office-save>${o ? 'Save changes' : 'Add office'}</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    const f = $('#of', m); const list = $('[data-county-list]', f); let picked = new Set((v.counties || []).map((c) => c.county));
    const drawCounties = () => { const st = f.state.value; const all = countiesFor(st); const tools = $('.off-county-tools', f);
      $('[data-county-hint]', f).textContent = st ? `Tick each county (or independent city) in ${STATE_NAMES[st]} this office serves. A county can belong to one active office only.` : 'Pick the state first.';
      tools.hidden = !st; picked = new Set([...picked].filter((c) => all.includes(c)));
      list.innerHTML = all.map((c, i) => `<label class="off-county"><input type="checkbox" value="${c.replace(/"/g, '&quot;')}" data-county="${c.replace(/"/g, '&quot;')}" ${picked.has(c) ? 'checked' : ''} id="cty-${i}"> ${c.replace(/</g, '&lt;')}</label>`).join('');
      $$('[data-county]', list).forEach((b) => b.addEventListener('change', () => { if (b.checked) picked.add(b.value); else picked.delete(b.value); count(); }));
      filter(); count(); };
    const count = () => { $('[data-county-count]', f).textContent = `${picked.size} picked`; };
    const filter = () => { const q = ($('[data-county-filter]', f).value || '').toLowerCase(); $$('.off-county', list).forEach((l) => { l.hidden = q && !l.textContent.toLowerCase().includes(q); }); };
    f.state.addEventListener('change', drawCounties); $('[data-county-filter]', f).addEventListener('input', filter);
    $('[data-county-clear]', f).addEventListener('click', () => { picked.clear(); drawCounties(); }); drawCounties();
    const read = () => ({ name: f.name.value, addressLine1: f.addressLine1.value, addressLine2: f.addressLine2.value, city: f.city.value, state: f.state.value, zip: f.zip.value,
      phone: f.phone.value, email: f.email.value, isMainOfficeForState: f.isMainOfficeForState.checked, counties: [...picked].map((county) => ({ state: f.state.value, county })) });
    // the same rules as the adapter, shown next to each field before saving
    const FIELD = [[/Office name/, 'name'], [/Address line 1/, 'addressLine1'], [/City/, 'city'], [/state/i, 'state'], [/ZIP/, 'zip'], [/phone/i, 'phone'], [/Email/, 'email']];
    const showErrs = (errs) => { $$('[data-err]', f).forEach((e) => { e.textContent = ''; }); $$('.is-invalid', f).forEach((e) => e.classList.remove('is-invalid')); const rest = [];
      errs.forEach((msg) => { const hit = /count(y|ies)|served by/i.test(msg) ? null : FIELD.find(([re]) => re.test(msg)); const slot = hit && $(`[data-err="${hit[1]}"]`, f);
        if (slot && !slot.textContent) { slot.textContent = msg; const el = f.elements[hit[1]]; if (el) el.classList.add('is-invalid'); } else rest.push(msg); });
      const box = $('[data-office-errors]', f); box.hidden = !rest.length; box.textContent = rest.join(' '); };
    // a field's message goes away as soon as it is edited
    ['name', 'addressLine1', 'city', 'state', 'zip', 'phone', 'email'].forEach((k) => { const el = f.elements[k]; const clear = () => { const slot = $(`[data-err="${k}"]`, f); if (slot) slot.textContent = ''; el.classList.remove('is-invalid'); };
      el.addEventListener('input', clear); el.addEventListener('change', clear); });
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const input = read();
      try { cleanOffice(input); } catch (err) { showErrs(err.errors || [err.message]); return; } showErrs([]);
      let r; try { r = o ? await api.updateOffice(o.id, input) : await api.createOffice(input); } catch (err) { showErrs([err.message]); return; }
      closeModal(); toast(`${r.name} ${o ? 'saved' : 'added'}${r.mainMovedFrom && r.mainMovedFrom.length ? ` (now the ${r.state} main office instead of ${r.mainMovedFrom.join(', ')})` : ''}`); refresh(); }));
  }
}
