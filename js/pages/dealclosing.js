// Closing Date tab: the processor sends time options; each side answers through its own link; the processor confirms; a request can be reopened.
// Links are shown here to copy. Nothing is emailed from this build.
import { html, $, $$, guard, formData, modal, closeModal, toast, fmtDate, fmtDateTime, pill } from '../ui.js';
import { isProcessor, isClient, sideOf, isViewOnly, CLOSING_LOCATIONS } from '../data/constants.js';
export const slotText = (s) => new Date(s).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const STATUS = { open: ['waiting for answers', 'info'], confirmed: ['confirmed', 'ok'] };

export async function render({ api, user, deal, refresh }) {
  const list = await api.listSettlements(deal.id); const proc = isProcessor(user.role); const anyOpen = list.some((s) => s.status === 'open');
  // Matt, Oct 31: agents / clients PROPOSE a closing time + where; the processor or coordinator CONFIRMS it; everyone on the file sees the scheduled closing.
  const proposals = await api.listClosingProposals(deal.id); const manager = proc || user.role === 'Transaction Coordinator'; const staffView = !user.accountRole && user.role !== 'Outside user';
  const canPropose = !staffView && !!sideOf(user.role) && !isViewOnly(user.role); const sc = deal.scheduledClosing;
  const sideName = (sd) => (sd === 'buyer' ? 'Buyer side' : 'Seller side');
  const scheduled = html`<div class="card" id="scheduled"><h3>Scheduled closing</h3>${sc ? html`<p><strong>${slotText(sc.at)}</strong> &middot; ${sc.location}${sc.note ? html` &middot; ${sc.note}` : ''}</p><p class="muted small">Confirmed by CLA Title ${fmtDateTime(sc.confirmedAt)}</p>`
      : html`<p class="muted">Not scheduled yet.${canPropose ? ' Propose a date, time and place below; CLA Title confirms it.' : ''}</p>`}
    ${manager ? html`<p><button class="ghost" id="confirmnew">${sc ? 'Change the scheduled closing' : 'Schedule the closing'}</button></p>` : ''}</div>`;
  const propTable = proposals.length || canPropose ? html`<div class="card" id="proposals"><div class="deal-card-head"><h3>Proposed closing times</h3>${canPropose ? html`<button class="m-btn" id="propose">+ Propose a closing time</button>` : ''}</div>
    ${proposals.length ? html`<table class="tbl"><thead><tr><th>When</th><th>Where</th>${staffView ? html`<th>Side</th>` : ''}<th>Proposed by</th><th>Note</th><th></th></tr></thead><tbody>${proposals.map((p) => html`<tr data-proposal="${p.id}"><td><strong>${slotText(p.at)}</strong></td><td>${p.location}</td>${staffView ? html`<td>${sideName(p.side)}</td>` : ''}<td>${p.proposedByName}<br><span class="muted small">${p.roleLabel}</span></td><td>${p.note}</td>
      <td>${p.status === 'confirmed' ? pill('confirmed', 'ok') : manager ? html`<button class="m-btn" data-accept="${p.id}">Confirm this</button>` : pill('waiting for CLA', 'info')}</td></tr>`)}</tbody></table>` : html`<p class="muted">No proposals yet.</p>`}
    ${!staffView ? html`<p class="muted small">Only CLA Title and your own side see your proposals.</p>` : ''}</div>` : '';
  const linkUrl = (tok) => `${location.origin}${location.pathname}#/schedule/${tok}`;
  const block = (s) => {
    const r = (side) => s.responses.find((x) => x.side === side);
    const tick = (side, i) => { const x = r(side); return x ? (x.picks.includes(i) ? html`<span class="ok-text">&#10003; works</span>` : html`<span class="muted">&ndash;</span>`) : html`<span class="muted">no answer yet</span>`; };
    const showSides = isClient(user.role) ? [s.mySide] : ['buyer', 'seller'];   // clients see only their own side's answers
    return html`<div class="card"><div class="deal-card-head"><h3>Closing date request</h3>${pill(STATUS[s.status][0], STATUS[s.status][1])}<span class="muted small">round ${s.round} &middot; sent by ${s.createdByName} ${fmtDateTime(s.createdAt)}</span></div>
      ${s.location ? html`<p><strong>Where:</strong> ${s.location}</p>` : ''}${s.note ? html`<p class="muted">${s.note}</p>` : ''}
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
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>Closing Date</h2>${proc && !anyOpen ? html`<button class="m-btn right" id="newreq">+ New closing date request</button>` : ''}</div>
    <p class="muted">Current settlement date: <strong>${fmtDate(deal.closingDate) || 'not set'}</strong></p>
    ${scheduled}${propTable}
    ${list.length ? list.map(block) : html`<p class="muted">No closing date request yet.${proc ? ' Send one with a few time options; each side answers through its own link.' : ''}</p>`}`;
  return { title: 'Closing Date', crumbs: [['Closing Date']], body, mount(root) {
    const nb = $('#newreq', root); if (nb) nb.addEventListener('click', () => slotsModal('New closing date request', async (f) => { await api.createSettlementRequest(deal.id, f); toast('Request created. Copy the links to send them.'); }, true));
    $$('[data-confirm]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Confirm this closing time? It becomes the settlement date.')) return; await api.confirmSettlement(b.dataset.confirm, Number(b.dataset.slot)); toast('Closing time confirmed'); refresh(); })));
    const pb = $('#propose', root); if (pb) pb.addEventListener('click', () => whenModal('Propose a closing time', async (f) => { await api.proposeClosing(deal.id, f); toast('Proposal sent to CLA Title'); }));
    const cn = $('#confirmnew', root); if (cn) cn.addEventListener('click', () => whenModal(sc ? 'Change the scheduled closing' : 'Schedule the closing', async (f) => { await api.confirmClosing(deal.id, f); toast('Closing scheduled. Everyone on the file can see it.'); }));
    $$('[data-accept]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Confirm this closing time and place? Everyone on the file will see it.')) return; await api.confirmClosing(deal.id, { proposalId: b.dataset.accept }); toast('Closing scheduled'); refresh(); })));
    $$('[data-reopen]', root).forEach((b) => b.addEventListener('click', () => slotsModal('Reopen closing date request', async (f) => { await api.reopenSettlement(b.dataset.reopen, f); toast('Reopened. Both sides can answer again.'); }, false)));
  } };

  function whenModal(title, save) {
    const m = modal(title, html`<form id="wf" class="form-grid"><label>Date and time *<input type="datetime-local" name="at" required></label>
      <label>Where *<select name="location" required><option value="">Choose&hellip;</option>${CLOSING_LOCATIONS.map((l) => html`<option>${l}</option>`)}</select></label>
      <label class="span2">Note<input name="note" maxlength="500" placeholder="e.g. mornings only, or the address for a mobile notary"></label>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#wf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); await save(formData(e.target)); closeModal(); refresh(); }));
  }
  function slotsModal(title, save, needSlots) {
    const m = modal(title, html`<form id="sf" class="form-grid">
      ${[0, 1, 2, 3, 4].map((i) => html`<label>Option ${i + 1}${i === 0 && needSlots ? ' *' : ''}<input type="datetime-local" name="slot${i}"></label>`)}
      ${needSlots ? html`<label class="span2">Where<input name="location" maxlength="200" placeholder="CLA Title office (fake)"></label>` : html`<p class="span2 muted small">Leave the options empty to keep the same times.</p>`}
      <label class="span2">Note to both sides<textarea name="note" rows="2" maxlength="1000"></textarea></label>
      <div class="span2"><button class="m-btn" type="submit">Save</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
    $('#sf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = formData(e.target);
      const slots = [0, 1, 2, 3, 4].map((i) => f['slot' + i]).filter(Boolean); await save({ slots, location: f.location, note: f.note || undefined }); closeModal(); refresh(); }));
  }
}
