// ACCOUNTING › General › PAYOFFS, TAXES & PRORATIONS (Qualia tabs) and OTHER CONTACTS; plus the H "HOA / Condo / Ground Rent / Payoffs" panel.
// Francis Santos's Qualia training video (John, Nov 4 2026: "yes build it", "mimic Qualia exactly for now"). CLA staff only (the Accounting tab
// already refuses agents and clients). Processor / Admin / Super admin edit; Sales and TCs read. Nothing is sent. No wire instructions, bank
// details or SSNs are stored. Spec: /workspace/francis-videos/payoff-hoa-ffb-gr/PAYOFF-HOA-FFB-GR-SPEC.md, docs/PAYOFFS-HOA-FFB-GR.md.
import { html, raw, $, $$, guard, toast, toText, fmtDate, fmtDateTime } from '../ui.js?v=202611051418';
import * as PO from '../data/payoffs.js?v=202611051418';
import { QUALIA_TABS, PRORATION_CYCLES, computeProration } from '../data/prorations.js?v=202611051418';
const opt = (v, l, sel) => html`<option value="${v}" ${String(v) === String(sel ?? '') ? raw('selected') : ''}>${l}</option>`;
const money = (n) => (n == null || n === '' ? '' : PO.usd(n));   // Qualia shows $301,485.00 in the inputs
const usd = PO.usd;
const helpCards = (title, text) => html`<aside class="qc-help acct-noprint" data-qc-help><div class="qc-help-card" data-qc-help-field><h5 data-po-help-title>${title} <span class="qc-q" aria-hidden="true">?</span></h5><p data-po-help-text>${text}</p></div>
  <div class="qc-help-card qc-help-pre" data-qc-help-pre><h5><span class="qc-dot pre"></span>Precalculated Field</h5><p data-po-pre-text>Blue values are calculated for you. You can type over them.</p></div>
  <div class="qc-help-card qc-help-over" data-qc-help-over><h5><span class="qc-dot over"></span>User Override</h5><p>Orange values were typed over a calculated value. Clear the field (&times;) to go back to the calculated value. Every change is logged.</p></div></aside>`;
const fld = (label, inner, cls = '') => html`<label class="qc-field po-f ${cls}"><span class="qc-label">${label}</span>${inner}</label>`;
const inp = (name, value, attrs = '') => html`<input class="qc-input" name="${name}" value="${value ?? ''}" autocomplete="off"${raw(attrs ? ' ' + attrs : '')}>`;

// =====================================================================  MORTGAGE PAYOFFS  =====================================================================
export async function payoffsView(api, deal, acc, q, base, user = {}) {
  const [P, info, others, notes, folders, log] = await Promise.all([api.listPayoffs(deal.id), api.getPayoffOrderInfo(deal.id), api.listOtherContacts(deal.id), api.listPayoffNotes(deal.id), api.listPayoffFolders(deal.id), api.listPayoffLog(deal.id)]);
  const pos = Math.min(PO.MAX_PAYOFFS, Math.max(1, Number(q.get('p')) || 1)); const cur = P.payoffs.find((p) => p.position === pos) || null; const can = P.canEdit;
  const shown = Math.max(1, ...P.payoffs.map((p) => p.position), Number(q.get('tabs')) || 0, pos);
  const tabs = html`<div class="qc-paytabs po-tabs" data-po-tabs>${PO.PAYOFF_TABS.slice(0, shown).map((t, i) => html`<a class="qc-paytab ${i + 1 === pos ? 'on' : ''}" href="${base}?v=payoffs&p=${i + 1}${shown > 1 ? `&tabs=${shown}` : ''}" data-po-tab="${i + 1}">${t}</a>`)}
    <span class="spacer"></span>${can ? html`<button type="button" class="ghost small qc-sq" data-po-minus title="Retire this payoff" aria-label="Retire this payoff" ${cur ? '' : raw('disabled')}>&ndash;</button><button type="button" class="ghost small qc-sq" data-po-plus title="Add a payoff tab" aria-label="Add a payoff" ${shown >= PO.MAX_PAYOFFS ? raw('disabled') : ''}>+</button>` : ''}</div>`;
  const lenderPick = q.get('lender'); const picked = lenderPick ? others.find((o) => o.id === lenderPick) : null;
  const lender = cur ? cur.lender : picked ? { name: picked.name, phone: picked.phone, address: picked.address, otherContactId: picked.id } : null;
  const empty = !lender ? html`<h4 class="po-sub">Add Payoff</h4>${can ? html`<div class="po-addbox" data-po-add><div class="po-addside"><div class="po-ico" aria-hidden="true">&#128269;</div><h4>Existing Payoff Lender</h4>
        <input class="qc-input" data-po-lender-search placeholder="Search payoff lenders..." autocomplete="off"><div class="po-results" data-po-lender-results></div></div><div class="po-or">OR</div>
      <div class="po-addside"><div class="po-ico" aria-hidden="true">&#10010;</div><h4>New Payoff Lender</h4><button type="button" class="m-btn" data-po-new-lender>Add New Payoff Lender</button>
        <form class="po-newform" data-po-new-lender-form hidden>${fld('NAME', inp('name', '', 'required maxlength="120"'))}${fld('PHONE', inp('phone', '', 'maxlength="40"'))}${fld('PRIMARY ADDRESS', inp('address', '', 'maxlength="200"'))}<button class="m-btn small" type="submit">Add lender to this order</button></form></div></div>`
      : html`<p class="notice info small">No payoff on this tab yet.</p>`}
    ${can && !P.payoffs.length ? html`<p class="small muted po-demo">Testing? <button type="button" class="linkish" data-po-demo>Load the FAKE demo payoff</button> (a fake lender, HOA, FFB utility, ground rent leaseholder and the H lines; nothing is sent).</p>` : ''}` : '';
  const form = lender ? payoffForm(cur, lender, pos, P, can) : '';
  const head = html`<div class="qc-page-head"><span class="qc-chip big" aria-hidden="true">&#9638;</span><h3 data-qc-title>Mortgage Payoffs</h3><span class="spacer"></span>
    <span class="small muted" data-po-sum>${P.payoffs.length ? html`${P.payoffs.length} payoff${P.payoffs.length === 1 ? '' : 's'} &middot; total due <strong data-po-all-total>${usd(P.totalDue)}</strong> &middot; on the ${P.refi ? 'borrower' : 'seller'} side of the CD` : 'No payoffs yet'}</span></div>`;
  const body = html`<div class="qc-wrap po-wrap" data-qc-page="payoffs" data-po-page><div class="qc-main">${head}${can ? '' : html`<p class="notice info small" data-readonly-note>Read only for your role: only a Processor, Admin or Super admin changes payoffs.</p>`}
      ${tabs}${empty}${form}</div>${helpCards('Payoff Total Due', PO.TOTAL_DUE_HELP + '. Precalculated using the value entered for ' + PO.TOTAL_DUE_FROM.join(', ') + '.')}</div>
    ${orderInfoCard(info, can)}${teamCard(deal, P, notes, folders, can, log)}`;
  return { body, mount: (root, c = {}) => mountPayoffs(root, api, deal, P, cur, lender, pos, base, c.refresh || (() => location.reload()), user) };
}

function payoffForm(p, L, pos, P, can) {
  const v = p || { position: pos, recording: {}, items: [], calc: { daysPerYear: '365' }, interestMode: 'to' }; const dis = can ? '' : 'disabled';
  const c = p ? p.calcOut : PO.payoffCalc(v, { closingDate: P.closingDate });
  const items = (v.items && v.items.length ? v.items : []).concat(Array.from({ length: Math.max(0, PO.PAYOFF_ITEM_SUGGESTIONS.length + 1 - (v.items || []).length) }, (_, i) => ({ label: '', amount: null, hint: PO.PAYOFF_ITEM_SUGGESTIONS[(v.items || []).length + i] || '' })));
  const line = ([k, l]) => k === 'interest' ? html`<div class="po-li" data-po-li="interest"><span class="qc-label po-li-l">${l}</span><input class="qc-input num" name="interest" value="${money(v.interest)}" inputmode="decimal" ${raw(dis)} data-po-calc-trigger>
      <span class="po-to" data-po-mode-label>${v.interestMode === 'through' ? 'through' : 'to'}</span><input class="qc-input" type="date" name="interestTo" value="${v.interestTo || ''}" ${raw(dis)} data-po-calc-trigger></div>`
    : k === 'additionalInterest' ? html`<div class="po-li" data-po-li="additionalInterest"><span class="qc-label po-li-l">${l}</span><input class="qc-input num ${v.additionalInterest != null ? 'qc-over' : c.calcAdditional != null ? 'qc-pre' : ''}" name="additionalInterest" value="${money(v.additionalInterest)}" placeholder="${c.calcAdditional != null ? money(c.calcAdditional) : ''}" inputmode="decimal" ${raw(dis)} data-po-calc-trigger data-po-addl></div>`
    : html`<div class="po-li" data-po-li="${k}"><span class="qc-label po-li-l">${l}</span><input class="qc-input num" name="${k}" value="${money(v[k])}" inputmode="decimal" ${raw(dis)}></div>`;
  const cc = v.calc || {};
  const calcPanel = html`<div class="qc-card po-calc" data-po-calc><h5>Interest Date Mode</h5><span class="qc-label">INTEREST CALCULATED</span>
      <div class="seg qc-seg small" data-po-mode>${PO.INTEREST_MODES.map(([k, l]) => html`<button type="button" class="seg-btn ${(v.interestMode || 'to') === k ? 'on' : ''}" data-po-mode-btn="${k}" ${raw(dis)}>${l}</button>`)}</div>
      <h5 class="po-calc-h">Calculate Additional Interest</h5><span class="qc-label">DAYS PER YEAR</span>
      <div class="seg qc-seg small" data-po-dpy>${PO.DAYS_PER_YEAR.map((d) => html`<button type="button" class="seg-btn ${String(cc.daysPerYear || '365') === d ? 'on' : ''}" data-po-dpy-btn="${d}" ${raw(dis)}>${d}</button>`)}</div>
      <div class="po-calc-grid">${fld('FROM', html`<input class="qc-input ${cc.from ? '' : 'qc-pre'}" type="date" name="calcFrom" value="${cc.from || ''}" ${raw(dis)} data-po-calc-trigger data-po-from>`)}${fld('TO', html`<input class="qc-input" type="date" name="calcTo" value="${cc.to || ''}" ${raw(dis)} data-po-calc-trigger>`)}
        ${fld('INTEREST RATE', html`<input class="qc-input num" name="calcRate" value="${cc.rate ?? ''}" placeholder="%" inputmode="decimal" ${raw(dis)} data-po-calc-trigger>`)}
        ${fld('PER DIEM', html`<span class="po-x-wrap"><input class="qc-input num ${cc.perDiem != null ? 'qc-over' : c.calcPerDiem != null ? 'qc-pre' : ''}" name="calcPerDiem" value="${cc.perDiem != null ? Number(cc.perDiem).toFixed(5) : ''}" placeholder="${c.calcPerDiem != null ? Number(c.calcPerDiem).toFixed(5) : ''}" inputmode="decimal" ${raw(dis)} data-po-calc-trigger data-po-perdiem>${cc.perDiem != null && can ? html`<button type="button" class="po-x" data-po-clear="calcPerDiem" title="Back to the precalculated value" aria-label="Clear the per diem override">&times;</button>` : ''}</span>`)}</div>
      <p class="small muted" data-po-calc-text>${c.perDiem != null ? `Per diem ${usd(c.perDiem, 5)}${c.days ? ` × ${c.days} day${c.days === 1 ? '' : 's'} = ${usd(c.calcAdditional)}` : ''}` : 'Per diem is precalculated from ' + PO.PER_DIEM_FROM.join(', ') + '.'}${c.from && !cc.from ? ` FROM defaults to the interest date ${PO.mdy(c.from)}.` : ''}</p></div>`;
  return html`<form class="po-form" data-po-form novalidate><input type="hidden" name="otherContactId" value="${L.otherContactId || ''}">
    <div class="qc-card po-card" data-po-lender><div class="qc-card-head"><h4>Payoff Lender</h4>${can ? html`<div class="qc-card-btns"><button type="button" class="ghost small" data-po-switch>&#8635; Switch Lender</button></div>` : ''}</div>
      <table class="qc-rec po-kv"><tbody><tr><th>NAME</th><td data-po-lender-name>${L.name}</td></tr><tr><th>PHONE</th><td>${L.phone || ''}</td></tr><tr><th>PRIMARY ADDRESS</th><td>${L.address || ''}</td></tr></tbody></table>
      <input type="hidden" name="lenderName" value="${L.name}"><input type="hidden" name="lenderPhone" value="${L.phone || ''}"><input type="hidden" name="lenderAddress" value="${L.address || ''}"></div>
    <div class="qc-card po-card"><div class="qc-card-head"><h4>Payoff Info</h4></div><div class="qc-pf-grid">
      ${fld('LOAN #', inp('loanNumber', v.loanNumber, `maxlength="40" ${dis}`))}${fld('MORTGAGOR SSN', html`<input class="qc-input" disabled placeholder="Never stored in the test portal" data-po-ssn>`)}
      ${fld('CURRENT LIEN HOLDER', inp('lienHolder', v.lienHolder, `maxlength="120" ${dis}`))}${fld('CURRENT TRUSTEE', inp('trustee', v.trustee, `maxlength="120" ${dis}`))}
      ${fld('IS THIS A MORTGAGE, LOAN, OR DEED OF TRUST?', html`<select class="qc-input" name="isMortgage" ${raw(dis)}>${opt('', '—', v.isMortgage == null ? '' : v.isMortgage ? 'yes' : 'no')}${opt('yes', 'Yes', v.isMortgage == null ? '' : v.isMortgage ? 'yes' : 'no')}${opt('no', 'No', v.isMortgage == null ? '' : v.isMortgage ? 'yes' : 'no')}</select>`, 'wide')}</div></div>
    <details class="qc-card po-card" data-po-recording ${Object.keys(v.recording || {}).length ? raw('open') : ''}><summary><h4 class="po-inline-h">Recording Info</h4> <button type="button" class="ghost small" disabled title="Qualia imports these from the title commitment. Not in the test portal.">Import From Commitment</button></summary><div class="qc-pf-grid">
      ${PO.RECORDING_FIELDS.map(([k, l]) => fld(l, k === 'dotDate' || k === 'dateRecorded' ? html`<input class="qc-input" type="date" name="rec_${k}" value="${(v.recording || {})[k] || ''}" ${raw(dis)}>` : inp('rec_' + k, k === 'originalAmount' ? money((v.recording || {})[k]) : (v.recording || {})[k], `maxlength="60" ${dis}`)))}</div></details>
    <div class="qc-card po-card" data-po-lines><div class="qc-card-head"><h4>Line Items</h4>${can ? html`<div class="qc-card-btns"><button type="button" class="ghost small qc-sq" data-po-item-minus title="Remove the last empty line item" aria-label="Remove a line item">&ndash;</button><button type="button" class="ghost small qc-sq" data-po-item-plus title="Add a line item" aria-label="Add a line item">+</button></div>` : ''}</div>
      <div class="po-lines-grid"><div class="po-lines-col">${PO.PAYOFF_LINES.map(line)}
        <div data-po-items>${items.map((it, i) => html`<div class="po-li po-item" data-po-item="${i}"><input class="qc-input po-item-l" name="itemLabel" value="${it.label || ''}" placeholder="${it.hint || 'Label'}" maxlength="80" ${raw(dis)}><input class="qc-input num" name="itemAmount" value="${money(it.amount)}" inputmode="decimal" ${raw(dis)}></div>`)}</div>
        ${fld('GOOD THROUGH DATE', html`<input class="qc-input" type="date" name="goodThrough" value="${v.goodThrough || ''}" ${raw(dis)} data-po-calc-trigger>`, 'po-gt')}</div>${calcPanel}</div></div>
    <div class="po-total" data-po-total><span class="qc-label">TOTAL DUE</span><strong data-po-total-amount>${usd(c.total)}</strong><span class="small" data-po-total-text>${c.parts.length ? c.text : 'Enter the payoff amounts.'}</span></div>
    ${can ? html`<div class="acct-form-actions"><button class="m-btn" type="submit" data-po-save>${p ? 'Save payoff' : 'Add payoff'}</button><span class="muted small">Saving puts the Total Due on the fee ledger: ALTA Payoffs and the ${P.refi ? 'borrower side (refinance payoffs)' : 'seller side of the CD (N, Due from Seller)'}. Logged.</span></div>` : ''}
    <p class="err-text small" data-po-err></p>
    <p class="muted small">Payments: the payoff line's payee is the lender. Choose Check / Wire / Net Funded … on Charges (Fee ledger line "Payoff of …"). Wire instructions and bank details are never stored in the test portal. Marketplace "Order Now" (Qualia's payoff service) is not part of the test portal.</p></form>`;
}

function readPayoffForm(f, pos) {
  const g = (n) => (f.elements[n] ? f.elements[n].value : '');
  const labels = $$('[name=itemLabel]', f).map((i) => i.value); const amts = $$('[name=itemAmount]', f).map((i) => i.value);
  const mode = ($('[data-po-mode-btn].on', f) || {}).dataset; const dpy = ($('[data-po-dpy-btn].on', f) || {}).dataset;
  const rec = Object.fromEntries(PO.RECORDING_FIELDS.map(([k]) => [k, g('rec_' + k)]).filter(([, x]) => x !== ''));
  return { position: pos, lender: { name: g('lenderName'), phone: g('lenderPhone'), address: g('lenderAddress'), otherContactId: g('otherContactId') || null }, loanNumber: g('loanNumber'), lienHolder: g('lienHolder'), trustee: g('trustee'),
    isMortgage: g('isMortgage') === 'yes' ? true : g('isMortgage') === 'no' ? false : null, recording: rec,
    ...Object.fromEntries(PO.PAYOFF_LINES.map(([k]) => [k, g(k)])), interestTo: g('interestTo'), interestMode: mode ? mode.poModeBtn : 'to',
    calc: { daysPerYear: dpy ? dpy.poDpyBtn : '365', from: g('calcFrom'), to: g('calcTo'), rate: g('calcRate'), perDiem: g('calcPerDiem') },
    items: labels.map((label, i) => ({ label, amount: amts[i] })).filter((it) => it.label || it.amount), goodThrough: g('goodThrough') };
}

function orderInfoCard(info, can) {
  const d = info.data || {}; const dis = can ? '' : 'disabled'; const sel = (n, list) => html`<select class="qc-input" name="${n}" ${raw(dis)}>${list.map(([k, l]) => opt(k, l, d[n] || ''))}</select>`;
  return html`<form class="card po-info" data-po-info novalidate><div class="acct-card-head"><h3>Order Info: payoff, HOA, FFB &amp; ground rent</h3><span class="muted small">${info.updatedAt ? `Saved ${fmtDateTime(info.updatedAt)} by ${info.updatedByName}` : 'Not saved yet'}</span></div>
    <div class="qc-pf-grid">${fld('PROPERTY TYPE', sel('propertyType', PO.PROPERTY_TYPES))}${fld('NEED PAYOFF?', sel('needPayoff', PO.YES_NO_VERIFY))}${fld('TOTAL NOS. DEED OF TRUST', inp('deedsOfTrust', d.deedsOfTrust, `inputmode="numeric" maxlength="1" ${dis}`))}
      ${fld('HOA', sel('hoa', PO.YES_NO_VERIFY))}${fld('CONDO', sel('condo', PO.YES_NO_VERIFY))}${fld('DEFERRED WATER / FFB', sel('ffb', PO.YES_NO_VERIFY))}
      ${fld('GROUND RENT', sel('groundRent', PO.YES_NO_VERIFY))}${fld('SEE CONTRACT PAGE', inp('grContractPage', d.grContractPage, `maxlength="20" placeholder="e.g. 30" ${dis} data-po-grpage`))}${fld('REDEMPTION', sel('redemption', PO.REDEMPTION))}
      <label class="check po-check"><input type="checkbox" name="sdatGrRegistration" ${d.sdatGrRegistration ? raw('checked') : ''} ${raw(dis)}> SDAT: Ground Rent Registration on File</label>
      <label class="check po-check"><input type="checkbox" name="sdatGrRedemption" ${d.sdatGrRedemption ? raw('checked') : ''} ${raw(dis)}> SDAT: Ground Rent Redemption on File</label>
      ${fld('REDEMPTION NOTE', inp('redemptionNote', d.redemptionNote, `maxlength="500" ${dis}`), 'wide')}</div>
    ${info.lines.length ? html`<pre class="po-orderinfo" data-po-orderinfo>${info.lines.join('\n')}</pre>` : ''}
    ${can ? html`<div class="acct-form-actions"><button class="m-btn small" type="submit" data-po-info-save>Save order info</button><span class="muted small">Shown as the ORDER INFO lines (e.g. "GROUND RENT - YES - SEE CONTRACT PAGE 30"). Logged.</span></div>` : ''}<p class="err-text small" data-po-info-err></p></form>`;
}

function teamCard(deal, P, notes, folders, can, log) {
  const bySec = PO.NOTE_SECTIONS.map(([k, l]) => [k, l, notes.filter((n) => n.section === k)]);
  return html`<div class="card po-team" data-po-team><div class="acct-card-head"><h3>Payoff team: tasks, notes &amp; documents</h3><span class="muted small">Staff only. Nothing is sent.</span></div>
    <div class="po-team-grid"><div><h4>Pre-Closing tasks</h4><p class="small muted">${PO.PAYOFF_TASKS.map((t) => t.title).join(' · ')}. "Update Payoff" is due on the first payoff's good-through date.</p>
        ${can ? html`<button type="button" class="m-btn small" data-po-tasks>Add Pre-Closing payoff tasks</button>` : ''} <a class="linkish small" href="#/deals/${deal.id}/tasks">Open Tasks</a>
        <h4>Documents</h4><ul class="small po-folders" data-po-folders>${folders.length ? folders.map((f) => html`<li data-po-folder="${f.name}">&#128193; ${f.name} <span class="muted">(${f.count})</span></li>`) : html`<li class="muted">No payoff folders yet.</li>`}</ul>
        ${can && folders.length < PO.PAYOFF_FOLDERS.length ? html`<button type="button" class="ghost small" data-po-folders-btn>Create "${PO.PAYOFF_FOLDER_ROOT}" folders</button>` : ''} <a class="linkish small" href="#/deals/${deal.id}/documents">Open Documents</a>
        <h4>Payoff history</h4><ul class="small po-log" data-po-log>${log.slice(0, 8).map((l) => html`<li>${fmtDateTime(l.at)} · ${l.byName} · ${l.what}: ${l.action}</li>`)}${log.length ? '' : html`<li class="muted">Nothing yet.</li>`}</ul></div>
      <div><h4>Notes</h4>${can ? html`<form class="po-note-form" data-po-note-form novalidate><div class="qc-inline"><select class="qc-input" name="section" data-po-note-sec>${PO.NOTE_SECTIONS.map(([k, l]) => opt(k, l, 'payoff'))}</select>
          <label class="check small"><input type="checkbox" name="critical"> Critical Issue</label></div>
          <div class="po-quick" data-po-quick>${PO.QUICK_NOTES.map(([k, l]) => html`<button type="button" class="ghost small" data-po-quick-btn="${k}">${l.replace('{gt}', 'mm/dd')}</button>`)}</div>
          <textarea class="qc-input" name="body" rows="4" maxlength="4000" placeholder="# PAYOFF TEAM&#10;## PAYOFF - Lender --&#10;11.04 Name - RECEIVED - GT 11.27" data-po-note-body></textarea>
          <div class="acct-form-actions"><button class="m-btn small" type="submit" data-po-note-save>Add Note</button><span class="muted small">Markdown, like Qualia's notes. Logged.</span></div><p class="err-text small" data-po-note-err></p></form>` : ''}
        ${bySec.map(([k, l, list]) => list.length ? html`<div class="po-notes" data-po-notes="${k}"><h5>${l}</h5>${list.map((n) => html`<div class="po-note ${n.critical ? 'is-critical' : ''}" data-po-note="${n.id}"><div class="small muted">${n.byName} · ${fmtDateTime(n.createdAt)}${n.updatedAt ? ` · edited by ${n.editedByName}` : ''}${n.critical ? ' · CRITICAL' : ''}</div><pre>${n.body}</pre></div>`)}</div>` : '')}</div></div></div>`;
}

function mountPayoffs(root, api, deal, P, cur, lender, pos, base, refresh, user = {}) {
  const go = (h) => { if (h) location.hash = h; else refresh(); };
  const plus = $('[data-po-plus]', root); if (plus) plus.addEventListener('click', () => { const n = Math.min(PO.MAX_PAYOFFS, Math.max(...P.payoffs.map((p) => p.position), pos, Number(new URLSearchParams(location.hash.split('?')[1] || '').get('tabs')) || 1) + 1); go(`${base}?v=payoffs&p=${n}&tabs=${n}`); });
  const minus = $('[data-po-minus]', root); if (minus && cur) minus.addEventListener('click', guard(async () => { if (!confirm(`Retire the ${PO.PAYOFF_TABS[pos - 1]}? Its fee-ledger line comes off the CD; both are kept in the history.`)) return; await api.retirePayoff(cur.id); toast('Payoff retired (kept in the history).'); go(`${base}?v=payoffs&p=1`); }));
  const demo = $('[data-po-demo]', root); if (demo) demo.addEventListener('click', guard(async () => { const r = await api.loadPayoffDemo(deal.id); toast(`FAKE demo loaded: payoff total ${usd(r.payoff.total)}, ${r.lines} H lines.`); go(`${base}?v=payoffs&p=1`); }));
  // Add Payoff: Existing Payoff Lender OR New Payoff Lender
  const search = $('[data-po-lender-search]', root);
  if (search) { const out = $('[data-po-lender-results]', root); const run = guard(async () => { const list = await api.searchOtherCompanies(search.value, 'payoffLender');
      out.innerHTML = toText(list.length ? list.map((c) => html`<button type="button" class="po-result" data-po-pick="${c.id}"><strong>${c.name}</strong><span class="small muted">${c.address}</span></button>`) : html`<p class="small muted">No payoff lender found. Add a new one.</p>`);
      $$('[data-po-pick]', out).forEach((b) => b.addEventListener('click', guard(async () => { const others = await api.listOtherContacts(deal.id); const ex = others.find((o) => o.companyId === b.dataset.poPick && o.type === 'payoffLender');
        const oc = ex || await api.addOtherContact(deal.id, b.dataset.poPick, 'payoffLender'); go(`${base}?v=payoffs&p=${pos}&lender=${oc.id}`); }))); });
    search.addEventListener('input', run); search.addEventListener('focus', run); }
  const nb = $('[data-po-new-lender]', root); if (nb) nb.addEventListener('click', () => { $('[data-po-new-lender-form]', root).hidden = false; nb.hidden = true; });
  const nf = $('[data-po-new-lender-form]', root); if (nf) nf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(nf).entries());
    const c = await api.createOtherCompany({ ...v, type: 'payoffLender' }); const oc = await api.addOtherContact(deal.id, c.id, 'payoffLender'); toast('Payoff lender added to this order.'); go(`${base}?v=payoffs&p=${pos}&lender=${oc.id}`); }));
  const f = $('[data-po-form]', root);
  if (f) {
    const recalc = () => { let c; try { const v = PO.cleanPayoff(readPayoffForm(f, pos)); c = PO.payoffCalc(v, { closingDate: P.closingDate }); } catch (e) { $('[data-po-total-text]', f).textContent = e.message; return; }
      $('[data-po-total-amount]', f).textContent = usd(c.total); $('[data-po-total-text]', f).textContent = c.parts.length ? c.text : 'Enter the payoff amounts.';
      const pd = $('[data-po-perdiem]', f); pd.placeholder = c.calcPerDiem != null ? c.calcPerDiem.toFixed(5) : ''; pd.classList.toggle('qc-over', pd.value !== ''); pd.classList.toggle('qc-pre', pd.value === '' && c.calcPerDiem != null);
      const ad = $('[data-po-addl]', f); ad.placeholder = c.calcAdditional != null ? c.calcAdditional.toFixed(2) : ''; ad.classList.toggle('qc-over', ad.value !== ''); ad.classList.toggle('qc-pre', ad.value === '' && c.calcAdditional != null);
      const fr = $('[data-po-from]', f); if (!fr.value && c.from) fr.placeholder = c.from;
      $('[data-po-calc-text]', f).textContent = c.perDiem != null ? `Per diem ${usd(c.perDiem, 5)}${c.days ? ` × ${c.days} day${c.days === 1 ? '' : 's'} = ${usd(c.calcAdditional)}` : ''}` : 'Per diem is precalculated from ' + PO.PER_DIEM_FROM.join(', ') + '.'; if (c.from && !fr.value) $('[data-po-calc-text]', f).textContent += ` FROM defaults to the interest date ${PO.mdy(c.from)}.`; };
    $$('input,select', f).forEach((i) => i.addEventListener('input', recalc));
    $$('[data-po-mode-btn]', f).forEach((b) => b.addEventListener('click', () => { $$('[data-po-mode-btn]', f).forEach((x) => x.classList.toggle('on', x === b)); $('[data-po-mode-label]', f).textContent = b.dataset.poModeBtn; recalc(); }));
    $$('[data-po-dpy-btn]', f).forEach((b) => b.addEventListener('click', () => { $$('[data-po-dpy-btn]', f).forEach((x) => x.classList.toggle('on', x === b)); recalc(); }));
    $$('[data-po-clear]', f).forEach((b) => b.addEventListener('click', () => { f.elements[b.dataset.poClear].value = ''; b.remove(); recalc(); }));
    const ip = $('[data-po-item-plus]', f); if (ip) ip.addEventListener('click', () => { const box = $('[data-po-items]', f); const n = $$('[data-po-item]', box).length; if (n >= PO.MAX_ITEMS) return toast(`At most ${PO.MAX_ITEMS} line items.`, 'err');
      box.insertAdjacentHTML('beforeend', toText(html`<div class="po-li po-item" data-po-item="${n}"><input class="qc-input po-item-l" name="itemLabel" placeholder="Label" maxlength="80"><input class="qc-input num" name="itemAmount" inputmode="decimal"></div>`)); $$('input', box.lastElementChild).forEach((i) => i.addEventListener('input', recalc)); });
    const im = $('[data-po-item-minus]', f); if (im) im.addEventListener('click', () => { const rows = $$('[data-po-item]', f); const last = rows.reverse().find((r) => !$$('input', r).some((i) => i.value)); if (last) last.remove(); });
    const sw = $('[data-po-switch]', root); if (sw) sw.addEventListener('click', () => go(`${base}?v=payoffs&p=${pos}&switch=1`));
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('switch') === '1') { const card = $('[data-po-lender]', f); card.insertAdjacentHTML('beforeend', toText(html`<div class="po-switch" data-po-switch-box><input class="qc-input" data-po-switch-search placeholder="Search payoff lenders..."><div data-po-switch-results></div></div>`));
      const s2 = $('[data-po-switch-search]', f); s2.addEventListener('input', guard(async () => { const list = await api.searchOtherCompanies(s2.value, 'payoffLender'); const out = $('[data-po-switch-results]', f);
        out.innerHTML = toText(list.map((c) => html`<button type="button" class="po-result" data-po-switch-pick="${c.id}"><strong>${c.name}</strong></button>`));
        $$('[data-po-switch-pick]', out).forEach((b) => b.addEventListener('click', guard(async () => { const others = await api.listOtherContacts(deal.id); const ex = others.find((o) => o.companyId === b.dataset.poSwitchPick && o.type === 'payoffLender');
          const oc = ex || await api.addOtherContact(deal.id, b.dataset.poSwitchPick, 'payoffLender'); f.elements.otherContactId.value = oc.id; f.elements.lenderName.value = oc.name; f.elements.lenderPhone.value = oc.phone; f.elements.lenderAddress.value = oc.address;
          $('[data-po-lender-name]', f).textContent = oc.name; toast('Lender switched. Save the payoff to keep it.'); }))); })); }
    f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const err = $('[data-po-err]', f); err.textContent = '';
      try { const p = await api.savePayoff(deal.id, readPayoffForm(f, pos)); toast(`${PO.PAYOFF_TABS[pos - 1]} saved: total due ${usd(p.total)} (on the CD, logged).`); go(`${base}?v=payoffs&p=${pos}`); } catch (x) { err.textContent = x.message; throw x; } }));
    recalc();
  }
  const inf = $('[data-po-info]', root); if (inf && $('[data-po-info-save]', inf)) inf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const err = $('[data-po-info-err]', inf); err.textContent = '';
    const v = Object.fromEntries(new FormData(inf).entries()); v.sdatGrRegistration = !!inf.elements.sdatGrRegistration.checked; v.sdatGrRedemption = !!inf.elements.sdatGrRedemption.checked;
    try { await api.savePayoffOrderInfo(deal.id, v); toast('Order info saved (logged).'); refresh(); } catch (x) { err.textContent = x.message; throw x; } }));
  const tb = $('[data-po-tasks]', root); if (tb) tb.addEventListener('click', guard(async () => { const r = await api.addPayoffTasks(deal.id); toast(`${r.added} Pre-Closing task${r.added === 1 ? '' : 's'} added${r.skipped ? `, ${r.skipped} already there` : ''}.`); refresh(); }));
  const fb = $('[data-po-folders-btn]', root); if (fb) fb.addEventListener('click', guard(async () => { await api.ensurePayoffFolders(deal.id); toast('Payoff folders created (staff only).'); refresh(); }));
  const nf2 = $('[data-po-note-form]', root);
  if (nf2) { const body = $('[data-po-note-body]', nf2);
    $$('[data-po-quick-btn]', nf2).forEach((b) => b.addEventListener('click', () => { const today = new Date().toISOString().slice(0, 10); const first = (P.payoffs[0] || {}).goodThrough || null;
      const line = PO.quickNote(b.dataset.poQuickBtn, { today, firstName: user.firstName || 'Staff', goodThrough: first }); body.value = body.value ? body.value.replace(/\s*$/, '') + '\n' + line : line; body.focus(); }));
    nf2.addEventListener('submit', guard(async (e) => { e.preventDefault(); const err = $('[data-po-note-err]', nf2); err.textContent = '';
      try { await api.addPayoffNote(deal.id, { section: nf2.elements.section.value, body: body.value, critical: nf2.elements.critical.checked }); toast('Note added (logged).'); refresh(); } catch (x) { err.textContent = x.message; throw x; } })); }
}

// =====================================================================  TAXES & PRORATIONS (Qualia tabs)  =====================================================================
const TAB_ITEM = Object.fromEntries(QUALIA_TABS.map(([k, , , item]) => [k, item]));
const TAB_TYPE = Object.fromEntries(QUALIA_TABS.map(([k, , t]) => [k, t]));
export async function taxesView(api, deal, acc, q, base) {
  const fees = acc.entries.filter((e) => e.proration && e.proration.tab && !e.retired);
  const typeOfKey = (k) => ({ t: 'tax', r: 'rent' })[String(k).slice(7, 8)] || 'basic';   // custom-<t|r|b><random>
  const custom = fees.filter((e) => /^custom-/.test(e.proration.tab)).map((e) => [e.proration.tab, e.proration.name || e.description, typeOfKey(e.proration.tab)]);
  const extra = q.get('new') ? [[q.get('new'), q.get('name') || 'New proration', ['basic', 'tax', 'rent'].includes(q.get('type')) ? q.get('type') : 'basic']] : [];
  const tabs = [...QUALIA_TABS.map(([k, l, t]) => [k, l, t]), ...custom, ...extra.filter(([k]) => !custom.some(([c]) => c === k))];
  const tab = tabs.some(([k]) => k === q.get('t')) ? q.get('t') : tabs[0][0]; const [, label, type] = tabs.find(([k]) => k === tab);
  const fee = fees.find((e) => e.proration.tab === tab) || null; const can = acc.canEdit; const sd = acc.closingDate;
  const head = html`<div class="qc-page-head"><span class="qc-chip big" aria-hidden="true">&#127963;</span><h3 data-qc-title>Taxes &amp; Prorations</h3><span class="spacer"></span></div>`;
  const tabBar = html`<div class="qc-paytabs po-tabs" data-tx-tabs>${tabs.map(([k, l]) => html`<a class="qc-paytab ${k === tab ? 'on' : ''}" href="${base}?v=taxes&t=${k}${extra.length && k === extra[0][0] ? `&new=${k}&name=${encodeURIComponent(extra[0][1])}&type=${extra[0][2]}` : ''}" data-tx-tab="${k}">${l}${fees.some((e) => e.proration.tab === k) ? html` <span class="po-dotset" title="Saved">&bull;</span>` : ''}</a>`)}
    <span class="spacer"></span>${can ? html`<button type="button" class="ghost small qc-sq" data-tx-gear title="Settings" aria-label="Settings">&#9881;</button><button type="button" class="ghost small qc-sq" data-tx-minus title="Retire this proration" aria-label="Retire this proration" ${fee ? '' : raw('disabled')}>&ndash;</button><button type="button" class="ghost small qc-sq" data-tx-plus title="Add a tax / proration" aria-label="Add a tax or proration">+</button>` : ''}</div>`;
  const plusPop = can ? html`<form class="qc-card po-pop" data-tx-plus-pop hidden><span class="qc-label">PRORATION TYPE</span><div class="seg qc-seg small" data-tx-ptype>${[['basic', 'Basic'], ['tax', 'Tax'], ['rent', 'Rent']].map(([k, l], i) => html`<button type="button" class="seg-btn ${i === 0 ? 'on' : ''}" data-tx-ptype-btn="${k}">${l}</button>`)}</div>
      ${fld('TAX / PRORATION NAME', html`<input class="qc-input" name="pname" maxlength="80" placeholder="e.g. Front Foot Benefit">`)}<button class="m-btn small" type="submit" data-tx-create>Create Tax / Proration</button></form>` : '';
  const body = acc.refi ? html`<p class="notice info" data-proration-refi>A refinance has no seller side, so there is nothing to prorate between a buyer and a seller.</p>` : taxForm(fee, tab, label, type, sd, can);
  return { body: html`<div class="qc-wrap" data-qc-page="taxes" data-tx-page="${tab}"><div class="qc-main">${head}${tabBar}${plusPop}${body}</div>${helpCards('Proration Date', 'The proration date is the closing (settlement) date from the order. Prorated Amount = number of days times the per diem (4 decimals). The period end date is the first day of the next period. With "Proration date debited to Seller" (Qualia\'s setting in the video) the seller has the proration day.')}</div>`,
    mount: (root, c = {}) => mountTaxes(root, api, deal, acc, fee, tab, label, type, base, c.refresh || (() => location.reload())) };
}

function taxForm(fee, tab, label, type, sd, can) {
  const p = fee ? fee.proration : { cycle: type === 'basic' && tab === 'hoa' ? 'monthly' : 'annual', debitedTo: 'seller', prorateUsing: type === 'tax' ? 'installment' : 'perDiem', daysPerYear: '365', status: 'paid' };
  const dis = can ? '' : 'disabled'; const inst = (p.prorateUsing || (type === 'tax' ? 'installment' : 'perDiem')) === 'installment';
  const L = inst ? { len: 'PAYMENT SCHEDULE', amt: 'INSTALLMENT AMOUNT', start: 'INSTALLMENT START DATE', end: 'INSTALLMENT END DATE' } : { len: 'PERIOD LENGTH', amt: 'TOTAL AMOUNT', start: 'PERIOD START DATE', end: 'PERIOD END DATE' };
  const ti = p.taxInfo || {};
  const settings = html`<div class="qc-card po-pop" data-tx-settings hidden><h5>Settings</h5><span class="qc-label">PRORATE USING</span><div class="seg qc-seg small" data-tx-using>${[['installment', 'Installment Amount'], ['perDiem', 'Per Diem']].map(([k, l]) => html`<button type="button" class="seg-btn ${(inst ? 'installment' : 'perDiem') === k ? 'on' : ''}" data-tx-using-btn="${k}" ${raw(dis)}>${l}</button>`)}</div>
      <span class="qc-label">DAYS PER YEAR</span><div class="seg qc-seg small" data-tx-dpy>${['360', '365', '366'].map((d) => html`<button type="button" class="seg-btn ${String(p.daysPerYear || '365') === d ? 'on' : ''}" data-tx-dpy-btn="${d}" ${raw(dis)}>${d}</button>`)}</div>
      <span class="qc-label">PRORATION DATE DEBITED TO</span><div class="seg qc-seg small" data-tx-deb>${[['buyer', 'Buyer'], ['seller', 'Seller']].map(([k, l]) => html`<button type="button" class="seg-btn ${(p.debitedTo || 'buyer') === k ? 'on' : ''}" data-tx-deb-btn="${k}" ${raw(dis)}>${l}</button>`)}</div>
      <label class="check small"><input type="checkbox" disabled> Include In 1099 <span class="muted">(not in the test portal)</span></label></div>`;
  const taxInfo = type === 'tax' ? html`<h4 class="po-sub">Tax Info</h4><div class="qc-pf-grid">${fld('ANNUAL AMOUNT', inp('annualAmount', money(ti.annualAmount), `inputmode="decimal" ${dis}`))}${fld('PARCEL ID', inp('parcelId', ti.parcelId, `maxlength="40" ${dis}`))}
      ${fld('PAID THRU', html`<input class="qc-input" type="date" name="paidThru" value="${ti.paidThru || ''}" ${raw(dis)}>`)}${fld('NEXT DUE', html`<input class="qc-input" type="date" name="nextDue" value="${ti.nextDue || ''}" ${raw(dis)}>`)}
      ${fld('PAYMENT SCHEDULE', html`<select class="qc-input" name="schedule" ${raw(dis)}>${opt('', '—', ti.schedule)}${PRORATION_CYCLES.map(([k, l]) => opt(k, l, ti.schedule))}</select>`)}</div>` : '';
  return html`<form class="po-form" data-tx-form novalidate>${settings}${taxInfo}<h4 class="po-sub">Proration</h4>
    ${type !== 'tax' ? fld('NAME', inp('name', p.name || (fee ? fee.description : tab === 'groundRent' ? 'Ground Rent Annual Fee' : tab === 'hoa' ? 'HOA/Condo Fee' : label), `maxlength="80" ${dis}`), 'po-wide') : ''}
    <div class="po-grid4">${fld(L.len, html`<select class="qc-input" name="cycle" ${raw(dis)} data-tx-calc>${PRORATION_CYCLES.map(([k, l]) => opt(k, l, p.cycle))}</select>`)}
      ${fld(L.start, html`<input class="qc-input" type="date" name="periodStart" value="${p.periodStart || ''}" ${raw(dis)} data-tx-calc>`, 'po-blue')}
      ${fld('PRORATION DATE', html`<input class="qc-input qc-pre" type="date" value="${sd || ''}" disabled data-tx-prodate title="The closing date from the order">`, 'po-blue')}
      ${fld(L.end, html`<input class="qc-input qc-pre" type="date" value="" disabled data-tx-end>`, 'po-blue')}</div>
    <div class="po-grid3">${fld(L.amt, inp('cycleAmount', fee ? money(p.cycleAmount) : '', `inputmode="decimal" ${dis} data-tx-calc`))}${fld('NUMBER OF DAYS IN PERIOD', html`<input class="qc-input qc-pre" disabled data-tx-days>`, 'po-blue')}${fld('PER DIEM', html`<input class="qc-input qc-pre" disabled data-tx-perdiem>`, 'po-blue')}</div>
    <div class="po-prorated" data-tx-result><div><span class="po-green po-res-l" data-tx-result-label>Prorated Amount</span><input class="qc-input" disabled data-tx-amount></div>
      <div><span class="qc-label">Debited Party</span><div class="seg qc-seg" data-tx-party>${[['paid', 'Buyer Owes Seller'], ['unpaid', 'Seller Owes Buyer']].map(([k, l]) => html`<button type="button" class="seg-btn ${(p.status || 'paid') === k ? 'on' : ''}" data-tx-party-btn="${k}" ${raw(dis)}>${l}</button>`)}</div></div></div>
    <p class="small" data-tx-msg></p>
    ${can ? html`<div class="acct-form-actions"><button class="m-btn" type="submit" data-tx-save>${fee ? 'Save proration' : 'Add proration'}</button><span class="muted small">On the fee ledger (ALTA Prorations / Adjustments; CD K / M when the buyer owes the seller, L / N when the seller owes the buyer). Logged.</span></div>` : ''}
    <p class="err-text small" data-tx-err></p></form>`;
}

function mountTaxes(root, api, deal, acc, fee, tab, label, type, base, refresh) {
  const plus = $('[data-tx-plus]', root); const pop = $('[data-tx-plus-pop]', root);
  if (plus && pop) { plus.addEventListener('click', () => { pop.hidden = !pop.hidden; });
    $$('[data-tx-ptype-btn]', pop).forEach((b) => b.addEventListener('click', () => $$('[data-tx-ptype-btn]', pop).forEach((x) => x.classList.toggle('on', x === b))));
    pop.addEventListener('submit', (e) => { e.preventDefault(); const name = pop.elements.pname.value.trim() || 'New proration'; const t = $('[data-tx-ptype-btn].on', pop).dataset.txPtypeBtn; const k = 'custom-' + t[0] + Math.random().toString(36).slice(2, 10);
      location.hash = `${base}?v=taxes&t=${k}&new=${k}&name=${encodeURIComponent(name)}&type=${t}`; }); }
  const gear = $('[data-tx-gear]', root); const st = $('[data-tx-settings]', root); if (gear && st) gear.addEventListener('click', () => { st.hidden = !st.hidden; });
  const minus = $('[data-tx-minus]', root); if (minus && fee) minus.addEventListener('click', guard(async () => { if (!confirm(`Retire the ${label} proration? It comes off the ALTA and CD; it is kept in the history.`)) return; await api.retireAccountingFee(fee.id, true); toast('Proration retired (kept in the history).'); refresh(); }));
  const f = $('[data-tx-form]', root); if (!f) return;
  const on = (sel, attr) => { const b = $(sel + '.on', f); return b ? b.dataset[attr] : null; };
  const seg = (sel) => $$(sel, f).forEach((b) => b.addEventListener('click', () => { $$(sel, f).forEach((x) => x.classList.toggle('on', x === b)); calc(); }));
  const read = () => { const g = (n) => (f.elements[n] ? f.elements[n].value : '');
    const dpy = on('[data-tx-dpy-btn]', 'txDpyBtn') || '365'; const using = on('[data-tx-using-btn]', 'txUsingBtn') || 'perDiem';
    const p = { item: TAB_ITEM[tab] || (type === 'rent' ? 'groundRent' : type === 'tax' ? 'countyTaxes' : 'other'), cycle: g('cycle'), cycleAmount: g('cycleAmount'), periodStart: g('periodStart'), basis: dpy === '360' ? '360' : 'installment', status: on('[data-tx-party-btn]', 'txPartyBtn') || 'paid',
      debitedTo: on('[data-tx-deb-btn]', 'txDebBtn') || 'buyer', perDiemDp: 4, tab, prorateUsing: using, daysPerYear: dpy };
    const nm = g('name') || label; p.name = nm;
    if (type === 'tax') p.taxInfo = Object.fromEntries([['annualAmount', g('annualAmount')], ['parcelId', g('parcelId')], ['paidThru', g('paidThru')], ['nextDue', g('nextDue')], ['schedule', g('schedule')]].filter(([, x]) => x));
    return p; };
  const calc = () => { const msg = $('[data-tx-msg]', f); const p = read(); if (!p.cycleAmount || !p.periodStart) { msg.textContent = 'Enter the amount and the start date to see the proration.'; msg.className = 'small muted'; return null; }
    try { const c = computeProration(p, acc.closingDate); $('[data-tx-end]', f).value = c.endExclusive; $('[data-tx-days]', f).value = c.totalDays; $('[data-tx-perdiem]', f).value = '$' + c.perDiem.toFixed(4);
      $('[data-tx-amount]', f).value = usd(c.amount); $('[data-tx-result-label]', f).textContent = `Prorated Amount (${c.days} days times $${String(Number(c.perDiem.toFixed(4)))})`; msg.textContent = c.text; msg.className = 'small muted'; return c; }
    catch (e) { msg.textContent = e.message; msg.className = 'small warn-text'; $('[data-tx-amount]', f).value = ''; return null; } };
  ['[data-tx-party-btn]', '[data-tx-dpy-btn]', '[data-tx-deb-btn]', '[data-tx-using-btn]'].forEach(seg);
  $$('[data-tx-calc], input, select', f).forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', calc));
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const err = $('[data-tx-err]', f); err.textContent = ''; const p = read();
    const input = { kind: 'credit', altaSection: 'prorations', cdSection: '', description: p.name || label, proration: p, presetKey: 'qtab:' + tab, note: '' };
    try { if (fee) { await api.updateAccountingFee(fee.id, input); toast('Proration saved (logged).'); } else { await api.addAccountingFee(deal.id, input); toast('Proration added (logged).'); } location.hash = `${base}?v=taxes&t=${tab}`; refresh(); }
    catch (x) { err.textContent = x.message; throw x; } }));
  calc();
}

// =====================================================================  OTHER CONTACTS  =====================================================================
export async function otherContactsView(api, deal, acc, q, base) {
  const list = await api.listOtherContacts(deal.id); const can = acc.canEdit; const sel = list.find((o) => o.id === q.get('c')) || (q.get('add') ? null : list[0]) || null; const addType = q.get('add');
  const pills = html`<div class="qc-paytabs po-tabs" data-oc-pills>${list.map((o) => html`<a class="qc-paytab ${sel && o.id === sel.id ? 'on' : ''}" href="${base}?v=othercontacts&c=${o.id}" data-oc-pill="${o.id}" title="${o.typeLabel}">${o.name}</a>`)}
    <span class="spacer"></span>${can ? html`<button type="button" class="ghost small qc-sq" data-oc-minus ${sel ? '' : raw('disabled')} title="Remove from this order" aria-label="Remove from this order">&ndash;</button><a class="ghost small qc-sq btn-like" href="${base}?v=othercontacts&add=choose" data-oc-plus title="Add a contact" aria-label="Add a contact">+</a>` : ''}</div>`;
  let main;
  if (addType && can) {
    const t = PO.OTHER_CONTACT_TYPES.some(([k]) => k === addType) ? addType : null; const tl = t ? PO.otherTypeLabel(t) : '';
    main = !t ? html`<div class="po-choose" data-oc-choose><h4>Choose a type of contact to add to this order</h4><select class="qc-input" data-oc-type><option value="">Select Contact Type</option>${PO.OTHER_CONTACT_TYPES.map(([k, l]) => opt(k, l, ''))}</select></div>`
      : html`<h4 class="po-sub" data-oc-addhead>Add a <select class="qc-input po-inline-sel" data-oc-type>${PO.OTHER_CONTACT_TYPES.map(([k, l]) => opt(k, l, t))}</select> to this order</h4>
        <div class="po-addbox" data-oc-add="${t}"><div class="po-addside"><div class="po-ico" aria-hidden="true">&#128269;</div><h4>Existing ${tl}</h4><input class="qc-input" data-oc-search placeholder="Search for ${tl.toLowerCase()}..." autocomplete="off"><div class="po-results" data-oc-results></div></div>
          <div class="po-or">OR</div><div class="po-addside"><div class="po-ico" aria-hidden="true">&#10010;</div><h4>New ${tl}</h4><button type="button" class="m-btn" data-oc-new>Add New ${tl}</button>
          <form class="po-newform" data-oc-new-form hidden>${fld('NAME', inp('name', '', 'required maxlength="120"'))}${fld('PHONE', inp('phone', '', 'maxlength="40"'))}${fld('FAX', inp('fax', '', 'maxlength="40"'))}${fld('PRIMARY ADDRESS', inp('address', '', 'maxlength="200"'))}
            <p class="small muted">Search Existing first: a company already in the list is reused (one global contact).</p><button class="m-btn small" type="submit" data-oc-create>Add ${tl}</button></form></div></div>`;
  } else if (sel) {
    const mt = PO.MANAGED_TYPES[sel.type];
    main = html`<div class="qc-card po-card" data-oc-card="${sel.id}"><div class="qc-card-head"><h4>${sel.typeLabel}</h4>${can ? html`<div class="qc-card-btns"><button type="button" class="ghost small" data-oc-edit>Edit Global Contact</button>${mt ? html`<button type="button" class="ghost small" data-oc-switch>&#8635; Switch ${PO.otherTypeLabel(mt)}</button>` : ''}</div>` : ''}</div>
      <table class="qc-rec po-kv"><tbody><tr><th>NAME</th><td data-oc-name>${sel.name}</td></tr>${sel.phone ? html`<tr><th>PHONE</th><td>${sel.phone}</td></tr>` : ''}${sel.fax ? html`<tr><th>FAX</th><td>${sel.fax}</td></tr>` : ''}<tr><th>PRIMARY ADDRESS</th><td>${sel.address}</td></tr>
        ${mt ? html`<tr><th>${PO.otherTypeLabel(mt).toUpperCase()}</th><td data-oc-mgmt>${sel.management ? sel.management.name : html`<span class="muted">Not set</span>`}</td></tr>` : ''}</tbody></table>
      <form class="po-newform" data-oc-edit-form hidden>${fld('NAME', inp('name', sel.name, 'required maxlength="120"'))}${fld('PHONE', inp('phone', sel.phone, 'maxlength="40"'))}${fld('FAX', inp('fax', sel.fax, 'maxlength="40"'))}${fld('PRIMARY ADDRESS', inp('address', sel.address, 'maxlength="200"'))}<button class="m-btn small" type="submit">Save global contact</button><span class="small muted"> Changes this company on every order.</span></form>
      ${mt ? html`<div class="po-switch" data-oc-switch-box hidden><input class="qc-input" data-oc-switch-search placeholder="Search ${PO.otherTypeLabel(mt).toLowerCase()}..."><div data-oc-switch-results></div></div>` : ''}</div>
      <p class="small muted">Employees from ${sel.name}: Qualia lists the company's people here. The test portal keeps company contacts only.</p>`;
  } else main = html`<div class="po-choose"><p class="muted">No other contacts on this order yet (HOA, HOA Management Co., Utility Co., Ground Rent Leaseholder, payoff lenders).</p>${can ? html`<a class="m-btn small" href="${base}?v=othercontacts&add=choose" data-oc-start>Add Other Contact</a>` : ''}</div>`;
  const body = html`<div class="qc-wrap" data-qc-page="othercontacts" data-oc-page><div class="qc-main"><div class="qc-page-head"><span class="qc-chip big" aria-hidden="true">&#128101;</span><h3 data-qc-title>Contacts: Other Contacts</h3><span class="spacer"></span><a class="linkish small" href="#/deals/${deal.id}/contacts">Buyers, sellers, agents &rarr; Contacts tab</a></div>${pills}${main}</div>
    ${helpCards('Other Contacts', 'Companies on this order that are not people: the HOA and its management company, the Utility Co. for a front foot benefit (with its management company), the Ground Rent Leaseholder and the payoff lenders. Their names are the payees on the Charges (H) lines. Staff only.')}</div>`;
  return { body, mount: (root, c = {}) => mountOthers(root, api, deal, sel, addType, base, c.refresh || (() => location.reload())) };
}

function mountOthers(root, api, deal, sel, addType, base, refresh) {
  const ty = $('[data-oc-type]', root); if (ty) ty.addEventListener('change', () => { if (ty.value) location.hash = `${base}?v=othercontacts&add=${ty.value}`; });
  const minus = $('[data-oc-minus]', root); if (minus && sel) minus.addEventListener('click', guard(async () => { if (!confirm(`Remove ${sel.name} from this order? The company stays in the contact list.`)) return; await api.removeOtherContact(sel.id); toast('Removed from this order (logged).'); location.hash = `${base}?v=othercontacts`; }));
  const s = $('[data-oc-search]', root);
  if (s) { const out = $('[data-oc-results]', root); const run = guard(async () => { const list = await api.searchOtherCompanies(s.value, addType);
      out.innerHTML = toText(list.length ? list.map((c) => html`<button type="button" class="po-result" data-oc-pick="${c.id}"><strong>${c.name}</strong><span class="small muted">${c.address}</span></button>`) : html`<p class="small muted">None found. Add a new one.</p>`);
      $$('[data-oc-pick]', out).forEach((b) => b.addEventListener('click', guard(async () => { const oc = await api.addOtherContact(deal.id, b.dataset.ocPick, addType); toast(`${oc.name} added to this order.`); location.hash = `${base}?v=othercontacts&c=${oc.id}`; }))); });
    s.addEventListener('input', run); s.addEventListener('focus', run); }
  const nb = $('[data-oc-new]', root); if (nb) nb.addEventListener('click', () => { $('[data-oc-new-form]', root).hidden = false; nb.hidden = true; });
  const nf = $('[data-oc-new-form]', root); if (nf) nf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(nf).entries());
    const c = await api.createOtherCompany({ ...v, type: addType }); const oc = await api.addOtherContact(deal.id, c.id, addType); toast(`${oc.name} added to this order.`); location.hash = `${base}?v=othercontacts&c=${oc.id}`; }));
  const eb = $('[data-oc-edit]', root); const ef = $('[data-oc-edit-form]', root); if (eb && ef) { eb.addEventListener('click', () => { ef.hidden = !ef.hidden; });
    ef.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.updateOtherCompany(sel.companyId, Object.fromEntries(new FormData(ef).entries())); toast('Global contact saved.'); refresh(); })); }
  const swb = $('[data-oc-switch]', root); const box = $('[data-oc-switch-box]', root);
  if (swb && box) { swb.addEventListener('click', () => { box.hidden = !box.hidden; }); const ss = $('[data-oc-switch-search]', box);
    ss.addEventListener('input', guard(async () => { const list = await api.searchOtherCompanies(ss.value, PO.MANAGED_TYPES[sel.type]); const out = $('[data-oc-switch-results]', box);
      out.innerHTML = toText(html`${list.map((c) => html`<button type="button" class="po-result" data-oc-mgmt-pick="${c.id}"><strong>${c.name}</strong></button>`)}<button type="button" class="linkish small" data-oc-mgmt-new>Add "${ss.value}" as a new ${PO.otherTypeLabel(PO.MANAGED_TYPES[sel.type])}</button>`);
      const set = async (id) => { await api.updateOtherCompany(sel.companyId, { managementCompanyId: id }); toast('Management company set (global contact).'); refresh(); };
      $$('[data-oc-mgmt-pick]', out).forEach((b) => b.addEventListener('click', guard(() => set(b.dataset.ocMgmtPick))));
      $('[data-oc-mgmt-new]', out).addEventListener('click', guard(async () => { if (!ss.value.trim()) throw new Error('Type the company name first.'); const c = await api.createOtherCompany({ name: ss.value, type: PO.MANAGED_TYPES[sel.type] }); await set(c.id); })); })); }
}

// =====================================================================  H: HOA / Condo / Ground Rent / Payoffs  =====================================================================
export function hoaGrPanel(ctx) {
  const { acc, deal, base, canEdit } = ctx; const refi = acc.refi;
  const lines = acc.entries.filter((e) => !e.retired && ((e.meta && e.meta.group === 'hoaGr') || e.altaSection === 'payoffs'));
  const cell = (e, side, when) => { const sp = e.split || {}; const amt = side === 'buyer' ? sp.buyer : sp.seller; return (e.timing === 'before') === (when === 'before') && Number(amt) > 0 ? usd(amt) : ''; };
  const row = (e) => html`<tr data-hg-row="${e.id}"><td class="qc-num">${e.cdSection === 'H' ? e.cdLine : e.cdSection || '—'}</td><td>${e.description}${e.altaSection === 'payoffs' ? html` <a class="pill qc-mini" href="${base}?v=payoffs" data-hg-payoff>Payoffs</a>` : ''}</td><td>${e.payee ? 'to ' + e.payee : ''}</td>
    <td>${canEdit && e.meta && e.meta.group === 'hoaGr' ? html`<input class="qc-cell" data-hg-paidto="${e.id}" value="${(e.meta && e.meta.paidTo) || ''}" list="hg-paidto" maxlength="120" aria-label="Paid to" placeholder="—">` : (e.meta && e.meta.paidTo) || ''}</td>
    <td class="num">${cell(e, 'buyer', 'at')}</td><td class="num">${cell(e, 'buyer', 'before')}</td>${refi ? '' : html`<td class="num">${cell(e, 'seller', 'at')}</td><td class="num">${cell(e, 'seller', 'before')}</td>`}
    <td class="nowrap">${canEdit && e.meta && e.meta.group === 'hoaGr' ? html`<button type="button" class="ghost small danger" data-hg-retire="${e.id}">Retire</button>` : ''}</td></tr>`;
  return html`<div class="qc-card po-hg" data-hg-panel><div class="qc-card-head"><h4>${PO.HOA_GR_GROUP_TITLE}</h4><span class="small muted">Amounts are edited in the grid above (the same lines). Retire = soft delete, kept in the history.</span></div>
    ${canEdit ? html`<div class="po-quick" data-hg-presets>${PO.HOA_GR_PRESETS.filter((p) => !(refi && p.side === 'seller')).map((p) => html`<button type="button" class="ghost small" data-hg-add="${p.key}">+ ${p.description}</button>`)}</div>` : ''}
    <div class="qc-table-wrap"><table class="qc-table" data-hg-table><thead><tr><th rowspan="2" class="qc-num">#</th><th rowspan="2">Description</th><th rowspan="2">Payee</th><th rowspan="2">Paid To</th><th colspan="2" class="center">Borrower</th>${refi ? '' : html`<th colspan="2" class="center">Seller</th>`}<th rowspan="2"></th></tr>
      <tr><th class="num">At</th><th class="num">Before</th>${refi ? '' : html`<th class="num">At</th><th class="num">Before</th>`}</tr></thead>
      <tbody>${lines.length ? lines.map(row) : html`<tr><td colspan="${refi ? 7 : 9}" class="muted small">No HOA, FFB, ground rent or payoff lines yet.</td></tr>`}</tbody></table></div>
    <datalist id="hg-paidto">${PO.PAID_TO_SUGGESTIONS.map((x) => html`<option value="${x}"></option>`)}</datalist>
    <p class="small muted">Payees come from the order's <a href="${base}?v=othercontacts">Other Contacts</a> (HOA, HOA Management Co., Utility Co., Ground Rent Leaseholder). Payoff lines come from <a href="${base}?v=payoffs">Payoffs</a>.</p></div>`;
}
export function mountHoaGr(root, api, deal, acc, refresh) {
  $$('[data-hg-add]', root).forEach((b) => b.addEventListener('click', guard(async () => { const f = await api.addHoaGrCharge(deal.id, b.dataset.hgAdd); toast(`H.${f.cdLine} ${f.description} added${f.payee ? ` (to ${f.payee})` : ''}. Type the amount in the grid.`); refresh(); })));
  $$('[data-hg-retire]', root).forEach((b) => b.addEventListener('click', guard(async () => { if (!confirm('Retire this line? It comes off the CD; it is kept in the history and can be restored on the Fee ledger.')) return; await api.retireAccountingFee(b.dataset.hgRetire, true); toast('Line retired (kept in the history).'); refresh(); })));
  $$('[data-hg-paidto]', root).forEach((i) => i.addEventListener('change', guard(async () => { const e = acc.entries.find((x) => x.id === i.dataset.hgPaidto); const meta = { ...(e.meta || {}), paidTo: i.value.trim() }; if (!meta.paidTo) delete meta.paidTo;
    await api.updateAccountingFee(e.id, { meta }); toast('Paid To saved (logged).'); refresh(); })));
}
