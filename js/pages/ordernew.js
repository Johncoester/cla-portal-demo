// Place Order (Processor, Admin, Super admin; John Nov 2): creates a deal and links the chosen people (their intake tasks are copied from the current task templates).
// John, Nov 2 (later): Open Date (backdating allowed, never future), every US state (no default), EMD amount + due date, documents attached at placement,
// type-to-search pickers for Buyer / Seller / Buyer Agent / Listing Agent, one "Add new user" place, and Transaction Coordinator = TC accounts only.
import { html, raw, $, $$, guard, formData, options, toast, fmtSize, toText } from '../ui.js?v=202611031702';
import { fmtPhone, TX_TYPES, runsOrders, isProcessor, localDate, US_STATE_NAMES, DOC_TYPES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, visibilityChoices, visibilityLabel, CONTACT_TYPES, contactTypeForRole, isRefi, REFI_BLOCKED_ROLES } from '../data/constants.js?v=202611031702';
import { pickerHtml, mountPicker, personLabel } from './person-picker.js?v=202611031702';
import { ENTITY_TYPES } from '../data/templates.js?v=202611031702';
import { moneyClean } from './money-input.js?v=202611031702';
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
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

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
  const body = html`
    <div class="box-title"><h2><span class="h-ico"></span>Place Order</h2></div>
    <form id="nof" class="card form-grid">
      <label class="span2">Street address *<input name="street" required maxlength="200"></label>
      <label>City *<input name="city" required maxlength="100"></label><label>State *<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}">${n} (${c})</option>`)}</select></label>
      <label>ZIP<input name="zip" maxlength="10" placeholder="20850"></label>
      <label>County <span class="muted small">(optional)</span><input name="county" maxlength="100" placeholder="e.g. Frederick" aria-label="County"></label>
      <label>Transaction type<select name="transactionType">${options(TX_TYPES, 'Purchase')}</select></label>
      <label>Source of business<select name="sourceOfBusiness" aria-label="Source of business"><option value="">(not set)</option>${options(sources, '', (o) => o.label, (o) => o.value)}</select><span class="muted small">How this order came to us. ${user.isAdmin ? html`Edit the list in <a href="#/crm/settings">CRM Settings &rarr; Lead Source</a>.` : 'An Admin edits the list (CRM Settings, Lead Source).'}</span></label>
      <label>Open date *<input name="openDate" type="date" required value="${today}" max="${today}" title="The day the order came in. Can be backdated; not in the future."></label>
      <label data-refi-hide="purchasePrice">Purchase price<input name="purchasePrice" inputmode="decimal" placeholder="485,000" data-money autocomplete="off"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" placeholder="388,000" data-money autocomplete="off"></label>
      <label data-refi-hide="emdAmount">EMD amount<input name="emdAmount" inputmode="decimal" placeholder="10,000" aria-label="EMD amount (earnest money deposit)" data-money autocomplete="off"></label><label data-refi-hide="emdDueDate">EMD due date<input name="emdDueDate" type="date"></label>
      <p class="span2 notice info" data-refi-note hidden><strong>Refinance:</strong> no purchase price, EMD, sellers or realtors. The people on the order are the borrower(s), salespeople, the Processor and the Lender. Switch back to Purchase to see those fields again.</p>
      <label>Closing date<input name="closingDate" type="date"></label>
      <label>Processor *<select name="processorId" required>${meProc ? '' : html`<option value="">Choose the Processor&hellip;</option>`}${options(procs, meProc ? user.id : '', (s) => `${s.firstName} ${s.lastName}${s.id === user.id ? ' (you)' : ''}`, (s) => s.id)}</select></label>
      <fieldset class="span2" data-sales-picker><legend>Salespeople on this order (check all that apply)</legend><div data-sales-list>${staff.length ? staff.map((s) => salesBox(s)) : html`<p class="muted" data-no-sales>No active salespeople.</p>`}</div></fieldset>
      <h3 class="span2">People on this order <span class="muted">(all optional; you can add or change them later under Contacts)</span></h3>
      ${SEARCH.map(([role, label]) => (MULTI[role] ? partyBlock(role, label) : role === 'Lender' ? html`<div class="span2 lender-block" data-lender-block>${pickerHtml('p:' + role, label)}
        <div class="form-grid"><label>Lender phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone aria-label="Lender phone"></label>
        <label>Lender email<input name="lenderEmail" type="email" maxlength="200" aria-label="Lender email"></label></div>
        <p class="muted small">Filled in from the lender you pick (change them for this order if needed). Optional, like the lender.</p></div>` : pickerHtml('p:' + role, label)))}
      <label data-refi-hide="tc">Transaction coordinator<select name="p:Transaction Coordinator"><option value="">(none yet)</option>${options(tcs, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.contactId)}</select></label>
      <label>Sales team member<select name="p:Sales Team"><option value="">(none yet)</option>${options(contacts, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.id)}</select></label>
      <fieldset class="span2" id="addnew"><legend>Add new user</legend>
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
      <label class="span2">Notes<textarea name="notes" rows="3" maxlength="2000"></textarea></label>
      <fieldset class="span2" id="nof-docs"><legend>Documents (e.g. the sales contract)</legend>
        <label>Files <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each; choose several at once)</span><input type="file" id="nof-files" multiple accept="${ALLOWED_UPLOAD_EXT.map((e) => '.' + e).join(',')}"></label>
        <div id="nof-filelist"></div>
        <label>Who can see them<select id="nof-vis">${options(visOpts, visOpts[0], (v) => visibilityLabel(v, user.role))}</select></label>
        <label class="check"><input type="checkbox" id="nof-wire"> These are wire instructions (buyer clients and CLA Title only; agents never see them)</label>
        <p class="muted small">They are saved to the order's Documents tab when you create the order. Documents are kept permanently and cannot be deleted.</p>
      </fieldset>
      <div class="span2"><button class="m-btn" type="submit">Create order</button> <a class="ghost" href="#/orders">Cancel</a></div>
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
      const tg = $('[data-ent-toggle]', el); const panel = $('[data-entity-panel]', el);
      tg.addEventListener('click', () => { const on = panel.hidden; panel.hidden = !on; tg.setAttribute('aria-pressed', String(on)); tg.textContent = on ? '\u2212 Remove entity' : '+ Add entity'; if (on) $('[data-ent="name"]', panel).focus(); });
      $('[data-rm-row]', el).addEventListener('click', () => { rows[role] = rows[role].filter((z) => z !== r); el.remove(); renumber(role); while (rows[role].length < MIN_ROWS) addRow(role); }); renumber(role); return r; };
    const addRow = (role) => { const box = $(`[data-multi="${role}"] [data-rows]`, root); box.insertAdjacentHTML('beforeend', toText(partyRow(role, labelOf(role), rows[role].length + 1)));
      const r = hookRow(role, box.lastElementChild); return r; };
    Object.keys(MULTI).forEach((role) => { rows[role] = []; $$(`[data-multi="${role}"] [data-party-row]`, root).forEach((el) => hookRow(role, el));
      $(`[data-add-row="${role}"]`, root).addEventListener('click', () => { const r = addRow(role); $('.picker-q', r.el).focus(); }); });
    // ---------- Refinance: hide / restore ----------
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
      if (on && REFI_BLOCKED_ROLES.includes(anRole.value)) { anRole.value = ''; anRole.dispatchEvent(new Event('change')); } };
    // which pickers count for this transaction type (a refinance ignores the hidden seller / realtor boxes completely)
    const counts = (role) => !(refi() && REFI_BLOCKED_ROLES.includes(role));
    const allPickers = () => [...SEARCH.filter(([role]) => !MULTI[role] && counts(role)).map(([role, label]) => [label, pickers[role]]), ...Object.keys(MULTI).filter(counts).flatMap((role) => rows[role].map((r) => [labelOf(role), r.pk]))];
    // "Add new user" / "Select existing person" with role Buyer or Seller APPENDS: fills the first empty row, else adds a row
    const placeParty = (role, c) => { const free = rows[role].find((r) => !r.pk.value && !r.pk.typed); (free || addRow(role)).pk.set(c); };
    // ---------- documents chosen at placement: one row per file with its own document type ----------
    const fileIn = $('#nof-files', root); const fileList = $('#nof-filelist', root);
    fileIn.addEventListener('change', () => { fileList.innerHTML = toText(html`${[...fileIn.files].map((f, i) => html`<div class="nof-file" data-file="${i}"><strong>${f.name}</strong> <span class="muted small">${fmtSize(f.size)}</span>
      <label>Document type<select data-doctype="${i}" aria-label="Document type for ${f.name}"><option value="">Choose&hellip;</option>${options(DOC_TYPES, '')}</select></label></div>`)}`); });
    // ---------- one "Add new user" place ----------
    const anForm = $('#an-form', root); const anRole = $('#an-role', root); const anFields = $('#an-fields', root); const dup = $('#an-dup', root);
    const val = (id) => $('#' + id, root).value.trim();
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
      const first = val('an-first'); const email = val('an-email').toLowerCase(); if (!first) throw new Error('First name is required.');
      if (role === 'Sales Person' && !email) throw new Error('Email is required for a salesperson (it is their login).');
      // one person per email: offer the existing person instead of a duplicate
      if (email) { const hit = (await api.listContacts(email)).find((c) => (c.email || '').toLowerCase() === email);
        if (hit) { const okToPick = role !== 'Sales Person' || staff.some((s) => s.id === hit.profileId);
          dup.hidden = false; dup.innerHTML = toText(html`<p class="notice warn" data-dup>A person with this email already exists: <strong>${personLabel(hit)}</strong> (${hit.email}${hit.company ? ', ' + hit.company : ''}). ${okToPick ? 'Select them instead of creating a duplicate.' : 'They are not an active salesperson, so they cannot be added as one.'}</p>
            ${okToPick ? html`<button type="button" class="m-btn" id="an-use">Select existing person</button>` : ''}`);
          const use = $('#an-use', root); if (use) use.addEventListener('click', () => { if (!people.some((p) => p.id === hit.id)) people.push(hit); place(role, hit); });
          return; } }
      if (role === 'Sales Person') { const p = await api.adminCreateUser({ role: 'Sales Person', firstName: first, lastName: val('an-last'), email, phone: val('an-phone') });
        staff.push(p); place(role, { ...p, profileId: p.id }); return; }
      const c = await api.createContact({ firstName: first, lastName: val('an-last'), email, phone: val('an-phone'), company: ['Buyer Agent', 'Listing Agent', 'Lender'].includes(role) ? val('an-company') : '', contactType: $('#an-ctype', root).value });
      people.push(c); place(role, c); }));
    txSel.addEventListener('change', applyRefi); applyRefi();
    // entity of a buyer / seller row (null when "+ Add entity" is closed or empty)
    const entityOf = (r) => { const panel = $('[data-entity-panel]', r.el); if (panel.hidden) return null;
      const e = Object.fromEntries($$('[data-ent]', panel).map((i) => [i.dataset.ent, i.value.trim()])); return Object.values(e).some(Boolean) ? e : null; };
    // ---------- submit ----------
    form.addEventListener('submit', guard(async (e) => {
      e.preventDefault(); const f = formData(e.target);
      // Francis, Nov 3: Buyer agent (like Listing agent and Lender) is OPTIONAL. Text left in one of those boxes without a person picked from the list (a
      // half-typed name, "none", "N/A", browser autofill) never blocks the order: the order is created without that person and a note says so.
      // Buyers and sellers still have to be picked from the list (or the box cleared) so a client is never dropped by accident.
      const skipped = [];
      for (const [label, pk] of allPickers()) if (pk.typed && !pk.value) { if (OPTIONAL_SLOTS.includes(label)) skipped.push(label); else throw new Error(`${label}: pick a person from the list (or clear the box, or use "Add new user").`); }
      for (const role of Object.keys(MULTI).filter(counts)) { const ids = rows[role].map((r) => r.pk.value).filter(Boolean); const twice = ids.find((id, i) => ids.indexOf(id) !== i);
        if (twice) throw new Error(`${personLabel(people.find((p) => p.id === twice) || { firstName: 'That person', lastName: '' })} is listed twice as ${labelOf(role)}.`); }
      if (refi()) { REFI_HIDE.forEach((k) => { delete f[k]; }); }   // hidden on a refinance: never checked, never saved
      // Matt, Nov 3 (b): amounts are shown with commas (485,000) and sent clean (485000)
      const amt = refi() ? '' : moneyClean(f.emdAmount); if (amt && !(isFinite(Number(amt)) && Number(amt) >= 0)) throw new Error('EMD amount must be a number of 0 or more.');
      for (const [k, l] of [['purchasePrice', 'Purchase price'], ['loanAmount', 'Loan amount']]) { const v = moneyClean(f[k]); if (v && !(isFinite(Number(v)) && Number(v) >= 0)) throw new Error(`${l} must be a number of 0 or more.`); }
      const entities = {};   // hidden input name (p:<role> / p:<role>:<n>) -> entity
      for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r, i) => { const e = entityOf(r); if (!e) return; const lab = rowLabel(labelOf(role), i + 1).replace(/ \(optional\)$/, '');
        if (!r.pk.value) throw new Error(`${lab}: pick the person who is our contact for the entity (or remove the entity).`);
        if (!e.name) throw new Error(`${lab}: entity name is required (or remove the entity).`); entities[$('input[type=hidden]', r.pk.el).name] = e; });
      const lenderPk = pickers.Lender; const lender = lenderPk && lenderPk.value ? people.find((p) => p.id === lenderPk.value) : null;
      if (f.openDate && f.openDate > localDate()) throw new Error('Open date cannot be in the future.');
      const files = [...fileIn.files]; for (const file of files) { if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is too large for this demo.`);
        if (!ALLOWED_UPLOAD_EXT.includes((file.name.split('.').pop() || '').toLowerCase())) throw new Error(`${file.name}: that file type is not allowed.`); }
      const input = { ...f, emdAmount: amt, purchasePrice: refi() ? '' : moneyClean(f.purchasePrice), ...(refi() ? { emdDueDate: '' } : {}), loanAmount: moneyClean(f.loanAmount), salesIds: new FormData(e.target).getAll('salesIds'),
        ...(lender ? { lenderName: lender.company || '', lenderContact: personLabel(lender) } : {}) };
      const deal = await api.createDeal(input); const problems = [];
      // in screen order: Buyer 1, Buyer 2, ..., Seller 1, Seller 2, ... (p:<role> or p:<role>:<n>)
      for (const [k, v] of new FormData(e.target).entries()) if (k.startsWith('p:') && v) { const role = k.slice(2).replace(/:\d+$/, ''); if (!counts(role)) continue;   // refinance: hidden seller / realtor / TC boxes are not saved
        try { await api.addParticipant(deal.id, v, role, entities[k] ? { entity: entities[k] } : undefined); } catch (err) { problems.push(`${role}: ${err.message}`); } }
      for (let i = 0; i < files.length; i++) { const file = files[i]; const sel = $(`[data-doctype="${i}"]`, root);
        try { await api.addDocument(deal.id, { name: file.name, description: '', mimeType: file.type, size: file.size, dataUrl: await readFile(file), visibility: $('#nof-vis', root).value, folderId: null, docType: sel ? sel.value : '', wireInstructions: $('#nof-wire', root).checked }); }
        catch (err) { problems.push(`${file.name}: ${err.message}`); } }
      if (skipped.length) toast(`No ${skipped.join(' / ').toLowerCase()} added (nobody was picked from the list). You can add one later on the Contacts tab.`);
      toast(`Order ${deal.fileNumber} created${files.length ? ` with ${files.length - problems.filter((p) => files.some((x) => p.startsWith(x.name + ':'))).length} document(s)` : ''}`);
      if (problems.length) toast('Some items were not added: ' + problems.join(' | '), 'err');
      go('/deals/' + deal.id);
    }));
  } };
}
