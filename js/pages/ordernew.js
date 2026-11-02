// Place Order (Processor, Admin, Super admin; John Nov 2): creates a deal and links the chosen people (their intake tasks are copied from the current task templates).
// John, Nov 2 (later): Open Date (backdating allowed, never future), every US state (no default), EMD amount + due date, documents attached at placement,
// type-to-search pickers for Buyer / Seller / Buyer Agent / Listing Agent, one "Add new user" place, and Transaction Coordinator = TC accounts only.
import { html, raw, $, $$, guard, formData, options, toast, fmtSize, toText } from '../ui.js?v=202611021559';
import { TX_TYPES, runsOrders, isProcessor, localDate, US_STATE_NAMES, DOC_TYPES, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, visibilityChoices, visibilityLabel } from '../data/constants.js?v=202611021559';
import { pickerHtml, mountPicker, personLabel } from './person-picker.js?v=202611021559';

const SEARCH = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer agent'], ['Listing Agent', 'Listing agent']];
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

export async function render({ api, user, go }) {
  if (!runsOrders(user)) throw new Error('Only a Processor or Admin can place orders.');
  const contacts = await api.listContacts(); const staff = await api.listSalesStaff(); const procs = await api.listProcessors(); const tcs = await api.listCoordinators();
  // the file's Processor: a Processor defaults to themselves; an Admin / Super admin is not a valid Processor, so they must choose one
  const meProc = isProcessor(user.role); const today = localDate();
  // "Add new user" roles. Salesperson creates a staff login, which is Admin-only (John's earlier decision), so only Admins / Super admins see it.
  const NEW_ROLES = [['Client-Buyer', 'Buyer'], ['Client-Seller', 'Seller'], ['Buyer Agent', 'Buyer Agent'], ['Listing Agent', 'Listing Agent'], ...(user.isAdmin ? [['Sales Person', 'Salesperson']] : [])];
  const visOpts = visibilityChoices(user.role, user.isAdmin);
  const salesBox = (s, checked = false) => html`<label class="check"><input type="checkbox" name="salesIds" value="${s.id}" ${checked ? raw('checked') : ''}> ${s.firstName} ${s.lastName} <span class="muted small">(${s.role})</span></label>`;
  const body = html`
    <div class="box-title"><h2><span class="h-ico"></span>Place Order</h2></div>
    <form id="nof" class="card form-grid">
      <label class="span2">Street address *<input name="street" required maxlength="200"></label>
      <label>City *<input name="city" required maxlength="100"></label><label>State *<select name="state" required><option value="">Select state</option>${US_STATE_NAMES.map(([c, n]) => html`<option value="${c}">${n} (${c})</option>`)}</select></label>
      <label>ZIP<input name="zip" maxlength="10" placeholder="20850"></label>
      <label>Transaction type<select name="transactionType">${options(TX_TYPES, 'Purchase')}</select></label>
      <label>Open date *<input name="openDate" type="date" required value="${today}" max="${today}" title="The day the order came in. Can be backdated; not in the future."></label>
      <label>Purchase price<input name="purchasePrice" inputmode="decimal" placeholder="485000"></label><label>Loan amount<input name="loanAmount" inputmode="decimal" placeholder="388000"></label>
      <label>EMD amount<input name="emdAmount" inputmode="decimal" placeholder="10000" aria-label="EMD amount (earnest money deposit)"></label><label>EMD due date<input name="emdDueDate" type="date"></label>
      <label>Closing date<input name="closingDate" type="date"></label>
      <label>Processor *<select name="processorId" required>${meProc ? '' : html`<option value="">Choose the Processor&hellip;</option>`}${options(procs, meProc ? user.id : '', (s) => `${s.firstName} ${s.lastName}${s.id === user.id ? ' (you)' : ''}`, (s) => s.id)}</select></label>
      <fieldset class="span2" data-sales-picker><legend>Salespeople on this order (check all that apply)</legend><div data-sales-list>${staff.length ? staff.map((s) => salesBox(s)) : html`<p class="muted" data-no-sales>No active salespeople.</p>`}</div></fieldset>
      <h3 class="span2">People on this order <span class="muted">(you can add or change them later under Contacts)</span></h3>
      ${SEARCH.map(([role, label]) => pickerHtml('p:' + role, label))}
      <label>Transaction coordinator<select name="p:Transaction Coordinator"><option value="">(none yet)</option>${options(tcs, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.contactId)}</select></label>
      <label>Sales team member<select name="p:Sales Team"><option value="">(none yet)</option>${options(contacts, '', (c) => `${c.firstName} ${c.lastName}${c.company ? ' \u2014 ' + c.company : ''}`, (c) => c.id)}</select></label>
      <fieldset class="span2" id="addnew"><legend>Add new user</legend>
        <button type="button" class="ghost" id="an-open">+ Add new user</button>
        <div id="an-form" class="form-grid" hidden>
          <label class="span2">Role *<select id="an-role" aria-label="Role"><option value="">Choose the role&hellip;</option>${NEW_ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
          <div class="span2 form-grid" id="an-fields" hidden>
            <label>First name *<input id="an-first" maxlength="80"></label><label>Last name<input id="an-last" maxlength="80"></label>
            <label>Email<span id="an-email-req" hidden> *</span><input id="an-email" type="email" maxlength="200"></label><label>Phone<input id="an-phone" type="tel" inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone></label>
            <label class="span2" id="an-company-l" hidden>Brokerage / company<input id="an-company" maxlength="120"></label>
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
        <p class="muted small">They are saved to the order's Documents tab when you create the order. Documents are kept permanently and cannot be deleted.</p>
      </fieldset>
      <div class="span2"><button class="m-btn" type="submit">Create order</button> <a class="ghost" href="#/orders">Cancel</a></div>
    </form>`;
  return { title: 'Place Order', crumbs: [['Orders', '#/orders'], ['Place Order']], body, mount(root) {
    const form = $('#nof', root); const people = [...contacts];
    const pickers = Object.fromEntries(SEARCH.map(([role]) => [role, mountPicker($(`[data-picker="p:${role}"]`, root), () => people)]));
    // ---------- documents chosen at placement: one row per file with its own document type ----------
    const fileIn = $('#nof-files', root); const fileList = $('#nof-filelist', root);
    fileIn.addEventListener('change', () => { fileList.innerHTML = toText(html`${[...fileIn.files].map((f, i) => html`<div class="nof-file" data-file="${i}"><strong>${f.name}</strong> <span class="muted small">${fmtSize(f.size)}</span>
      <label>Document type<select data-doctype="${i}" aria-label="Document type for ${f.name}"><option value="">Choose&hellip;</option>${options(DOC_TYPES, '')}</select></label></div>`)}`); });
    // ---------- one "Add new user" place ----------
    const anForm = $('#an-form', root); const anRole = $('#an-role', root); const anFields = $('#an-fields', root); const dup = $('#an-dup', root);
    const val = (id) => $('#' + id, root).value.trim();
    const reset = () => { ['an-first', 'an-last', 'an-email', 'an-phone', 'an-company'].forEach((id) => { $('#' + id, root).value = ''; }); anRole.value = ''; anFields.hidden = true; dup.hidden = true; dup.innerHTML = ''; };
    $('#an-open', root).addEventListener('click', () => { anForm.hidden = false; anRole.focus(); });
    $('#an-cancel', root).addEventListener('click', () => { reset(); anForm.hidden = true; });
    anRole.addEventListener('change', () => { const r = anRole.value; anFields.hidden = !r; dup.hidden = true;
      $('#an-company-l', root).hidden = !(r === 'Buyer Agent' || r === 'Listing Agent'); $('#an-email-req', root).hidden = r !== 'Sales Person';
      $('#an-note', root).textContent = r === 'Sales Person' ? 'Creates an active CLA staff login (role Sales Person) and checks them under Salespeople. No email or invite is sent.'
        : r ? `Adds a contact (no portal login, no email or invite is sent) and puts them in the ${NEW_ROLES.find((x) => x[0] === r)[1]} slot of this order.` : ''; });
    $('#addnew', root).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter here must not submit the order
    const place = (role, c) => {
      if (role === 'Sales Person') { const list = $('[data-sales-list]', root); const box = $(`input[name=salesIds][value="${c.profileId || c.id}"]`, list);
        if (box) box.checked = true; else { const nd = $('[data-no-sales]', list); if (nd) nd.remove(); list.insertAdjacentHTML('beforeend', toText(salesBox({ id: c.profileId || c.id, firstName: c.firstName, lastName: c.lastName, role: 'Sales Person' }, true))); } }
      else pickers[role].set(c);
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
      const c = await api.createContact({ firstName: first, lastName: val('an-last'), email, phone: val('an-phone'), company: (role === 'Buyer Agent' || role === 'Listing Agent') ? val('an-company') : '' });
      people.push(c); place(role, c); }));
    // ---------- submit ----------
    form.addEventListener('submit', guard(async (e) => {
      e.preventDefault(); const f = formData(e.target);
      for (const [role, label] of SEARCH) { const pk = pickers[role]; if (pk.typed && !pk.value) throw new Error(`${label}: pick a person from the list (or clear the box, or use "Add new user").`); }
      const amt = String(f.emdAmount || '').replace(/[$,\s]/g, ''); if (amt && !(isFinite(Number(amt)) && Number(amt) >= 0)) throw new Error('EMD amount must be a number of 0 or more.');
      if (f.openDate && f.openDate > localDate()) throw new Error('Open date cannot be in the future.');
      const files = [...fileIn.files]; for (const file of files) { if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is too large for this demo.`);
        if (!ALLOWED_UPLOAD_EXT.includes((file.name.split('.').pop() || '').toLowerCase())) throw new Error(`${file.name}: that file type is not allowed.`); }
      const input = { ...f, emdAmount: amt, salesIds: new FormData(e.target).getAll('salesIds') };
      const deal = await api.createDeal(input); const problems = [];
      for (const [k, v] of Object.entries(f)) if (k.startsWith('p:') && v) { try { await api.addParticipant(deal.id, v, k.slice(2)); } catch (err) { problems.push(`${k.slice(2)}: ${err.message}`); } }
      for (let i = 0; i < files.length; i++) { const file = files[i]; const sel = $(`[data-doctype="${i}"]`, root);
        try { await api.addDocument(deal.id, { name: file.name, description: '', mimeType: file.type, size: file.size, dataUrl: await readFile(file), visibility: $('#nof-vis', root).value, folderId: null, docType: sel ? sel.value : '' }); }
        catch (err) { problems.push(`${file.name}: ${err.message}`); } }
      toast(`Order ${deal.fileNumber} created${files.length ? ` with ${files.length - problems.filter((p) => files.some((x) => p.startsWith(x.name + ':'))).length} document(s)` : ''}`);
      if (problems.length) toast('Some items were not added: ' + problems.join(' | '), 'err');
      go('/deals/' + deal.id);
    }));
  } };
}
