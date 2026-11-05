// Place Order (Processor, Admin, Super admin; John Nov 2): creates a deal and links the chosen people (their intake tasks are copied from the current task templates).
// John, Nov 2 (later): Open Date (backdating allowed, never future), every US state (no default), EMD amount + due date, documents attached at placement,
// type-to-search pickers for Buyer / Seller / Buyer Agent / Listing Agent, one "Add new user" place, and Transaction Coordinator = TC accounts only.
// REDESIGN (John, Nov 3): the same form is now a STEP-BY-STEP flow modeled on the existing portal's order opening (docs/ORDER-OPEN-REFERENCE.md):
//   1 Transaction -> 2 Property -> 3 Buyers & Sellers -> 4 Lender & Loan -> 5 Agents -> 6 Team & Notes -> 7 Review & Submit
// with a progress bar (click any step to jump to it), per-step validation on Next, a review summary and a confirmation panel on the new order's page.
// It is still ONE <form id="nof"> with the same field names, ids and data-attributes; only one step is shown at a time. Every rule is unchanged:
// refinance hides price / EMD / sellers / agents / TC (the Agents step is skipped), Buyer Agent / Listing Agent / Lender are optional, two buyer + two seller
// rows, entity representative, commas in money fields, source of business (CLA staff only: Place Order is staff-only), wires never shown to agents.
import { html, raw, $, $$, guard, formData, options, toast, fmtSize, toText, fmtDate, fmtMoney } from '../ui.js?v=202611041856';
import { occSelects, yesNo } from './occ-fields.js?v=202611041856';
import { fmtPhone, TX_TYPES, runsOrders, isProcessor, localDate, US_STATE_NAMES, DOC_TYPES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, visibilityChoices, visibilityLabel, CONTACT_TYPES, contactTypeForRole, isRefi, REFI_BLOCKED_ROLES } from '../data/constants.js?v=202611041856';
import { pickerHtml, mountPicker, personLabel } from './person-picker.js?v=202611041856';
import { ENTITY_TYPES } from '../data/templates.js?v=202611041856';
import { moneyClean } from './money-input.js?v=202611041856';
// John, Nov 2 (a real contract had two buyers and two sellers): Buyer and Seller take one or more people. Each row is the same type-to-search picker;
// "+ Add another buyer / seller" adds a row, rows can be removed before the order is created. Row 1 keeps the field name p:<role>, row n is p:<role>:<n>.
// Each person becomes their own deal_participants row, so each buyer / seller gets their own copy of the client intake tasks (existing per-person behaviour).
export const MULTI = { 'Client-Buyer': 'buyer', 'Client-Seller': 'seller' };
// Matt, Nov 3 (b): TWO buyer and TWO seller rows by default (the second is optional and may stay blank); "+ Add another" still adds more (3, 4, ...).
// Each row has its own "+ Add entity": the buyer / seller is an LLC, corporation, partnership or trust -> entity name, type and the Entity Representative
// (name, title or role, phone, email). Saved on that person's row of the order and pre-filled on their Personal information form (+ Add entity there).
export const MIN_ROWS = 2;
const rowLabel = (label, n) => `${label} ${n}${n > 1 ? ' (optional)' : ''}`;
const entityPanel = (label) => html`<div class="entity-panel" data-entity-panel hidden><p class="muted small">This ${label.toLowerCase()} is an entity (LLC, corporation, partnership or trust). The person picked above is our contact for it; they confirm the details and attach the entity documents on their Personal information form.</p>
  <div class="form-grid"><label>Entity name *<input data-ent="name" maxlength="200" aria-label="Entity name"></label>
  <label>Entity type<select data-ent="type" aria-label="Entity type"><option value="">Choose&hellip;</option>${ENTITY_TYPES.map((t) => html`<option>${t}</option>`)}</select></label>
  <label>Entity Representative<input data-ent="repName" maxlength="120" placeholder="Full name" aria-label="Entity Representative"></label>
  <label>Representative's title or role<input data-ent="repTitle" maxlength="120" placeholder="e.g. Managing Member, Trustee" aria-label="Representative's title or role"></label>
  <label>Representative's phone<input data-ent="repPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone aria-label="Representative's phone"></label>
  <label>Representative's email<input data-ent="repEmail" type="email" maxlength="200" aria-label="Representative's email"></label></div></div>`;
const partyRow = (role, label, n = 1) => html`<div class="party-row-wrap" data-party-row="${n}"><div class="multi-row">${pickerHtml('p:' + role, rowLabel(label, n))}<button type="button" class="ghost" data-ent-toggle aria-pressed="false" title="This ${label.toLowerCase()} is an LLC, corporation, partnership or trust">+ Add entity</button><button type="button" class="ghost" data-rm-row title="Remove this ${label.toLowerCase()} (before the order is created)" hidden>Remove</button></div>${entityPanel(label)}</div>`;
const partyBlock = (role, label) => html`<fieldset class="span2 multi-party" data-multi="${role}"><legend>${label}s <span class="muted small">(${label} 1 and ${label} 2 shown; add more with +)</span></legend>
  <div class="multi-rows" data-rows>${Array.from({ length: MIN_ROWS }, (_, i) => partyRow(role, label, i + 1))}</div><button type="button" class="ghost" data-add-row="${role}">+ Add another ${MULTI[role]}</button></fieldset>`;

// optional single-person slots: text in the box without a pick is ignored, never an error (Francis, Nov 3: "Buyer Agent field should be optional")
export const OPTIONAL_SLOTS = ['Buyer agent', 'Listing agent', 'Lender'];
// REFINANCE (John, Nov 3): picking Transaction type = Refinance hides (and never requires or saves) the purchase price, EMD amount / due date, the sellers
// (both rows and any added), the Buyer Agent and Listing Agent (realtors) and the Transaction coordinator. The buyer rows are shown as BORROWERS (same
// Client-Buyer role: the party on the loan). Loan amount, salespeople, Processor and Lender stay. Switching back to Purchase shows everything again with
// whatever was typed. The adapter (and migration 32) refuse a refinance with any of them, so this is not only a screen rule.
export const REFI_HIDE = ['purchasePrice', 'emdAmount', 'emdDueDate'];
const SEARCH = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer agent'], ['Listing Agent', 'Listing agent'], ['Lender', 'Lender']];   // Lender slot: John, Nov 2 (contact type)
// people are added to the order in this role order (the order the one-page form used), whichever step they were picked on
const ADD_ORDER = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Lender', 'Transaction Coordinator', 'Sales Team'];
// the steps (key, title, one-line hint). The Agents step is skipped on a refinance (no realtors, no TC).
export const STEPS = [
  ['transaction', 'Transaction', 'Type, source, open date'],
  ['property', 'Property', 'Address and county'],
  ['parties', 'Buyers & Sellers', 'Who is on the contract'],
  ['loan', 'Lender & Loan', 'Price, loan, EMD, dates'],
  ['agents', 'Agents', 'Realtors and TC'],
  ['team', 'Team & Notes', 'Processor, sales, documents'],
  ['review', 'Review & Submit', 'Check, then place the order'],
];
// "Add new user" is one place for every role; it shows on the steps where people are picked
const PEOPLE_STEPS = ['parties', 'loan', 'agents'];
export const PLACED_KEY = 'cla-portal-new:placed';   // the confirmation shown once on the new order's page (deal.js)
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
const zipOk = (z) => !z || /^\d{5}(-\d{4})?$/.test(z);   // same rule as the data layer

export async function render({ api, user, go }) {
  if (!runsOrders(user)) throw new Error('Only a Processor or Admin can place orders.');
  const contacts = await api.listContacts(); const staff = await api.listSalesStaff(); const procs = await api.listProcessors(); const tcs = await api.listCoordinators();
  // Matt, Nov 3 (b): Source of business = the CRM Settings "Lead Source" list (Admins edit it there)
  const sources = api.listSourceOptions ? await api.listSourceOptions().catch(() => []) : [];
  // the file's Processor: a Processor defaults to themselves; an Admin / Super admin is not a valid Processor, so they must choose one
  const meProc = isProcessor(user.role); const today = localDate();
  // "Add new user" roles. Salesperson creates a staff login, which is Admin-only (John's earlier decision), so only Admins / Super admins see it.
  const NEW_ROLES = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer Agent'], ['Listing Agent', 'Listing Agent'], ['Lender', 'Lender'], ...(user.isAdmin ? [['Sales Person', 'Salesperson']] : [])];
  const visOpts = visibilityChoices(user.role, user.isAdmin);
  const salesBox = (s, checked = false) => html`<label class="check"><input type="checkbox" name="salesIds" value="${s.id}" ${checked ? raw('checked') : ''}> ${s.firstName} ${s.lastName} <span class="muted small">(${s.role})</span></label>`;
  const N = STEPS.length;
  const panel = (key, inner, intro) => { const i = STEPS.findIndex((s) => s[0] === key); const [, title] = STEPS[i];
    return html`<section class="wiz-panel" data-wiz-step="${key}" aria-labelledby="wiz-h-${key}" ${i ? raw('hidden') : ''}>
      <header class="wiz-panel-head"><span class="wiz-step-no" data-wiz-stepno>Step ${i + 1} of ${N}</span><h3 id="wiz-h-${key}" tabindex="-1">${title}</h3>${intro ? html`<p class="muted">${intro}</p>` : ''}</header>
      <div class="notice warn wiz-errors" data-wiz-errors role="alert" hidden></div>${inner}</section>`; };
  const body = html`
    <div class="page-head wiz-page-head"><div><p class="eyebrow">New order</p><h2 class="page-title">Place Order</h2>
      <p class="muted">Open a title order step by step: the transaction, the property, the people, the loan, then review. Required fields are marked *.</p></div>
      <a class="ghost" href="#/orders">Cancel</a></div>
    <form id="nof" class="wizard" novalidate>
      <ol class="wiz-progress" aria-label="Place Order steps">${STEPS.map(([key, title, hint], i) => html`<li class="wiz-tab-item" data-wiz-item="${key}"><button type="button" class="wiz-tab ${i ? '' : 'is-current'}" data-wiz-tab="${key}" ${i ? '' : raw('aria-current="step"')}>
        <span class="wiz-num" aria-hidden="true">${i + 1}</span><span class="wiz-text"><span class="wiz-label">${title}</span><span class="wiz-hint">${hint}</span></span></button></li>`)}</ol>
      <div class="wiz-meter" aria-hidden="true"><div data-wiz-meter style="width:${Math.round(100 / N)}%"></div></div>
      <div class="wiz-body card">
      ${panel('transaction', html`<div class="form-grid">
        <label>Transaction type<select name="transactionType">${options(TX_TYPES, 'Purchase')}</select></label>
        <label>Source of business<select name="sourceOfBusiness" aria-label="Source of business"><option value="">(not set)</option>${options(sources, '', (o) => o.label, (o) => o.value)}</select><span class="field-hint">How this order came to us (CLA staff only). ${user.isAdmin ? html`Edit the list in <a href="#/crm/settings">CRM Settings &rarr; Lead Source</a>.` : 'An Admin edits the list (CRM Settings, Lead Source).'}</span></label>
        <label>Open date *<input name="openDate" type="date" required value="${today}" max="${today}" title="The day the order came in. Can be backdated; not in the future."><span class="field-hint">The day the order came in. Can be backdated, never in the future.</span></label>
        ${occSelects({}, 'data-refi-hide="occ"')}
        <p class="span2 notice info" data-refi-note hidden><strong>Refinance:</strong> no purchase price, EMD, sellers or realtors. The people on the order are the borrower(s), salespeople, the Processor and the Lender. Switch back to Purchase to see those fields again.</p></div>`,
        'What kind of order is this, and when did it come in?')}
      ${panel('property', html`<div class="form-grid">
        <label class="span2">Street address *<input name="street" required maxlength="200" autocomplete="off"></label>
        <label>City *<input name="city" required maxlength="100"></label><label>State *<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}">${n} (${c})</option>`)}</select></label>
        <label>ZIP<input name="zip" maxlength="10" placeholder="20850"></label>
        <label>County <span class="muted small">(optional)</span><input name="county" maxlength="100" placeholder="e.g. Frederick" aria-label="County"></label></div>`,
        'The address of the property being bought, sold or refinanced.')}
      ${panel('parties', html`<p class="muted small people-optional">People on this order are all optional; you can add or change them later under Contacts. Pick each person from the list, or add someone new with <strong>Add new user</strong> below.</p>
        <div class="form-grid">${partyBlock('Client-Buyer', 'Buyer')}${partyBlock('Client-Seller', 'Seller')}</div>`,
        'Type a name, email, phone or company and pick the person. A buyer or seller that is an LLC, corporation, partnership or trust: use + Add entity.')}
      ${panel('loan', html`<h4 class="wiz-sub">Amounts and dates</h4><div class="form-grid">
        <label data-refi-hide="purchasePrice">Purchase price<input name="purchasePrice" inputmode="decimal" placeholder="485,000" data-money autocomplete="off"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" placeholder="388,000" data-money autocomplete="off"></label>
        <label data-refi-hide="emdAmount">EMD amount<input name="emdAmount" inputmode="decimal" placeholder="10,000" aria-label="EMD amount (earnest money deposit)" data-money autocomplete="off"></label><label data-refi-hide="emdDueDate">EMD due date<input name="emdDueDate" type="date"></label>
        <label>Closing date<input name="closingDate" type="date"></label></div>
        <h4 class="wiz-sub">Lender <span class="muted small">(optional)</span></h4>
        <div class="lender-block" data-lender-block>${pickerHtml('p:Lender', 'Lender')}
        <div class="form-grid"><label>Lender phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone aria-label="Lender phone"></label>
        <label>Lender email<input name="lenderEmail" type="email" maxlength="200" aria-label="Lender email"></label></div>
        <p class="muted small">Filled in from the lender you pick (change them for this order if needed). Optional, like the lender.</p></div>`,
        'Money is typed with commas (485,000). Every amount is optional and can be filled in later.')}
      ${panel('agents', html`<div class="form-grid agents-grid">${pickerHtml('p:Buyer Agent', 'Buyer agent')}${pickerHtml('p:Listing Agent', 'Listing agent')}
        <label data-refi-hide="tc">Transaction coordinator<select name="p:Transaction Coordinator"><option value="">(none yet)</option>${options(tcs, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.contactId)}</select></label></div>
        <p class="muted small">The buyer agent, listing agent and transaction coordinator are all optional. Agents never see wire instructions.</p>`,
        'The realtors on each side and the transaction coordinator.')}
      ${panel('team', html`<div class="form-grid">
        <label>Processor *<select name="processorId" required>${meProc ? '' : html`<option value="">Choose the Processor&hellip;</option>`}${options(procs, meProc ? user.id : '', (s) => `${s.firstName} ${s.lastName}${s.id === user.id ? ' (you)' : ''}`, (s) => s.id)}</select></label>
        <label>Sales team member<select name="p:Sales Team"><option value="">(none yet)</option>${options(contacts, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.id)}</select></label>
        <fieldset class="span2" data-sales-picker><legend>Salespeople on this order (check all that apply)</legend><div data-sales-list class="check-grid">${staff.length ? staff.map((s) => salesBox(s)) : html`<p class="muted" data-no-sales>No active salespeople.</p>`}</div></fieldset>
        <label class="span2">Notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Anything the team should know about this order"></textarea></label>
        <fieldset class="span2" id="nof-docs"><legend>Documents (e.g. the sales contract)</legend>
          <label class="dropzone-label">Files <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each; choose several at once)</span><input type="file" id="nof-files" multiple accept="${ALLOWED_UPLOAD_EXT.map((e) => '.' + e).join(',')}"></label>
          <div id="nof-filelist"></div>
          <label>Who can see them<select id="nof-vis">${options(visOpts, visOpts[0], (v) => visibilityLabel(v, user.role))}</select></label>
          <label class="check"><input type="checkbox" id="nof-wire"> These are wire instructions (buyer clients and CLA Title only; agents never see them)</label>
          <p class="muted small">They are saved to the order's Documents tab when you create the order. Documents are kept permanently and cannot be deleted.</p>
        </fieldset></div>`,
        'Who at CLA Title works this order, plus notes and any documents you already have.')}
      ${panel('review', html`<div data-review></div>
        <div class="wiz-submit"><button class="m-btn m-btn-lg" type="submit" data-place-order>Place order</button><span class="muted small">Creates the order and adds the people above. No emails, texts or invites are sent.</span></div>`,
        'Check everything below. Use Edit to change a section; nothing is saved until you press Place order.')}
      <fieldset id="addnew" class="addnew" data-wiz-home="parties"><legend>Add new user</legend>
        <p class="muted small addnew-hint">Someone not in the lists? Add them here and they are put on this order.</p>
        <button type="button" class="ghost" id="an-open">+ Add new user</button>
        <div id="an-form" class="form-grid" hidden>
          <label class="span2">Role *<select id="an-role" aria-label="Role"><option value="">Choose the role&hellip;</option>${NEW_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
          <div class="span2 form-grid" id="an-fields" hidden>
            <label>First name *<input id="an-first" maxlength="80"></label><label>Last name<input id="an-last" maxlength="80"></label>
            <label>Email<span id="an-email-req" hidden> *</span><input id="an-email" type="email" maxlength="200"></label><label>Phone<input id="an-phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label>
            <label class="span2" id="an-company-l" hidden><span id="an-company-t">Brokerage / company</span><input id="an-company" maxlength="120"></label>
            <label class="span2" id="an-ctype-l" hidden>Contact type <span class="muted small">(for reporting; set from the role, you can change it)</span><select id="an-ctype" aria-label="Contact type"><option value="">(not set)</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
            <p class="span2 muted small" id="an-note"></p>
            <div class="span2" id="an-dup" hidden></div>
            <div class="span2"><button type="button" class="m-btn" id="an-create">Create and add to this order</button></div>
          </div>
          <div class="span2"><button type="button" class="ghost" id="an-cancel">Close without adding</button></div>
        </div>
      </fieldset>
      <div class="wiz-nav"><button type="button" class="ghost" data-wiz-back hidden>&larr; Back</button><span class="spacer"></span><span class="muted small" data-wiz-count>Step 1 of ${N}</span><button type="button" class="m-btn" data-wiz-next>Next: ${STEPS[1][1]} &rarr;</button></div>
      </div>
    </form>`;
  return { title: 'Place Order', crumbs: [['Orders', '#/orders'], ['Place Order']], body, mount(root) {
    const form = $('#nof', root); const people = [...contacts];
    const txSel = $('[name=transactionType]', root); const refi = () => isRefi(txSel.value);
    const labelOf = (role) => (role === 'Client-Buyer' && refi() ? 'Borrower' : SEARCH.find((x) => x[0] === role)[1]);
    // Matt, Nov 3 (b): picking a lender fills Lender phone / email (only boxes still empty; the processor can change them for this order)
    const fillLender = (c) => { if (!c) return; const ph = $('[name=lenderPhone]', root); const em = $('[name=lenderEmail]', root);
      if (ph && !ph.value.trim() && c.phone) ph.value = fmtPhone(c.phone); if (em && !em.value.trim() && c.email) em.value = c.email; };
    const pickers = Object.fromEntries(SEARCH.filter(([role]) => !MULTI[role]).map(([role]) => [role, mountPicker($(`[data-picker="p:${role}"]`, root), () => people, role === 'Lender' ? { onSet: fillLender } : {})]));
    // ---------- several buyers / sellers ----------
    const rows = {};   // role -> [{ pk, el }] in screen order
    const renumber = (role) => { rows[role].forEach(({ pk, el }, i) => { const nm = i ? `p:${role}:${i + 1}` : `p:${role}`; pk.el.dataset.picker = nm; $('input[type=hidden]', pk.el).name = nm; el.dataset.partyRow = String(i + 1);
        const lab = rowLabel(labelOf(role), i + 1); const q = $('.picker-q', pk.el); q.setAttribute('aria-label', lab); q.parentNode.firstChild.textContent = lab; });
      // Matt, Nov 3 (b): always at least two rows (leave the second blank if there is only one). Any row can be removed; the rest move up and a
      // blank row is added back at the end. The last row of a two-row set has no Remove (removing it would only put an empty row back).
      rows[role].forEach(({ el }, i) => { $('[data-rm-row]', el).hidden = rows[role].length <= MIN_ROWS && i === rows[role].length - 1; }); };
    const hookRow = (role, el) => { const r = { el, pk: mountPicker($('.picker', el), () => people) }; rows[role].push(r);
      const tg = $('[data-ent-toggle]', el); const pnl = $('[data-entity-panel]', el);
      tg.addEventListener('click', () => { const on = pnl.hidden; pnl.hidden = !on; tg.setAttribute('aria-pressed', String(on)); tg.textContent = on ? '\u2212 Remove entity' : '+ Add entity'; if (on) $('[data-ent="name"]', pnl).focus(); });
      $('[data-rm-row]', el).addEventListener('click', () => { rows[role] = rows[role].filter((z) => z !== r); el.remove(); renumber(role); while (rows[role].length < MIN_ROWS) addRow(role); }); renumber(role); return r; };
    const addRow = (role) => { const box = $(`[data-multi="${role}"] [data-rows]`, root); box.insertAdjacentHTML('beforeend', toText(partyRow(role, labelOf(role), rows[role].length + 1)));
      const r = hookRow(role, box.lastElementChild); return r; };
    Object.keys(MULTI).forEach((role) => { rows[role] = []; $$(`[data-multi="${role}"] [data-party-row]`, root).forEach((el) => hookRow(role, el));
      $(`[data-add-row="${role}"]`, root).addEventListener('click', () => { const r = addRow(role); $('.picker-q', r.el).focus(); }); });
    // which pickers count for this transaction type (a refinance ignores the hidden seller / realtor boxes completely)
    const counts = (role) => !(refi() && REFI_BLOCKED_ROLES.includes(role));
    // ---------- the steps ----------
    const active = () => STEPS.map((s) => s[0]).filter((k) => !(k === 'agents' && refi()));   // a refinance has no Agents step
    let cur = 'transaction'; const visited = new Set(['transaction']); const bad = new Set();
    const stepTitle = (k) => (k === 'parties' && refi() ? 'Borrowers' : STEPS.find((s) => s[0] === k)[1]);
    const paint = () => { const list = active(); const i = list.indexOf(cur);
      STEPS.forEach(([k]) => { const item = $(`[data-wiz-item="${k}"]`, root); const tab = $(`[data-wiz-tab="${k}"]`, root); const on = list.includes(k);
        item.hidden = !on; const n = list.indexOf(k);
        $('.wiz-num', tab).textContent = bad.has(k) ? '!' : visited.has(k) && k !== cur && n < i ? '\u2713' : String(n + 1);
        $('.wiz-label', tab).textContent = stepTitle(k);
        tab.classList.toggle('is-current', k === cur); tab.classList.toggle('is-done', visited.has(k) && k !== cur && !bad.has(k)); tab.classList.toggle('is-error', bad.has(k));
        if (k === cur) tab.setAttribute('aria-current', 'step'); else tab.removeAttribute('aria-current'); });
      $$('[data-wiz-step]', root).forEach((p) => { p.hidden = p.dataset.wizStep !== cur; const n = list.indexOf(p.dataset.wizStep); $('[data-wiz-stepno]', p).textContent = `Step ${n + 1} of ${list.length}`; $('h3', p).textContent = stepTitle(p.dataset.wizStep); });
      $('#addnew', root).hidden = !PEOPLE_STEPS.includes(cur);
      $('[data-wiz-back]', root).hidden = i <= 0; const nx = $('[data-wiz-next]', root); nx.hidden = cur === 'review';
      if (cur !== 'review') nx.innerHTML = `Next: ${toText(stepTitle(list[i + 1]))} &rarr;`;
      $('[data-wiz-count]', root).textContent = `Step ${i + 1} of ${list.length}`;
      $('[data-wiz-meter]', root).style.width = `${Math.round(((i + 1) / list.length) * 100)}%`;
      if (cur === 'review') drawReview(); };
    const show = (k, { focus = true } = {}) => { if (!active().includes(k)) k = 'review'; cur = k; visited.add(k); paint();
      const top = $('.wiz-progress', root); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
      if (focus) { const h = $(`#wiz-h-${k}`, root); if (h) h.focus({ preventScroll: true }); } };
    // ---------- per-step validation ----------
    const labelText = (el) => { const l = el.closest('label'); const t = el.getAttribute('aria-label') || (l && l.childNodes[0] ? l.childNodes[0].textContent : '') || el.name || 'This field';
      return t.replace(/\s*\*\s*$/, '').trim(); };
    const nativeMsg = (el) => { const v = el.validity; const n = el.name;
      if (n === 'street' && v.valueMissing) return 'Street address is required.'; if (n === 'city' && v.valueMissing) return 'City is required.';
      if (n === 'state' && v.valueMissing) return 'State is required: choose it from the list.'; if (n === 'processorId' && v.valueMissing) return 'Choose the Processor for this order.';
      if (n === 'openDate' && v.rangeOverflow) return 'Open date cannot be in the future.'; if (n === 'openDate' && v.valueMissing) return 'Open date is required.';
      if (v.valueMissing) return `${labelText(el)} is required.`; if (v.typeMismatch) return `${labelText(el)} is not valid.`; if (v.tooLong) return `${labelText(el)} is too long.`;
      return `${labelText(el)}: ${el.validationMessage || 'check this value'}`; };
    const entityOf = (r) => { const pnl = $('[data-entity-panel]', r.el); if (pnl.hidden) return null;   // entity of a buyer / seller row (null when "+ Add entity" is closed or empty)
      const e = Object.fromEntries($$('[data-ent]', pnl).map((i) => [i.dataset.ent, i.value.trim()])); return Object.values(e).some(Boolean) ? e : null; };
    const fileIn = $('#nof-files', root); const fileList = $('#nof-filelist', root);
    // returns [{ el, msg }] for one step (el = the field to mark, or null)
    const check = (k) => { const p = $(`[data-wiz-step="${k}"]`, root); const errs = [];
      $$('input, select, textarea', p).filter((el) => el.type !== 'hidden' && el.type !== 'file' && !el.closest('[hidden]:not([data-wiz-step])') && el.willValidate && !el.checkValidity())
        .forEach((el) => errs.push({ el, msg: nativeMsg(el) }));
      const f = formData(form);
      if (k === 'transaction' && f.openDate && f.openDate > localDate() && !errs.some((e) => e.el && e.el.name === 'openDate')) errs.push({ el: $('[name=openDate]', p), msg: 'Open date cannot be in the future.' });
      if (k === 'property' && !zipOk(String(f.zip || '').trim())) errs.push({ el: $('[name=zip]', p), msg: 'ZIP must be 5 digits (or ZIP+4).' });
      if (k === 'parties') {
        for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r, i) => { if (r.pk.typed && !r.pk.value) errs.push({ el: $('.picker-q', r.pk.el), msg: `${labelOf(role)}: pick a person from the list (or clear the box, or use "Add new user").` }); });
        for (const role of Object.keys(MULTI).filter(counts)) { const ids = rows[role].map((r) => r.pk.value).filter(Boolean); const twice = ids.find((id, i) => ids.indexOf(id) !== i);
          if (twice) errs.push({ el: null, msg: `${personLabel(people.find((pp) => pp.id === twice) || { firstName: 'That person', lastName: '' })} is listed twice as ${labelOf(role)}.` }); }
        for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r, i) => { const e = entityOf(r); if (!e) return; const lab = rowLabel(labelOf(role), i + 1).replace(/ \(optional\)$/, '');
          if (!r.pk.value) errs.push({ el: $('.picker-q', r.pk.el), msg: `${lab}: pick the person who is our contact for the entity (or remove the entity).` });
          if (!e.name) errs.push({ el: $('[data-ent="name"]', r.el), msg: `${lab}: entity name is required (or remove the entity).` }); });
      }
      if (k === 'loan') {
        const amt = refi() ? '' : moneyClean(f.emdAmount); if (amt && !(isFinite(Number(amt)) && Number(amt) >= 0)) errs.push({ el: $('[name=emdAmount]', p), msg: 'EMD amount must be a number of 0 or more.' });
        for (const [key, l] of [['purchasePrice', 'Purchase price'], ['loanAmount', 'Loan amount']]) { if (key === 'purchasePrice' && refi()) continue; const v = moneyClean(f[key]);
          if (v && !(isFinite(Number(v)) && Number(v) >= 0)) errs.push({ el: $(`[name=${key}]`, p), msg: `${l} must be a number of 0 or more.` }); }
      }
      if (k === 'team') for (const file of [...fileIn.files]) { if (file.size > MAX_UPLOAD_BYTES) errs.push({ el: fileIn, msg: `${file.name} is too large for this demo.` });
        if (!ALLOWED_UPLOAD_EXT.includes((file.name.split('.').pop() || '').toLowerCase())) errs.push({ el: fileIn, msg: `${file.name}: that file type is not allowed.` }); }
      return errs; };
    const clearMarks = (p) => { $$('[data-ferr]', p).forEach((x) => x.remove()); $$('.has-err', p).forEach((x) => x.classList.remove('has-err')); $$('[aria-invalid]', p).forEach((x) => x.removeAttribute('aria-invalid')); };
    const mark = (k, errs) => { const p = $(`[data-wiz-step="${k}"]`, root); clearMarks(p); const box = $('[data-wiz-errors]', p);
      if (!errs.length) { box.hidden = true; box.innerHTML = ''; bad.delete(k); return; }
      bad.add(k); box.hidden = false; box.innerHTML = toText(html`<strong>Please fix ${errs.length === 1 ? 'this' : `these ${errs.length} things`} before you continue:</strong><ul>${errs.map((e) => html`<li>${e.msg}</li>`)}</ul>`);
      errs.forEach(({ el, msg }) => { if (!el) return; el.setAttribute('aria-invalid', 'true'); const host = el.closest('.picker') || el.closest('label') || el.parentElement; host.classList.add('has-err');
        if (!$('[data-ferr]', host)) host.insertAdjacentHTML('beforeend', toText(html`<span class="ferr" data-ferr>${msg}</span>`)); }); };
    const validate = (k) => { const errs = check(k); mark(k, errs); paint(); return errs; };
    // after an error, fix-as-you-go: re-check the current step when a field changes (only once it has been flagged)
    form.addEventListener('change', () => { if (bad.has(cur)) validate(cur); });
    const next = () => { const list = active(); const errs = validate(cur);
      if (errs.length) { toast(errs.map((e) => e.msg).join(' | '), 'err'); const first = errs.find((e) => e.el); if (first) first.el.focus(); return; }
      show(list[list.indexOf(cur) + 1]); };
    $('[data-wiz-next]', root).addEventListener('click', next);
    $('[data-wiz-back]', root).addEventListener('click', () => { const list = active(); show(list[Math.max(0, list.indexOf(cur) - 1)]); });
    // the progress bar: any step can be opened (nothing is lost); errors are shown again on Next and on Place order
    $$('[data-wiz-tab]', root).forEach((b) => b.addEventListener('click', () => show(b.dataset.wizTab)));
    root.addEventListener('click', (e) => { const g = e.target.closest('[data-wiz-goto]'); if (g) { e.preventDefault(); show(g.dataset.wizGoto); } });
    // ---------- review ----------
    const optionalSkipped = () => SEARCH.filter(([role]) => !MULTI[role] && counts(role)).filter(([role]) => pickers[role].typed && !pickers[role].value).map(([, label]) => label);
    const nameOf = (id) => { const c = people.find((pp) => pp.id === id); return c ? personLabel(c) : ''; };
    const selText = (sel) => (sel && sel.value ? sel.options[sel.selectedIndex].textContent.trim() : '');
    const dash = html`<span class="muted">&mdash;</span>`; const val = (v) => (v ? v : dash);
    const drawReview = () => { const f = formData(form); const r = refi(); const list = active();
      const issues = list.filter((k) => k !== 'review').map((k) => [k, check(k)]).filter(([, e]) => e.length);
      const section = (k, title, items) => html`<section class="review-sec" data-review-sec="${k}"><header><h4>${title}</h4><button type="button" class="linkish" data-wiz-goto="${k}">Edit</button></header><dl class="review-dl">${items.map(([dt, dd]) => html`<dt>${dt}</dt><dd>${dd}</dd>`)}</dl></section>`;
      const partyList = (role) => { const out = rows[role].filter((x) => x.pk.value).map((x) => { const e = entityOf(x); return html`<div>${nameOf(x.pk.value)}${e && e.name ? html` <span class="muted small">for ${e.name}${e.type ? ` (${e.type})` : ''}</span>` : ''}</div>`; }); return out.length ? out : dash; };
      const sales = $$('input[name=salesIds]:checked', root).map((b) => b.parentElement.textContent.replace(/\s+/g, ' ').trim());
      const files = [...fileIn.files];
      const skipped = optionalSkipped();
      $('[data-review]', root).innerHTML = toText(html`
        ${issues.length ? html`<div class="notice warn" data-review-issues><strong>${issues.reduce((n, [, e]) => n + e.length, 0)} thing(s) to fix before placing the order:</strong><ul>${issues.map(([k, e]) => html`<li><a href="#" data-wiz-goto="${k}">${stepTitle(k)}</a>: ${e.map((x) => x.msg).join(' ')}</li>`)}</ul></div>`
          : html`<div class="notice ok-box" data-review-ready><strong>Ready to place.</strong> Everything required is filled in.</div>`}
        ${skipped.length ? html`<div class="notice info" data-review-skipped>Not added (nobody picked from the list): ${skipped.join(', ').toLowerCase()}. You can add them later on the Contacts tab.</div>` : ''}
        <div class="review-grid">
        ${section('transaction', 'Transaction', [['Transaction type', html`<strong>${f.transactionType}</strong>`], ['Source of business', val(selText($('[name=sourceOfBusiness]', root)))], ['Open date', val(fmtDate(f.openDate))], ...(r ? [] : [['Primary residence', yesNo(f.primaryResidence)], ['First-time buyer', yesNo(f.firstTimeBuyer)]])])}
        ${section('property', 'Property', [['Address', f.street ? html`${f.street}<br>${[f.city, f.state].filter(Boolean).join(', ')} ${f.zip || ''}` : dash], ['County', val(f.county)]])}
        ${section('parties', r ? 'Borrowers' : 'Buyers & Sellers', [[r ? 'Borrowers' : 'Buyers', partyList('Client-Buyer')], ...(r ? [] : [['Sellers', partyList('Client-Seller')]])])}
        ${section('loan', 'Lender & Loan', [...(r ? [] : [['Purchase price', val(fmtMoney(moneyClean(f.purchasePrice)))]]), ['Loan amount', val(fmtMoney(moneyClean(f.loanAmount)))],
          ...(r ? [] : [['EMD amount', val(fmtMoney(moneyClean(f.emdAmount)))], ['EMD due date', val(fmtDate(f.emdDueDate))]]), ['Closing date', val(fmtDate(f.closingDate))],
          ['Lender', pickers.Lender.value ? html`${nameOf(pickers.Lender.value)}${f.lenderPhone || f.lenderEmail ? html`<br><span class="muted small">${[f.lenderPhone, f.lenderEmail].filter(Boolean).join(' \u00b7 ')}</span>` : ''}` : dash]])}
        ${r ? '' : section('agents', 'Agents', [['Buyer agent', val(nameOf(pickers['Buyer Agent'].value))], ['Listing agent', val(nameOf(pickers['Listing Agent'].value))], ['Transaction coordinator', val(selText($('[name="p:Transaction Coordinator"]', root)))]])}
        ${section('team', 'Team & Notes', [['Processor', val(selText($('[name=processorId]', root)).replace(/^Choose the Processor.*$/, ''))], ['Salespeople', sales.length ? sales.join(', ') : dash], ['Sales team member', val(selText($('[name="p:Sales Team"]', root)))],
          ['Notes', f.notes ? html`<span class="review-notes">${f.notes.length > 240 ? f.notes.slice(0, 240) + '\u2026' : f.notes}</span>` : dash],
          ['Documents', files.length ? html`${files.map((x, i) => html`<div>${x.name} <span class="muted small">${fmtSize(x.size)}${($(`[data-doctype="${i}"]`, root) || {}).value ? ' \u00b7 ' + $(`[data-doctype="${i}"]`, root).value : ''}</span></div>`)}<span class="muted small">${selText($('#nof-vis', root))}${$('#nof-wire', root).checked ? ' \u00b7 wire instructions (never shown to agents)' : ''}</span>` : dash]])}
        </div>
        <div class="card next-box"><h4>What happens when you place the order</h4><ul class="checklist">
          <li>The order opens at stage <strong>Opened</strong> with a new file number, and the Processor gets the <em>Collect executed contract</em> task.</li>
          <li>Each person you added gets their own intake tasks, copied from the current Task Templates.</li>
          <li>The standard document folders are created${files.length ? ` and your ${files.length} document(s) are saved` : ''}.</li>
          <li>It is recorded in the Activity Log. <strong>No emails, texts or portal invites are sent</strong> (invite people later from Contacts).</li></ul></div>`); };
    // ---------- Refinance: hide / restore ----------
    const anRole = $('#an-role', root);
    const applyRefi = () => { const on = refi();
      $$('[data-refi-hide]', root).forEach((el) => { el.hidden = on; });
      $('[data-refi-note]', root).hidden = !on;
      $('[data-multi="Client-Seller"]', root).hidden = on;
      ['Buyer Agent', 'Listing Agent'].forEach((r) => { $(`[data-picker="p:${r}"]`, root).hidden = on; });
      const bf = $('[data-multi="Client-Buyer"]', root); bf.dataset.refi = String(on);
      $('legend', bf).firstChild.textContent = on ? 'Borrowers ' : 'Buyers '; $('legend span', bf).textContent = on ? '(Borrower 1 and Borrower 2 shown; add more with +)' : '(Buyer 1 and Buyer 2 shown; add more with +)'; $('[data-add-row="Client-Buyer"]', bf).textContent = on ? '+ Add another borrower' : '+ Add another buyer';
      renumber('Client-Buyer');
      // Add new user: no seller / realtor roles on a refinance; Buyer reads Borrower
      [...anRole.options].forEach((o) => { if (REFI_BLOCKED_ROLES.includes(o.value)) { o.hidden = on; o.disabled = on; } if (o.value === 'Client-Buyer') o.textContent = on ? 'Borrower' : 'Buyer'; });
      if (on && REFI_BLOCKED_ROLES.includes(anRole.value)) { anRole.value = ''; anRole.dispatchEvent(new Event('change')); }
      ['agents'].forEach((k) => { if (on) { bad.delete(k); } });
      paint(); };
    const allPickers = () => [...SEARCH.filter(([role]) => !MULTI[role] && counts(role)).map(([role, label]) => [label, pickers[role]]), ...Object.keys(MULTI).filter(counts).flatMap((role) => rows[role].map((r) => [labelOf(role), r.pk]))];
    // "Add new user" / "Select existing person" with role Buyer or Seller APPENDS: fills the first empty row, else adds a row
    const placeParty = (role, c) => { const free = rows[role].find((r) => !r.pk.value && !r.pk.typed); (free || addRow(role)).pk.set(c); };
    // ---------- documents chosen at placement: one row per file with its own document type ----------
    fileIn.addEventListener('change', () => { fileList.innerHTML = toText(html`${[...fileIn.files].map((f, i) => html`<div class="nof-file" data-file="${i}"><strong>${f.name}</strong> <span class="muted small">${fmtSize(f.size)}</span>
      <label>Document type<select data-doctype="${i}" aria-label="Document type for ${f.name}"><option value="">Choose&hellip;</option>${options(DOC_TYPES, '')}</select></label></div>`)}`); });
    // ---------- one "Add new user" place ----------
    const anForm = $('#an-form', root); const anFields = $('#an-fields', root); const dup = $('#an-dup', root);
    const v = (id) => $('#' + id, root).value.trim();
    const reset = () => { ['an-first', 'an-last', 'an-email', 'an-phone', 'an-company', 'an-ctype'].forEach((id) => { $('#' + id, root).value = ''; }); anRole.value = ''; anFields.hidden = true; dup.hidden = true; dup.innerHTML = ''; };
    $('#an-open', root).addEventListener('click', () => { anForm.hidden = false; anRole.focus(); });
    $('#an-cancel', root).addEventListener('click', () => { reset(); anForm.hidden = true; });
    anRole.addEventListener('change', () => { const r = anRole.value; anFields.hidden = !r; dup.hidden = true;
      $('#an-company-l', root).hidden = !(r === 'Buyer Agent' || r === 'Listing Agent' || r === 'Lender'); $('#an-company-t', root).textContent = r === 'Lender' ? 'Company (lender)' : 'Brokerage / company';
      $('#an-ctype-l', root).hidden = !r || r === 'Sales Person'; $('#an-ctype', root).value = contactTypeForRole(r); $('#an-email-req', root).hidden = r !== 'Sales Person';
      $('#an-note', root).textContent = r === 'Sales Person' ? 'Creates an active CLA staff login (role Sales Person) and checks them under Salespeople. No email or invite is sent.'
        : r ? `Adds a contact (no portal login, no email or invite is sent) and ${MULTI[r] ? `adds them to the ${MULTI[r]}s of this order (after any already chosen)` : `puts them in the ${NEW_ROLES.find((x) => x[0] === r)[1]} slot of this order`}.` : ''; });
    $('#addnew', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter here must not submit the order
    const place = (role, c) => {
      if (role === 'Sales Person') { const list = $('[data-sales-list]', root); const box = $(`input[name=salesIds][value="${c.profileId || c.id}"]`, list);
        if (box) box.checked = true; else { const nd = $('[data-no-sales]', list); if (nd) nd.remove(); list.insertAdjacentHTML('beforeend', toText(salesBox({ id: c.profileId || c.id, firstName: c.firstName, lastName: c.lastName, role: 'Sales Person' }, true))); } }
      else if (MULTI[role]) placeParty(role, c); else pickers[role].set(c);
      toast(`${personLabel(c)} added as ${NEW_ROLES.find((x) => x[0] === role)[1]}`); reset(); anForm.hidden = true; };
    $('#an-create', root).addEventListener('click', guard(async () => {
      const role = anRole.value; if (!role) throw new Error('Choose the role first.');
      const first = v('an-first'); const email = v('an-email').toLowerCase(); if (!first) throw new Error('First name is required.');
      if (role === 'Sales Person' && !email) throw new Error('Email is required for a salesperson (it is their login).');
      // one person per email: offer the existing person instead of a duplicate
      if (email) { const hit = (await api.listContacts(email)).find((c) => (c.email || '').toLowerCase() === email);
        if (hit) { const okToPick = role !== 'Sales Person' || staff.some((s) => s.id === hit.profileId);
          dup.hidden = false; dup.innerHTML = toText(html`<p class="notice warn" data-dup>A person with this email already exists: <strong>${personLabel(hit)}</strong> (${hit.email}${hit.company ? ', ' + hit.company : ''}). ${okToPick ? 'Select them instead of creating a duplicate.' : 'They are not an active salesperson, so they cannot be added as one.'}</p>
            ${okToPick ? html`<button type="button" class="m-btn" id="an-use">Select existing person</button>` : ''}`);
          const use = $('#an-use', root); if (use) use.addEventListener('click', () => { if (!people.some((p) => p.id === hit.id)) people.push(hit); place(role, hit); });
          return; } }
      if (role === 'Sales Person') { const p = await api.adminCreateUser({ role: 'Sales Person', firstName: first, lastName: v('an-last'), email, phone: v('an-phone') });
        staff.push(p); place(role, { ...p, profileId: p.id }); return; }
      const c = await api.createContact({ firstName: first, lastName: v('an-last'), email, phone: v('an-phone'), company: ['Buyer Agent', 'Listing Agent', 'Lender'].includes(role) ? v('an-company') : '', contactType: $('#an-ctype', root).value });
      people.push(c); place(role, c); }));
    txSel.addEventListener('change', applyRefi); applyRefi();
    // ---------- submit (only from Review; Enter on an earlier step means Next) ----------
    let placing = false;
    form.addEventListener('submit', guard(async (e) => {
      e.preventDefault(); if (cur !== 'review') { next(); return; } if (placing) return;
      // every step again, in order: the first step with a problem is opened and its fields are marked
      for (const k of active().filter((x) => x !== 'review')) { const errs = validate(k); if (errs.length) { show(k); throw new Error(errs.map((x) => x.msg).join(' | ')); } }
      const f = formData(e.target);
      // Francis, Nov 3: Buyer agent (like Listing agent and Lender) is OPTIONAL. Text left in one of those boxes without a person picked from the list (a
      // half-typed name, "none", "N/A", browser autofill) never blocks the order: the order is created without that person and a note says so.
      // Buyers and sellers still have to be picked from the list (or the box cleared) so a client is never dropped by accident.
      const skipped = [];
      for (const [label, pk] of allPickers()) if (pk.typed && !pk.value) { if (OPTIONAL_SLOTS.includes(label)) skipped.push(label); else throw new Error(`${label}: pick a person from the list (or clear the box, or use "Add new user").`); }
      if (refi()) { REFI_HIDE.forEach((k) => { delete f[k]; }); }   // hidden on a refinance: never checked, never saved
      // Matt, Nov 3 (b): amounts are shown with commas (485,000) and sent clean (485000)
      const amt = refi() ? '' : moneyClean(f.emdAmount);
      const entities = {};   // hidden input name (p:<role> / p:<role>:<n>) -> entity
      for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r) => { const ent = entityOf(r); if (ent) entities[$('input[type=hidden]', r.pk.el).name] = ent; });
      const lenderPk = pickers.Lender; const lender = lenderPk && lenderPk.value ? people.find((p) => p.id === lenderPk.value) : null;
      const files = [...fileIn.files];
      const input = { ...f, emdAmount: amt, purchasePrice: refi() ? '' : moneyClean(f.purchasePrice), ...(refi() ? { emdDueDate: '' } : {}), loanAmount: moneyClean(f.loanAmount), salesIds: new FormData(e.target).getAll('salesIds'),
        ...(lender ? { lenderName: lender.company || '', lenderContact: personLabel(lender) } : {}) };
      placing = true; const btn = $('[data-place-order]', root); btn.disabled = true; btn.textContent = 'Placing order\u2026';
      let deal; try { deal = await api.createDeal(input); } catch (err) { placing = false; btn.disabled = false; btn.textContent = 'Place order'; throw err; }
      const problems = []; let tasks = 0; const added = {};
      // Buyer 1, Buyer 2, ..., Seller 1, Seller 2, ..., agents, lender, TC, sales team (p:<role> or p:<role>:<n>); the same order as the one-page form
      const entries = [...new FormData(e.target).entries()].filter(([k, x]) => k.startsWith('p:') && x).map(([k, x]) => [k, x, k.slice(2).replace(/:\d+$/, '')])
        .map((t, i) => [...t, i]).sort((a, b) => (ADD_ORDER.indexOf(a[2]) - ADD_ORDER.indexOf(b[2])) || (a[3] - b[3]));
      for (const [k, x, role] of entries) { if (!counts(role)) continue;   // refinance: hidden seller / realtor / TC boxes are not saved
        try { const res = await api.addParticipant(deal.id, x, role, entities[k] ? { entity: entities[k] } : undefined); tasks += (res && res.tasksCreated) || 0; added[role] = (added[role] || 0) + 1; } catch (err) { problems.push(`${role}: ${err.message}`); } }
      let saved = 0;
      for (let i = 0; i < files.length; i++) { const file = files[i]; const sel = $(`[data-doctype="${i}"]`, root);
        try { await api.addDocument(deal.id, { name: file.name, description: '', mimeType: file.type, size: file.size, dataUrl: await readFile(file), visibility: $('#nof-vis', root).value, folderId: null, docType: sel ? sel.value : '', wireInstructions: $('#nof-wire', root).checked }); saved++; }
        catch (err) { problems.push(`${file.name}: ${err.message}`); } }
      if (skipped.length) toast(`No ${skipped.join(' / ').toLowerCase()} added (nobody was picked from the list). You can add one later on the Contacts tab.`);
      toast(`Order ${deal.fileNumber} created${files.length ? ` with ${saved} document(s)` : ''}`);
      if (problems.length) toast('Some items were not added: ' + problems.join(' | '), 'err');
      // the confirmation panel on the new order's page (shown once; deal.js)
      try { sessionStorage.setItem(PLACED_KEY, JSON.stringify({ dealId: deal.id, fileNumber: deal.fileNumber, address: `${deal.street}, ${deal.city}, ${deal.state} ${deal.zip || ''}`.trim(), transactionType: deal.transactionType,
        added, tasks, docs: saved, skipped, problems, at: Date.now() })); } catch (err) { /* private mode: no confirmation panel, the toasts above still say it */ }
      go('/deals/' + deal.id);
    }));
    paint();
  } };
}
