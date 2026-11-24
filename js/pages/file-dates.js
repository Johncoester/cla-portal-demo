/* FF-097: settlement date and disbursement date at the top of a file.
 * Both dates are columns that already exist (deals.closing_date, deals.disbursement_date).
 * A blank disbursement date stays automatic. This file does not copy a buyer's proposed closing time onto the file. */
import { html, fmtDate, guard, toast } from '../ui.js?v=202611161500';
import { runsOrders, isRefi } from '../data/constants.js?v=202611302300';
import { disbursementFor } from '../data/disbursement.js?v=202611190600';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function fileDateCanEdit(user, { demoLocked = false } = {}) {
  return !!(user && runsOrders(user) && !demoLocked);
}

export function cleanFileDate(value, label) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  if (!DATE_RE.test(v)) throw new Error(`Enter a real ${label}, or clear the field.`);
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`Enter a real ${label}, or clear the field.`);
  return v;
}

export function closingDatePatch(value) {
  return { closingDate: cleanFileDate(value, 'settlement date') };
}

/* A date that matches the automatic date is stored blank, so the file keeps following the closing date. */
export function disbursementDatePatch(deal, value) {
  const next = cleanFileDate(value, 'disbursement date');
  const auto = disbursementFor({ ...(deal || {}), disbursementDate: '' }).date || '';
  if (!next || next === auto) return { disbursementDate: '' };
  return { disbursementDate: next };
}

export function datesSaved(saved, patch) {
  if (!saved) return 'The date was not saved. Reload the file and try again.';
  if (patch.closingDate !== undefined && String(saved.closingDate || '').slice(0, 10) !== patch.closingDate) {
    return 'The settlement date was not saved. Reload the file. A processor, a pre-processor on this file, or an admin can change it.';
  }
  if (patch.disbursementDate !== undefined && String(saved.disbursementDate || '').slice(0, 10) !== patch.disbursementDate) {
    return 'The disbursement date was not saved. Reload the file. A processor, a pre-processor on this file, or an admin can change it.';
  }
  return '';
}

function plainSaveError(err, kind) {
  const msg = String((err && err.message) || '');
  const what = kind === 'disbursement' ? 'disbursement date' : 'settlement date';
  if (!msg || /42501|P0001|schema cache|23514|violates|JWT|row-level|permission denied/i.test(msg)) {
    return `The ${what} was not saved. Reload the file and try again. A processor, a pre-processor on this file, or an admin can change it.`;
  }
  return msg;
}

export function fileDatesHtml(deal, { canEdit = false } = {}) {
  const d = deal || {};
  const closing = String(d.closingDate || '').slice(0, 10);
  const shown = disbursementFor(d);
  const disb = shown.date || '';
  const settlement = canEdit
    ? html`<input type="date" class="oh-date-input" data-oh-edit="closing" data-prev="${closing}" value="${closing}" aria-label="Settlement date">`
    : html`<span class="oh-big" data-oh-closing>${fmtDate(closing) || 'Not set'}</span>`;
  const disbursement = canEdit
    ? html`<input type="date" class="oh-date-input" data-oh-edit="disbursement" data-prev="${disb}" value="${disb}" aria-label="Disbursement date" title="${isRefi(d) ? 'Clear this date to use the automatic date.' : 'Follows the settlement date. You can change it by hand; the next settlement date change resets it.'}">`
    : html`<span class="oh-big" data-oh-disbursement-date>${fmtDate(disb) || 'Not set'}</span>`;
  return html`<div class="oh-side" data-file-dates>
    <div class="oh-date" data-oh-settlement><span class="oh-big-label">Settlement date</span>${settlement}</div>
    <div class="oh-date" data-oh-disbursement><span class="oh-big-label">Disbursement date</span>${disbursement}</div></div>`;
}

/* Leave the typed date in the field when the save fails. */
export function mountFileDates(root, { api, deal, refresh } = {}) {
  if (!root || !deal || !api || !deal.id || typeof root.querySelector !== 'function') return;
  const box = root.querySelector('[data-file-dates]');
  if (!box || box.dataset.wired === '1') return;
  box.dataset.wired = '1';
  box.addEventListener('change', guard(async (e) => {
    const el = e.target;
    if (!el || !el.dataset || !el.dataset.ohEdit) return;
    const kind = el.dataset.ohEdit === 'disbursement' ? 'disbursement' : 'closing';
    let patch;
    try { patch = kind === 'disbursement' ? disbursementDatePatch(deal, el.value) : closingDatePatch(el.value); }
    catch (err) { throw new Error(plainSaveError(err, kind)); }
    const stored = kind === 'disbursement' ? String(deal.disbursementDate || '').slice(0, 10) : String(deal.closingDate || '').slice(0, 10);
    const next = kind === 'disbursement' ? patch.disbursementDate : patch.closingDate;
    if (next === stored) return;
    let saved;
    try { saved = await api.updateDeal(deal.id, patch); }
    catch (err) { throw new Error(plainSaveError(err, kind)); }
    const problem = datesSaved(saved, patch);
    if (problem) throw new Error(problem);
    toast(kind === 'disbursement' ? 'Disbursement date saved' : 'Settlement date saved');
    if (typeof refresh === 'function') refresh();
  }));
}
