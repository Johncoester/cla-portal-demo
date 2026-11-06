// UNDERWRITER SPLITS (John, Nov 3 call). Admin / Super admin page: each state's underwriter share of the title premium (CLA keeps the rest).
// Defaults MD 15% (Francis's Qualia video: 85% CLA / 15% Fidelity), FL 30%, SC 40%; VA and DC blank until set. Add a state, edit any %.
// Every change is logged below; nothing is ever deleted (blank = not set). Shown on the Accounting tab's title premium lines.
import { html, raw, $, $$, guard, toast, fmtDateTime } from '../ui.js?v=202611060013';
import { canManageSplits, UNSET_NOTE, DEFAULT_UNDERWRITER } from '../data/underwriter.js?v=202611060013';
const pctText = (p) => (p === null || p === undefined ? 'Not set' : `${p}%`);
export async function render({ api, user, refresh }) {
  if (!canManageSplits(user)) throw new Error('Only an Admin or Super admin can see the Underwriter splits page.');
  const data = await api.listUnderwriterSplits();
  const row = (r) => html`<tr data-uw-row="${r.state}" data-uw-pct="${r.pct === null ? '' : r.pct}">
    <th scope="row">${r.state}</th>
    <td><input class="uw-pct" name="pct" inputmode="decimal" aria-label="${r.state} underwriter %" value="${r.pct === null ? '' : r.pct}" placeholder="not set" data-uw-input="${r.state}" maxlength="6"> %</td>
    <td><input name="underwriter" aria-label="${r.state} underwriter" value="${r.underwriter || DEFAULT_UNDERWRITER}" data-uw-name="${r.state}" maxlength="120"></td>
    <td data-uw-split="${r.state}">${r.pct === null ? html`<span class="muted small" data-uw-unset>${UNSET_NOTE}</span>` : html`CLA <strong>${Math.round((100 - r.pct) * 100) / 100}%</strong> &middot; underwriter <strong>${r.pct}%</strong>`}</td>
    <td class="small muted">${r.updatedAt ? html`${fmtDateTime(r.updatedAt)} by ${r.updatedByName || 'an Admin'}` : 'Default'}</td>
    <td><button type="button" class="m-btn small" data-uw-save="${r.state}">Save</button></td></tr>`;
  const body = html`<section data-underwriters-page>
    <div class="page-head"><p class="eyebrow">Admin</p><h2 class="page-title">Underwriter splits</h2>
      <p class="muted">For each state, the underwriter's share of the title insurance premium. CLA keeps the rest. The Accounting tab shows the split on every title premium line (owner's and lender's policies).
      Leave a % blank for "not set": no split is shown for that state until an Admin sets it. Only Admins and Super admins can change these. Every change is logged; nothing is deleted.</p></div>
    <div class="card"><table class="tbl" data-uw-table><thead><tr><th>State</th><th>Underwriter %</th><th>Underwriter</th><th>Split</th><th>Last change</th><th></th></tr></thead>
      <tbody>${data.rows.map(row)}</tbody></table>
      <form class="uw-add form-inline" data-uw-add><label>Add a state <input name="state" maxlength="2" placeholder="e.g. SC" aria-label="New state code" data-uw-add-state></label>
        <label>Underwriter % <input name="pct" inputmode="decimal" placeholder="blank = not set" aria-label="New state underwriter %" data-uw-add-pct maxlength="6"></label>
        <button class="m-btn" type="submit">Add state</button></form></div>
    <div class="card"><h3>Change log</h3><table class="tbl" data-uw-log><thead><tr><th>When</th><th>Who</th><th>State</th><th>Change</th></tr></thead><tbody>
      ${data.log.length ? data.log.map((l) => html`<tr data-uw-log-row="${l.state}" data-log-old="${l.oldPct === null ? '' : l.oldPct}" data-log-new="${l.newPct === null ? '' : l.newPct}"><td class="nowrap">${fmtDateTime(l.at)}</td><td>${l.byName}</td><td>${l.state}${l.added ? html` <span class="pill info">added</span>` : ''}</td>
        <td>${pctText(l.oldPct)} &rarr; <strong>${pctText(l.newPct)}</strong>${l.oldUnderwriter !== l.newUnderwriter && l.oldUnderwriter ? html` <span class="small muted">(${l.oldUnderwriter} &rarr; ${l.newUnderwriter})</span>` : ''}</td></tr>`)
        : html`<tr><td colspan="4" class="muted">No changes yet. Defaults: MD 15%, FL 30%, SC 40%; VA and DC not set.</td></tr>`}</tbody></table></div></section>`;
  return { title: 'Underwriter splits', crumbs: [['Underwriter splits']], body, mount(root) {
    $$('[data-uw-save]', root).forEach((b) => b.addEventListener('click', guard(async () => { const st = b.dataset.uwSave;
      await api.setUnderwriterSplit(st, $(`[data-uw-input="${st}"]`, root).value, $(`[data-uw-name="${st}"]`, root).value); toast(`${st} split saved (logged)`); refresh(); })));
    $('[data-uw-add]', root).addEventListener('submit', guard(async (e) => { e.preventDefault(); const f = e.target;
      const st = String(f.elements.state.value || '').trim().toUpperCase(); if (data.rows.some((r) => r.state === st)) throw new Error(`${st} is already in the list: edit its % above.`);
      await api.setUnderwriterSplit(st, f.elements.pct.value); toast(`${st} added (logged)`); refresh(); }));
  } };
}
