// Agent task page (Francis, Nov 3; Qualia Connect): Confirm Client Contact Information / Your Transaction Information / Home Warranty Information.
// Edit -> Submit -> "Task Complete". A completed task opens as View Submission (read-only) with Modify, which turns the button into Submit Revision.
// "About This Task" sidebar with Send Message (a conversation with the processor tied to this task). Leaving with unsaved edits asks first.
import { html, raw, toText, $, $$, guard, toast, fmtDate, fmtDateTime, fmtMoney, pill } from '../ui.js?v=202611060220';
import { MARITAL } from '../data/agent-portal.js?v=202611060220';
import { CLS, LABEL } from './dealtasks.js?v=202611060220';

const yn = (name, val, label) => html`<fieldset class="span2 yn" data-k="${name}"><legend>${label}</legend>${['Yes', 'No'].map((o) => html`<label class="check"><input type="radio" name="${name}" value="${o}" ${val === o ? raw('checked') : ''}> ${o}</label>`)}<span class="ferr"></span></fieldset>`;
const inp = (name, label, val, type = 'text', extra = '') => html`<label class="fld" data-k="${name}">${label}<input name="${name}" type="${type}" value="${val == null ? '' : val}" ${raw(extra)}><span class="ferr"></span></label>`;
const sel = (name, label, opts, val) => html`<label class="fld" data-k="${name}">${label}<select name="${name}"><option value="">Choose&hellip;</option>${opts.map((o) => html`<option ${o === val ? raw('selected') : ''}>${o}</option>`)}</select><span class="ferr"></span></label>`;
const PH = 'inputmode="tel" placeholder="xxx-xxx-xxxx" data-phone';
const personFields = (k, p = {}, { married = true } = {}) => html`${inp(`${k}.firstName`, 'First Name', p.firstName)}${inp(`${k}.lastName`, 'Last Name', p.lastName)}${inp(`${k}.email`, 'Email', p.email, 'email')}${inp(`${k}.phone`, 'Phone', p.phone, 'tel', PH)}
  ${married ? html`${sel(`${k}.maritalStatus`, 'Marital Status', MARITAL, p.maritalStatus)}<div class="span2 form-grid" data-spouse="${k}" ${p.maritalStatus === 'Married' ? '' : raw('hidden')}><h4 class="span2">Spouse</h4>${inp(`${k}.spouse.firstName`, 'Spouse First Name', (p.spouse || {}).firstName)}${inp(`${k}.spouse.lastName`, 'Spouse Last Name', (p.spouse || {}).lastName)}${inp(`${k}.spouse.phone`, 'Spouse Phone', (p.spouse || {}).phone, 'tel', PH)}${inp(`${k}.spouse.email`, 'Spouse Email', (p.spouse || {}).email, 'email')}</div>` : ''}`;

function editForm(t, a) {
  if (t.code === 'agent_client_contacts') return html`<h3 class="span2">Do you represent the following ${t.assignedRole === 'Listing Agent' ? 'sellers' : 'buyers'}?</h3>
    ${(a.clients || []).map((c, i) => { const cl = t.clients.find((z) => z.participantId === c.participantId) || {}; return html`<div class="span2 form-grid card" data-client="${i}"><input type="hidden" name="clients.${i}.participantId" value="${c.participantId}">
      ${yn(`clients.${i}.represent`, c.represent, `Do you represent ${cl.name}?`)}<div class="span2 form-grid" data-represent="${i}" ${c.represent === 'Yes' ? '' : raw('hidden')}>${personFields(`clients.${i}`, c)}</div></div>`; })}
    ${(a.added || []).map((c, i) => html`<div class="span2 form-grid card" data-added="${i}"><h4 class="span2">Added client contact ${i + 1} <button type="button" class="ghost" data-del-row="added.${i}">Remove</button></h4>${personFields(`added.${i}`, c)}</div>`)}
    <div class="span2"><button type="button" class="ghost" data-add-row="added">+ Add Client Contact</button></div>`;
  if (t.code === 'agent_transaction_info') return html`${inp('closingDate', 'Estimated Closing Date', a.closingDate, 'date')}${inp('purchasePrice', 'Purchase Price ($)', a.purchasePrice, 'text', 'inputmode="decimal"')}
    <h4 class="span2">${t.assignedRole === 'Listing Agent' ? 'Listing' : 'Selling'} commission splits</h4>
    ${(a.commissions || []).map((c, i) => html`<div class="span2 form-grid" data-commission="${i}">${inp(`commissions.${i}.name`, 'Name', c.name)}${inp(`commissions.${i}.percent`, 'Percent (%)', c.percent, 'text', 'inputmode="decimal"')}${inp(`commissions.${i}.amount`, 'Amount ($)', c.amount, 'text', 'inputmode="decimal"')}${i ? html`<button type="button" class="ghost" data-del-row="commissions.${i}">Remove split</button>` : ''}</div>`)}
    <div class="span2"><button type="button" class="ghost" data-add-row="commissions">Edit: + add a split</button></div>
    <h4 class="span2">Fees and credits</h4>
    ${(a.fees || []).map((f, i) => html`<div class="span2 form-grid" data-fee="${i}">${inp(`fees.${i}.name`, 'Name', f.name)}${sel(`fees.${i}.type`, 'Type', ['Fee', 'Credit'], f.type)}${inp(`fees.${i}.amount`, 'Amount ($)', f.amount, 'text', 'inputmode="decimal"')}${sel(`fees.${i}.paidBy`, 'Paid By', ['Buyer', 'Seller'], f.paidBy)}<button type="button" class="ghost" data-del-row="fees.${i}">Remove</button></div>`)}
    <div class="span2"><button type="button" class="ghost" data-add-row="fees">+ Add a Fee or Credit</button></div>
    ${inp('emdAmount', 'Earnest deposit amount ($)', a.emdAmount, 'text', 'inputmode="decimal"')}${inp('licenseId', 'Your Agency License ID', a.licenseId)}
    ${yn('holdingEmd', a.holdingEmd, 'Are you holding earnest money given to you by the buyer?')}
    <h4 class="span2">${t.assignedRole === 'Listing Agent' ? 'Listing' : 'Selling'} team members</h4>
    ${(a.team || []).map((p, i) => html`<div class="span2 form-grid card" data-team="${i}">${personFields(`team.${i}`, p, { married: false })}${inp(`team.${i}.company`, 'Company', p.company)}${inp(`team.${i}.licenseId`, 'Agency License ID', p.licenseId)}<button type="button" class="ghost" data-del-row="team.${i}">Remove</button></div>`)}
    <div class="span2"><button type="button" class="ghost" data-add-row="team">+ Add team member</button></div>`;
  return html`${yn('willPurchase', a.willPurchase, 'Will you or someone else be purchasing a home warranty?')}
    <div class="span2 form-grid" data-hw-yes ${a.willPurchase === 'Yes' ? '' : raw('hidden')}>${sel('purchaser', 'Who is purchasing it?', ['Me', 'Someone else'], a.purchaser)}${inp('company', 'Warranty company (if known)', a.company)}</div>`;
}
const row = (k, v) => html`<dt>${k}</dt><dd>${v == null || v === '' ? html`<span class="muted">\u2014</span>` : v}</dd>`;
const pv = (p) => html`${row('Name', `${p.firstName} ${p.lastName}`)}${row('Email', p.email)}${row('Phone', p.phone)}${p.maritalStatus ? row('Marital Status', p.maritalStatus) : ''}${p.spouse ? row('Spouse', `${p.spouse.firstName} ${p.spouse.lastName} ${p.spouse.phone || ''} ${p.spouse.email || ''}`.trim()) : ''}`;
function viewSubmission(t, a) {
  if (t.code === 'agent_client_contacts') return html`${(a.clients || []).map((c) => { const cl = t.clients.find((z) => z.participantId === c.participantId) || {}; return html`<dl class="answers" data-view-client>${row(`Do you represent ${cl.name}?`, c.represent)}${c.represent === 'Yes' ? pv(c) : ''}</dl>`; })}
    ${(a.added || []).map((c) => html`<dl class="answers" data-view-added><dt>Added client contact</dt><dd></dd>${pv(c)}</dl>`)}`;
  if (t.code === 'agent_transaction_info') return html`<dl class="answers">${row('Estimated Closing Date', fmtDate(a.closingDate))}${row('Purchase Price', fmtMoney(a.purchasePrice))}
    ${(a.commissions || []).map((c) => row(c.name, [c.percent != null ? `${c.percent}%` : '', c.amount != null ? fmtMoney(c.amount) : ''].filter(Boolean).join(' / ')))}
    ${(a.fees || []).map((f) => row(`${f.type}: ${f.name}`, `${fmtMoney(f.amount)} paid by ${f.paidBy}`))}
    ${row('Earnest deposit amount', fmtMoney(a.emdAmount))}${row('Holding earnest money given by the buyer?', a.holdingEmd)}${row('Agency License ID', a.licenseId)}
    ${(a.team || []).map((p) => row('Team member', `${p.firstName} ${p.lastName}, ${p.email}${p.phone ? ', ' + p.phone : ''}${p.company ? ', ' + p.company : ''}${p.licenseId ? ', license ' + p.licenseId : ''}`))}</dl>`;
  return html`<dl class="answers">${row('Will you or someone else be purchasing a home warranty?', a.willPurchase)}${a.willPurchase === 'Yes' ? html`${row('Who', a.purchaser)}${row('Company', a.company)}` : ''}</dl>`;
}
// read the form back into the answers shape (paths like clients.0.spouse.email)
function readForm(form, base) {
  const out = JSON.parse(JSON.stringify(base)); ['added', 'commissions', 'fees', 'team'].forEach((k) => { if (Array.isArray(out[k])) out[k] = out[k].map(() => ({})); });
  if (Array.isArray(out.clients)) out.clients = out.clients.map((c) => ({ participantId: c.participantId }));
  new FormData(form).forEach((v, k) => { const p = k.split('.'); let o = out; p.slice(0, -1).forEach((s, i) => { const nx = /^\d+$/.test(p[i + 1]) ? [] : {}; if (o[s] == null) o[s] = nx; o = o[s]; }); o[p[p.length - 1]] = v; });
  return out;
}
const blank = { added: { firstName: '', lastName: '', email: '', phone: '', maritalStatus: '' }, commissions: { name: 'Split', percent: '', amount: '' }, fees: { name: '', type: '', amount: '', paidBy: '' }, team: { firstName: '', lastName: '', email: '', phone: '', company: '', licenseId: '' } };

export async function render({ api, deal, params, go }) {
  let t = await api.getAgentTask(params.sub); let editing = t.canSubmit && !t.submitted; let answers = t.answers; let dirty = false; const justDone = /[?&]done=1/.test(location.hash);
  window.claDirty = () => dirty;
  const head = () => html`<p class="muted small">For <strong>${t.ownerName}</strong> (${t.assignedRole}) &middot; due ${fmtDate(t.dueDate) || 'n/a'} &middot; ${pill(t.submitted ? 'complete' : LABEL[t.status], t.submitted ? 'ok' : CLS[t.status])}${t.revisionCount ? html` &middot; submitted ${t.revisionCount === 1 ? 'once' : `${t.revisionCount} times (${t.revisionCount - 1} revision${t.revisionCount > 2 ? 's' : ''})`}` : ''}${t.completedAt ? html` &middot; last ${fmtDateTime(t.completedAt)}` : ''}</p>`;
  const main = () => t.answersHidden ? html`<p class="muted" data-answers-hidden>Only ${t.ownerName}, the processor, the coordinator and Admin can see these answers.</p>`
    : editing ? html`<form id="atf" class="form-grid" novalidate>${editForm(t, answers)}<div class="span2"><button class="m-btn" type="submit" data-submit>${t.submitted ? 'Submit Revision' : 'Submit'}</button>${t.submitted ? html` <button type="button" class="ghost" data-cancel-modify>Cancel</button>` : ''}</div></form>`
    : html`<div data-view-submission><h3>View Submission</h3>${answers && (t.submitted || t.revisionCount) ? viewSubmission(t, answers) : html`<p class="muted">Not submitted yet.</p>`}${t.canSubmit && t.submitted ? html`<button type="button" class="m-btn" data-modify>Modify</button>` : ''}
      ${t.revisions.length ? html`<p class="muted small" data-revisions>History: ${t.revisions.map((r) => `${r.kind === 'submission' ? 'Submitted' : 'Revision ' + (r.n - 1)} by ${r.by} ${fmtDateTime(r.at)}`).join('; ')}</p>` : ''}</div>`;
  const draw = (root) => { $('[data-task-main]', root).innerHTML = toText(html`${head()}${main()}`); wire(root); };
  const body = html`<div class="box-title"><h2><span class="h-ico"></span>${t.title}</h2><a class="ghost right" href="#/deals/${deal.id}/tasks">All tasks</a></div>
    ${justDone ? html`<div class="notice ok" data-task-complete><strong>Task Complete.</strong> Thank you! You can view or modify your submission below.</div>` : ''}
    <div class="sum-grid"><div class="card" data-task-main>${head()}${main()}</div>
    <aside class="card" data-about-task><h3>About This Task</h3><p>${t.about}</p>${t.canSubmit || t.mine ? html`<form id="tmsg"><label>Question about this task?<textarea name="body" rows="3" maxlength="4000" placeholder="Message CLA Title about this task"></textarea></label><button class="m-btn" type="submit" data-send-message>Send Message</button></form>` : ''}</aside></div>`;
  function wire(root) {
    const form = $('#atf', root);
    const md = $('[data-modify]', root); if (md) md.addEventListener('click', () => { editing = true; draw(root); });
    const cm = $('[data-cancel-modify]', root); if (cm) cm.addEventListener('click', () => { editing = false; dirty = false; answers = t.answers; draw(root); });
    if (!form) return;
    const sync = () => { $$('[data-represent]', form).forEach((el) => { const r = form.querySelector(`[name="clients.${el.dataset.represent}.represent"]:checked`); el.hidden = !(r && r.value === 'Yes'); });
      $$('[data-spouse]', form).forEach((el) => { const s = form.elements[`${el.dataset.spouse}.maritalStatus`]; el.hidden = !(s && s.value === 'Married'); });
      const hw = $('[data-hw-yes]', form); if (hw) { const r = form.querySelector('[name=willPurchase]:checked'); hw.hidden = !(r && r.value === 'Yes'); } };
    form.addEventListener('input', () => { dirty = true; }); form.addEventListener('change', () => { dirty = true; sync(); }); sync();
    $$('[data-add-row]', form).forEach((b) => b.addEventListener('click', () => { answers = readForm(form, answers); const k = b.dataset.addRow; answers[k] = [...(answers[k] || []), { ...blank[k] }]; dirty = true; draw(root); }));
    $$('[data-del-row]', form).forEach((b) => b.addEventListener('click', () => { answers = readForm(form, answers); const [k, i] = b.dataset.delRow.split('.'); answers[k].splice(Number(i), 1); dirty = true; draw(root); }));
    form.addEventListener('submit', async (e) => { e.preventDefault(); $$('.ferr', form).forEach((x) => { x.textContent = ''; }); $$('.has-err', form).forEach((x) => x.classList.remove('has-err'));
      answers = readForm(form, answers);
      try { t = await api.submitAgentTask(t.id, answers); dirty = false; answers = t.answers; editing = false; toast('Task Complete'); go(`/deals/${deal.id}/tasks/${t.id}?done=1`); }
      catch (err) { (err.fieldErrors || []).forEach((fe) => { const el = form.querySelector(`[data-k="${fe.k}"]`) || form.querySelector(`[data-k="${fe.k.split('.').slice(0, -1).join('.')}"]`); if (el) { el.classList.add('has-err'); const fx = $('.ferr', el); if (fx) fx.textContent = fe.msg; } });
        toast(err.fieldErrors ? `Please fix ${err.fieldErrors.length} field(s).` : err.message, 'err'); } });
  }
  return { title: t.title, crumbs: [['All Tasks', `#/deals/${deal.id}/tasks`], [t.title]], body, mount(root) {
    wire(root);
    const mf = $('#tmsg', root); if (mf) mf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const th = await api.messageAboutTask(t.id, e.target.elements.body.value); toast('Message sent to CLA Title');
      if (!dirty) go(`/deals/${deal.id}/inbox/${th.id}`); else e.target.reset(); }));
  } };
}
