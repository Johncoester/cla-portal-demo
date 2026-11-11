// crm-forms.js : Zoho-style CRM pieces (John, Nov 2): the client / lead form (Client Information, Social Media Links & Web Addresses, Address,
// Description; Cancel / Save and New / Save), the record view, the related lists (Notes, Attachments, Open Activities, Closed Activities,
// Invited Meetings) and the Task and Meeting forms. Meetings: NO calendar sync, NO invitations, nothing is ever emailed. Function first.
import { html, raw, $, $$, guard, formData, toast, fmtDate, fmtDateTime, fmtMoney, fmtSize, modal, closeModal, pill } from '../ui.js?v=202611070139';
import { CONTACT_TYPES, contactTypeLabel, US_STATE_NAMES, localDate } from '../data/constants.js?v=202611101015';
import { ROLES_IN_COMPANY, LEAD_SOURCES, RELATIONSHIP_STATUSES, LINK_FIELDS, safeHref, TASK_SUBJECTS, TASK_STATUSES, TASK_PRIORITIES, REPEAT_EVERY, MEETING_TYPES, relatedLists,
  activityKindLabel, ACTIVITY_KINDS, entityLabel, localStamp } from '../data/crm.js?v=202611130900';
import { sel, pairs, ownerSel } from './crm-kit.js?v=202611132200';
import { CONVERTED_STATUS } from '../data/crm.js?v=202611130900';
import { fieldsInSection, builtinRequired, activeOptions, defaultOption } from '../data/crm-config.js?v=202611130900';
import { optSel, lbl, lblOrDash, hiddenField, cfInputs, cfRows, cfExtraSections } from './crm-custom.js?v=202611130900';
import { activityBoard, wireCalls } from './crm-calls.js?v=202611132200';
import { wireZipCounty, wireSubjectTypeahead, inviteBtn, invitePreview } from './crm-janine.js?v=202611131900';

const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
const v0 = (v) => (v == null ? '' : v);
const dash = (v) => (v == null || v === '' ? html`<span class="muted">&mdash;</span>` : v);
export const extLink = (url, label) => { const h = safeHref(url); return h ? html`<a href="${h}" target="_blank" rel="noopener noreferrer" data-ext-link>${label || h}</a>` : dash(''); };
export const fmtWhen = (s) => (!s ? '' : s.length > 10 ? `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}` : fmtDate(s));
const fieldErr = (form, msg) => { const e = $('[data-form-err]', form); if (e) e.textContent = msg; };

// ---------- CLIENT / LEAD FORM (create or edit). kind 'contact' | 'lead'. Edit of a client keeps name / email / phone read-only (Processor's contact edit). ----------
// CRM Settings (Nov 2): pick lists come from opts.cfg (a retired value the record already has stays selected), built-in fields an Admin hid are
// left out (their stored values are kept: the form simply does not send them), Role / Status / State may be un-required, custom fields per section.
export function personFormHtml(kind, v, { owners, accounts = [], me, edit = false, cfg = null }) {
  const isLead = kind === 'lead'; const lockId = !isLead && edit;
  const L = isLead ? 'Lead' : 'Client';
  const H = (k) => hiddenField(cfg, 'person', k); const R = (k) => (builtinRequired(cfg, k) ? ' *' : '');
  const txt = (name, label, max = 100, extra = '') => (H(name) ? '' : html`<label>${label}<input name="${name}" maxlength="${max}" value="${v0(v[name])}" ${raw(extra)}></label>`);
  const idTxt = (name, label, type = 'text') => html`<label>${label}<input name="${name}" type="${type}" value="${v0(v[name])}" ${lockId ? raw('disabled') : ''} ${type === 'tel' ? raw('data-phone placeholder="xxx-xxx-xxxx"') : ''}></label>`;
  const cf = (sec) => cfInputs(cfg, kind, sec, v);
  const extra = fieldsInSection(cfg, kind, 'additional');
  const notConverted = (s) => !isLead || s !== CONVERTED_STATUS || v.relationshipStatus === s;
  const linkFields = LINK_FIELDS.filter(([k]) => !H('links.' + k));
  return html`<form id="person-form" class="form-grid" data-person-form="${kind}" novalidate>
    <h4 class="span2">${L} Information</h4>
    <label>${L} Owner${ownerSel(owners, v.ownerId)}</label>
    ${idTxt('firstName', 'First Name')}<label>Last Name *<input name="lastName" maxlength="80" value="${v0(v.lastName)}" ${lockId ? raw('disabled') : ''}></label>
    ${isLead ? html`<label>Company${sel('accountId', accounts.filter((a) => !a.archived || a.id === v.accountId).map((a) => [a.id, a.state ? `${a.name} (${a.state})` : a.name]), v.accountId, '(none)')}
      ${!v.accountId && v.companyText ? html`<span class="muted small" data-old-company>Typed before the lookup: ${v.companyText} (kept until you pick a company)</span>` : ''}<a class="small" href="#/crm/new/account" target="_blank" rel="noopener" data-company-new>New company</a></label>` : html`<label>Company Name${sel('accountId', accounts.filter((a) => !a.archived || a.id === v.accountId).map((a) => [a.id, a.name]), v.accountId, '(none)')}</label>
      <label>Company (if not in the list)<input name="company" maxlength="120" value="${v0(v.company)}"></label>`}
    ${H('roleInCompany') ? '' : html`<label>Role in Company${R('roleInCompany')}${optSel(cfg, 'roleInCompany', 'roleInCompany', v.roleInCompany)}</label>`}${txt('title', 'Title')}
    ${idTxt('email', 'Email', 'email')}${idTxt('phone', 'Phone', 'tel')}
    ${H('mobile') ? '' : html`<label>Mobile<input name="mobile" type="tel" data-phone placeholder="xxx-xxx-xxxx" value="${v0(v.mobile)}"></label>`}${txt('assistant', 'Assistant')}
    ${H('asstPhone') ? '' : html`<label>Asst Phone<input name="asstPhone" type="tel" data-phone placeholder="xxx-xxx-xxxx" value="${v0(v.asstPhone)}"></label>`}
    ${H('leadSource') ? '' : html`<label>Lead Source${optSel(cfg, 'leadSource', 'leadSource', v.leadSource)}</label>`}
    ${H('relationshipStatus') ? '' : html`<label>Relationship Status${R('relationshipStatus')}${optSel(cfg, isLead ? 'leadRelationshipStatus' : 'relationshipStatus', 'relationshipStatus', v.relationshipStatus, '-None-', notConverted)}</label>`}
    ${H('agentSplit') ? '' : html`<label>Agent Split (%)<input name="agentSplit" inputmode="decimal" value="${v0(v.agentSplit)}"></label>`}${txt('licenseNo', 'Real Estate License #', 60)}
    ${H('salesVolumeLastYear') ? '' : html`<label>Sales Volume (Last Year)<input name="salesVolumeLastYear" inputmode="decimal" value="${v0(v.salesVolumeLastYear)}"></label>`}
    ${H('dealsClosedLastYear') ? '' : html`<label>Deals Closed (Last Year)<input name="dealsClosedLastYear" inputmode="numeric" value="${v0(v.dealsClosedLastYear)}"></label>`}
    ${H('contactType') ? '' : html`<label>Contact type (portal)${sel('contactType', CONTACT_TYPES, v.contactType, '(not set)')}</label>`}
    ${isLead || H('tags') ? '' : html`<label>Tags<input name="tags" value="${(v.tags || []).join(', ')}" placeholder="comma separated"></label>`}
    ${cf('info')}
    ${linkFields.length ? html`<h4 class="span2">Social Media Links &amp; Web Addresses</h4>
    ${linkFields.map(([k, label]) => html`<label>${label}<input name="links.${k}" inputmode="url" maxlength="500" value="${v0((v.links || {})[k])}" placeholder="https://"></label>`)}` : ''}
    <h4 class="span2">Address Information</h4>
    ${txt('street', 'Street', 200)}${txt('city', 'City', 80)}
    ${H('state') ? '' : html`<label>State${R('state')}${sel('state', US_STATE_NAMES.map(([c, n]) => [c, `${n} (${c})`]), v.state, '-None-')}</label>`}
    ${H('zip') ? '' : html`<label>Zip Code<input name="zip" maxlength="10" inputmode="numeric" value="${v0(v.zip)}"></label>`}${txt('county', 'County', 60)}
    ${cf('address')}
    <h4 class="span2" data-desc-head>Description</h4>
    ${H('description') ? '' : html`<label class="span2">Description<textarea name="description" rows="3" maxlength="4000">${v0(v.description)}</textarea></label>`}
    ${cf('description')}
    ${extra.length ? html`<h4 class="span2" data-additional>Additional Information</h4>${cf('additional')}` : ''}${cfExtraSections(cfg, kind, 'form', v)}
    ${lockId ? html`<p class="muted small span2">Name, email and phone are edited by the Processor on the order's Contacts tab (this person may have a portal login).</p>` : ''}
    <p class="muted small span2">* required. Links must be http:// or https:// web addresses. No email is ever sent from the CRM.</p>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> ${edit ? '' : html`<button class="ghost" type="button" data-save-new>Save and New</button> `}<button class="m-btn" type="submit" data-save>Save</button></div></form>`;
}
// opens the form in a modal. save(values) -> record. done(record) after Save; Save and New keeps the modal open with an empty form.
export function personModal(kind, v, opts, save, done) {
  const title = `${opts.edit ? 'Edit' : 'Create'} ${kind === 'lead' ? 'Lead' : 'Client'}`;
  const open = (vals) => { const m = modal(title, personFormHtml(kind, vals, opts), { wide: true }); const f = $('#person-form', m); wireZipCounty(f);   // Janine, Nov 3: county from the ZIP
    const run = (andNew) => guard(async (e) => { if (e) e.preventDefault(); fieldErr(f, '');
      try { const r = await save(formData(f)); toast(`${kind === 'lead' ? 'Lead' : 'Client'} ${opts.edit ? 'saved' : 'created'}`);
        if (andNew) { open(opts.blank ? opts.blank() : {}); const nf = $('#person-form'); if (nf) nf.dataset.savedNew = r.id; } else { closeModal(); done(r); } }
      catch (err) { fieldErr(f, err.message); throw err; } });
    f.addEventListener('submit', run(false)); const sn = $('[data-save-new]', f); if (sn) sn.addEventListener('click', run(true)); };
  open(v);
}

// ---------- RECORD VIEW (Zoho detail sections). cfg = CRM Settings: labels for pick-list values (retired ones marked), hidden fields left out, custom fields. ----------
export function personView(kind, r, extra = '', cfg = null) {
  const L = kind === 'lead' ? 'Lead' : 'Client';
  const H = (k) => hiddenField(cfg, 'person', k);
  const links = LINK_FIELDS.filter(([k]) => (r.links || {})[k] && !H('links.' + k));
  const row = (k, label, val, f = '') => (H(k) ? '' : html`<dt>${label}</dt><dd ${f ? raw(`data-f="${f}"`) : ''}>${val}</dd>`);
  const extraFields = fieldsInSection(cfg, kind, 'additional');
  return html`<div class="card" data-person-view>
    <h3>${L} Information</h3>
    <dl class="kv" data-info>
      <dt>${L} Owner</dt><dd data-f="owner">${r.ownerName || 'Unassigned'}</dd><dt>${kind === 'lead' ? 'Lead Name' : 'Client Name'}</dt><dd data-f="name">${r.name}</dd>
      <dt>${kind === 'lead' ? 'Company' : 'Company Name'}</dt><dd data-f="company">${r.accountId ? html`<a href="#/crm/accounts/${r.accountId}">${r.accountName}</a>` : dash(r.company)}</dd>
      ${row('roleInCompany', 'Role in Company', lblOrDash(cfg, 'roleInCompany', r.roleInCompany), 'roleInCompany')}${row('title', 'Title', dash(r.title))}
      <dt>Email</dt><dd>${dash(r.email)}</dd><dt>Phone</dt><dd>${dash(r.phone)}</dd>${row('mobile', 'Mobile', dash(r.mobile), 'mobile')}
      ${row('assistant', 'Assistant', dash(r.assistant))}${row('asstPhone', 'Asst Phone', dash(r.asstPhone))}
      ${row('leadSource', 'Lead Source', lblOrDash(cfg, 'leadSource', r.leadSource), 'leadSource')}${row('relationshipStatus', 'Relationship Status', lblOrDash(cfg, kind === 'lead' ? 'leadRelationshipStatus' : 'relationshipStatus', r.relationshipStatus), 'relationshipStatus')}
      ${row('agentSplit', 'Agent Split (%)', r.agentSplit == null ? dash('') : r.agentSplit + '%')}${row('licenseNo', 'Real Estate License #', dash(r.licenseNo))}
      ${row('salesVolumeLastYear', 'Sales Volume (Last Year)', r.salesVolumeLastYear == null ? dash('') : fmtMoney(r.salesVolumeLastYear))}${row('dealsClosedLastYear', 'Deals Closed (Last Year)', dash(r.dealsClosedLastYear))}
      ${row('contactType', 'Contact type (portal)', contactTypeLabel(r.contactType) || 'Not set', 'contactType')}
      ${cfRows(cfg, kind, 'info', r)}
      ${extra}</dl>
    <h3>Address Information</h3>
    <dl class="kv" data-address>${row('street', 'Street', dash(r.street))}${row('city', 'City', dash(r.city))}${row('state', 'State', dash(r.state), 'state')}${row('zip', 'Zip Code', dash(r.zip))}${row('county', 'County', dash(r.county), 'county')}${cfRows(cfg, kind, 'address', r)}</dl>
    <h3>Social Media Links &amp; Web Addresses</h3>
    ${links.length ? html`<dl class="kv" data-links>${links.map(([k, label]) => html`<dt>${label}</dt><dd data-link="${k}">${extLink(r.links[k])}</dd>`)}</dl>` : html`<p class="muted" data-links>No links yet.</p>`}
    <h3 data-desc-head>Description</h3>${H('description') ? '' : html`<p data-f="description">${r.description || html`<span class="muted">&mdash;</span>`}</p>`}
    ${fieldsInSection(cfg, kind, 'description').length ? html`<dl class="kv">${cfRows(cfg, kind, 'description', r)}</dl>` : ''}
    ${extraFields.length ? html`<h3 data-additional>Additional Information</h3><dl class="kv" data-custom-fields>${cfRows(cfg, kind, 'additional', r)}</dl>` : ''}${cfExtraSections(cfg, kind, 'view', r)}</div>`;
}

// ---------- RELATED LISTS ----------
const actWhen = (a) => (a.kind === 'task' ? fmtDate(a.dueDate) : a.kind === 'meeting' ? `${fmtWhen(a.startsAt)}${a.allDay ? ' (all day)' : ''}` : a.kind === 'call' && a.callStart ? fmtWhen(a.callStart) : fmtDate(a.occurredOn));
const actLink = (a) => (a.kind === 'task' ? html`<a href="#/crm/tasks/${a.id}" data-task-link="${a.id}">${a.subject}</a>` : a.kind === 'meeting' ? html`<a href="#/crm/meetings/${a.id}" data-meeting-link="${a.id}">${a.subject}</a>` : a.kind === 'call' ? html`<a href="#/crm/calls/${a.id}" data-call-link="${a.id}">${a.subject}</a>` : html`<strong>${a.subject}</strong>`);
function actTable(list, me, { closeBtn = false, empty = 'None.', cfg = null } = {}) {
  return html`<table class="tbl"><thead><tr><th>Type</th><th>Subject / Title</th><th>Due / From</th><th>Status</th><th>Owner / Host</th><th></th></tr></thead><tbody>
    ${list.length ? list.map((a) => html`<tr data-act="${a.id}" data-kind="${a.kind}" class="${a.overdue ? 'overdue' : ''}"><td>${activityKindLabel(a.kind)}${a.system ? html` <span class="muted small">(CRM)</span>` : ''}</td>
      <td>${actLink(a)}${a.body && a.kind !== 'task' && a.kind !== 'meeting' ? html`<br><span class="small">${a.body}</span>` : ''}${a.parentLabel && a.entity === 'lead' && a.kind !== 'note' ? '' : ''}</td>
      <td>${actWhen(a)}</td>
      <td>${a.kind === 'task' ? html`${lbl(cfg, 'taskStatus', a.status)}${a.overdue ? html` ${pill('Overdue', 'bad')}` : ''}${a.reminderDue ? html` ${pill('Reminder', 'warn')}` : ''} <span class="muted small">${lbl(cfg, 'taskPriority', a.priority)}</span>` : a.kind === 'meeting' ? html`${lbl(cfg, 'meetingType', a.meetingType) || 'Meeting'}${a.open ? '' : html` <span class="muted small">(held)</span>`}` : a.kind === 'call' ? html`${a.callStatus || 'Completed'}${a.callType ? html` <span class="muted small">${a.callType}</span>` : ''}${a.callDurationText ? html` <span class="muted small">${a.callDurationText}</span>` : ''}${a.reminderDue ? html` ${pill('Reminder', 'warn')}` : ''}` : 'Logged'}</td>
      <td>${a.kind === 'task' ? a.ownerName : a.kind === 'meeting' ? a.hostName : a.kind === 'call' ? a.ownerName || a.createdByName : a.createdByName}</td>
      <td>${closeBtn && me.canEdit && a.kind === 'task' && a.open ? html`<button class="ghost" data-close-task="${a.id}">Close Task</button>` : ''}</td></tr>`) : html`<tr><td colspan="6" class="muted">${empty}</td></tr>`}</tbody></table>`;
}
// record = { activities, invitedMeetings, attachments }
export function relatedHtml(rec, { entity, entityId, me, cfg = null }) {
  const rl = relatedLists(rec.activities || [], rec.invitedMeetings || [], localStamp());
  return html`
  <div class="card" data-notes><h3>Notes (${rl.notes.length})</h3>
    ${me.canEdit ? html`<form id="note-form" class="inline-form"><textarea name="text" rows="2" maxlength="4000" placeholder="Add a note"></textarea><button class="m-btn" type="submit">Add Note</button></form>` : ''}
    ${rl.notes.length ? html`<ul class="notes-list">${rl.notes.map((n) => html`<li data-note="${n.id}"><strong>${n.subject}</strong>${n.body && n.body !== n.subject ? html`<br>${n.body}` : ''}<br><span class="muted small">${n.system ? 'CRM' : n.createdByName} &middot; ${fmtDateTime(n.createdAt)}${n.entity !== entity ? ` · on the ${entityLabel(n.entity).toLowerCase()}` : ''}</span></li>`)}</ul>` : html`<p class="muted">No notes yet.</p>`}
    <p class="muted small">Notes are kept permanently (no delete).</p></div>
  <div class="card" data-attachments><h3>Attachments (${(rec.attachments || []).length})</h3>
    ${me.canEdit && entity !== 'opportunity' ? html`<form id="att-form" class="inline-form"><input type="file" name="file" data-att-file><button class="m-btn" type="submit">Attach</button></form>` : ''}
    ${(rec.attachments || []).length ? html`<table class="tbl"><thead><tr><th>File</th><th>Size</th><th>Attached by</th><th>Date</th></tr></thead><tbody>${rec.attachments.map((f) => html`<tr data-att="${f.id}"><td><a href="#" data-open-att="${f.id}">${f.name}</a></td><td>${fmtSize(f.size)}</td><td>${f.uploadedByName}</td><td>${fmtDateTime(f.createdAt)}</td></tr>`)}</tbody></table>` : html`<p class="muted">No attachments.</p>`}
    <p class="muted small">Attachments are kept permanently (never deleted).</p></div>
  ${activityBoard(rec, { me, cfg })}
  <div class="card" data-open-acts><h3>Open Activities (${rl.open.length}) ${me.canEdit ? html`<span class="right"><button class="m-btn" data-new-task>+ Task</button> <button class="m-btn" data-new-meeting>+ Meeting</button> <button class="ghost" data-schedule-call-btn>+ Call</button></span>` : ''}</h3>
    ${actTable(rl.open, me, { closeBtn: true, empty: 'No open activities.', cfg })}</div>
  <div class="card" data-closed-acts><h3>Closed Activities (${rl.closed.length})</h3>${actTable(rl.closed, me, { empty: 'No closed activities.', cfg })}</div>
  <div class="card" data-invited><h3>Invited Meetings (${rl.invited.length})</h3>
    ${rl.invited.length ? html`<table class="tbl"><thead><tr><th>Title</th><th>From</th><th>To</th><th>Host</th><th>On</th></tr></thead><tbody>${rl.invited.map((m) => html`<tr data-invited-row="${m.id}"><td><a href="#/crm/meetings/${m.id}">${m.subject}</a></td><td>${fmtWhen(m.startsAt)}</td><td>${fmtWhen(m.endsAt)}</td><td>${m.hostName}</td><td><a href="${m.parentLink}">${m.parentName}</a></td></tr>`)}</tbody></table>` : html`<p class="muted">Not invited to any meetings.</p>`}
    <p class="muted small">Meetings are recorded in the portal only: no invitations are sent and nothing is added to any calendar.</p></div>`;
}
export function wireRelated(root, api, refresh, ctx) {
  const nf = $('#note-form', root); if (nf) nf.addEventListener('submit', guard(async (e) => { e.preventDefault(); await api.addCrmNote(ctx.entity, ctx.entityId, formData(nf).text || ''); toast('Note added'); refresh(); }));
  const af = $('#att-form', root); if (af) af.addEventListener('submit', guard(async (e) => { e.preventDefault(); const file = $('[data-att-file]', af).files[0]; if (!file) throw new Error('Choose a file first.');
    const dataUrl = await readFile(file); await api.addCrmAttachment(ctx.entity, ctx.entityId, { name: file.name, mimeType: file.type, size: file.size, dataUrl }); toast('File attached'); refresh(); }));
  $$('[data-open-att]', root).forEach((a) => a.addEventListener('click', guard(async (e) => { e.preventDefault(); const c = await api.getCrmAttachmentContent(a.dataset.openAtt);
    const l = document.createElement('a'); l.href = c.dataUrl; l.download = c.name; document.body.appendChild(l); l.click(); l.remove(); })));
  $$('[data-close-task]', root).forEach((b) => b.addEventListener('click', guard(async () => { const r = await api.closeCrmTask(b.dataset.closeTask); toast(r.nextTaskId ? 'Task closed; next occurrence created' : 'Task closed'); refresh(); })));
  const nt = $('[data-open-acts] [data-new-task]', root); if (nt) nt.addEventListener('click', () => taskModal(api, ctx, null, () => refresh()));
  const nm = $('[data-open-acts] [data-new-meeting]', root); if (nm) nm.addEventListener('click', guard(() => meetingModal(api, ctx, null, () => refresh())));
  // video 11: calls use Schedule a call / Log a call (crm-calls.js); this older quick log stays for EMAILS only (logged, never sent)
  const logEmail = () => {
    const m = modal('Log an email', html`<form id="log-form" class="form-grid"><input type="hidden" name="kind" value="email"><label>Subject *<input name="subject" maxlength="200"></label>
      <label>Date<input name="occurredOn" type="date" value="${localDate()}" max="${localDate()}"></label>
      <label class="span2">Details<textarea name="body" rows="2" maxlength="4000"></textarea></label>
      <p class="muted small span2">A log entry only: nothing is sent from the CRM.</p><div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Save</button></div></form>`);
    const lf = $('#log-form', m);
    lf.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(e.target);
      await api.logCrmActivity({ ...v, kind: 'email', entity: ctx.entity, entityId: ctx.entityId }); closeModal(); toast('Email logged'); refresh(); })); };
  // the board's "+" menu: Task / Meeting / Call > Schedule a call | Log a call (calls: crm-calls.js)
  const pt = $('[data-plus-task]', root); if (pt) pt.addEventListener('click', () => taskModal(api, ctx, null, () => refresh()));
  const pm = $('[data-plus-meeting]', root); if (pm) pm.addEventListener('click', guard(() => meetingModal(api, ctx, null, () => refresh())));
  const pc = $('[data-schedule-call-btn]', root); if (pc) pc.addEventListener('click', () => { const d = $('[data-act-plus]', root); if (d) { d.open = true; const c = $('[data-plus-call]', d); if (c) c.open = true; d.scrollIntoView({ block: 'center' }); } });
  wireCalls(root, api, refresh, ctx, { logEmail });
}

// ---------- TASK form (Zoho: Subject* combobox, Due Date*, Client, Status, Priority, Reminder, Repeat, Description) ----------
// ctx = { entity, entityId, parentName, me, assignees }. t = existing task to edit, or null.
export function taskModal(api, ctx, t, done) {
  const cfg = ctx.cfg || null; const v = t || { status: 'Not Started', priority: cfg ? defaultOption(cfg, 'taskPriority', 'High') : 'High', ownerId: ctx.me.id };
  const m = modal(t ? 'Edit Task' : 'Create Task', html`<form id="task-form" class="form-grid" novalidate>
    <label class="ta-wrap">Subject *<input name="subject" type="text" maxlength="200" value="${v0(v.subject)}" autocomplete="off" data-task-subject placeholder="Type a subject"></label>
    <label>Due Date *<input name="dueDate" type="date" value="${v0(v.dueDate)}"></label>
    <label>${entityLabel(ctx.entity)}<input value="${ctx.parentName}" disabled data-task-client></label>
    <label>Task Owner${ownerSel(ctx.assignees || [], v.ownerId, null)}</label>
    <label>Status${cfg ? optSel(cfg, 'taskStatus', 'status', v.status, null) : sel('status', pairs(TASK_STATUSES), v.status)}</label><label>Priority${cfg ? optSel(cfg, 'taskPriority', 'priority', v.priority, null) : sel('priority', pairs(TASK_PRIORITIES), v.priority)}</label>
    <label class="check"><input type="checkbox" name="reminder" value="1" ${v.reminder ? raw('checked') : ''} data-rem-on> Reminder</label>
    <label data-rem-at ${v.reminder ? '' : raw('hidden')}>Remind me at<input name="reminderAt" type="datetime-local" value="${v0(v.reminderAt)}"></label>
    <label class="check"><input type="checkbox" name="repeat" value="1" ${v.repeatEvery ? raw('checked') : ''} data-rep-on> Repeat</label>
    <span data-rep ${v.repeatEvery ? '' : raw('hidden')}><label>Every${sel('repeatEvery', REPEAT_EVERY, v.repeatEvery || 'weekly')}</label><label>Ends on (optional)<input name="repeatUntil" type="date" value="${v0(v.repeatUntil)}"></label></span>
    <label class="span2">Description<textarea name="description" rows="3" maxlength="4000">${v0(v.body)}</textarea></label>
    <p class="muted small span2">Reminders show in the portal only (Home and the task); they are never emailed. A repeating task makes its next occurrence when it is closed.</p>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Save</button></div></form>`, { wide: true });
  const f = $('#task-form', m); wireSubjectTypeahead(f, cfg ? activeOptions(cfg, 'taskSubject').map((o) => o.label) : TASK_SUBJECTS);   // Janine, Nov 3: a plain text field, old choices as type-ahead
  const sync = () => { $('[data-rem-at]', f).hidden = !$('[data-rem-on]', f).checked; $('[data-rep]', f).hidden = !$('[data-rep-on]', f).checked; };
  $('[data-rem-on]', f).addEventListener('change', sync); $('[data-rep-on]', f).addEventListener('change', sync);
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); fieldErr(f, ''); const val = formData(f); val.reminder = val.reminder ? '1' : ''; val.repeat = val.repeat ? '1' : '';
    try { const r = t ? await api.updateCrmTask(t.id, val) : await api.createCrmTask({ ...val, entity: ctx.entity, entityId: ctx.entityId }); closeModal(); toast(t ? 'Task saved' : 'Task created'); done(r); }
    catch (err) { fieldErr(f, err.message); throw err; } }));
}

// ---------- MEETING form (Zoho: Title*, Location, All Day, From*, To*, Host, Type*, Participants, Client, "Add the client as a participant") ----------
// Janine, Nov 3: a "Send invite" option makes an invite PREVIEW (+ .ics download) after Save. Nothing is ever sent ("Sending turns on once Gmail is connected").
export async function meetingModal(api, ctx, mt, done) {
  const [leads, clients, users] = await Promise.all([api.listCrmLeads(), api.listCrmContacts(), api.listCrmUsers()]);
  const cands = [...leads.filter((l) => !l.archived && !l.converted).map((l) => ['lead:' + l.id, l.name, 'Lead']), ...clients.filter((c) => !c.archived).map((c) => ['contact:' + c.id, c.name, 'Client']),
    ...users.map((u) => ['user:' + u.id, u.name, 'User'])];
  const v = mt || { hostId: ctx.me.id, allDay: false, from: '', to: '' };
  const chosen = new Set((mt ? mt.participants.map((p) => p.key) : []));
  const sv = (s) => v0(s); const isAll = !!v.allDay;
  const m = modal(mt ? 'Edit Meeting' : 'Create Meeting', html`<form id="meeting-form" class="form-grid" novalidate>
    <label class="span2">Title *<input name="title" maxlength="200" value="${v0(v.subject)}"></label>
    <label>Location<input name="location" maxlength="200" value="${v0(v.location)}"></label><label class="check"><input type="checkbox" name="allDay" value="1" ${isAll ? raw('checked') : ''} data-allday> All Day</label>
    <label>From *<input name="from" type="${isAll ? 'date' : 'datetime-local'}" value="${sv(mt ? mt.startsAt : '')}" data-when></label><label>To *<input name="to" type="${isAll ? 'date' : 'datetime-local'}" value="${sv(mt ? mt.endsAt : '')}" data-when></label>
    <label>Host${ownerSel(ctx.assignees || [], v.hostId, null, 'hostId')}</label><label>Type *${ctx.cfg ? optSel(ctx.cfg, 'meetingType', 'meetingType', v.meetingType) : sel('meetingType', pairs(MEETING_TYPES), v.meetingType, '-None-')}</label>
    <fieldset class="span2 checks" data-participants><legend>Participants (leads, clients, users)</legend>
      <input type="search" placeholder="Search participants" data-part-q>
      <div class="part-list" style="max-height:160px;overflow:auto">${cands.map(([k, n, t]) => html`<label data-part="${k}"><input type="checkbox" name="participants" value="${k}" ${chosen.has(k) ? raw('checked') : ''}> ${n} <span class="muted small">(${t})</span></label>`)}</div></fieldset>
    <label>${entityLabel(ctx.entity)}<input value="${ctx.parentName}" disabled data-meeting-client></label>
    ${mt ? '' : html`<label class="check"><input type="checkbox" name="addClient" value="1" data-add-client> Add the ${entityLabel(ctx.entity).toLowerCase()} as a participant</label>`}
    <label class="span2">Description<textarea name="description" rows="2" maxlength="4000">${v0(v.body)}</textarea></label>
    ${ctx.me.canEdit ? html`<label class="check span2"><input type="checkbox" name="sendInvite" value="1" data-send-invite-opt> Send invite <span class="muted small">(preview + .ics only: sending turns on once Gmail is connected)</span></label>` : ''}
    <p class="muted small span2">Recorded in the portal only: no invitations are sent and nothing is added to Google Calendar or any other calendar.</p>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Save</button></div></form>`, { wide: true });
  const f = $('#meeting-form', m);
  $('[data-allday]', f).addEventListener('change', (e) => { $$('[data-when]', f).forEach((i) => { const val = i.value; i.type = e.target.checked ? 'date' : 'datetime-local'; i.value = e.target.checked ? val.slice(0, 10) : val; }); });
  $('[data-part-q]', f).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('[data-part]', f).forEach((l) => { l.hidden = !!q && !l.textContent.toLowerCase().includes(q); }); });
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); fieldErr(f, ''); const fd = new FormData(f); const val = formData(f);
    val.participants = fd.getAll('participants'); val.allDay = val.allDay ? '1' : ''; val.addClient = val.addClient ? '1' : ''; const inv = !!val.sendInvite; delete val.sendInvite;
    try { const r = mt ? await api.updateCrmMeeting(mt.id, val) : await api.createCrmMeeting({ ...val, entity: ctx.entity, entityId: ctx.entityId }); closeModal(); toast(mt ? 'Meeting saved' : 'Meeting created');
      if (inv) { await invitePreview(api, r.id || (mt && mt.id)); const back = $('#modal'); if (back) back.addEventListener('click', (ev) => { if (ev.target === back || ev.target.closest('[data-close]')) done(r); }); } else done(r); }
    catch (err) { fieldErr(f, err.message); throw err; } }));
}
