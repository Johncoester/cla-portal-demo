// crm-calls.js : Zoho CRM video 11 "Adding a Call" (Janine / John, Nov 3). On a Lead / Client / Company record the activities "+" offers
// Task, Meeting and Call; Call offers "Schedule a call" or "Log a call". Activities board (Open Tasks / Open Meetings / Open Calls, closed below),
// "Mark as Completed" -> Complete (Call Duration MM minutes SS seconds, above zero), call detail page #/crm/calls/<id>.
// Reminders are RECORDED ONLY (shown in the portal; nothing is ever sent). The voice recording stays in this browser (nothing uploads anywhere).
// Function first, minimal styling. Every rule is checked again by the adapter (and migration 33 in SQL).
import { html, raw, toText, $, $$, guard, formData, toast, fmtDate, fmtDateTime, modal, closeModal, pill } from '../ui.js?v=202611070139';
import { relatedLists, localStamp, entityLabel } from '../data/crm.js?v=202611070139';
import { CALL_TYPE_CHOICES, CALL_REMINDERS, CALL_TO_TYPES, RELATED_TO_TYPES, CALL_TIME_MSG, CALL_ZERO_MSG, VOICE_EXT, durationText, durationWords, reminderLabel, defaultCallSubject } from '../data/crm-calls.js?v=202611070139';
import { optSel, lbl } from './crm-custom.js?v=202611070139';
import { ownerSel, tabs, head } from './crm-kit.js?v=202611131100';
import { modOn } from '../data/modules.js?v=202611101015';   // module switches: Calls not Live = no call menu / call columns for regular users

const v0 = (v) => (v == null ? '' : v);
const when = (s) => (!s ? '' : s.length > 10 ? `${fmtDate(s.slice(0, 10))} ${s.slice(11, 16)}` : fmtDate(s));
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
const req = (label, inner, extra = '') => html`<label class="req ${extra}" data-req>${label}${inner}</label>`;   // red left bar = required (Zoho)

// ---------- "+" menu (Task / Meeting / Call > Schedule a call | Log a call) ----------
export const activityPlus = (me) => (me.canEdit ? html`<details class="more-menu act-plus" data-act-plus style="display:inline-block"><summary class="m-btn" data-act-plus-btn title="Add an activity">+</summary>
  <div data-act-plus-items class="act-plus-items"><button type="button" class="ghost" data-plus-task>Task</button> <button type="button" class="ghost" data-plus-meeting>Meeting</button>
    ${modOn('calls') ? html`<details data-plus-call><summary class="ghost" data-plus-call-btn>Call &#9656;</summary><button type="button" class="ghost" data-schedule-call>Schedule a call</button> <button type="button" class="ghost" data-log-call-new>Log a call</button></details>` : ''}</div></details>` : '');

// ---------- activities board ----------
const taskCard = (a, cfg) => html`<li class="act-card" data-board-card="${a.id}" data-kind="task"><a href="#/crm/tasks/${a.id}">${a.subject}</a><br><span class="small">Due ${fmtDate(a.dueDate)} &middot; ${lbl(cfg, 'taskStatus', a.status)}${a.overdue ? html` ${pill('Overdue', 'bad')}` : ''}</span><br><span class="muted small">${a.ownerName}</span></li>`;
const meetingCard = (a) => html`<li class="act-card" data-board-card="${a.id}" data-kind="meeting"><a href="#/crm/meetings/${a.id}">${a.subject}</a><br><span class="small">${when(a.startsAt)}${a.allDay ? ' (all day)' : ''}</span><br><span class="muted small">${a.hostName}</span></li>`;
const callCard = (a, me) => html`<li class="act-card" data-board-card="${a.id}" data-kind="call" data-call-status="${a.callStatus}"><a href="#/crm/calls/${a.id}" data-call-link="${a.id}">${a.subject}</a>
  <br><span class="small">${a.callType || 'Call'} &middot; ${when(a.callStart || a.occurredOn)}${a.callDurationText ? ` · ${a.callDurationText}` : ''}</span>
  ${a.relatedName ? html`<br><span class="small muted">Related to ${a.relatedName}</span>` : ''}
  <br><span class="muted small">${a.ownerName || a.createdByName} &middot; ${a.callStatus}</span>${a.reminderDue ? html` ${pill('Reminder', 'warn')}` : a.callReminder ? html` <span class="muted small">(reminder ${reminderLabel(a.callReminder)})</span>` : ''}
  ${a.open && me.canEdit ? html`<br><label class="check small"><input type="checkbox" data-mark-complete="${a.id}"> Mark as Completed</label>` : ''}</li>`;
export function activityBoard(rec, { me, cfg }) {
  const rl = relatedLists(rec.activities || [], [], localStamp());
  const col = (title, key, list, card, empty) => html`<div class="act-col" data-board-col="${key}"><h4>${title} (${list.length})</h4><ul class="act-list">${list.length ? list.map(card) : html`<li class="muted small">${empty}</li>`}</ul></div>`;
  const by = (list, k) => list.filter((a) => a.kind === k);
  return html`<div class="card" data-act-board><h3>Activities ${activityPlus(me)} ${me.canEdit ? html`<button class="ghost small" data-log-email>Log an email</button>` : ''}</h3>
    <div class="act-board" data-board-open>${col('Open Tasks', 'open-tasks', by(rl.open, 'task'), (a) => taskCard(a, cfg), 'No open tasks.')}${col('Open Meetings', 'open-meetings', by(rl.open, 'meeting'), meetingCard, 'No open meetings.')}${modOn('calls') ? col('Open Calls', 'open-calls', by(rl.open, 'call'), (a) => callCard(a, me), 'No open calls.') : ''}</div>
    <div class="act-board" data-board-closed>${col('Closed Tasks', 'closed-tasks', by(rl.closed, 'task'), (a) => taskCard(a, cfg), 'None.')}${col('Closed Meetings', 'closed-meetings', by(rl.closed, 'meeting'), meetingCard, 'None.')}${modOn('calls') ? col('Closed Calls', 'closed-calls', by(rl.closed, 'call'), (a) => callCard(a, me), 'None.') : ''}</div>
    <p class="muted small">Call reminders are shown in the portal only (CRM Home and the call); nothing is emailed, texted or dialled.</p></div>`;
}

// ---------- the call form (Schedule a call / Log a call) ----------
let lookCache = null;
async function lookups(api) {
  const get = async (m) => { try { return await api.listCrmModuleRows(m); } catch (e) { return []; } };
  const [contacts, leads, accounts, opportunities, deals] = await Promise.all(['contacts', 'leads', 'accounts', 'opportunities', 'deals'].map(get));
  return { contact: contacts.filter((r) => !r.archived), lead: leads.filter((r) => !r.archived && !r.converted), account: accounts.filter((r) => !r.archived), opportunity: opportunities.filter((r) => !r.archived), deal: deals };
}
const recOpts = (list, cur) => html`<option value="">-None-</option>${list.map((r) => html`<option value="${r.id}" ${r.id === cur ? raw('selected') : ''}>${r.name || r.subject || r.id}</option>`)}`;
const lookup = (key, types, type, list, cur, required) => html`<span class="lookup" data-lookup="${key}"><select name="${key}Entity" data-lookup-type aria-label="${key === 'callTo' ? 'Call To' : 'Related To'} module">${types.map(([v, l]) => html`<option value="${v}" ${v === type ? raw('selected') : ''}>${l}</option>`)}</select>
  <input type="search" data-lookup-q placeholder="Search" aria-label="Search records" style="max-width:120px"><select name="${key}Id" data-lookup-rec ${required ? raw('data-required') : ''}>${recOpts(list, cur)}</select></span>`;

// ctx = { entity, entityId, parentName, me, assignees, cfg, rec }. mode 'scheduled' | 'logged'. done(call) after save.
export async function callModal(api, ctx, mode, done) {
  const L = lookCache = await lookups(api); const log = mode === 'logged'; const cfg = ctx.cfg;
  const toType = ctx.entity === 'lead' || ctx.entity === 'contact' ? ctx.entity : 'contact'; const toId = ctx.entity === toType ? ctx.entityId : '';
  const relType = ctx.entity === 'account' || ctx.entity === 'opportunity' ? ctx.entity : 'account'; const relId = ctx.entity === relType ? ctx.entityId : ctx.entity === 'contact' && ctx.rec && ctx.rec.accountId ? ctx.rec.accountId : '';
  const nameOf = (t, id) => ((L[t] || []).find((r) => r.id === id) || {}).name || '';
  const subj0 = defaultCallSubject(mode, 'Outbound', nameOf(toType, toId) || (ctx.entity === toType ? ctx.parentName : ''));
  const m = modal(log ? 'Log a call' : 'Schedule a call', html`<form id="call-form" class="form-grid" data-call-form="${mode}" novalidate>
    <h4 class="span2">Call Information</h4>
    ${req('Call To', lookup('callTo', CALL_TO_TYPES, toType, L[toType], toId, true), 'span2')}
    <label class="span2">Related To${lookup('related', RELATED_TO_TYPES, relType, L[relType], relId, false)}</label>
    <label>From Number<input name="fromNumber" type="tel" data-phone placeholder="xxx-xxx-xxxx"></label><label>To Number<input name="toNumber" type="tel" data-phone placeholder="xxx-xxx-xxxx" value="${v0(ctx.rec && (ctx.rec.phone || ctx.rec.mobile))}"></label>
    ${req('Call Type', html`<select name="callType" data-call-type>${CALL_TYPE_CHOICES.map((t) => html`<option ${t === 'Outbound' ? raw('selected') : ''}>${t}</option>`)}</select>`)}
    ${req('Outgoing Call Status', html`<select name="callStatus" data-call-status-sel><option>${log ? 'Completed' : 'Scheduled'}</option></select>`)}
    ${req('Call Start Time', html`<input name="callStart" type="datetime-local" ${log ? raw(`max="${localStamp()}"`) : ''} data-call-start>`)}
    ${log ? req('Call Duration', html`<span class="duration" data-duration><input name="durationMin" type="number" min="0" max="1440" step="1" placeholder="MM" aria-label="Minutes" style="width:70px"> minutes <input name="durationSec" type="number" min="0" max="59" step="1" placeholder="SS" aria-label="Seconds" style="width:70px"> seconds</span>`) : ''}
    ${req('Call Owner', ownerSel(ctx.assignees || [], ctx.me.id, null))}
    ${req('Subject', html`<input name="subject" maxlength="200" value="${subj0}" data-call-subject>`, 'span2')}
    ${log ? '' : html`<label>Reminder<select name="reminder" data-call-reminder>${CALL_REMINDERS.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>`}
    ${log ? html`<fieldset class="span2" data-voice><legend>Voice Recording</legend>
      <label class="check"><input type="radio" name="voiceKind" value="" checked> None</label> <label class="check"><input type="radio" name="voiceKind" value="file"> Attach a file (${VOICE_EXT.join(', ')})</label>
      <input type="file" data-voice-file accept="${VOICE_EXT.map((e) => '.' + e).join(',')}"> <label class="check"><input type="radio" name="voiceKind" value="link"> Link</label><input name="voiceUrl" inputmode="url" placeholder="https://" maxlength="500" data-voice-url>
      <p class="muted small">Kept in this demo browser only; nothing is uploaded to any phone system or cloud.</p></fieldset>
    <div class="span2" data-outcome-section><h4>Outcome Of Outgoing Call</h4><div class="form-grid">
      <label>Outbound Call Outcome${optSel(cfg, 'callOutcome', 'callOutcome', '', '-None-')}</label><label>Reason Not Interested<input name="reasonNotInterested" maxlength="200"></label>
      <label class="span2">Outbound Call Notes<textarea name="callNotes" rows="2" maxlength="4000"></textarea></label></div></div>` : ''}
    <h4 class="span2">Description Information</h4>
    <label class="span2">Description<textarea name="description" rows="2" maxlength="4000"></textarea></label>
    <div class="call-alert span2" data-call-alert hidden role="alertdialog" aria-live="assertive"><p data-call-alert-msg>${CALL_TIME_MSG}</p><button type="button" class="m-btn" data-alert-ok>OK, got it!</button></div>
    <p class="muted small span2"><span class="req-mark"></span> required. Recorded in the portal only: nothing dials, texts or emails anyone${log ? '' : '; the reminder shows on CRM Home'}.</p>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit" data-call-save>${log ? 'Save' : 'Schedule'}</button></div></form>`, { wide: true });
  const f = $('#call-form', m); const subjEl = $('[data-call-subject]', f);
  $$('[data-lookup]', f).forEach((box) => { const t = $('[data-lookup-type]', box), q = $('[data-lookup-q]', box), r = $('[data-lookup-rec]', box);
    const fill = () => { const s = q.value.toLowerCase(); const cur = r.value; const list = (L[t.value] || []).filter((x) => !s || String(x.name || '').toLowerCase().includes(s)); r.innerHTML = toText(recOpts(list, cur)); };
    t.addEventListener('change', () => { r.value = ''; fill(); syncSubject(); }); q.addEventListener('input', fill); r.addEventListener('change', syncSubject); });
  subjEl.addEventListener('input', () => { subjEl.dataset.touched = '1'; });
  function syncSubject() { if (subjEl.dataset.touched) return; const v = formData(f); subjEl.value = defaultCallSubject(mode, v.callType, nameOf(v.callToEntity, v.callToId)); }
  $('[data-call-type]', f).addEventListener('change', () => { syncSubject(); const o = $('[data-outcome-section]', f); if (o) o.hidden = $('[data-call-type]', f).value !== 'Outbound'; });
  const alertBox = $('[data-call-alert]', f); const showAlert = (msg) => { $('[data-call-alert-msg]', f).textContent = msg; alertBox.hidden = false; $('[data-alert-ok]', f).focus(); };
  $('[data-alert-ok]', f).addEventListener('click', () => { alertBox.hidden = true; });
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); $('[data-form-err]', f).textContent = ''; const v = formData(f);
    if (!v.callToId) { $('[data-form-err]', f).textContent = 'Call To is required.'; return; }
    if (log) { const secs = (Number(v.durationMin) || 0) * 60 + (Number(v.durationSec) || 0);
      if (!v.callStart || v.callStart > localStamp() || !(secs > 0)) { showAlert(CALL_TIME_MSG); return; } }
    else if (!v.callStart) { $('[data-form-err]', f).textContent = 'Call Start Time is required.'; return; }
    const input = { callToEntity: v.callToEntity, callToId: v.callToId, relatedEntity: v.relatedEntity, relatedId: v.relatedId, fromNumber: v.fromNumber, toNumber: v.toNumber, callType: v.callType, callStatus: v.callStatus,
      callStart: v.callStart, ownerId: v.ownerId, subject: v.subject, description: v.description };
    if (log) { Object.assign(input, { durationMin: v.durationMin, durationSec: v.durationSec, callOutcome: v.callOutcome, reasonNotInterested: v.reasonNotInterested, callNotes: v.callNotes });
      if (v.voiceKind === 'link') input.voiceRecording = { kind: 'link', url: v.voiceUrl };
      if (v.voiceKind === 'file') { const file = $('[data-voice-file]', f).files[0]; if (!file) { $('[data-form-err]', f).textContent = 'Choose the recording file first.'; return; }
        input.voiceRecording = { kind: 'file', name: file.name, mimeType: file.type, size: file.size, dataUrl: await readFile(file) }; } }
    else input.reminder = v.reminder;
    try { const r = log ? await api.logCrmCall(input) : await api.scheduleCrmCall(input); closeModal(); banner(log ? 'Call logged successfully.' : 'Call created successfully.', r.id); done(r); }
    catch (err) { if (err.message === CALL_TIME_MSG) showAlert(err.message); else $('[data-form-err]', f).textContent = err.message; throw err; } }));
  return m;
}
// Zoho's green banner: "Call created successfully. View details." (stays until closed; survives the page refresh)
export function banner(msg, id) {
  const old = $('#call-banner'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'call-banner'; el.className = 'call-banner'; el.setAttribute('role', 'status'); el.dataset.callBanner = id;
  el.innerHTML = toText(html`${msg} <a href="#/crm/calls/${id}" data-banner-view>View details.</a> <button type="button" class="modal-x" data-banner-x aria-label="Close">&times;</button>`);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-banner-x]') || e.target.closest('[data-banner-view]')) el.remove(); });
  document.body.appendChild(el); setTimeout(() => el.remove(), 15000);
}

// ---------- Mark as Completed -> Complete ----------
export function completeModal(api, call, done) {
  const m = modal('Complete', html`<form id="complete-form" class="form-grid" novalidate data-complete-form="${call.id}">
    <p class="span2"><strong>${call.subject}</strong><br><span class="muted small">${call.callType} &middot; ${when(call.callStart)}</span></p>
    ${req('Outgoing Call Status', html`<select name="callStatus"><option>Completed</option></select>`)}
    ${req('Call Duration', html`<span class="duration"><input name="durationMin" type="number" min="0" max="1440" step="1" placeholder="MM" aria-label="Minutes" style="width:70px"> minutes <input name="durationSec" type="number" min="0" max="59" step="1" placeholder="SS" aria-label="Seconds" style="width:70px"> seconds</span>`)}
    <label class="span2">Description<textarea name="description" rows="2" maxlength="4000" placeholder="(optional)"></textarea></label>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit" data-complete-save>Save</button></div></form>`);
  const f = $('#complete-form', m);
  f.addEventListener('submit', guard(async (e) => { e.preventDefault(); const v = formData(f); const err = $('[data-form-err]', f); err.textContent = '';
    const secs = (Number(v.durationMin) || 0) * 60 + (Number(v.durationSec) || 0); if (!(secs > 0)) { err.textContent = CALL_ZERO_MSG; return; }
    try { const r = await api.completeCrmCall(call.id, { durationMin: v.durationMin, durationSec: v.durationSec, description: v.description }); closeModal(); toast('Call completed'); done(r); }
    catch (x) { err.textContent = x.message; throw x; } }));
  return m;
}

// ---------- wiring on a record page ----------
export function wireCalls(root, api, refresh, ctx, { logEmail } = {}) {
  // picking a menu item closes the "+" menu
  $$('[data-act-plus-items] button', root).forEach((b) => b.addEventListener('click', () => { $$('[data-act-plus], [data-plus-call]', root).forEach((d) => { d.open = false; }); }));
  const sc = $('[data-schedule-call]', root); if (sc) sc.addEventListener('click', guard(() => callModal(api, ctx, 'scheduled', () => refresh())));
  const lc = $('[data-log-call-new]', root); if (lc) lc.addEventListener('click', guard(() => callModal(api, ctx, 'logged', () => refresh())));
  const le = $('[data-log-email]', root); if (le && logEmail) le.addEventListener('click', logEmail);
  $$('[data-mark-complete]', root).forEach((cb) => cb.addEventListener('change', guard(async () => { if (!cb.checked) return; cb.checked = false;
    const call = await api.getCrmCall(cb.dataset.markComplete); completeModal(api, call, () => refresh()); })));
}

// ---------- call detail page (#/crm/calls/<id>) ----------
export async function callPage({ api, me, params, refresh, cfg }) {
  const a = await api.getCrmCall(params.id); const back = a.parentLink;
  const row = (k, l, v) => html`<dt>${l}</dt><dd data-f="${k}">${v == null || v === '' ? html`<span class="muted">&mdash;</span>` : v}</dd>`;
  const body = html`${head(`Call: ${a.subject}`, me)}${tabs('home')}
    <div class="card" data-call-detail="${a.id}"><p>${a.open && me.canEdit ? html`<label class="check"><input type="checkbox" data-mark-complete="${a.id}"> Mark as Completed</label> ` : ''}<a class="ghost" href="${back}">Back to ${a.parentName}</a></p>
      <h3>Call Information</h3><dl class="kv" data-call-fields>
        ${row('callTo', 'Call To', html`<a href="${back}">${a.parentName}</a> <span class="muted small">(${entityLabel(a.entity)})</span>`)}
        ${row('relatedTo', 'Related To', a.relatedName ? html`<a href="${a.relatedLink}">${a.relatedName}</a>` : '')}
        ${row('fromNumber', 'From Number', a.fromNumber)}${row('toNumber', 'To Number', a.toNumber)}${row('callType', 'Call Type', a.callType)}
        ${row('callStatus', 'Outgoing Call Status', a.callStatus)}${row('callStart', 'Call Start Time', when(a.callStart || a.occurredOn))}
        ${row('callDuration', 'Call Duration', a.callDurationSec != null ? `${a.callDurationText} (${durationWords(a.callDurationSec)})` : '')}
        ${row('owner', 'Call Owner', a.ownerName || a.createdByName)}${row('subject', 'Subject', a.subject)}
        ${row('reminder', 'Reminder', a.callReminder ? html`${reminderLabel(a.callReminder)} (${when(a.callReminderAt)})${a.reminderDue ? html` ${pill('Due', 'warn')}` : ''} <span class="muted small">in the portal only; never sent</span>` : 'None')}
        ${row('voice', 'Voice Recording', a.voiceRecording ? html`<a href="#" data-open-voice>${a.voiceRecording.kind === 'link' ? a.voiceRecording.url : a.voiceRecording.name}</a>` : '')}
        ${row('createdBy', 'Created By', `${a.createdByName}, ${fmtDateTime(a.createdAt)}`)}${a.completedAt ? row('completedAt', 'Completed', fmtDateTime(a.completedAt)) : ''}</dl>
      ${a.callMode === 'logged' || a.callOutcome || a.callNotes ? html`<h3>Outcome Of Outgoing Call</h3><dl class="kv" data-call-outcome>${row('callOutcome', 'Outbound Call Outcome', a.callOutcome ? lbl(cfg, 'callOutcome', a.callOutcome) : '')}${row('reasonNotInterested', 'Reason Not Interested', a.reasonNotInterested)}${row('callNotes', 'Outbound Call Notes', a.callNotes)}</dl>` : ''}
      <h3>Description Information</h3><p data-f="description">${a.body || html`<span class="muted">&mdash;</span>`}</p></div>`;
  return { title: 'Call ' + a.subject, crumbs: [['CRM', '#/crm'], [a.parentName, back], [a.subject]], body, mount(root) {
    wireCalls(root, api, refresh, {});
    const ov = $('[data-open-voice]', root); if (ov) ov.addEventListener('click', guard(async (e) => { e.preventDefault(); const r = await api.getCrmCallRecording(a.id);
      if (r.kind === 'link') { window.open(r.url, '_blank', 'noopener'); return; } const l = document.createElement('a'); l.href = r.dataUrl; l.download = r.name; document.body.appendChild(l); l.click(); l.remove(); })); } };
}
