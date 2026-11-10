/* File settlement rows. Staff who run the order edit date, time, closer, and agents in place.
 * Signing method is the existing per-party list (Processor, coordinator, Admin). Buyers, sellers, and agents get text only. */
import { html, raw, $$, guard, toast, fmtDate } from '../ui.js?v=202611070139';
import { isRefi } from '../data/constants.js?v=202611101015';
import { SIGNING_METHODS } from '../data/closing-location.js?v=202611101015';
import { closerChoices, closerInputValue, resolveCloser } from '../data/closer.js?v=202611101015';
import { settlementClock, settlementEditFlags, agentRoleEditable, saveSettlementAgent, cleanClosingTime } from '../data/settlement-edit.js?v=202611101900';

const contactLabel = (c) => `${c.firstName || ''} ${c.lastName || ''}`.replace(/\s+/g, ' ').trim() || c.company || 'Unnamed contact';
const partyName = (p) => contactLabel(p.contact || {});

function agentLines(deal, role) {
  return (deal.participants || []).filter((p) => p && p.role === role && !p.removed && p.contact);
}

function agentSelect(deal, role, label, row, contacts) {
  const current = row ? row.contactId : '';
  const list = contacts.slice();
  if (current && !list.some((c) => c.id === current)) list.push({ id: current, firstName: row ? partyName(row) : 'Current', lastName: '' });
  return html`<label class="settlement-row" data-settlement-row="agent" data-settlement-role="${role}"><span class="settlement-k">${label}</span>
    <select data-settlement-edit="agent" data-settlement-role="${role}" data-participant="${row ? row.id : ''}" data-prev="${current}" aria-label="${label}">
      <option value="">Not set</option>${list.map((c) => html`<option value="${c.id}" ${c.id === current ? raw('selected') : ''}>${contactLabel(c)}</option>`)}
    </select></label>`;
}

export function settlementSectionHtml({ deal, user, demoLocked = false, contacts = [], closerStaff = [], locations = [] } = {}) {
  const d = deal || { participants: [] };
  const flags = settlementEditFlags(user, { demoLocked });
  const { staffView, canEdit, canEditSigning } = flags;
  const closers = closerChoices(closerStaff);
  const clock = settlementClock(d);
  const agentRow = (role, label) => {
    const rows = agentLines(d, role);
    if (canEdit && agentRoleEditable(d, role)) {
      const shown = rows.length ? rows : [null];
      return shown.map((row) => agentSelect(d, role, label, row, contacts));
    }
    if (!rows.length && isRefi(d)) return '';
    const names = rows.map(partyName).filter(Boolean).join(', ') || 'Not set';
    return html`<div class="settlement-row" data-settlement-row="agent" data-settlement-role="${role}"><span class="settlement-k">${label}</span><span data-settlement-value="agent">${names}</span></div>`;
  };
  const dateRow = canEdit
    ? html`<label class="settlement-row" data-settlement-row="date"><span class="settlement-k">Settlement date</span><input type="date" data-settlement-edit="date" data-prev="${d.closingDate || ''}" value="${d.closingDate || ''}" aria-label="Settlement date"></label>`
    : html`<div class="settlement-row" data-settlement-row="date"><span class="settlement-k">Settlement date</span><span data-settlement-value="date">${fmtDate(d.closingDate) || 'Not set'}</span></div>`;
  const timeRow = canEdit
    ? html`<label class="settlement-row" data-settlement-row="time"><span class="settlement-k">Time</span><input type="time" data-settlement-edit="time" data-prev="${clock}" value="${clock}" aria-label="Settlement time"></label>`
    : html`<div class="settlement-row" data-settlement-row="time"><span class="settlement-k">Time</span><span data-settlement-value="time">${clock || 'Not set'}</span></div>`;
  const closerShown = closerInputValue(d, closers);
  const closerRow = !staffView ? '' : canEdit
    ? html`<label class="settlement-row" data-settlement-row="closer"><span class="settlement-k">Closer</span><input data-settlement-edit="closer" data-closer-input list="settlement-closer-staff" maxlength="120" autocomplete="off" data-prev="${closerShown}" value="${closerShown}" aria-label="Closer"><datalist id="settlement-closer-staff">${closers.map((c) => html`<option value="${c.label}"></option>`)}</datalist></label>`
    : html`<div class="settlement-row" data-settlement-row="closer"><span class="settlement-k">Closer</span><span data-settlement-value="closer">${d.closerName || 'Not set'}</span></div>`;
  const signingRows = !staffView ? '' : (locations || []).map((r) => html`<label class="settlement-row" data-settlement-row="signing" data-participant="${r.participantId}"><span class="settlement-k">Signing method</span><span class="settlement-who">${r.name}</span>
    ${canEditSigning ? html`<select data-settlement-edit="signing" data-participant="${r.participantId}" data-prev="${r.signingMethod || 'undecided'}" aria-label="Signing method for ${r.name}">${SIGNING_METHODS.map(([c, l]) => html`<option value="${c}" ${r.signingMethod === c ? raw('selected') : ''}>${l}</option>`)}</select>` : html`<span data-settlement-value="signing">${r.signingLabel || 'Undecided'}</span>`}</label>`);
  return html`<section class="card settlement-file" data-settlement-section><h3>Settlement</h3>
    <div class="settlement-rows">${agentRow('Buyer Agent', 'Buyer agent')}${agentRow('Listing Agent', 'Listing agent')}${dateRow}${timeRow}${closerRow}${signingRows}</div>
    ${canEdit ? html`<p class="muted small">Each change saves on its own. Pick a closer from CLA staff, or type a name.</p>` : ''}</section>`;
}

export function mountSettlement(root, { api, deal, refresh, user, demoLocked = false, contacts = [], closerStaff = [] } = {}) {
  const flags = settlementEditFlags(user, { demoLocked });
  if (!flags.canEdit && !flags.canEditSigning) return;
  const closers = closerChoices(closerStaff);
  const failBack = (el) => { if (el && el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'prev')) el.value = el.dataset.prev; };
  $$('[data-settlement-edit="agent"]', root).forEach((sel) => sel.addEventListener('change', guard(async () => {
    try {
      const result = await saveSettlementAgent(api, deal, { role: sel.dataset.settlementRole, participantId: sel.dataset.participant, contactId: sel.value });
      if (!result.changed) return;
      toast('Agent saved');
      refresh();
    } catch (e) { failBack(sel); throw e; }
  })));
  $$('[data-settlement-edit="date"]', root).forEach((el) => el.addEventListener('change', guard(async () => {
    try {
      if ((el.value || '') === (el.dataset.prev || '')) return;
      await api.updateDeal(deal.id, { closingDate: el.value });
      toast('Settlement date saved');
      refresh();
    } catch (e) { failBack(el); throw e; }
  })));
  $$('[data-settlement-edit="time"]', root).forEach((el) => el.addEventListener('change', guard(async () => {
    try {
      const closingTime = cleanClosingTime(el.value);
      if (closingTime === (el.dataset.prev || '')) return;
      await api.updateDeal(deal.id, { closingTime });
      toast('Time saved');
      refresh();
    } catch (e) { failBack(el); throw e; }
  })));
  $$('[data-settlement-edit="closer"]', root).forEach((el) => el.addEventListener('change', guard(async () => {
    try {
      const closer = resolveCloser(el.value, closers, { closerName: deal.closerName || '', closerProfileId: deal.closerProfileId || null });
      await api.updateDeal(deal.id, { closerName: closer.closerName, closerProfileId: closer.closerProfileId });
      toast(closer.closerName ? 'Closer saved' : 'Closer cleared');
      refresh();
    } catch (e) { failBack(el); throw e; }
  })));
  $$('[data-settlement-edit="signing"]', root).forEach((sel) => sel.addEventListener('change', guard(async () => {
    try {
      if (sel.value === (sel.dataset.prev || '')) return;
      await api.setSigningMethod(deal.id, sel.dataset.participant, sel.value);
      toast('Signing method saved');
      refresh();
    } catch (e) { failBack(sel); throw e; }
  })));
}
