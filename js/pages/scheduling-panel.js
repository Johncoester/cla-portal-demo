/* MF-058: processor Scheduling Details. Each side has its own settlement agent/notary.
 * Buyer details sit in a larger lower block. Seller details sit in the seller section.
 * Fields save on their own. A reminder emails that side's parties after the processor confirms. */
import { html, raw, $, $$, guard, toast, modal, closeModal } from '../ui.js?v=202611161500';
import { scheduleTimeLabel, schedulingFromDeal, placeSummary, askLabel } from '../data/scheduling-details.js?v=202611241900';
import { AUTOSAVE_MS, AGENT_LABEL, cleanSideAgent, reminderEmptyMessage, sameAgent, sideAgentFromDeal, sideAgentPatch } from '../data/scheduling-agent.js?v=202611242210';

const line = (k, v) => html`<div class="settlement-row" data-sched-row="${k}"><span class="settlement-k">${k}</span><span>${v || html`<span class="muted">Not set</span>`}</span></div>`;

function sideBlock(side, label) {
  if (!side || !(side.date || side.time || side.placeKind || side.askParty || side.notes)) {
    return html`<div data-sched-summary="${side && side.side || label.toLowerCase()}"><h4>${label}</h4><p class="muted">Not scheduled yet.</p></div>`;
  }
  const when = [side.date, side.time ? scheduleTimeLabel(side.time) : ''].filter(Boolean).join(' at ');
  return html`<div data-sched-summary="${side.side}"><h4>${label}</h4>
    ${side.askParty ? html`<p data-sched-asked>${askLabel(side.side)}. A link is queued in the Outbox. Nothing was emailed.</p>` : ''}
    ${line('Settlement date', when)}${line('Where', placeSummary(side) || (side.askParty ? 'Waiting on their answer' : ''))}
    ${side.notes ? line('Notes', side.notes) : ''}</div>`;
}

function agentBox(side, deal, list) {
  const agent = sideAgentFromDeal(deal, side);
  const who = side === 'seller' ? 'seller' : 'buyer';
  const name = list.length
    ? html`<label data-k="name">${AGENT_LABEL}<select data-settlement-agent aria-label="${AGENT_LABEL} for the ${who} side">${html`<option value="">Choose…</option>`}${list.map((c) => html`<option value="${c.id}" ${c.id === agent.profileId ? raw('selected') : ''}>${c.name} (${c.role})</option>`)}</select></label>`
    : html`<label data-k="name">${AGENT_LABEL}<input data-settlement-agent maxlength="120" value="${agent.name || ''}" placeholder="Type the settlement agent/notary name" aria-label="${AGENT_LABEL} for the ${who} side"></label>`;
  const lower = side === 'buyer' ? ' sched-agent-lower' : '';
  return html`<div class="sched-agent${lower}" data-settlement-agent-side="${side}">
    <div class="sched-agent-head"><h4>${AGENT_LABEL}</h4>
      <label class="check"><input type="checkbox" data-agent-confirmed aria-label="Confirmed for the ${who} ${AGENT_LABEL}" ${agent.confirmed ? raw('checked') : ''}> Confirmed</label></div>
    ${name}
    <label>Phone<input type="tel" inputmode="tel" data-phone data-agent-phone maxlength="12" placeholder="xxx-xxx-xxxx" value="${agent.phone || ''}" autocomplete="off" aria-label="${AGENT_LABEL} phone for the ${who} side"></label>
    <label>Email<input type="email" data-agent-email maxlength="200" value="${agent.email || ''}" autocomplete="off" aria-label="${AGENT_LABEL} email for the ${who} side"></label>
    <p class="small sched-save" data-sched-save role="status"></p>
    <button type="button" class="ghost" data-sched-remind="${side}">Send reminder</button>
  </div>`;
}

export function schedulingPanelHtml({ deal, staff, choices, links }) {
  const view = schedulingFromDeal(deal);
  const list = choices || [];
  const buyerLink = (links || []).find((l) => l.side === 'buyer');
  const sellerLink = (links || []).find((l) => l.side === 'seller');
  const linkRow = (row, label) => row ? html`<p data-sched-link="${row.side}"><span>${label} link (queued, not emailed):</span> <input readonly value="${row.path}" aria-label="${label} scheduling link"></p>` : '';
  const column = (side, label) => html`<section class="sched-side" data-sched-side="${side}">${sideBlock(view[side], label)}${staff ? agentBox(side, deal, list) : ''}</section>`;
  return html`<div class="card" data-scheduling-details><h3>Scheduling details</h3>
    <div class="sum-grid sched-sides">${column('buyer', 'Buyer side')}${column('seller', 'Seller side')}</div>
    ${staff ? html`<p><button class="ghost" type="button" data-processor-notes>Processor notes</button></p>
      ${view.processorNotes ? html`<p class="muted" data-processor-notes-preview>Processor notes: ${view.processorNotes}</p>` : ''}
      ${linkRow(buyerLink, 'Buyer')}${linkRow(sellerLink, 'Seller')}` : ''}</div>`;
}

function readBox(box) {
  const nameEl = box.querySelector('[data-settlement-agent]');
  const picking = nameEl && nameEl.tagName === 'SELECT';
  return {
    side: box.dataset.settlementAgentSide,
    name: picking ? '' : (nameEl ? nameEl.value : ''),
    profileId: picking ? (nameEl.value || null) : null,
    phone: (box.querySelector('[data-agent-phone]') || {}).value || '',
    email: (box.querySelector('[data-agent-email]') || {}).value || '',
    confirmed: !!(box.querySelector('[data-agent-confirmed]') || {}).checked,
  };
}

function plainSaveError(err) {
  const msg = (err && err.message) || '';
  if (/save_side_settlement_agent|schema cache|could not find the function/i.test(msg)) {
    return 'Scheduling details are not ready on this site yet. Ask CLA Title to finish the update, then try again.';
  }
  return msg || 'This was not saved. Your typing is still in the boxes. Try again.';
}

export function wireSchedulingPanel(root, { api, deal, refresh, choices }) {
  const flushes = [];
  $$('[data-settlement-agent-side]', root).forEach((box) => {
    const status = $('[data-sched-save]', box);
    const say = (text, bad) => { if (!status) return; status.textContent = text || ''; status.classList.toggle('err-text', !!bad); };
    let saved = sideAgentFromDeal(deal, box.dataset.settlementAgentSide);
    let timer = 0;
    let chain = Promise.resolve();
    const saveOnce = async () => {
      let clean;
      try { clean = cleanSideAgent(readBox(box), choices || []); }
      catch (e) { say(e.message, true); return; }
      if (sameAgent(clean, saved)) { if (status && status.classList.contains('err-text')) say('Saved', false); return; }
      say('Saving…', false);
      try {
        await api.saveSettlementAgent(deal.id, clean);
        Object.assign(deal, sideAgentPatch(clean));
        saved = clean;
        say('Saved', false);
      } catch (err) { say(plainSaveError(err), true); }
    };
    const run = () => { const job = chain.then(saveOnce, saveOnce); chain = job.then(() => {}, () => {}); return job; };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(run, AUTOSAVE_MS); };
    box.addEventListener('input', (e) => { if (e.target && e.target.closest('[data-sched-remind]')) return; schedule(); });
    box.addEventListener('change', schedule);
    flushes.push(async () => { clearTimeout(timer); await run(); });
  });
  const flushAll = () => Promise.all(flushes.map((fn) => fn()));

  $$('[data-sched-remind]', root).forEach((btn) => btn.addEventListener('click', guard(async () => {
    await flushAll();
    const side = btn.dataset.schedRemind === 'seller' ? 'seller' : 'buyer';
    const who = side === 'seller' ? 'seller' : 'buyer';
    const preview = await api.previewSchedulingReminder(deal.id, side);
    const people = (preview && preview.recipients) || [];
    const missing = (preview && preview.missing) || [];
    let g = null;
    if (api.getGmailStatus) g = await api.getGmailStatus().catch(() => ({ connected: false, status: '' }));
    const ready = !g || (!!g.connected && (g.status === 'connected' || !g.status));
    const m = modal(`Email the ${who} side`, html`<p>One email per person below. Nothing is texted.</p>
      ${g ? (ready ? html`<p class="small">Sends from your CLA Title Gmail${g.mailbox ? html` (${g.mailbox})` : ''}.</p>` : html`<div class="notice warn">Connect Gmail on Profile Setting before this can be emailed. Nothing has been sent.</div>`) : html`<p class="small">Email only, to the people on this file.</p>`}
      ${people.length ? html`<ul class="plain">${people.map((p) => html`<li data-remind-to="${p.email}"><strong>${p.name}</strong> &lt;${p.email}&gt; <span class="muted">(${p.roleLabel})</span></li>`)}</ul>` : html`<p data-remind-none>${reminderEmptyMessage(side)}</p>`}
      ${missing.map((p) => html`<p class="small" data-remind-skip>${p.name} (${p.roleLabel}) is not included. ${p.reason}</p>`)}
      <div><button type="button" class="m-btn" data-remind-send ${people.length && ready ? '' : raw('disabled')}>Email these people</button> <button type="button" class="ghost" data-close>Cancel</button></div>`);
    const send = $('[data-remind-send]', m);
    if (!send || send.disabled) return;
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        const result = await api.sendSchedulingReminder(deal.id, side);
        closeModal();
        const n = result.sent || 0;
        toast(result.emailed ? `Reminder emailed to ${n} ${n === 1 ? 'person' : 'people'}.` : (result.message || 'Some reminders were not emailed. Try again.'), result.emailed ? 'ok' : 'err');
      } catch (err) {
        send.disabled = false;
        toast(err.message || 'The reminder was not emailed. Nothing was sent.', 'err');
      }
    });
  })));

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
