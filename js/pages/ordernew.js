// Place Order (Processor, Admin, Super admin; John Nov 2): creates a deal and links the chosen people (their intake tasks are copied from the current task templates).
// John, Nov 2 (later): Open Date (backdating allowed, never future), every US state (no default), EMD amount + due date, documents attached at placement,
// type-to-search pickers for Buyer / Seller / Buyer Agent / Listing Agent, one "Add new user" place, and Transaction Coordinator = TC accounts only.
// REDESIGN (John, Nov 3): the same form is now a STEP-BY-STEP flow modeled on the existing portal's order opening (docs/ORDER-OPEN-REFERENCE.md):
//   1 Transaction -> 2 Property -> 3 Buyers & Sellers -> 4 Lender & Loan -> 5 Agents -> 6 Team & Notes -> 7 Review & Submit
// with a progress bar (click any step to jump to it), per-step validation on Next, a review summary and a confirmation panel on the new order's page.
// It is still ONE <form id="nof"> with the same field names, ids and data-attributes; only one step is shown at a time. Every rule is unchanged:
// refinance hides price / EMD / sellers / agents / both transaction coordinators (the Agents step is skipped), Buyer Agent / Listing Agent / Lender are optional,
// two buyer rows and two seller rows to start ("+ Add another" adds the rest; an empty extra row is not saved), entity representative, commas in money fields, source of business (who referred the file),
// wires never shown to agents.
import { html, raw, $, $$, guard, formData, options, toast, fmtSize, toText, fmtDate, fmtMoney } from '../ui.js?v=202611161500';
import { occSelects, yesNo } from './occ-fields.js?v=202611161500';
import { fmtPhone, TX_TYPES, runsOrders, US_STATE_NAMES, DOC_TYPES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, visibilityChoices, visibilityLabel, CONTACT_TYPES, contactTypeForRole, isRefi, REFI_BLOCKED_ROLES, moneyAmount } from '../data/constants.js?v=202611101015';
import { officeDate } from '../data/office-date.js?v=202611102100';
import { pickerHtml, mountPicker, personLabel, splitPersonName } from './person-picker.js?v=202611161500';
import { ENTITY_TYPES } from '../data/templates.js?v=202611171000';
import { showMdQuestions, processorChoices, referralPartyByRole, encodeReferral, referralFromForm } from '../data/place-order.js?v=202611092320';
import { closerChoices, resolveCloser } from '../data/closer.js?v=202611101015';
import { duplicateNotice } from '../data/order-duplicates.js?v=202611101700';
import { CLA_REPRESENTATION, claRepresentationLabel, claRepresentationWritesEnabled, draftKeepsUnrecordedRepresentation, representationPayload } from '../data/cla-representation.js?v=202611090950';
import { orderDraftKey, readOrderDraft, writeOrderDraft, collectOrderFields, rememberedFiles, applyOrderDraft, claimOrderDraft, releaseOrderClaim, tombstoneOrderDraft } from '../data/order-draft.js?v=202611140200';
import { looksLikeEntityName, entityIdentity, newPartyContact, lenderCompanyContact, lenderExtras, readLenderContactRows } from '../data/lender-file.js?v=202611101200';
import { bindAddressFill } from '../data/address-fill.js?v=202611141400';
import { parcelFieldsHtml, mountParcelFields, parcelsFromForm } from './parcel-fields.js?v=202611161500';
import { readEarnest, COMMISSION_PAID_BY } from '../data/earnest-commission.js?v=202611141000';
import { partyDisplayName } from '../data/party-name.js?v=202611102000';
import { lenderFieldsHtml, lenderContactRowHtml, mountLossPayee, mountCplSame } from './lender-section.js?v=202611161500';
import { sameUploadId } from '../data/supabase-nov5.js?v=202611162200';
// John, Nov 2 (a real contract had two buyers and two sellers): Buyer and Seller take one or more people. Each row is the same type-to-search picker;
// "+ Add another buyer / seller" adds a row, rows can be removed before the order is created. Row 1 keeps the field name p:<role>, row n is p:<role>:<n>.
// Each person becomes their own deal_participants row, so each buyer / seller gets their own copy of the client intake tasks (existing per-person behaviour).
export const MULTI = { 'Client-Buyer': 'buyer', 'Client-Seller': 'seller' };
// Matt, Nov 9 (MF-015): a new order starts with two buyer rows and two seller rows. "+ Add another buyer / seller" adds the next row.
// An empty extra row is ignored on save (only a picked person is added). Each row has its own "+ Add entity": the buyer / seller is an LLC,
// corporation, partnership or trust -> entity name, type and the Entity Representative (name, title or role, phone, email). Saved on that person's
// row of the order and pre-filled on their Personal information form (+ Add entity there).
export const MIN_ROWS = 2;
const rowLabel = (label, n) => `${label} ${n}${n > 1 ? ' (optional)' : ''}`;
const entityPanel = (label) => html`<div class="entity-panel" data-entity-panel hidden><p class="muted small">This ${label.toLowerCase()} is an entity (LLC, corporation, partnership or trust). Enter the entity name. A contact person is optional. First and last name are not required.</p>
  <div class="form-grid"><label>Entity name *<input data-ent="name" maxlength="200" aria-label="Entity name"></label>
  <label>Entity type<select data-ent="type" aria-label="Entity type"><option value="">Choose&hellip;</option>${ENTITY_TYPES.map((t) => html`<option>${t}</option>`)}</select></label>
  <label>Entity Representative<input data-ent="repName" maxlength="120" placeholder="Full name" aria-label="Entity Representative"></label>
  <label>Representative's title or role<input data-ent="repTitle" maxlength="120" placeholder="e.g. Managing Member, Trustee" aria-label="Representative's title or role"></label>
  <label>Representative's phone<input data-ent="repPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone aria-label="Representative's phone"></label>
  <label>Representative's email<input data-ent="repEmail" type="email" maxlength="200" aria-label="Representative's email"></label></div></div>`;
const referralSlot = (role) => { const meta = referralPartyByRole(role); if (!meta) return '';
  return html`<label class="referral-source" data-referral-slot="${meta.code}"><input type="radio" name="referralSource" value="pending" data-referral-code="${meta.code}" disabled aria-label="Source of business: ${meta.label}, pick a person first"> <span>Source of business</span></label>`; };
const partyRow = (role, label, n = 1) => html`<div class="party-row-wrap" data-party-row="${n}"><div class="multi-row">${pickerHtml('p:' + role, rowLabel(label, n))}${referralSlot(role)}<button type="button" class="ghost" data-ent-toggle aria-pressed="false" title="This ${label.toLowerCase()} is an LLC, corporation, partnership or trust">+ Add entity</button><button type="button" class="ghost" data-rm-row title="Remove this ${label.toLowerCase()} (before the order is created)" hidden>Remove</button></div>${entityPanel(label)}</div>`;
const pickerWithReferral = (role, label) => html`<div class="picker-with-ref" data-referral-wrap="${referralPartyByRole(role).code}">${pickerHtml('p:' + role, label)}${referralSlot(role)}</div>`;
const agentCard = (role, label) => html`<div class="agent-card" data-agent-card="${role}">${pickerWithReferral(role, label)}
  <div class="form-grid" data-agent-edit hidden>
    <label>Role<select data-agent-role aria-label="${label} role"><option value="Buyer Agent" ${role === 'Buyer Agent' ? raw('selected') : ''}>Buyer agent</option><option value="Listing Agent" ${role === 'Listing Agent' ? raw('selected') : ''}>Listing agent</option></select></label>
    <label>Phone<input data-agent-phone type="tel" inputmode="tel" maxlength="40" aria-label="${label} phone" placeholder="xxx-xxx-xxxx" data-phone></label>
    <label>Email<input data-agent-email type="email" maxlength="200" aria-label="${label} email"></label>
    <label>Brokerage<input data-agent-company maxlength="120" aria-label="${label} brokerage"></label>
    <p class="span2 muted small">Change the person in the search box. Role, phone, email and brokerage can be changed before the order is saved.</p>
  </div></div>`;
const partyBlock = (role, label) => html`<fieldset class="span2 multi-party" data-multi="${role}"><legend>${label}s</legend>
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
// Sales Team is not collected on Place Order (MF-020). A Sales Team person already on a file stays there.
const ADD_ORDER = ['Client-Buyer', 'Client-Seller', 'Buyer Agent', 'Listing Agent', 'Lender', 'Transaction Coordinator'];
// Form fields can lose the hidden id. The picker state is the person who was actually selected.
export function partyEntries(formParts, picks) {
  const merged = new Map((formParts || []).filter((part) => part && part.name && String(part.contactId || '').trim()).map((part) => [part.name, { name: part.name, contactId: String(part.contactId).trim(), role: part.role }]));
  for (const part of picks || []) if (part && part.name && String(part.contactId || '').trim()) merged.set(part.name, { name: part.name, contactId: String(part.contactId).trim(), role: part.role });
  return [...merged.values()].sort((a, b) => (ADD_ORDER.indexOf(a.role) - ADD_ORDER.indexOf(b.role)) || a.name.localeCompare(b.name));
}
// the steps (key, title, one-line hint). The Agents step is skipped on a refinance (no realtors, no TC).
export const STEPS = [
  ['transaction', 'Transaction', 'Type, open date, contract'],
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
  const repOn = claRepresentationWritesEnabled(api);
  if (!runsOrders(user)) throw new Error('Only a Processor or Admin can place orders.');
  const contacts = await api.listContacts();
  const optional = async (fn) => { try { return (await fn()) || []; } catch (e) { return []; } };
  const staff = await optional(() => api.listSalesStaff()); const procs = await optional(() => api.listProcessors()); const preprocs = await optional(() => api.listPreprocessors()); const tcs = await optional(() => api.listCoordinators());
  const closers = closerChoices(await optional(() => api.listActiveStaff()));
  // the file's Processor: a Processor defaults to themselves; an Admin / Super admin is not a valid Processor, so they must choose one
  const today = officeDate();
  // "Add new user" roles. Salesperson creates a staff login, which is Admin-only (John's earlier decision), so only Admins / Super admins see it.
  const NEW_ROLES = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer Agent'], ['Listing Agent', 'Listing Agent'], ['Lender', 'Lender'], ['Transaction Coordinator', 'Transaction coordinator'], ...(user.isAdmin ? [['Sales Person', 'Salesperson']] : [])];
  const visOpts = visibilityChoices(user.role, user.isAdmin);
  const salesBox = (s, checked = false) => html`<label class="check"><input type="checkbox" name="salesIds" value="${s.id}" ${checked ? raw('checked') : ''}> ${s.firstName} ${s.lastName} <span class="muted small">(${s.role})</span></label>`;
  const tcBlank = tcs.length ? '(none)' : '(none available for this login)';
  const tcSelect = (name, label) => html`<label>${label}<select name="${name}"><option value="">${tcBlank}</option>${options(tcs, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.contactId)}</select></label>`;
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
        ${repOn ? html`<fieldset class="span2" data-cla-representation><legend>Who CLA represents</legend>
          <p class="muted small">CLA's side of this file. It is not a person's portal role, not the buyer or listing agent, not the source of business, and it does not change who can see the file. A new order starts as both sides. An older file with no answer stays not recorded.</p>
          ${CLA_REPRESENTATION.map((row) => html`<label class="referral-source"><input type="radio" name="claRepresentation" value="${row.code}" ${row.code === 'both' ? raw('checked') : ''}> ${row.label}</label>`)}
        </fieldset>` : ''}
        <label>Open date *<input name="openDate" type="date" required value="${today}" max="${today}" title="The day the order came in. Can be backdated; not in the future."><span class="field-hint">The day the order came in. Can be backdated, never in the future.</span></label>
        <fieldset class="span2" id="tx-docs"><legend data-tx-doc-label>Upload sales contract</legend>
          <label class="dropzone-label">Files <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each)</span><input type="file" id="tx-files" multiple accept="${ALLOWED_UPLOAD_EXT.map((e) => '.' + e).join(',')}"></label>
          <div id="tx-filelist"></div>
          <p class="notice info" data-vis-prompt="tx-vis" hidden>Who can see these files? Choose before you continue.</p>
          <label>Who can see them<select id="tx-vis" data-vis>${options(visOpts, visOpts[0], (v) => visibilityLabel(v, user.role))}</select></label>
        </fieldset>
        <p class="span2 notice info" data-refi-note hidden><strong>Refinance:</strong> no purchase price, EMD, sellers or realtors. The people on the order are the borrower(s), salespeople, the Processor and the Lender. A source of business is chosen only if you mark one of those people. Switch back to Purchase to see the other fields again.</p></div>`,
        'What kind of order is this, and when did it come in?')}
      ${panel('property', html`<div class="form-grid">
        <label class="span2">Street address *<input name="street" required maxlength="200" autocomplete="off"></label>
        <label>City *<input name="city" required maxlength="100"></label><label>State *<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}">${n} (${c})</option>`)}</select></label>
        <label>ZIP<input name="zip" maxlength="10" placeholder="20850"></label>
        <label>County <span class="muted small">(optional; filled from the address or the ZIP when left blank)</span><input name="county" maxlength="100" placeholder="e.g. Frederick" aria-label="County"></label>
        ${parcelFieldsHtml([''])}
        <p class="span2 muted small" data-address-fill>Leave the street box (or pick a full address) and the empty city, state, ZIP and county fill from that line and the bundled ZIP table. A value you already typed stays. Parcel IDs stay typed; use + Parcel ID for another.</p>
        <div class="span2" id="md-occ" hidden><p class="muted small">Maryland purchases only.</p>${occSelects({})}</div></div>`,
        'The address of the property being bought, sold or refinanced.')}
      ${panel('parties', html`<p class="muted small people-optional">People on this order are all optional; you can add or change them later under Contacts. Type a name and pick a match, or choose <strong>Add "…" as a new person</strong> in the list. <strong>Add new user</strong> below still works for full details (email, entity, lender company).</p>
        <div class="span2" id="sob-block" data-referral-bar><fieldset class="referral-bar"><legend>Source of business</legend>
          <label class="referral-source"><input type="radio" name="referralSource" value="" checked data-referral-clear aria-label="Source of business: Not set"> Not set</label>
          <p class="muted small" data-referral-status>Source of business: Not set. Mark one buyer, seller, buyer agent, listing agent, or lender. Nobody is selected for you. This is not the CLA salesperson and it does not change a contact's Lead Source.</p></fieldset></div>
        <div class="form-grid">${partyBlock('Client-Buyer', 'Buyer')}${partyBlock('Client-Seller', 'Seller')}</div>`,
        'Type a name and pick a match, or add them from the list when there is no match. A buyer or seller that is an LLC, corporation, partnership or trust: use + Add entity and enter the entity name. A representative is optional.')}
      ${panel('loan', html`<h4 class="wiz-sub">Amounts and dates</h4><div class="form-grid">
        <label data-refi-hide="purchasePrice">Purchase price<input name="purchasePrice" inputmode="decimal" placeholder="485,000" data-money autocomplete="off"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" placeholder="388,000" data-money autocomplete="off"></label>
        <label data-refi-hide="emdAmount">EMD amount<input name="emdAmount" inputmode="decimal" placeholder="10,000" aria-label="EMD amount (earnest money deposit)" data-money autocomplete="off"></label><label data-refi-hide="emdDueDate">EMD due date<input name="emdDueDate" type="date"></label>
        <label>Closing date<input name="closingDate" type="date"></label></div>
        <h4 class="wiz-sub" data-refi-hide="earnestCommission">Earnest &amp; Commissions <span class="muted small">(optional)</span></h4>
        <div class="form-grid" data-refi-hide="earnestCommission" data-earnest-commission>
          <label>EMD held by<input name="emdHeldBy" maxlength="200" aria-label="EMD held by" placeholder="CLA Title, listing brokerage, or another holder"></label>
          <label>Commission base<input name="commissionBase" inputmode="decimal" data-money aria-label="Commission base" autocomplete="off"></label>
          <label>Commission %<input name="commissionPercent" inputmode="decimal" aria-label="Commission percent" autocomplete="off"></label>
          <label>Additional<input name="commissionAdditional" inputmode="decimal" data-money aria-label="Commission additional" autocomplete="off"></label>
          <label>Total<input name="commissionTotal" data-commission-total readonly aria-label="Commission total" tabindex="-1"></label>
          <label>Paid by<select name="commissionPaidBy" aria-label="Commission paid by"><option value="">Choose&hellip;</option>${COMMISSION_PAID_BY.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
        </div>
        <h4 class="wiz-sub">Lender <span class="muted small">(optional)</span></h4>
        <div class="lender-block" data-lender-block>${pickerWithReferral('Lender', 'Lender')}
        <div class="form-grid"><label class="span2">Lender company name<input name="lenderName" maxlength="200" aria-label="Lender company name" placeholder="Company name (a contact person is optional)" data-lender-company></label>
        <label>Lender phone<input name="lenderPhone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone aria-label="Lender phone"></label>
        <label>Lender email<input name="lenderEmail" type="email" maxlength="200" aria-label="Lender email"></label>
        ${lenderFieldsHtml({})}</div>
        <div data-lender-contacts><h4 class="wiz-sub">Lender contacts <span class="muted small">(optional)</span></h4><div data-lender-contact-rows></div>
          <button type="button" class="ghost" data-add-lender-contact>+ Add lender contact</button>
          <p class="muted small">Each person is a Loan Officer or a Lender TC (the lender's processor). More than one is allowed. Leave this blank to save the company with no contact person.</p></div>
        <p class="muted small">Company name, phone and email fill in from the lender you pick (change them for this order if needed). The loss payee clause lists clauses already used for that company, and you can edit the text. Optional, like the lender.</p></div>`,
        'Money is typed with commas (485,000). Every amount is optional and can be filled in later.')}
      ${panel('agents', html`<div class="form-grid agents-grid">${agentCard('Buyer Agent', 'Buyer agent')}${agentCard('Listing Agent', 'Listing agent')}
        ${tcSelect('p:Transaction Coordinator', "Buyer's transaction coordinator")}<button type="button" class="ghost" data-add-tc="p:Transaction Coordinator">+ Add buyer's transaction coordinator</button>
        ${tcSelect('p:Transaction Coordinator:2', 'Listing transaction coordinator')}<button type="button" class="ghost" data-add-tc="p:Transaction Coordinator:2">+ Add listing transaction coordinator</button>
        ${tcs.length ? '' : html`<p class="span2 muted small" data-no-tc>No transaction coordinator is available for this login.</p>`}</div>
        <p class="muted small">Both transaction coordinators are optional and are saved as transaction coordinators on the order. A new person needs a Transaction Coordinator login before they can be the coordinator on the file. Agents never see wire instructions.</p>`,
        'The realtors on each side, who referred the file, and each side\'s transaction coordinator.')}
      ${panel('team', html`<div class="form-grid">
        <label>Processor<select name="processorId" data-processor-select><option value="">Unassigned</option></select> <button type="button" class="ghost" data-refresh-processors>Refresh list</button><span class="field-hint">Leave Unassigned to save the file now. A Processor added after you opened this page appears when you refresh the list. Nothing else on the form is cleared.</span></label><label>Preprocessor<select name="preprocessorUserId"><option value="">(none)</option>${options(preprocs, '', (p) => `${p.firstName} ${p.lastName}`, (p) => p.id)}</select>${preprocs.length ? '' : html`<span class="field-hint" data-no-preproc>No preprocessor is available for this login.</span>`}</label>
        <label class="span2">Closer<input name="closerName" list="place-closer-staff" maxlength="120" autocomplete="off" aria-label="Closer" data-closer-input><datalist id="place-closer-staff">${closers.map((c) => html`<option value="${c.label}"></option>`)}</datalist><span class="field-hint">Pick an active CLA staff member, or type a name. Same field as Edit order details.</span></label>
        <fieldset class="span2" data-sales-picker><legend>Salespeople on this order</legend><div data-sales-list class="check-grid">${staff.length ? staff.map((s) => salesBox(s)) : html`<p class="muted" data-no-sales>No salespeople are available for this login.</p>`}</div><span class="field-hint">Check every salesperson on this order. You can pick more than one.</span></fieldset>
        <label class="span2">Notes<textarea name="notes" rows="3" maxlength="2000" placeholder="Anything the team should know about this order"></textarea></label>
        <fieldset class="span2" id="nof-docs"><legend>Documents (e.g. the sales contract)</legend>
          <label class="dropzone-label">Files <span class="muted small">(${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each; choose several at once)</span><input type="file" id="nof-files" multiple accept="${ALLOWED_UPLOAD_EXT.map((e) => '.' + e).join(',')}"></label>
          <div id="nof-filelist"></div>
          <p class="notice info" data-vis-prompt="nof-vis" hidden>Who can see these files? Choose before you continue.</p>
          <label>Who can see them<select id="nof-vis" data-vis>${options(visOpts, visOpts[0], (v) => visibilityLabel(v, user.role))}</select></label>
          <label class="check"><input type="checkbox" id="nof-wire"> These are wire instructions (buyer clients and CLA Title only; agents never see them)</label>
          <p class="muted small">They are saved to the order's Documents tab when you create the order. Documents are kept permanently and cannot be deleted.</p>
        </fieldset></div>`,
        'Who at CLA Title works this order, plus notes and any documents you already have.')}
      ${panel('review', html`<div data-review></div>
        <div class="wiz-submit"><button class="m-btn m-btn-lg" type="submit" data-place-order>Place order</button><span class="muted small">Creates the order and adds the people above. No emails, texts or invites are sent.</span></div>`,
        'Check everything below. Use Edit to change a section. Place order creates the file. Save draft does not.')}
      <fieldset id="addnew" class="addnew" data-wiz-home="parties"><legend>Add new user</legend>
        <p class="muted small addnew-hint">Someone not in the lists? Add them here and they are put on this order.</p>
        <button type="button" class="ghost" id="an-open">+ Add new user</button>
        <div id="an-form" class="form-grid" hidden>
          <label class="span2">Role *<select id="an-role" aria-label="Role"><option value="">Choose the role&hellip;</option>${NEW_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
          <div class="span2 form-grid" id="an-fields" hidden>
            <label class="span2" id="an-kind-l" hidden>This buyer or seller is<select id="an-kind" aria-label="Person or entity"><option value="person">A person</option><option value="entity">An entity (LLC, company, trust)</option></select></label>
            <label id="an-entity-l" hidden>Entity name *<input id="an-entity" maxlength="200" aria-label="Entity name"></label>
            <label id="an-etype-l" hidden>Entity type<select id="an-etype" aria-label="Entity type"><option value="">Choose&hellip;</option>${ENTITY_TYPES.map((t) => html`<option>${t}</option>`)}</select></label>
            <label id="an-first-l"><span id="an-first-t">First name *</span><input id="an-first" maxlength="80" aria-label="First name"></label><label id="an-last-l">Last name<input id="an-last" maxlength="80" aria-label="Last name"></label>
            <label>Email<span id="an-email-req" hidden> *</span><input id="an-email" type="email" maxlength="200"></label><label>Phone<input id="an-phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label>
            <label class="span2" id="an-company-l" hidden><span id="an-company-t">Brokerage / company</span><input id="an-company" maxlength="120" aria-label="Company"></label>
            <label class="span2" id="an-ctype-l" hidden>Contact type <span class="muted small">(for reporting; set from the role, you can change it)</span><select id="an-ctype" aria-label="Contact type"><option value="">(not set)</option>${CONTACT_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
            <label class="span2" id="an-lrole-l" hidden>Lender contact type<select id="an-lrole" aria-label="Lender contact type"><option value="">No contact person</option><option value="loan_officer">Loan Officer</option><option value="lender_tc">Lender TC</option></select></label>
            <p class="span2 muted small" id="an-note"></p>
            <div class="span2" id="an-dup" hidden></div>
            <div class="span2"><button type="button" class="m-btn" id="an-create">Create and add to this order</button></div>
          </div>
          <div class="span2"><button type="button" class="ghost" id="an-cancel">Close without adding</button></div>
        </div>
      </fieldset>
      <p class="notice info" data-draft-restored hidden></p>
      <div class="wiz-nav"><button type="button" class="ghost" data-wiz-back hidden>&larr; Back</button><button type="button" class="ghost" data-save-draft>Save as draft</button><span class="spacer"></span><span class="muted small" data-wiz-count>Step 1 of ${N}</span><button type="button" class="m-btn" data-wiz-next>Next: ${STEPS[1][1]} &rarr;</button></div>
      <p class="muted small" data-draft-note>Save as draft opens the file as Open. Processor can stay Unassigned. Street, city and state are still required. If those are missing, the answers stay in this browser and no order is created.</p>
      </div>
    </form>`;
  const view = { title: 'Place Order', crumbs: [['Orders', '#/orders'], ['Place Order']], body, unmount() {}, mount(root) {
    const form = $('#nof', root); const people = [...contacts]; mountParcelFields(root);
    const paintProcessors = (list, keep) => { const sel = $('[name=processorId]', form); const next = processorChoices(list, keep == null ? sel.value : keep, user.id);
      sel.replaceChildren(); for (const o of next.options) { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); } sel.value = next.value; return next; };
    paintProcessors(procs, '');
    $('[data-refresh-processors]', root).addEventListener('click', guard(async () => { const sel = $('[name=processorId]', form); const keepStreet = $('[name=street]', form).value; const keepParty = $('[name="p:Client-Buyer"]', form) && $('[name="p:Client-Buyer"]', form).value;
      const painted = paintProcessors(await api.listProcessors(), sel.value);
      if ($('[name=street]', form).value !== keepStreet || ($('[name="p:Client-Buyer"]', form) && $('[name="p:Client-Buyer"]', form).value) !== keepParty) throw new Error('Refreshing the Processor list must not clear the form.');
      toast(painted.dropped ? 'Processor list updated. That person is no longer eligible, so this stays Unassigned. Nothing else was cleared.' : 'Processor list updated. Nothing else on this form was changed.'); }));
    const txSel = $('[name=transactionType]', root); const refi = () => isRefi(txSel.value);
    const labelOf = (role) => (role === 'Client-Buyer' && refi() ? 'Borrower' : SEARCH.find((x) => x[0] === role)[1]);
    // Matt, Nov 3 (b): picking a lender fills Lender phone / email (only boxes still empty; the processor can change them for this order)
    const fillLender = (c) => { if (!c) return; const ph = $('[name=lenderPhone]', root); const em = $('[name=lenderEmail]', root); const co = $('[name=lenderName]', root); const lp = $('[name=lossPayeeName]', root);
      if (ph && !ph.value.trim() && c.phone) ph.value = fmtPhone(c.phone); if (em && !em.value.trim() && c.email) em.value = c.email;
      if (co && !co.value.trim() && c.company) co.value = c.company;
      if (lp && !lp.value.trim() && c.company) lp.value = c.company; };
    // Francis, Nov 9: create a contact from the typed name in the picker (Buyers & Sellers / Agents / Lender).
    // Buyers/sellers/agents: first + last from the typed words. Lender: a company-ish typed string becomes company-only;
    // an officer name (2+ words without company keywords) becomes a person; company can still be set in Lender company name.
    const quickCreate = async (role, typed) => {
      const name = String(typed || '').trim(); if (!name) throw new Error('Type a name first.');
      const { firstName, lastName } = splitPersonName(name);
      const contactType = contactTypeForRole(role) || 'buyer_seller';
      let input;
      if (role === 'Lender') {
        const companyish = !lastName || /\b(llc|inc|corp|bank|mortgage|lending|loan|capital|financial|credit)\b/i.test(name);
        input = companyish
          ? { firstName: '', lastName: '', company: name, email: '', phone: '', contactType: 'lender' }
          : { firstName, lastName, company: ($('[name=lenderName]', root) || {}).value || '', email: '', phone: '', contactType: 'lender' };
      } else if ((role === 'Client-Buyer' || role === 'Client-Seller') && looksLikeEntityName(name)) {
        input = { firstName: '', lastName: '', company: name, email: '', phone: '', contactType };
      } else {
        input = { firstName: firstName || name, lastName, email: '', phone: '', company: '', contactType };
      }
      const c = await api.createContact(input);
      if (!people.some((x) => x.id === c.id)) people.push(c);
      return c;
    };
    const openEntity = (el, name) => { const pnl = $('[data-entity-panel]', el); const tg = $('[data-ent-toggle]', el); if (!pnl) return; pnl.hidden = false;
      const box = $('[data-ent="name"]', pnl); if (box && !box.value) box.value = name || ''; if (tg) { tg.setAttribute('aria-pressed', 'true'); tg.textContent = '\u2212 Remove entity'; } };
    const showAgent = (role, c) => { const card = $(`[data-agent-card="${role}"]`, root); if (!card) return; const edit = $('[data-agent-edit]', card); if (!c) { edit.hidden = true; return; } edit.hidden = false; $('[data-agent-role]', card).value = role; $('[data-agent-phone]', card).value = c.phone || ''; $('[data-agent-email]', card).value = c.email || ''; $('[data-agent-company]', card).value = c.company || ''; };
    const pickerOpts = (role, el) => ({
      createVerb: role === 'Lender' ? 'lender' : (MULTI[role] ? MULTI[role] : 'person'),
      onSet: (c) => { if (role === 'Lender') fillLender(c); if (role === 'Buyer Agent' || role === 'Listing Agent') showAgent(role, c); syncReferral(); },
      onCreate: async (typed) => { const c = await quickCreate(role, typed);
        if (el && (role === 'Client-Buyer' || role === 'Client-Seller') && c && !String(c.firstName || '').trim() && c.company) openEntity(el, c.company);
        return c; },
    });
    const pickers = Object.fromEntries(SEARCH.filter(([role]) => !MULTI[role]).map(([role]) => [role, mountPicker($(`[data-picker="p:${role}"]`, root), () => people, pickerOpts(role))]));
    const moveAgent = (from, to) => { const card = $(`[data-agent-card="${from}"]`, root); const id = pickers[from].value; const c = people.find((p) => p.id === id); if (!c) { $('[data-agent-role]', card).value = from; return; }
      c.phone = $('[data-agent-phone]', card).value.trim(); c.email = $('[data-agent-email]', card).value.trim(); c.company = $('[data-agent-company]', card).value.trim();
      if (pickers[to].value && pickers[to].value !== id) { $('[data-agent-role]', card).value = from; throw new Error('That role already has an agent. Clear that person first.'); }
      pickers[from].set(null); $('[data-agent-edit]', card).hidden = true; pickers[to].set(c); };
    ['Buyer Agent', 'Listing Agent'].forEach((role) => { const card = $(`[data-agent-card="${role}"]`, root); const q = $('.picker-q', card); if (q) q.addEventListener('input', () => { if (!pickers[role].value) $('[data-agent-edit]', card).hidden = true; });
      $('[data-agent-role]', card).addEventListener('change', () => { const nextRole = $('[data-agent-role]', card).value; if (nextRole === role) return; try { moveAgent(role, nextRole); } catch (err) { toast(err.message, 'err'); } }); });
    const paintCommission = () => { const box = $('[data-commission-total]', root); if (!box) return; try { const e = readEarnest(formData(form)); box.value = e.commissionTotal == null ? '' : String(e.commissionTotal); } catch (err) { box.value = ''; } };
    bindAddressFill(form);
    const syncAfterAddress = () => syncMd();
    ['street', 'city', 'state', 'zip'].forEach((name) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.addEventListener('blur', syncAfterAddress); });
    // ---------- several buyers / sellers ----------
    const rows = {};   // role -> [{ pk, el }] in screen order
    const renumber = (role) => { rows[role].forEach(({ pk, el }, i) => { const nm = i ? `p:${role}:${i + 1}` : `p:${role}`; pk.el.dataset.picker = nm; $('input[type=hidden]', pk.el).name = nm; el.dataset.partyRow = String(i + 1);
        const lab = rowLabel(labelOf(role), i + 1); const q = $('.picker-q', pk.el); q.setAttribute('aria-label', lab); q.parentNode.firstChild.textContent = lab; });
      // Matt, Nov 3 (b): always at least two rows (leave the second blank if there is only one). Any row can be removed; the rest move up and a
      // blank row is added back at the end. The last row of a two-row set has no Remove (removing it would only put an empty row back).
      rows[role].forEach(({ el }, i) => { $('[data-rm-row]', el).hidden = rows[role].length <= MIN_ROWS && i === rows[role].length - 1; }); };
    const hookRow = (role, el) => { const r = { el, pk: mountPicker($('.picker', el), () => people, pickerOpts(role, el)) }; rows[role].push(r);
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
      const add = $('#addnew', root); add.hidden = !PEOPLE_STEPS.includes(cur);
      if (PEOPLE_STEPS.includes(cur)) { const head = $(`[data-wiz-step="${cur}"] .wiz-panel-head`, root); if (head) head.after(add); }
      const bar = $('#sob-block', root);
      if (bar && PEOPLE_STEPS.includes(cur)) {
        const anchor = cur === 'loan' ? $('[data-lender-block]', root) : cur === 'agents' ? $('.agents-grid', root) : $('[data-multi="Client-Buyer"]', root);
        if (anchor && !anchor.contains(bar)) anchor.before(bar);
      }
      const legend = $('legend', add); const openBtn = $('#an-open', root);
      if (cur === 'loan') { legend.textContent = 'Add lender'; openBtn.textContent = '+ Add lender'; }
      else { legend.textContent = 'Add new user'; openBtn.textContent = '+ Add new user'; }
      const rolePick = $('#an-role', root); const allowed = cur === 'loan' ? ['Lender'] : cur === 'agents' ? ['Buyer Agent', 'Listing Agent', 'Transaction Coordinator', 'Sales Person'] : ['Client-Buyer', 'Client-Seller', 'Sales Person'];
      if (rolePick) [...rolePick.options].forEach((o) => { if (!o.value) return; const hide = !allowed.includes(o.value) || (refi() && REFI_BLOCKED_ROLES.includes(o.value)); o.hidden = hide; o.disabled = hide; if (o.value === 'Client-Buyer') o.textContent = refi() ? 'Borrower' : 'Buyer'; });
      if (rolePick && rolePick.value && rolePick.selectedOptions[0] && rolePick.selectedOptions[0].disabled) rolePick.value = cur === 'loan' ? 'Lender' : '';
      $('[data-wiz-back]', root).hidden = i <= 0; const nx = $('[data-wiz-next]', root); nx.hidden = cur === 'review';
      if (cur !== 'review') nx.innerHTML = `Next: ${toText(stepTitle(list[i + 1]))} &rarr;`;
      $('[data-wiz-count]', root).textContent = `Step ${i + 1} of ${list.length}`;
      $('[data-wiz-meter]', root).style.width = `${Math.round(((i + 1) / list.length) * 100)}%`;
      if (cur === 'review') drawReview(); };
    const show = (k, { focus = true } = {}) => { if (!active().includes(k)) k = 'review'; cur = k; visited.add(k); paint(); persistDraft();
      const top = $('.wiz-progress', root); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
      if (focus) { const h = $(`#wiz-h-${k}`, root); if (h) h.focus({ preventScroll: true }); } };
    // ---------- per-step validation ----------
    const labelText = (el) => { const l = el.closest('label'); const t = el.getAttribute('aria-label') || (l && l.childNodes[0] ? l.childNodes[0].textContent : '') || el.name || 'This field';
      return t.replace(/\s*\*\s*$/, '').trim(); };
    const nativeMsg = (el) => { const v = el.validity; const n = el.name;
      if (n === 'street' && v.valueMissing) return 'Street address is required.'; if (n === 'city' && v.valueMissing) return 'City is required.';
      if (n === 'state' && v.valueMissing) return 'State is required: choose it from the list.';
      if (n === 'openDate' && v.rangeOverflow) return 'Open date cannot be in the future.'; if (n === 'openDate' && v.valueMissing) return 'Open date is required.';
      if (v.valueMissing) return `${labelText(el)} is required.`; if (v.typeMismatch) return `${labelText(el)} is not valid.`; if (v.tooLong) return `${labelText(el)} is too long.`;
      return `${labelText(el)}: ${el.validationMessage || 'check this value'}`; };
    const entityOf = (r) => { const pnl = $('[data-entity-panel]', r.el); if (pnl.hidden) return null;   // entity of a buyer / seller row (null when "+ Add entity" is closed or empty)
      const e = Object.fromEntries($$('[data-ent]', pnl).map((i) => [i.dataset.ent, i.value.trim()])); return Object.values(e).some(Boolean) ? e : null; };
    const fileIn = $('#nof-files', root); const fileList = $('#nof-filelist', root);
    const txIn = $('#tx-files', root); const txList = $('#tx-filelist', root);
    // returns [{ el, msg }] for one step (el = the field to mark, or null)
    const check = (k) => { const p = $(`[data-wiz-step="${k}"]`, root); const errs = [];
      $$('input, select, textarea', p).filter((el) => el.type !== 'hidden' && el.type !== 'file' && !el.closest('[hidden]:not([data-wiz-step])') && el.willValidate && !el.checkValidity())
        .forEach((el) => errs.push({ el, msg: nativeMsg(el) }));
      const f = formData(form);
      if (k === 'transaction' && f.openDate && f.openDate > officeDate() && !errs.some((e) => e.el && e.el.name === 'openDate')) errs.push({ el: $('[name=openDate]', p), msg: 'Open date cannot be in the future.' });
      if (k === 'transaction' && repOn && !$$('[name=claRepresentation]', p).some((el) => el.checked)) errs.push({ el: $('[name=claRepresentation]', p), msg: 'Choose who CLA represents: Both buyer and seller, Buyer only, or Seller only.' });
      if (k === 'property' && !zipOk(String(f.zip || '').trim())) errs.push({ el: $('[name=zip]', p), msg: 'ZIP must be 5 digits (or ZIP+4).' });
      if (k === 'property') { try { parcelsFromForm(form); } catch (err) { errs.push({ el: $('[name=parcelId]', p), msg: err.message }); } }
      if (k === 'parties') {
        for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r, i) => { if (r.pk.typed && !r.pk.value) errs.push({ el: $('.picker-q', r.pk.el), msg: `${labelOf(role)}: pick a person from the list, choose Add as a new person, clear the box, or use "Add new user".` }); });
        for (const role of Object.keys(MULTI).filter(counts)) { const ids = rows[role].map((r) => r.pk.value).filter(Boolean); const twice = ids.find((id, i) => ids.indexOf(id) !== i);
          if (twice) errs.push({ el: null, msg: `${personLabel(people.find((pp) => pp.id === twice) || { firstName: 'That person', lastName: '' })} is listed twice as ${labelOf(role)}.` }); }
        for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r, i) => { const e = entityOf(r); if (!e) return; const lab = rowLabel(labelOf(role), i + 1).replace(/ \(optional\)$/, '');
          if (!e.name) errs.push({ el: $('[data-ent="name"]', r.el), msg: `${lab}: entity name is required (or remove the entity).` }); });
      }
      if (k === 'loan') {
        // A blank or incomplete extra lender row is ignored when the order is saved. It does not block the company.
        const refused = (v) => { try { moneyAmount(v); return false; } catch (err) { return true; } };
        if (!refi() && refused(f.emdAmount)) errs.push({ el: $('[name=emdAmount]', p), msg: 'EMD amount must be a number of 0 or more.' });
        if (!refi()) { try { readEarnest(f); } catch (err) { errs.push({ el: $('[name=commissionPercent]', p) || $('[name=emdHeldBy]', p), msg: err.message }); } }
        for (const [key, l] of [['purchasePrice', 'Purchase price'], ['loanAmount', 'Loan amount']]) { if (key === 'purchasePrice' && refi()) continue;
          if (refused(f[key])) errs.push({ el: $(`[name=${key}]`, p), msg: `${l} must be a number of 0 or more.` }); }
      }
      const fileErr = (input) => { for (const file of [...(input.files || [])]) { if (file.size > MAX_UPLOAD_BYTES) errs.push({ el: input, msg: `${file.name} is too large for this demo.` });
        if (!ALLOWED_UPLOAD_EXT.includes((file.name.split('.').pop() || '').toLowerCase())) errs.push({ el: input, msg: `${file.name}: that file type is not allowed.` }); } };
      if (k === 'transaction') fileErr(txIn);
      if (k === 'team') fileErr(fileIn);
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
    const agentReview = (role) => { const id = pickers[role] && pickers[role].value; if (!id) return dash; const card = $(`[data-agent-card="${role}"]`, root); const bits = card ? [$('[data-agent-phone]', card).value, $('[data-agent-email]', card).value, $('[data-agent-company]', card).value].map((v) => String(v || '').trim()).filter(Boolean) : []; return html`${nameOf(id)}${bits.length ? html` <span class="muted small">${bits.join(' · ')}</span>` : ''}`; };
    let dupGen = 0;
    const partyIds = (role) => (rows[role] || []).map((r) => r.pk && r.pk.value).filter(Boolean);
    const paintDuplicates = () => {
      const gen = ++dupGen; const f = formData(form);
      const buyerIds = partyIds('Client-Buyer'); const sellerIds = refi() ? [] : partyIds('Client-Seller');
      const box = $('[data-dup-orders]', root); if (!box) return;
      box.innerHTML = toText(html`<p class="muted small" data-dup-pending>Checking open files at this address.</p>`);
      const run = typeof api.findDuplicateOrders === 'function' ? api.findDuplicateOrders({ street: f.street, city: f.city, state: f.state, zip: f.zip, buyerIds, sellerIds }) : Promise.reject(new Error('missing'));
      Promise.resolve(run).then((matches) => ({ failed: false, matches: matches || [] }), () => ({ failed: true, matches: [] })).then((result) => {
        if (gen !== dupGen) return; const host = $('[data-dup-orders]', root); if (!host) return;
        if (result.failed) { host.innerHTML = toText(html`<div class="notice warn" data-dup-failed><strong>Could not check for an existing file.</strong> Look this address up in Open Orders before you place it. You can still place this order.</div>`); return; }
        const note = duplicateNotice(result.matches); if (!note.show) { host.innerHTML = ''; return; }
        host.innerHTML = toText(html`<div class="notice warn" data-dup-hit><strong>${note.title}</strong><ul>${note.lines.map((line) => html`<li><a href="#/deals/${line.id}">${line.text}</a></li>`)}</ul><p>${note.proceed}</p></div>`);
      });
    };
    const drawReview = () => { const f = formData(form); const r = refi(); const list = active();
      const issues = list.filter((k) => k !== 'review').map((k) => [k, check(k)]).filter(([, e]) => e.length);
      const section = (k, title, items) => html`<section class="review-sec" data-review-sec="${k}"><header><h4>${title}</h4><button type="button" class="linkish" data-wiz-goto="${k}">Edit</button></header><dl class="review-dl">${items.map(([dt, dd]) => html`<dt>${dt}</dt><dd>${dd}</dd>`)}</dl></section>`;
      const partyList = (role) => { const out = rows[role].filter((x) => x.pk.value).map((x) => { const e = entityOf(x); const who = e && e.name ? e.name : (partyDisplayName({ role, contact: people.find((pp) => pp.id === x.pk.value) || {}, entity: null }) || nameOf(x.pk.value)); return html`<div>${who}${e && e.repName ? html` <span class="muted small">Representative: ${e.repName}</span>` : ''}</div>`; }); return out.length ? out : dash; };
      const sales = $$('input[name=salesIds]:checked', root).map((b) => b.parentElement.textContent.replace(/\s+/g, ' ').trim());
      const files = [...fileIn.files]; const txFiles = [...txIn.files]; const mdOn = showMdQuestions(f.state, r);
      const skipped = optionalSkipped();
      $('[data-review]', root).innerHTML = toText(html`
        <div data-dup-orders></div>
        ${issues.length ? html`<div class="notice warn" data-review-issues><strong>${issues.reduce((n, [, e]) => n + e.length, 0)} thing(s) to fix before placing the order:</strong><ul>${issues.map(([k, e]) => html`<li><a href="#" data-wiz-goto="${k}">${stepTitle(k)}</a>: ${e.map((x) => x.msg).join(' ')}</li>`)}</ul></div>`
          : html`<div class="notice ok-box" data-review-ready><strong>Ready to place.</strong> Everything required is filled in.</div>`}
        ${skipped.length ? html`<div class="notice info" data-review-skipped>Not added (nobody picked from the list): ${skipped.join(', ').toLowerCase()}. You can add them later on the Contacts tab.</div>` : ''}
        <div class="review-grid">
        ${section('transaction', 'Transaction', [['Transaction type', html`<strong>${f.transactionType}</strong>`], ...(repOn ? [['Who CLA represents', html`<strong data-review-representation>${claRepresentationLabel(f.claRepresentation)}</strong>`]] : []), ['Open date', val(fmtDate(f.openDate))], ['Contract / title request', txFiles.length ? txFiles.map((x) => html`<div>${x.name} <span class="muted small">${fmtSize(x.size)}</span></div>`) : dash]])}
        ${section('property', 'Property', [['Address', f.street ? html`${f.street}<br>${[f.city, f.state].filter(Boolean).join(', ')} ${f.zip || ''}` : dash], ['County', val(f.county)], ['Parcel ID', val(f.parcelId)], ...(mdOn ? [['Primary residence', yesNo(f.primaryResidence)], ['First-time buyer', yesNo(f.firstTimeBuyer)]] : [])])}
        ${section('parties', r ? 'Borrowers' : 'Buyers & Sellers', [[r ? 'Borrowers' : 'Buyers', partyList('Client-Buyer')], ...(r ? [] : [['Sellers', partyList('Client-Seller')]])])}
        ${section('loan', 'Lender & Loan', [...(r ? [] : [['Purchase price', val(fmtMoney(moneyAmount(f.purchasePrice)))]]), ['Loan amount', val(fmtMoney(moneyAmount(f.loanAmount)))],
          ...(r ? [] : [['EMD amount', val(fmtMoney(moneyAmount(f.emdAmount)))], ['EMD due date', val(fmtDate(f.emdDueDate))], ['EMD held by', val(f.emdHeldBy)], ['Commission', (() => { try { const e = readEarnest(f); if (e.commissionTotal == null && !e.commissionPaidBy && !e.emdHeldBy) return dash; return html`${e.commissionTotal == null ? dash : fmtMoney(e.commissionTotal)} <span class="muted small">${[e.commissionBase != null ? 'base ' + fmtMoney(e.commissionBase) : '', e.commissionPercent != null ? e.commissionPercent + '%' : '', e.commissionAdditional != null ? 'additional ' + fmtMoney(e.commissionAdditional) : '', e.commissionPaidBy ? 'paid by ' + e.commissionPaidBy : ''].filter(Boolean).join(' · ')}</span>`; } catch (err) { return err.message; } })()]]), ['Closing date', val(fmtDate(f.closingDate))],
                    ['Lender', (pickers.Lender.value || f.lenderName) ? html`${f.lenderName ? html`<strong>${f.lenderName}</strong>${pickers.Lender.value ? html` · ${nameOf(pickers.Lender.value)}` : ''}` : nameOf(pickers.Lender.value)}${f.lenderPhone || f.lenderEmail || f.lossPayeeName || f.mortgageBrokerName || f.cplAddress ? html`<br><span class="muted small">${[f.lenderPhone, f.lenderEmail, f.mortgageBrokerName && ('Broker: ' + f.mortgageBrokerName), f.lossPayeeName && ('Loss payee: ' + f.lossPayeeName), f.cplAddress && ('CPL: ' + f.cplAddress)].filter(Boolean).join(' · ')}</span>` : ''}` : dash],
          ['Lender contacts', readLenderContactRows(form).length ? readLenderContactRows(form).map((row) => html`<div>${[row.firstName, row.lastName].filter(Boolean).join(' ')} <span class="muted small">${row.lenderRole === 'lender_tc' ? 'Lender TC' : row.lenderRole === 'loan_officer' ? 'Loan Officer' : ''}</span></div>`) : dash]])}
        ${section('parties', 'Source of business', [['Source of business', val((() => { const picked = $$('[name=referralSource]', root).find((el) => el.checked && el.value); return picked ? (picked.getAttribute('aria-label') || '').replace(/^Source of business:\s*/, '') : ''; })())]])}
        ${r ? '' : section('agents', 'Agents', [['Buyer agent', agentReview('Buyer Agent')], ['Listing agent', agentReview('Listing Agent')], ["Buyer's transaction coordinator", val(selText($('[name="p:Transaction Coordinator"]', root)))], ['Listing transaction coordinator', val(selText($('[name="p:Transaction Coordinator:2"]', root)))]])}
        ${section('team', 'Team & Notes', [['Processor', val(selText($('[name=processorId]', root)).replace(/^Choose the Processor.*$/, ''))], ['Preprocessor', val(selText($('[name=preprocessorUserId]', root)))], ['Closer', val(f.closerName)], ['Sales Rep', sales.length ? sales.join(', ') : dash],
          ['Notes', f.notes ? html`<span class="review-notes">${f.notes.length > 240 ? f.notes.slice(0, 240) + '\u2026' : f.notes}</span>` : dash],
          ['Documents', files.length ? html`${files.map((x, i) => html`<div>${x.name} <span class="muted small">${fmtSize(x.size)}${($(`[data-doctype="${i}"]`, root) || {}).value ? ' \u00b7 ' + $(`[data-doctype="${i}"]`, root).value : ''}</span></div>`)}<span class="muted small">${selText($('#nof-vis', root))}${$('#nof-wire', root).checked ? ' \u00b7 wire instructions (never shown to agents)' : ''}</span>` : dash]])}
        </div>
        <div class="card next-box"><h4>What happens when you place the order</h4><ul class="checklist">
          <li>The order opens at stage <strong>Opened</strong> with a new file number, and the Processor gets the <em>Collect executed contract</em> task.</li>
          <li>Each person you added gets their own intake tasks, copied from the current Task Templates.</li>
          <li>The standard document folders are created${files.length + txFiles.length ? ` and your ${files.length + txFiles.length} document(s) are saved` : ''}.</li>
          <li>It is recorded in the Activity Log. <strong>No emails, texts or portal invites are sent</strong> (invite people later from Contacts).</li></ul></div>`); paintDuplicates(); };
    // ---------- Refinance: hide / restore ----------
    const anRole = $('#an-role', root);
    const applyRefi = () => { const on = refi();
      $$('[data-refi-hide]', root).forEach((el) => { el.hidden = on; });
      $('[data-refi-note]', root).hidden = !on;
      $('[data-multi="Client-Seller"]', root).hidden = on;
      ['Buyer Agent', 'Listing Agent'].forEach((r) => { $(`[data-picker="p:${r}"]`, root).hidden = on; });
      const bf = $('[data-multi="Client-Buyer"]', root); bf.dataset.refi = String(on);
      $('legend', bf).textContent = on ? 'Borrowers' : 'Buyers'; $('[data-add-row="Client-Buyer"]', bf).textContent = on ? '+ Add another borrower' : '+ Add another buyer';
      const docLabel = $('[data-tx-doc-label]', root); if (docLabel) docLabel.textContent = on ? 'Upload title request' : 'Upload sales contract';
      renumber('Client-Buyer'); syncMd(); syncReferral();
      // Add new user: no seller / realtor roles on a refinance; Buyer reads Borrower
      [...anRole.options].forEach((o) => { if (REFI_BLOCKED_ROLES.includes(o.value)) { o.hidden = on; o.disabled = on; } if (o.value === 'Client-Buyer') o.textContent = on ? 'Borrower' : 'Buyer'; });
      if (on && REFI_BLOCKED_ROLES.includes(anRole.value)) { anRole.value = ''; anRole.dispatchEvent(new Event('change')); }
      ['agents'].forEach((k) => { if (on) { bad.delete(k); } });
      paint(); };
    const allPickers = () => [...SEARCH.filter(([role]) => !MULTI[role] && counts(role)).map(([role, label]) => [label, pickers[role]]), ...Object.keys(MULTI).filter(counts).flatMap((role) => rows[role].map((r) => [labelOf(role), r.pk]))];
    // "Add new user" / "Select existing person" with role Buyer or Seller APPENDS: fills the first empty row, else adds a row
    const placeParty = (role, c) => { const free = rows[role].find((r) => !r.pk.value && !r.pk.typed); (free || addRow(role)).pk.set(c); };
    // ---------- documents chosen at placement: one row per file with its own document type ----------
    const armFiles = (input, list, visId, rowsOf) => input.addEventListener('change', () => { list.innerHTML = toText(rowsOf()); const ask = $(`[data-vis-prompt="${visId}"]`, root); if (ask) ask.hidden = !input.files.length; if (input.files.length) { const vis = $('#' + visId, root); if (vis) vis.focus(); } });
    armFiles(fileIn, fileList, 'nof-vis', () => html`${[...fileIn.files].map((f, i) => html`<div class="nof-file" data-file="${i}"><strong>${f.name}</strong> <span class="muted small">${fmtSize(f.size)}</span>
      <label>Document type<select data-doctype="${i}" aria-label="Document type for ${f.name}"><option value="">Choose&hellip;</option>${options(DOC_TYPES, '')}</select></label></div>`)}`);
    armFiles(txIn, txList, 'tx-vis', () => html`${[...txIn.files].map((f) => html`<div class="nof-file"><strong>${f.name}</strong> <span class="muted small">${fmtSize(f.size)}</span></div>`)}`);
    const syncMd = () => { const box = $('#md-occ', root); const on = showMdQuestions($('[name=state]', root).value, refi()); box.hidden = !on; if (!on) $$('select', box).forEach((s) => { s.value = ''; }); };
    const syncReferral = () => { const on = refi(); const clear = $('[data-referral-clear]', root);
      $$('[data-referral-slot]', root).forEach((slot) => { const input = $('input', slot); const code = input.dataset.referralCode; const meta = referralPartyByRole(ROLE_BY[code]); const role = ROLE_BY[code];
        const hiddenRole = on && code !== 'buyer' && code !== 'lender'; slot.hidden = hiddenRole; let contactId = '';
        if (MULTI[role]) { const wrap = slot.closest('[data-party-row]'); const row = (rows[role] || []).find((r) => r.el === wrap); contactId = row && row.pk.value || ''; }
        else if (pickers[role]) contactId = pickers[role].value || '';
        const value = contactId ? encodeReferral(code, contactId) : ''; input.value = value; input.disabled = !value || hiddenRole;
        const who = contactId ? `${meta.label} — ${nameOf(contactId)}` : `${meta.label}, pick a person first`; input.setAttribute('aria-label', `Source of business: ${who}`);
        if (input.checked && (!value || hiddenRole)) { input.checked = false; if (clear) clear.checked = true; } });
      const status = $('[data-referral-status]', root); if (!status) return; const picked = $$('[name=referralSource]', root).find((el) => el.checked && el.value);
      status.textContent = picked ? `Source of business: ${(picked.getAttribute('aria-label') || '').replace(/^Source of business:\s*/, '')}. One person only.` : 'Source of business: Not set. Mark one buyer, seller, buyer agent, listing agent, or lender. Nobody is selected for you.'; };
    const ROLE_BY = { buyer: 'Client-Buyer', seller: 'Client-Seller', buyer_agent: 'Buyer Agent', listing_agent: 'Listing Agent', lender: 'Lender' };
    $('[name=state]', root).addEventListener('change', syncMd);
    // ---------- one "Add new user" place ----------
    const anForm = $('#an-form', root); const anFields = $('#an-fields', root); const dup = $('#an-dup', root);
    const v = (id) => $('#' + id, root).value.trim();
    const reset = () => { ['an-first', 'an-last', 'an-email', 'an-phone', 'an-company', 'an-ctype', 'an-entity', 'an-lrole'].forEach((id) => { const el = $('#' + id, root); if (el) el.value = ''; }); const kind = $('#an-kind', root); if (kind) kind.value = 'person'; anRole.value = ''; anFields.hidden = true; dup.hidden = true; dup.innerHTML = ''; };
    const paintNew = () => { const r = anRole.value; const entity = (r === 'Client-Buyer' || r === 'Client-Seller') && $('#an-kind', root).value === 'entity'; const lender = r === 'Lender';
      $('#an-kind-l', root).hidden = !(r === 'Client-Buyer' || r === 'Client-Seller'); $('#an-entity-l', root).hidden = !entity; $('#an-etype-l', root).hidden = !entity;
      $('#an-first-t', root).textContent = lender ? 'Contact first name (optional)' : entity ? 'Representative first name (optional)' : 'First name *';
      $('#an-first', root).required = false;
      $('#an-last-l', root).firstChild.textContent = lender ? 'Contact last name (optional)' : entity ? 'Representative last name (optional)' : 'Last name';
      $('#an-company-l', root).hidden = !(r === 'Buyer Agent' || r === 'Listing Agent' || r === 'Lender'); $('#an-company-t', root).textContent = lender ? 'Lender company name *' : 'Brokerage / company';
      $('#an-ctype-l', root).hidden = !r || r === 'Sales Person'; $('#an-ctype', root).value = contactTypeForRole(r); $('#an-lrole-l', root).hidden = !lender; $('#an-email-req', root).hidden = r !== 'Sales Person';
      $('#an-note', root).textContent = r === 'Sales Person' ? 'A Sales Person login is created in HR. Add the employee there and copy the invite link. Nothing is emailed.'
        : lender ? 'Adds the lender company as a contact. No portal login is created. A contact person is optional, and this does not change another lender\'s saved record.'
        : entity ? 'The entity name is the buyer or seller. First and last are only a representative and can be left blank. The entity name is not split into a first and last name. No portal login is created.'
        : r ? `Adds a contact (no portal login, no email or invite is sent) and ${MULTI[r] ? `adds them to the ${MULTI[r]}s of this order (after any already chosen)` : `puts them in the ${NEW_ROLES.find((x) => x[0] === r)[1]} slot of this order`}.` : ''; };
    $('#an-open', root).addEventListener('click', () => { anForm.hidden = false; if (cur === 'loan' && !anRole.value) { anRole.value = 'Lender'; anRole.dispatchEvent(new Event('change')); } else anRole.focus(); });
    $$('[data-add-tc]', root).forEach((b) => b.addEventListener('click', () => { $('#addnew', root).dataset.tcTarget = b.dataset.addTc; anForm.hidden = false; anRole.value = 'Transaction Coordinator'; anRole.dispatchEvent(new Event('change')); $('#an-first', root).focus(); }));
    $('#an-cancel', root).addEventListener('click', () => { reset(); anForm.hidden = true; });
    anRole.addEventListener('change', () => { anFields.hidden = !anRole.value; dup.hidden = true; paintNew(); });
    $('#an-kind', root).addEventListener('change', paintNew);
    $('#addnew', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter here must not submit the order
    const place = (role, c) => {
      if (role === 'Sales Person') { const list = $('[data-sales-list]', root); const box = $(`input[name=salesIds][value="${c.profileId || c.id}"]`, list);
        if (box) box.checked = true; else { const nd = $('[data-no-sales]', list); if (nd) nd.remove(); list.insertAdjacentHTML('beforeend', toText(salesBox({ id: c.profileId || c.id, firstName: c.firstName, lastName: c.lastName, role: 'Sales Person' }, true))); } }
      else if (role === 'Transaction Coordinator') { const name = $('#addnew', root).dataset.tcTarget || 'p:Transaction Coordinator'; const sel = $(`select[name="${CSS.escape(name)}"]`, root); if (sel && ![...sel.options].some((o) => o.value === c.id)) sel.add(new Option(personLabel(c), c.id)); if (sel) sel.value = c.id; }
      else if (MULTI[role]) placeParty(role, c); else pickers[role].set(c);
      toast(`${personLabel(c)} added as ${NEW_ROLES.find((x) => x[0] === role)[1]}`); reset(); anForm.hidden = true; };
    $('#an-create', root).addEventListener('click', guard(async () => {
      const role = anRole.value; if (!role) throw new Error('Choose the role first.');
      const kind = ($('#an-kind', root) || {}).value || 'person';
      const entity = (role === 'Client-Buyer' || role === 'Client-Seller') && kind === 'entity';
      const first = v('an-first'); const email = v('an-email').toLowerCase(); const company = role === 'Lender' || role === 'Buyer Agent' || role === 'Listing Agent' ? v('an-company') : '';
      const built = newPartyContact({ role, kind, entityName: v('an-entity'), entityType: ($('#an-etype', root) || {}).value || '', firstName: first, lastName: v('an-last'), email, phone: v('an-phone'), company, contactType: ($('#an-ctype', root) || {}).value || '', lenderRole: ($('#an-lrole', root) || {}).value || '' });
      if (!built.ok) throw new Error(built.error);
      if (role === 'Sales Person' && !email) throw new Error('Email is required for a salesperson (it is their login).');
      // one person per email: use the saved contact. A different last name typed here does not overwrite that record and does not create a second login.
      if (email) { const hit = (await api.listContacts(email)).find((c) => (c.email || '').toLowerCase() === email);
        if (hit) { const okToPick = role !== 'Sales Person' || staff.some((s) => s.id === hit.profileId);
          const typedLast = v('an-last'); const kept = personLabel(hit);
          dup.hidden = false; dup.innerHTML = toText(html`<p class="notice warn" data-dup>This email is already saved as <strong>${kept}</strong>. ${typedLast && typedLast.toLowerCase() !== String(hit.lastName || '').toLowerCase() ? 'The last name you typed is not written over that contact. ' : ''}${okToPick ? 'Select them for this order. No second login is created.' : 'They are not an active salesperson, so they cannot be added as one.'}</p>
            ${okToPick ? html`<button type="button" class="m-btn" id="an-use">Select existing person</button>` : ''}`);
          const use = $('#an-use', root); if (use) use.addEventListener('click', () => {
            if (!people.some((p) => p.id === hit.id)) people.push(hit); place(role, hit); if (built.entity) fillEntity(role, built.entity); });
          return; } }
      if (role === 'Sales Person') throw new Error('A Sales Person login is created in HR. Add the employee and copy the invite link (#/hr/add). Nothing is emailed.');
      const c = await api.createContact(built.contact);
      people.push(c); place(role, c); if (built.entity) fillEntity(role, built.entity); }));
    const fillEntity = (role, ent) => { const row = (rows[role] || []).find((r) => r.pk.value); if (!row) return; const pnl = $('[data-entity-panel]', row.el); if (!pnl) return; pnl.hidden = false; const btn = $('[data-ent-toggle]', row.el); if (btn) { btn.setAttribute('aria-pressed', 'true'); btn.textContent = '\u2212 Remove entity'; }
      const set = (k, val) => { const el = $(`[data-ent="${k}"]`, pnl); if (el && val) el.value = val; }; set('name', ent.name); set('type', ent.type); set('repName', ent.repName); set('repEmail', ent.repEmail); set('repPhone', ent.repPhone); };
    txSel.addEventListener('change', applyRefi); applyRefi();
    mountLossPayee(form, api); mountCplSame(form);
    let lcSeq = 0;
    const addLc = (i) => { const n = i == null ? lcSeq : i; lcSeq = Math.max(lcSeq, n + 1); const box = $('[data-lender-contact-rows]', root); if (!box) return;
      box.insertAdjacentHTML('beforeend', toText(lenderContactRowHtml(n))); const row = box.lastElementChild; const rm = $('[data-rm-lender-contact]', row); if (rm) rm.addEventListener('click', () => row.remove()); };
    const addLcBtn = $('[data-add-lender-contact]', root); if (addLcBtn) addLcBtn.addEventListener('click', () => addLc());
    const draftKey = orderDraftKey(user);
    const draftStore = typeof localStorage !== 'undefined' ? localStorage : null;
    let placing = false;
    let sealed = false;   // set when the order is placed; later writers must not recreate the draft
    const syncPickers = () => { $$('[data-picker]', root).forEach((el) => { const hid = $('input[type=hidden]', el); const person = people.find((p) => p.id === (hid && hid.value));
      if (!person) return; const q = $('.picker-q', el); const chosen = $('[data-chosen]', el);
      if (q) q.value = personLabel(person); if (chosen) chosen.textContent = `Selected: ${personLabel(person)}`; el.setAttribute('data-selected', ''); }); };
    const persistDraft = () => {
      if (sealed || !draftStore || !draftKey || placing) return false;
      const body = collectOrderFields(form);
      body.savedAt = new Date().toISOString(); body.step = cur; body.fileNames = rememberedFiles([fileIn, txIn]); body.fresh = true;
      try { return writeOrderDraft(draftStore, draftKey, body) !== false; } catch (e) { return false; }
    };
    let draftTimer = 0;
    const queueDraft = () => { if (sealed) return; clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 400); };
    form.addEventListener('input', () => { syncReferral(); paintCommission(); queueDraft(); }); form.addEventListener('change', queueDraft);
    const saveBtn = $('[data-save-draft]', root);
    if (saveBtn) saveBtn.addEventListener('click', () => { commitOrder({ asDraft: true }).catch((err) => toast(err.message || String(err), 'err')); });
    let placedMark = null;
    try { placedMark = JSON.parse(sessionStorage.getItem(PLACED_KEY) || 'null'); } catch (e) { placedMark = null; }
    if (placedMark && placedMark.dealId && draftStore && draftKey) tombstoneOrderDraft(draftStore, draftKey, placedMark);
    const prior = placedMark && placedMark.dealId ? null : (draftStore && draftKey ? readOrderDraft(draftStore, draftKey) : null);
    if (prior) {
      Object.keys(prior.fields || {}).map((k) => /^lcFirst:(\d+)$/.exec(k)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b).forEach((i) => addLc(i));
      const restored = applyOrderDraft(form, prior, procs);
      if (repOn && draftKeepsUnrecordedRepresentation(prior.fields)) $$('[name=claRepresentation]', form).forEach((el) => { el.checked = false; });
      applyRefi();
      syncPickers();
      syncReferral();
      const savedReferral = prior.fields && prior.fields.referralSource;
      if (savedReferral) { const hit = $$('[name=referralSource]', root).find((el) => el.value === savedReferral && !el.disabled); if (hit) hit.checked = true; else { const clear = $('[data-referral-clear]', root); if (clear) clear.checked = true; } }
      if (active().includes(prior.step)) cur = prior.step;
      const note = $('[data-draft-restored]', root);
      const names = (prior.fileNames || []).join(', ');
      if (note) { note.hidden = false; note.textContent = `Restored an unplaced draft from this browser${restored.processorDropped ? '. The saved Processor is no longer on the list, so choose one again' : ''}. It is not an order yet.${names ? ' These files were not kept and must be chosen again: ' + names + '.' : ''}`; }
    }
    const onDocClick = (e) => { if (sealed || !form.isConnected || form.contains(e.target)) return; persistDraft(); };
    const onLeave = (e) => { if (sealed || placing || !form.isConnected) return; const body = collectOrderFields(form); const dirty = Object.values(body.fields).some((v) => String(v || '').trim()) || Object.values(body.checks).some((v) => v.length);
      if (!dirty) return; e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('beforeunload', onLeave);
    const unmount = () => { document.removeEventListener('click', onDocClick, true); window.removeEventListener('beforeunload', onLeave); clearTimeout(draftTimer); };
    view.unmount = unmount;
    // ---------- submit (only from Review; Enter on an earlier step means Next) ----------
    const saveAgentEdits = async () => { for (const role of ['Buyer Agent', 'Listing Agent']) { const pk = pickers[role]; if (!pk || !pk.value) continue; const card = $(`[data-agent-card="${role}"]`, root); if (!card) continue;
      const phone = $('[data-agent-phone]', card).value.trim(); const email = $('[data-agent-email]', card).value.trim().toLowerCase(); const company = $('[data-agent-company]', card).value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${role}: email is not valid.`);
      const c = people.find((p) => p.id === pk.value); if (!c) continue; const patch = {};
      if (phone !== String(c.phone || '')) patch.phone = phone; if (email !== String(c.email || '').toLowerCase()) patch.email = email; if (company !== String(c.company || '')) patch.company = company;
      if (!Object.keys(patch).length) continue; const saved = await api.updateContact(c.id, patch); Object.assign(c, saved); } };
    const commitOrder = async ({ asDraft }) => {
      if (placing) return;
      if (!asDraft && cur !== 'review') { next(); return; }
      for (const k of active().filter((x) => x !== 'review')) { const errs = validate(k); if (errs.length) { if (asDraft) persistDraft(); show(k); throw new Error(errs.map((x) => x.msg).join(' | ')); } }
      const e = { target: form };
      const f = formData(form);
      // Francis, Nov 3: Buyer agent (like Listing agent and Lender) is OPTIONAL. Text left in one of those boxes without a person picked from the list (a
      // half-typed name, "none", "N/A", browser autofill) never blocks the order: the order is created without that person and a note says so.
      // Buyers and sellers still have to be picked from the list (or the box cleared) so a client is never dropped by accident.
      const skipped = [];
      for (const [label, pk] of allPickers()) if (pk.typed && !pk.value) { if (OPTIONAL_SLOTS.includes(label)) skipped.push(label); else throw new Error(`${label}: pick a person from the list, choose Add as a new person, clear the box, or use "Add new user".`); }
      for (const role of Object.keys(MULTI).filter(counts)) { for (const r of rows[role]) { const ent = entityOf(r); if (!ent || !ent.name || r.pk.value) continue;
        const builtEnt = entityIdentity({ entityName: ent.name, entityType: ent.type, repName: ent.repName, repTitle: ent.repTitle, repEmail: ent.repEmail, repPhone: ent.repPhone });
        if (!builtEnt.ok) throw new Error(builtEnt.error);
        const made = await api.createContact(builtEnt.contact); if (!people.some((p) => p.id === made.id)) people.push(made); r.pk.set(made); } }
      if (refi()) { REFI_HIDE.forEach((k) => { delete f[k]; }); ['emdHeldBy', 'commissionBase', 'commissionPercent', 'commissionAdditional', 'commissionPaidBy', 'commissionTotal'].forEach((k) => { delete f[k]; }); }
      await saveAgentEdits();
      // Matt, Nov 3 (b): amounts are shown with commas (485,000) and sent clean (485000)
      const amt = refi() ? '' : moneyAmount(f.emdAmount);
      const entities = {};   // hidden input name (p:<role> / p:<role>:<n>) -> entity
      for (const role of Object.keys(MULTI).filter(counts)) rows[role].forEach((r) => { const ent = entityOf(r); if (ent) entities[$('input[type=hidden]', r.pk.el).name] = ent; });
      const lenderPk = pickers.Lender; const lender = lenderPk && lenderPk.value ? people.find((p) => p.id === lenderPk.value) : null;
      const files = [...fileIn.files]; const txFiles = [...txIn.files];
      const pickedReferral = $$('[name=referralSource]', root).find((el) => el.checked);
      const hiddenName = (pk) => (($('input[type=hidden]', pk.el) || {}).name) || '';
      const picks = [...Object.entries(pickers).filter(([role, pk]) => pk && pk.value && counts(role)).map(([role, pk]) => ({ role, contactId: pk.value, name: hiddenName(pk) })), ...Object.keys(MULTI).filter(counts).flatMap((role) => rows[role].filter((r) => r.pk.value).map((r) => ({ role, contactId: r.pk.value, name: hiddenName(r.pk) })))];
      const referral = referralFromForm({ value: pickedReferral ? pickedReferral.value : '', picks, refinance: refi() });
      f.sourceOfBusiness = ''; delete f.sourceContactId;
      if (!showMdQuestions(f.state, refi())) { f.primaryResidence = ''; f.firstTimeBuyer = ''; }
      const extras = lenderExtras({ lenderAddress: f.lenderAddress, cplAddress: f.cplAddress, cplSameAsLender: !!($('[data-cpl-same]', root) && $('[data-cpl-same]', root).checked), mortgageBrokerName: f.mortgageBrokerName });
      const earnest = refi() ? { financial: {} } : readEarnest(f);
      const placedCloser = resolveCloser(f.closerName, closers, {});
      const parcels = parcelsFromForm(form);
      const input = representationPayload(api, { ...f, closerName: placedCloser.closerName, closerProfileId: placedCloser.closerProfileId, parcelId: parcels.parcelId, parcelIds: parcels.parcelIds, emdHeldBy: earnest.emdHeldBy || '', commissionBase: earnest.commissionBase, commissionPercent: earnest.commissionPercent, commissionAdditional: earnest.commissionAdditional, commissionPaidBy: earnest.commissionPaidBy || '', emdAmount: amt, purchasePrice: refi() ? '' : moneyAmount(f.purchasePrice), ...(refi() ? { emdDueDate: '' } : {}), loanAmount: moneyAmount(f.loanAmount), salesIds: new FormData(form).getAll('salesIds'),
        lenderName: (f.lenderName || (lender && lender.company) || '').trim(),
        lenderContact: lender ? personLabel(lender) : '',
        lenderPhone: (f.lenderPhone || '').trim(),
        lenderEmail: (f.lenderEmail || '').trim(),
        lossPayeeName: (f.lossPayeeName || '').trim(),
        lenderAddress: extras.lenderAddress, cplAddress: extras.cplAddress, cplSameAsLender: extras.cplSameAsLender, mortgageBrokerName: extras.mortgageBrokerName });
      if (!extras.lenderAddress) delete input.lenderAddress;
      if (!extras.cplAddress) delete input.cplAddress;
      if (!extras.cplSameAsLender) delete input.cplSameAsLender;
      if (!extras.mortgageBrokerName) delete input.mortgageBrokerName;
      if (draftStore && draftKey) { const claim = claimOrderDraft(draftStore, draftKey); if (!claim.ok) throw new Error(claim.message); }
      placing = true; const btn = $('[data-place-order]', root); if (btn) { btn.disabled = true; btn.textContent = asDraft ? 'Saving draft\u2026' : 'Placing order\u2026'; }
      let deal; try { deal = await api.createDeal(input); } catch (err) { placing = false; if (btn) { btn.disabled = false; btn.textContent = 'Place order'; } if (draftStore && draftKey) releaseOrderClaim(draftStore, draftKey); throw err; }
      sealed = true; clearTimeout(draftTimer); unmount();
      if (draftStore && draftKey) tombstoneOrderDraft(draftStore, draftKey, { dealId: deal.id, fileNumber: deal.fileNumber });
      const problems = []; let tasks = 0; const added = {};
      // Buyer 1, Buyer 2, ..., Seller 1, Seller 2, ..., agents, lender, TC, sales team (p:<role> or p:<role>:<n>); the same order as the one-page form.
      // Empty extra buyer / seller rows (the form starts with two of each) are ignored: a blank value is not a person.
      // People come from the picker state. FormData alone misses a party when the hidden id was cleared.
      const formParts = [...new FormData(e.target).entries()].filter(([k, x]) => k.startsWith('p:') && String(x || '').trim()).map(([k, x]) => ({ name: k, contactId: String(x).trim(), role: k.slice(2).replace(/:\d+$/, '') }));
      const entries = partyEntries(formParts, picks);
      for (const { name, contactId, role } of entries) { if (!counts(role)) continue;   // refinance: hidden seller / realtor / TC boxes are not saved
        try { const res = await api.addParticipant(deal.id, contactId, role, entities[name] ? { entity: entities[name] } : undefined); tasks += (res && res.tasksCreated) || 0; added[role] = (added[role] || 0) + 1; } catch (err) { problems.push(`${role}: ${err.message}`); } }
      const lenderCompany = (input.lenderName || '').trim();
      const extraContacts = readLenderContactRows(e.target);
      let namedLender = !!(lenderPk && lenderPk.value) || !!added.Lender;
      for (const row of extraContacts) {
        const builtRow = lenderCompanyContact({ company: lenderCompany, ...row });
        const blank = ![row.firstName, row.lastName, row.email, row.phone, row.lenderRole].some((v) => String(v || '').trim());
        if (blank || !builtRow.ok || (!builtRow.contact.firstName && !builtRow.contact.lastName)) continue;   // a blank or incomplete extra row does not block the company
        try { const c = await api.createContact(builtRow.contact); await api.addParticipant(deal.id, c.id, 'Lender'); added.Lender = (added.Lender || 0) + 1; namedLender = true; } catch (err) { problems.push(`Lender contact: ${err.message}`); }
      }
      if (lenderCompany && !namedLender) {
        try {
          const found = people.find((c) => String(c.company || '').trim().toLowerCase() === lenderCompany.toLowerCase() && !String(c.firstName || '').trim() && !String(c.lastName || '').trim());
          const c = found || await api.createContact({ firstName: '', lastName: '', company: lenderCompany, email: '', phone: '', contactType: 'lender' });
          if (!people.some((p) => p.id === c.id)) people.push(c);
          await api.addParticipant(deal.id, c.id, 'Lender'); added.Lender = (added.Lender || 0) + 1;
        } catch (err) { problems.push(`Lender company: ${err.message}`); }
      }
      if (referral) { try { await api.updateDeal(deal.id, { sourceOfBusiness: referral }); } catch (err) { problems.push(`Source of business was not saved: ${err.message}`); } }
      let saved = 0;
      const uploadIds = new WeakMap();
      const uploadOne = async (file, visibility, docType, wire) => { try { let slot = uploadIds.get(file); if (!slot) uploadIds.set(file, slot = {}); const id = sameUploadId(slot, file); await api.addDocument(deal.id, { id, name: file.name, description: '', mimeType: file.type, size: file.size, dataUrl: await readFile(file), visibility, folderId: null, docType, wireInstructions: wire }); saved++; } catch (err) { problems.push(`${file.name}: ${err.message}`); } };
      for (const file of txFiles) await uploadOne(file, $('#tx-vis', root).value, refi() ? 'Lender documents' : 'Contract / addendum', false);
      for (let i = 0; i < files.length; i++) { const sel = $(`[data-doctype="${i}"]`, root); await uploadOne(files[i], $('#nof-vis', root).value, sel ? sel.value : '', $('#nof-wire', root).checked); }
      try { sessionStorage.setItem(PLACED_KEY, JSON.stringify({ dealId: deal.id, fileNumber: deal.fileNumber, address: `${deal.street}, ${deal.city}, ${deal.state} ${deal.zip || ''}`.trim(), transactionType: deal.transactionType,
        added, tasks, docs: saved, skipped, problems, at: Date.now() })); } catch (err) { /* private mode: no confirmation panel, the toasts above still say it */ }
      if (problems.length) {
        const box = $('[data-wiz-step="review"] [data-wiz-errors]', root);
        if (box) { box.hidden = false; box.innerHTML = toText(html`<strong>Order ${deal.fileNumber} was created, but these people were not added.</strong><ul>${problems.map((m) => html`<li>${m}</li>`)}</ul><p>You are still on Place Order. <a href="#/deals/${deal.id}">Open ${deal.fileNumber}</a> and add them on Contacts.</p>`); }
        if (btn) { btn.disabled = true; btn.textContent = 'Place order'; }
        return;
      }
      if (skipped.length) toast(`No ${skipped.join(' / ').toLowerCase()} added (nobody was picked from the list). You can add one later on the Contacts tab.`);
      toast(asDraft ? `Order ${deal.fileNumber} saved as open${deal.processorId ? '' : ' with Processor Unassigned'}` : `Order ${deal.fileNumber} created${saved ? ` with ${saved} document(s)` : ''}`);
      go('/deals/' + deal.id);
    };
    form.addEventListener('submit', guard(async (ev) => { ev.preventDefault(); await commitOrder({ asDraft: false }); }));
    paint();
  } };
  return view;
}
