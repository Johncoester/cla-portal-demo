/* MF-056: the Scheduling Details card on the file. Processor confirms the settlement agent and keeps separate notes.
 * Side answers come from the agent task or the buyer / seller link. The file closing date is left alone. */
import { html, raw, $, guard, toast, formData, modal, closeModal } from '../ui.js?v=202611161500';
import { scheduleTimeLabel, schedulingFromDeal, placeSummary, settlementAgentChoices, askLabel } from '../data/scheduling-details.js?v=202611241600';

const line = (k, v) => html`<div class="settlement-row" data-sched-row="${k}"><span class="settlement-k">${k}</span><span>${v || html`<span class="muted">Not set</span>`}</span></div>`;

function sideBlock(side, label) {
  if (!side || !(side.date || side.time || side.placeKind || side.askParty || side.notes)) {
    return html`<div data-sched-side="${side && side.side || label.toLowerCase()}"><h4>${label}</h4><p class="muted">Not scheduled yet.</p></div>`;
  }
  const when = [side.date, side.time ? scheduleTimeLabel(side.time) : ''].filter(Boolean).join(' at ');
  return html`<div data-sched-side="${side.side}"><h4>${label}</h4>
    ${side.askParty ? html`<p data-sched-asked>${askLabel(side.side)}. A link is queued in the Outbox. Nothing was emailed.</p>` : ''}
    ${line('Settlement date', when)}${line('Where', placeSummary(side) || (side.askParty ? 'Waiting on their answer' : ''))}
    ${side.notes ? line('Notes', side.notes) : ''}</div>`;
}

export function schedulingPanelHtml({ deal, staff, choices, links }) {
  const view = schedulingFromDeal(deal);
  const list = choices || [];
  const buyerLink = (links || []).find((l) => l.side === 'buyer');
  const sellerLink = (links || []).find((l) => l.side === 'seller');
  const linkRow = (row, label) => row ? html`<p data-sched-link="${row.side}"><span>${label} link (queued, not emailed):</span> <input readonly value="${row.path}" aria-label="${label} scheduling link"></p>` : '';
  const agentBox = !staff ? '' : list.length
    ? html`<label data-k="name">Settlement agent<select name="profileId" data-settlement-agent>${html`<option value="">Choose…</option>`}${list.map((c) => html`<option value="${c.id}" ${c.id === view.settlementAgentProfileId ? raw('selected') : ''}>${c.name} (${c.role})</option>`)}</select><span class="ferr"></span></label>`
    : html`<label data-k="name">Settlement agent<input name="name" maxlength="120" value="${view.settlementAgentName || ''}" data-settlement-agent placeholder="Type the settlement agent name"><span class="ferr"></span></label>`;
  return html`<div class="card" data-scheduling-details><h3>Scheduling details</h3>
    <div class="sum-grid">${sideBlock(view.buyer, 'Buyer side')}${sideBlock(view.seller, 'Seller side')}</div>
    ${staff ? html`<form data-settlement-agent-form class="form-grid">${agentBox}
      <label class="check" data-k="confirmed"><input type="checkbox" name="confirmed" value="yes" ${view.settlementAgentConfirmed ? raw('checked') : ''}> Settlement Agent Confirmed</label>
      <div class="span2"><button class="m-btn" type="submit">Save settlement agent</button>
        <button class="ghost" type="button" data-processor-notes>Processor notes</button></div>
      ${view.processorNotes ? html`<p class="span2 muted" data-processor-notes-preview>Processor notes: ${view.processorNotes}</p>` : ''}</form>
      ${linkRow(buyerLink, 'Buyer')}${linkRow(sellerLink, 'Seller')}` : ''}</div>`;
}

export function wireSchedulingPanel(root, { api, deal, refresh, choices }) {
  const form = $('[data-settlement-agent-form]', root);
  if (form) form.addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const v = formData(form);
    const picked = (choices || []).find((c) => c.id === v.profileId);
    try {
      await api.saveSettlementAgent(deal.id, { name: picked ? picked.name : (v.name || ''), profileId: v.profileId || null, confirmed: v.confirmed === 'yes' });
      toast('Settlement agent saved');
      refresh();
    } catch (err) { toast(err.message || 'The settlement agent was not saved. Check the name and try again.', 'err'); }
  }));
  const notes = $('[data-processor-notes]', root);
  if (!notes) return;
  notes.addEventListener('click', () => {
    const current = schedulingFromDeal(deal).processorNotes || '';
    const m = modal('Processor notes', html`<form id="sched-notes" class="form-grid"><p class="span2 muted">These notes are for CLA Title only. They are separate from the buyer and seller notes.</p>
      <label class="span2">Notes<textarea name="notes" rows="4" maxlength="2000">${current}</textarea></label>
      <div class="span2"><button class="m-btn" type="submit">Save notes</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`);
    $('#sched-notes', m).addEventListener('submit', guard(async (e) => {
      e.preventDefault();
      const text = e.target.elements.notes.value;
      try { await api.saveSchedulingNotes(deal.id, text); closeModal(); toast('Processor notes saved'); refresh(); }
      catch (err) { toast(err.message || 'The notes were not saved. They are still in the box. Try again.', 'err'); }
    }));
  });
}
