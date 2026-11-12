// Closing Date tab: the processor sends time options; each side answers through its own link; the processor confirms; a request can be reopened.
// Links are shown here to copy. Nothing is emailed from this build.
import { html, raw, $, $$, guard, formData, modal, closeModal, toast, fmtDate, fmtDateTime, pill } from '../ui.js?v=202611161500';
import { runsOrders, viewOnly, isProcessor, isClient, sideOf, isViewOnly, CLOSING_LOCATIONS } from '../data/constants.js?v=202611101015';
import { placeText, OFFICE_LOCATION } from '../data/cla-offices.js?v=202611101015';
import { SIGNING_METHODS, COUNTRIES, stateName, sideWord, canManageClosingLocations, canScheduleClosing } from '../data/closing-location.js?v=202611101015';
import { officeOptionLabel, MANUAL_OFFICE, sideFromDeal, cleanSideSigning, sidePatch, scheduledPlace, cleanManualAddress, composeAddress, PLACE_KINDS, SIGN_STATUSES, TYPED_ADDRESS } from '../data/closing-side.js?v=202611120500';
import { US_STATE_NAMES } from '../data/constants.js?v=202611101015';
// John, Nov 4: "Will you be in <state> at the time of closing?" (Yes / No -> another US state or a country outside the US). One block per party.
export function locFields(r, pre = '') { const st = stateName(r.propertyState) || "the property's state"; const no = r.inStateAtClosing === false; const abroad = no && !!r.closingLocationCountry;
  return html`<fieldset class="loc-q span2" data-loc-fields="${r.participantId}" data-pre="${pre}"><legend>${r.mine ? '' : html`${sideWord(r.partyRole)} ${r.name}: `}Will you be in ${st} at the time of closing?</legend>
    <label class="inline"><input type="radio" name="${pre}inState" value="yes" ${r.inStateAtClosing === true ? raw('checked') : ''}> Yes</label>
    <label class="inline"><input type="radio" name="${pre}inState" value="no" ${no ? raw('checked') : ''}> No</label>
    <div data-loc-no ${no ? '' : raw('hidden')}><p class="small">Where will you be?</p>
      <label class="inline"><input type="radio" name="${pre}where" value="state" ${no && !abroad ? raw('checked') : ''}> In another US state</label>
      <label class="inline"><input type="radio" name="${pre}where" value="country" ${abroad ? raw('checked') : ''}> Outside the US</label>
      <label data-loc-state ${no && !abroad ? '' : raw('hidden')}>State<select name="${pre}state"><option value="">Choose a state&hellip;</option>${US_STATE_NAMES.filter(([c]) => c !== r.propertyState).map(([c, n]) => html`<option value="${c}" ${r.closingLocationState === c ? raw('selected') : ''}>${n}</option>`)}</select></label>
      <label data-loc-country ${abroad ? '' : raw('hidden')}>Country<select name="${pre}country"><option value="">Choose a country&hellip;</option>${COUNTRIES.map(([c, n]) => html`<option value="${c}" ${r.closingLocationCountry === c ? raw('selected') : ''}>${n}</option>`)}</select></label></div></fieldset>`; }
export function wireLocFields(root) { $$('[data-loc-fields]', root).forEach((fs) => { const pre = fs.dataset.pre || '';
  const sync = () => { const v = (n) => (fs.querySelector(`input[name="${pre}${n}"]:checked`) || {}).value; const no = v('inState') === 'no'; const w = v('where');
    $('[data-loc-no]', fs).hidden = !no; $('[data-loc-state]', fs).hidden = !(no && w === 'state'); $('[data-loc-country]', fs).hidden = !(no && w === 'country'); };
  fs.addEventListener('change', sync); sync(); }); }
export const locValue = (f, pre = '') => ({ inState: f[pre + 'inState'], where: f[pre + 'where'], state: f[pre + 'state'], country: f[pre + 'country'] });

export const slotText = (s) => new Date(s).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const STATUS = { open: ['waiting for answers', 'info'], confirmed: ['confirmed', 'ok'] };

export async function render({ api, user, deal, refresh }) {
  const list = await api.listSettlements(deal.id); const proc = runsOrders(user); const anyOpen = list.some((s) => s.status === 'open');
  const officeBook = await api.getClosingOfficeDefault(deal.id).catch(() => ({ offices: [] }));
  // Matt, Oct 31: agents / clients PROPOSE a closing time + where; the processor or coordinator CONFIRMS it; everyone on the file sees the scheduled closing.
  const proposals = await api.listClosingProposals(deal.id); const manager = proc || user.role === 'Transaction Coordinator' || canScheduleClosing(user); /* John, Nov 4: TCs and the agents on the file may schedule too */ const staffView = !user.accountRole && user.role !== 'Outside user';
  const canPropose = !staffView && !!sideOf(user.role) && !viewOnly(user); const sc = deal.scheduledClosing;
  const sideName = (sd) => (sd === 'buyer' ? 'Buyer side' : 'Seller side');
  const locs = await api.listClosingLocations(deal.id).catch(() => []); const editLoc = staffView && canManageClosingLocations(user);
  const flags = locs.filter((r) => r.flag);
  const flagBox = staffView && flags.length ? html`<div class="notice warn" data-location-flags>${flags.map((r) => html`<div data-location-flag="${r.participantId}"><strong>${r.flag.text}</strong> &middot; signing method: ${r.signingLabel}</div>`)}</div>` : '';
  const whereCard = !locs.length ? '' : staffView ? html`<div class="card" id="where-at-closing"><h3>Where each buyer / seller will be at closing</h3>
      <table class="tbl"><thead><tr><th>Party</th><th>Where at closing</th><th>Answered</th><th>Signing method <span class="muted small">(CLA only)</span></th><th></th></tr></thead><tbody>
      ${locs.map((r) => html`<tr data-loc-row="${r.participantId}" class="${r.flag ? 'flagged' : ''}"><td><strong>${r.name}</strong><br><span class="muted small">${sideWord(r.partyRole)}</span></td><td data-loc-where>${r.whereText}${r.flag ? html` ${pill(r.flag.level === 'abroad' ? 'outside the US' : 'out of state', 'warn')}` : ''}</td>
        <td class="small">${r.answeredAt ? fmtDateTime(r.answeredAt) : html`<span class="muted">&ndash;</span>`}</td>
        <td>${editLoc ? html`<select data-signing="${r.participantId}" aria-label="Signing method for ${r.name}">${SIGNING_METHODS.map(([c, l]) => html`<option value="${c}" ${r.signingMethod === c ? raw('selected') : ''}>${l}</option>`)}</select>` : r.signingLabel}</td>
        <td>${editLoc ? html`<button class="ghost" data-edit-loc="${r.participantId}">Edit answer</button>` : ''}</td></tr>`)}</tbody></table></div>`
    : html`<div class="card" id="where-at-closing"><h3>${locs.some((r) => r.mine) ? 'Where will you be at closing?' : 'Where will your clients be at closing?'}</h3>
      ${locs.filter((r) => r.canAnswer).map((r) => html`<form class="form-grid" data-loc-form="${r.participantId}">${locFields(r)}<div class="span2"><button class="m-btn" type="submit">${r.mine ? 'Save my answer' : html`Save for ${r.name}`}</button>${r.answeredAt ? html` <span class="muted small">Saved ${fmtDateTime(r.answeredAt)}</span>` : ''}</div></form>`)}
      ${locs.filter((r) => !r.canAnswer).map((r) => html`<p data-loc-read="${r.participantId}"><strong>${r.name}</strong> (${sideWord(r.partyRole)}): ${r.whereText}</p>`)}
      <p class="muted small">If ${locs.some((r) => r.mine) ? 'you' : 'your client'} will be outside the US or in another state, CLA Title arranges a remote online (RON), embassy or out-of-state signing. Only CLA Title and your own side see this.</p></div>`;
  const typedPlace = scheduledPlace(sc, deal);
  const scheduled = html`<div class="card" id="scheduled"><h3>Scheduled closing</h3>${sc ? html`<p><strong>${slotText(sc.at)}</strong> &middot; <span data-scheduled-place>${typedPlace || placeText(sc.location, sc.officeId, sc.officeName)}</span>${sc.officeRetired ? html` <span class="muted small" data-office-retired>(this office is retired)</span>` : ''}${sc.note ? html` &middot; ${sc.note}` : ''}</p><p class="muted small" data-scheduled-by>${sc.confirmedByRole === 'Buyer Agent' || sc.confirmedByRole === 'Listing Agent' ? `Scheduled by the ${sc.confirmedByRole}` : 'Confirmed by CLA Title'} ${fmtDateTime(sc.confirmedAt)}</p>`
      : html`<p class="muted">Not scheduled yet.${canPropose ? ' Propose a date, time and place below; CLA Title confirms it.' : ''}</p>`}
    ${manager ? html`<p><button class="ghost" id="confirmnew">${sc ? 'Change the scheduled closing' : 'Schedule the closing'}</button></p>` : ''}</div>`;
  const propTable = proposals.length || canPropose ? html`<div class="card" id="proposals"><div class="deal-card-head"><h3>Proposed closing times</h3>${canPropose ? html`<button class="m-btn" id="propose">+ Propose a closing time</button>` : ''}</div>
    ${proposals.length ? html`<table class="tbl"><thead><tr><th>When</th><th>Where</th>${staffView ? html`<th>Side</th>` : ''}<th>Proposed by</th><th>Note</th><th></th></tr></thead><tbody>${proposals.map((p) => html`<tr data-proposal="${p.id}"><td><strong>${slotText(p.at)}</strong></td><td data-proposal-place>${placeText(p.location, p.officeId, p.officeName)}${p.officeRetired ? html` <span class="muted small" data-office-retired>(retired office)</span>` : ''}</td>${staffView ? html`<td>${sideName(p.side)}</td>` : ''}<td>${p.proposedByName}<br><span class="muted small">${p.roleLabel}</span></td><td>${p.note}</td>
      <td>${p.status === 'confirmed' ? pill('confirmed', 'ok') : manager ? html`<button class="m-btn" data-accept="${p.id}">Confirm this</button>` : pill('waiting for CLA', 'info')}</td></tr>`)}</tbody></table>` : html`<p class="muted">No proposals yet.</p>`}
    ${!staffView ? html`<p class="muted small">Only CLA Title and your own side see your proposals.</p>` : ''}</div>` : '';
  const linkUrl = (tok) => `${globalThis.location.origin}${globalThis.location.pathname}#/schedule/${tok}`;
  const officeName = (id) => (id && (officeBook.offices || []).find((o) => o.id === id) || {}).name || '';
  const block = (s) => {
    const r = (side) => s.responses.find((x) => x.side === side);
    const tick = (side, i) => { const x = r(side); return x ? (x.picks.includes(i) ? html`<span class="ok-text">&#10003; works</span>` : html`<span class="muted">&ndash;</span>`) : html`<span class="muted">no answer yet</span>`; };
    const showSides = isClient(user.role) ? [s.mySide] : ['buyer', 'seller'];   // clients see only their own side's answers
    const choice = (side) => { const x = r(side); const label = side === 'buyer' ? 'Buyer' : 'Seller'; if (!x) return html`<p data-side-choice="${side}"><strong>${label} side:</strong> no answer yet.</p>`;
      const place = placeText(x.location, x.officeId, x.officeName || officeName(x.officeId)) || x.location;
      const times = (x.picks || []).map((i) => s.slots[i]).filter(Boolean);
      return html`<div data-side-choice="${side}"><strong>${label} side</strong> <span class="muted small">(${x.responderName || 'answered'})</span>
        <div data-choice-place>Location: ${place || 'No location selected'}</div>
        <div data-choice-times>Date and time: ${times.length ? times.map((sl) => html`<span data-choice-slot="${sl}">${slotText(sl)}</span>`).reduce((a, b) => html`${a}; ${b}`) : html`<span class="muted">none selected</span>`}</div></div>`; };
    return html`<div class="card"><div class="deal-card-head"><h3>Closing date request</h3>${pill(STATUS[s.status][0], STATUS[s.status][1])}<span class="muted small">round ${s.round} &middot; sent by ${s.createdByName} ${fmtDateTime(s.createdAt)}</span></div>
      ${s.location || s.officeId ? html`<p><strong>Where:</strong> <span data-request-place>${placeText(s.location, s.officeId, s.officeName || officeName(s.officeId)) || s.location}</span></p>` : ''}${s.note ? html`<p class="muted">${s.note}</p>` : ''}
      <div data-side-choices>${showSides.map(choice)}</div>
      <table class="tbl"><thead><tr><th>Time option</th>${showSides.map((sd) => html`<th>${sd === 'buyer' ? 'Buyer side' : 'Seller side'}</th>`)}<th></th></tr></thead><tbody>
      ${s.slots.map((sl, i) => html`<tr class="${s.confirmedSlot === i ? 'chosen' : ''}"><td><strong>${slotText(sl)}</strong>${s.confirmedSlot === i ? html` ${pill('confirmed', 'ok')}` : ''}</td>${showSides.map((sd) => html`<td>${tick(sd, i)}</td>`)}
        <td>${proc && s.status === 'open' ? html`<button class="m-btn" data-confirm="${s.id}" data-slot="${i}">Confirm this time</button>` : ''}</td></tr>`)}</tbody></table>
      ${s.responses.filter((x) => x.note).map((x) => html`<p class="muted small"><strong>${x.side === 'buyer' ? 'Buyer' : 'Seller'} side (${x.responderName}):</strong> ${x.note}</p>`)}
      ${proc ? html`<div class="links"><strong>Response links</strong> <span class="muted small">(copy and send yourself; nothing is emailed from this build)</span>
        ${['buyer', 'seller'].map((sd) => html`<div class="linkrow"><span>${sd === 'buyer' ? 'Buyer side' : 'Seller side'}:</span><input readonly value="${linkUrl(s.tokens[sd])}" aria-label="${sd} link"><a class="ghost" href="#/schedule/${s.tokens[sd]}">Open</a></div>`)}</div>` : ''}
      ${s.myLink ? html`<p><a class="m-btn" href="${s.myLink}">Answer for the ${s.mySide} side</a></p>` : ''}
      ${proc && s.status === 'confirmed' ? html`<p><button class="ghost" data-reopen="${s.id}">Reopen (reschedule)</button></p>` : ''}
      ${s.history.length ? html`<details><summary class="muted small">Earlier rounds (${s.history.length})</summary><ul class="plain">${s.history.map((h) => html`<li>Round ${h.round}: ${h.slots.map(slotText).join(' / ')}${h.confirmedSlot != null ? html` &mdash; confirmed ${slotText(h.slots[h.confirmedSlot])}` : ''}</li>`)}</ul></details>` : ''}</div>`;
  };
  const offices = officeBook.offices || [];
  const sideBlock = (side) => { const s = sideFromDeal(deal, side); const place = s.placeKind === 'office' ? officeOptionLabel(offices.find((o) => o.id === s.officeId) || {}) : composeAddress(s);
    if (!editLoc) return html`<p data-side-read="${side}"><strong>${s.label}:</strong> ${s.status === 'signed' ? `Signed ${fmtDate(s.signedOn)}` : 'Pending'}${s.date ? html` · ${fmtDate(s.date)} ${s.time || ''}` : ''}${place ? html` · ${place}` : ''}</p>`;
    return html`<form data-side-form="${side}" class="form-grid"><h4 class="span2">${s.label}</h4>
      <label>Status<select name="status" aria-label="${s.label} signing status">${SIGN_STATUSES.map(([c, l]) => html`<option value="${c}" ${s.status === c ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <label>Signed on<input type="date" name="signedOn" value="${s.signedOn || ''}" aria-label="${s.label} signed on"></label>
      <label>Date<input type="date" name="date" value="${s.date || ''}" aria-label="${s.label} signing date"></label>
      <label>Time<input type="time" name="time" value="${s.time || ''}" aria-label="${s.label} signing time"></label>
      <label class="span2">Location<select name="placeKind" data-place-kind aria-label="${s.label} location"><option value="">Choose&hellip;</option>${PLACE_KINDS.map(([c, l]) => html`<option value="${c}" ${s.placeKind === c ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <label class="span2" data-side-office ${s.placeKind === 'office' ? '' : raw('hidden')}>Office<select name="officeId">${offices.map((o) => html`<option value="${o.id}" ${o.id === s.officeId ? raw('selected') : ''}>${officeOptionLabel(o)}</option>`)}</select></label>
      <div class="span2 form-grid" data-side-manual ${s.placeKind === 'mobile_notary' || s.placeKind === 'manual' ? '' : raw('hidden')}><label>Street<input name="street" value="${s.street || ''}" maxlength="120"></label><label>City<input name="city" value="${s.city || ''}" maxlength="80"></label><label>State<input name="state" value="${s.state || ''}" maxlength="2"></label><label>ZIP<input name="zip" value="${s.zip || ''}" maxlength="10"></label></div>
      <div class="span2"><button class="m-btn" type="submit">Save ${s.label}</button></div></form>`; };
  const sideCard = staffView ? html`<div class="card" data-side-signing><h3>Signing by side</h3><p class="muted small">The buyer side and the seller side are set separately. Pending or Signed is what the processor sees for each side.</p>${sideBlock('buyer')}${sideBlock('seller')}</div>` : '';
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Closing Date</h2>${proc && !anyOpen ? html`<button class="m-btn right" id="newreq">+ New closing date request</button>` : ''}</div>
    <p class="muted">Current settlement date: <strong>${fmtDate(deal.closingDate) || 'not set'}</strong></p>
    ${flagBox}${sideCard}${scheduled}${whereCard}${propTable}
    ${list.length ? list.map(block) : html`<p class="muted">No closing date request yet.${proc ? ' Send one with a few time options; each side answers through its own link.' : ''}</p>`}`;
  return { title: 'Closing Date', crumbs: [['Closing Date']], body, mount(root) {
    const nb = $('#newreq', root); if (nb) nb.addEventListener('click', guard(() => slotsModal('New closing date request', async (f) => { await api.createSettlementRequest(deal.id, f); toast('Request created. Copy the links to send them.'); }, true)));
    $$('[data-confirm]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Confirm this closing time? It becomes the settlement date.')) return; await api.confirmSettlement(b.dataset.confirm, Number(b.dataset.slot)); toast('Closing time confirmed'); refresh(); })));
    const pb = $('#propose', root); if (pb) pb.addEventListener('click', guard(() => whenModal('Propose a closing time', async (f) => { await api.proposeClosing(deal.id, f); toast('Proposal sent to CLA Title'); })));
    const cn = $('#confirmnew', root); if (cn) cn.addEventListener('click', guard(() => whenModal(sc ? 'Change the scheduled closing' : 'Schedule the closing', async (f) => { await api.confirmClosing(deal.id, f); toast('Closing scheduled. Everyone on the file can see it.'); })));
    $$('[data-accept]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Confirm this closing time and place? Everyone on the file will see it.')) return; await api.confirmClosing(deal.id, { proposalId: b.dataset.accept }); toast('Closing scheduled'); refresh(); })));
    wireLocFields(root);
    $$('[data-loc-form]', root).forEach((f) => f.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.answerClosingLocation(deal.id, f.dataset.locForm, locValue(formData(f))); toast('Thanks, saved'); refresh(); })));
    $$('[data-signing]', root).forEach((sel) => sel.addEventListener('change', guard(async () => { await api.setSigningMethod(deal.id, sel.dataset.signing, sel.value); toast('Signing method saved'); refresh(); })));
    $$('[data-side-form]', root).forEach((form) => { const sync = () => { const kind = (form.placeKind && form.placeKind.value) || ''; const office = $('[data-side-office]', form); const manual = $('[data-side-manual]', form); if (office) office.hidden = kind !== 'office'; if (manual) manual.hidden = kind !== 'mobile_notary' && kind !== 'manual'; }; form.addEventListener('change', sync);
      form.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(form); const clean = cleanSideSigning({ ...v, side: form.dataset.sideForm }); await api.saveSideSigning(deal.id, clean); toast(`${clean.side === 'seller' ? 'Seller' : 'Buyer'} side saved`); refresh(); })); });
    $$('[data-edit-loc]', root).forEach((b) => b.addEventListener('click', () => { const r = locs.find((z) => z.participantId === b.dataset.editLoc); const side = r.partyRole === 'Client-Seller' ? 'seller' : 'buyer'; const s = sideFromDeal(deal, side);
      const m = modal(`Where ${r.name} will be at closing`, html`<form id="lf" class="form-grid">${locFields(r)}
        <h4 class="span2">${s.label} date, time and location</h4>
        <label>Date<input type="date" name="date" value="${s.date || ''}"></label><label>Time<input type="time" name="time" value="${s.time || ''}"></label>
        <label class="span2">Location<select name="placeKind"><option value="">Choose&hellip;</option>${PLACE_KINDS.map(([c, l]) => html`<option value="${c}" ${s.placeKind === c ? raw('selected') : ''}>${l}</option>`)}</select></label>
        <label class="span2">Office<select name="officeId"><option value="">Choose an office&hellip;</option>${offices.map((o) => html`<option value="${o.id}" ${o.id === s.officeId ? raw('selected') : ''}>${officeOptionLabel(o)}</option>`)}</select></label>
        <label>Street<input name="street" value="${s.street || ''}" maxlength="120"></label><label>City<input name="city" value="${s.city || ''}" maxlength="80"></label><label>State<input name="state" value="${s.state || ''}" maxlength="2"></label><label>ZIP<input name="zip" value="${s.zip || ''}" maxlength="10"></label>
        <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
      wireLocFields(m); $('#lf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target); await api.setClosingLocation(deal.id, r.participantId, locValue(v));
        if (v.placeKind || v.date || v.time) await api.saveSideSigning(deal.id, cleanSideSigning({ ...v, side, status: s.status, signedOn: s.signedOn }));
        closeModal(); toast('Answer saved'); refresh(); })); }));
    $$('[data-reopen]', root).forEach((b) => b.addEventListener('click', guard(() => slotsModal('Reopen closing date request', async (f) => { await api.reopenSettlement(b.dataset.reopen, f); toast('Reopened. Both sides can answer again.'); }, false))));
  } };

  // Matt: "Where" defaults to a CLA Title office, the one closest to the property (straight-line distance). The offices are the ACTIVE ones
  // from Admin > Offices (retired offices are not offered). Staff can change the office before sending.
  async function whenModal(title, save) {
    const od = await api.getClosingOfficeDefault(deal.id); const offices = od.offices;
    const m = modal(title, html`<form id="wf" class="form-grid"><label>Date and time *<input type="datetime-local" name="at" required></label>
      <label>Where *<select name="location" required data-closing-where><option value="">Choose&hellip;</option>${CLOSING_LOCATIONS.map((l) => html`<option ${l === OFFICE_LOCATION ? raw('selected') : ''}>${l}</option>`)}</select></label>
      <label class="span2" data-office-wrap>Which CLA Title office *<select name="officeId" data-closing-office><option value="">Choose an office&hellip;</option>${offices.map((o) => html`<option value="${o.id}" ${o.id === od.officeId ? raw('selected') : ''}>${officeOptionLabel(o)}</option>`)}<option value="${MANUAL_OFFICE}">Type an address</option></select>
        <span class="muted small" data-office-hint>${od.officeId ? html`Closest to the property: ${od.text}. You can change it.` : od.text} <span data-office-address>${(offices.find((o) => o.id === od.officeId) || {}).address || ''}</span></span></label>
      <div class="span2 form-grid" data-manual-place hidden><label>Street<input name="mstreet" maxlength="120" data-manual-street></label><label>City<input name="mcity" maxlength="80"></label><label>State<input name="mstate" maxlength="2" placeholder="FL"></label><label>ZIP<input name="mzip" maxlength="10"></label></div>
      <label class="span2">Note<input name="note" maxlength="500" placeholder="e.g. mornings only"></label>
      ${!staffView ? locs.filter((r) => r.mine).map((r) => locFields(r, `loc_${r.participantId}_`)) : flags.length ? html`<div class="span2 notice warn" data-modal-flags>${flags.map((r) => html`<div>${r.flag.text} (signing method: ${r.signingLabel})</div>`)}</div>` : ''}
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    const f = $('#wf', m); const wrap = $('[data-office-wrap]', f); const offSel = $('[data-closing-office]', f);
    const manual = $('[data-manual-place]', f);
    const sync = () => { const on = f.location.value === OFFICE_LOCATION; wrap.hidden = !on; const typing = on && offSel.value === MANUAL_OFFICE; offSel.required = on && !typing; if (manual) manual.hidden = !typing; };
    f.location.addEventListener('change', sync); offSel.addEventListener('change', sync); sync();
    offSel.addEventListener('change', () => { $('[data-office-address]', f).textContent = offSel.value === MANUAL_OFFICE ? '' : ((offices.find((o) => o.id === offSel.value) || {}).address || ''); });
    wireLocFields(f);
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target);
      if (v.officeId === MANUAL_OFFICE) { const addr = cleanManualAddress({ street: v.mstreet, city: v.mcity, state: v.mstate, zip: v.mzip }, { required: true }); v.closingManualStreet = addr.street; v.closingManualCity = addr.city; v.closingManualState = addr.state; v.closingManualZip = addr.zip; delete v.officeId; }
      else if (v.location !== OFFICE_LOCATION) delete v.officeId;
      const manualPatch = {};
      ['closingManualStreet', 'closingManualCity', 'closingManualState', 'closingManualZip'].forEach((k) => { if (v[k]) { manualPatch[k] = v[k]; delete v[k]; } });
      ['mstreet', 'mcity', 'mstate', 'mzip'].forEach((k) => delete v[k]);
      if (manualPatch.closingManualStreet) { Object.assign(v, manualPatch); v.location = TYPED_ADDRESS; delete v.officeId; }
      for (const r of staffView ? [] : locs.filter((z) => z.mine)) { const pre = `loc_${r.participantId}_`; await api.answerClosingLocation(deal.id, r.participantId, locValue(v, pre)); Object.keys(v).filter((k) => k.startsWith(pre)).forEach((k) => delete v[k]); }
      await save(v); closeModal(); refresh(); }));
  }
  async function slotsModal(title, save, needSlots) {
    const od = needSlots ? await api.getClosingOfficeDefault(deal.id) : { offices: [], officeId: null, text: '' };
    const m = modal(title, html`<form id="sf" class="form-grid">
      ${[0, 1, 2, 3, 4].map((i) => html`<label>Option ${i + 1}${i === 0 && needSlots ? ' *' : ''}<input type="datetime-local" name="slot${i}"></label>`)}
      ${needSlots ? html`<label>Where *<select name="location" required data-closing-where><option value="">Choose&hellip;</option>${CLOSING_LOCATIONS.map((l) => html`<option ${l === OFFICE_LOCATION ? raw('selected') : ''}>${l}</option>`)}</select></label>
        <label class="span2" data-office-wrap>Which CLA Title office *<select name="officeId" data-closing-office><option value="">Choose an office&hellip;</option>${od.offices.map((o) => html`<option value="${o.id}" ${o.id === od.officeId ? raw('selected') : ''}>${officeOptionLabel(o)}</option>`)}<option value="${MANUAL_OFFICE}">Type an address</option></select>
          <span class="muted small" data-office-hint>${od.officeId ? html`Closest to the property: ${od.text}. You can change it.` : od.text} <span data-office-address>${(od.offices.find((o) => o.id === od.officeId) || {}).address || ''}</span></span></label>` : html`<p class="span2 muted small">Leave the options empty to keep the same times.</p>`}
      <label class="span2">Note to both sides<textarea name="note" rows="2" maxlength="1000"></textarea></label>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    const f = $('#sf', m);
    if (needSlots) { const wrap = $('[data-office-wrap]', f); const offSel = $('[data-closing-office]', f);
      const sync = () => { const on = f.location.value === OFFICE_LOCATION; wrap.hidden = !on; offSel.required = on; };
      f.location.addEventListener('change', sync); sync();
      offSel.addEventListener('change', () => { $('[data-office-address]', f).textContent = (od.offices.find((o) => o.id === offSel.value) || {}).address || ''; }); }
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target);
      const slots = [0, 1, 2, 3, 4].map((i) => v['slot' + i]).filter(Boolean);
      if (v.location !== OFFICE_LOCATION) delete v.officeId;
      await save({ slots, location: v.location, officeId: v.officeId, note: v.note || undefined }); closeModal(); refresh(); }));
  }
}
