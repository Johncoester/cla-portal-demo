/* mock adapter: CRM CALLS (Zoho video 11 "Adding a Call", Janine / John, Nov 3; storage v25; mirrored by migration 33). FAKE DATA ONLY.
 * Schedule a call / Log a call / Mark as Completed, Related To, From / To Number, Call Owner, Reminder (RECORDED ONLY: shown in the portal,
 * never emailed or sent), Outcome Of Outgoing Call (CRM Settings picklist 'callOutcome'), Voice Recording (a link, or a file kept in this
 * browser's own file store: nothing is uploaded anywhere). Access = the CRM activity rules: a call lives on its Call To lead / client, so a
 * Sales Person sees and adds calls only on records they may see; the Processor reads only. Nothing is ever deleted.
 * Also (John, Nov 3): CSV downloads of the Clients, Leads and Companies lists are Admin / Super admin only (exportCrmList), like report Export. */
import { CALL_TYPE_CHOICES, CALL_SCHEDULED, CALL_COMPLETED, CALL_REMINDER_MINUTES, CALL_TO_CODES, RELATED_TO_CODES, CALL_TIME_MSG, CALL_ZERO_MSG, VOICE_EXT,
  durationSeconds, minusMinutes, defaultCallSubject, callOpen } from './crm-calls.js?v=202611041817';
import { cleanUrl, localStamp, toCsv } from './crm.js?v=202611041817';

export function crmCallsPart(x, h) {
  const { save, nid, fail, str, now, localDate, clone, dealsFor, C } = x;
  const { db, crmUser, crmEditor, entityOf, seen, assignee, opt, dt, actOut, leadSeen, contactSeen, accountSeen } = h;
  const callOf = (u, id) => { const a = db().crmActivities.find((z) => z.id === id && z.kind === 'call'); if (!a || !seen(u, a.entity, a.entityId)) fail('Call not found.'); return a; };
  const dealOk = (u, id) => dealsFor(u).some((q) => q.id === id) || fail('Deal not found.');
  const touchContact = (a) => { if (a.entity !== 'contact') return; const c = db().contacts.find((z) => z.id === a.entityId);
    if (c && a.occurredOn <= localDate() && (!c.lastContactedOn || c.lastContactedOn < a.occurredOn)) c.lastContactedOn = a.occurredOn; };
  const secsOf = (input) => { if (input.callDurationSec != null && input.callDurationSec !== '') { const n = Number(input.callDurationSec);
    if (!Number.isInteger(n) || n < 0 || n > 86400) fail('Call Duration must be whole seconds.'); return n; } return durationSeconds(input.durationMin, input.durationSec); };
  async function voice(u, a, v) {
    if (!v || (typeof v === 'object' && !v.kind)) return null;
    if (v.kind === 'link') { let url; try { url = cleanUrl(v.url); } catch (e) { fail(`Voice Recording: ${e.message}`); } return url ? { kind: 'link', url } : null; }
    if (v.kind !== 'file') fail('Voice Recording must be a file or a link.');
    const name = str(v.name, 200).replace(/[\\/]/g, '_') || fail('A file name is required.'); const dot = name.lastIndexOf('.'); const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (!VOICE_EXT.includes(ext)) fail(`Voice Recording takes an audio file (${VOICE_EXT.join(', ')}).`);
    if (!(Number(v.size) >= 0) || Number(v.size) > C.MAX_UPLOAD_BYTES) fail('File is too large.');
    const f = { id: nid('cvoice'), name, mimeType: str(v.mimeType, 100) || 'audio/mpeg', size: Number(v.size) || 0, dataUrl: v.dataUrl || null };
    await x.keepFile(f); return { kind: 'file', fileId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, hasFile: !!f.hasFile, dataUrl: f.dataUrl || null, uploadedBy: u.id, uploadedAt: now() };
  }
  // Schedule a call (mode 'scheduled') or Log a call (mode 'logged')
  async function saveCall(mode, input = {}) {
    const u = crmEditor();
    const entity = str(input.callToEntity !== undefined ? input.callToEntity : input.entity, 20); const toId = str(input.callToId !== undefined ? input.callToId : input.entityId, 60);
    if (!entity || !toId) fail('Call To is required.'); if (!CALL_TO_CODES.includes(entity)) fail('Call To must be a client or a lead.');
    const parent = entityOf(u, entity, toId);
    if (entity === 'lead' && parent.convertedAt) fail('This lead was converted; call the client instead.');
    let relatedEntity = str(input.relatedEntity, 20) || null; let relatedId = str(input.relatedId, 60) || null;
    if (!relatedId) relatedEntity = null; else { if (!RELATED_TO_CODES.includes(relatedEntity)) fail('Related To must be a company, an opportunity or a deal.');
      if (relatedEntity === 'deal') dealOk(u, relatedId); else entityOf(u, relatedEntity, relatedId); }
    const callType = str(input.callType, 20) || 'Outbound'; if (!CALL_TYPE_CHOICES.includes(callType)) fail('Pick a call type (Outbound or Inbound).');
    const status = str(input.callStatus, 20) || (mode === 'scheduled' ? CALL_SCHEDULED : CALL_COMPLETED);
    if (status !== (mode === 'scheduled' ? CALL_SCHEDULED : CALL_COMPLETED)) fail(mode === 'scheduled' ? 'A scheduled call starts as Scheduled.' : 'A logged call is Completed.');
    let start = null; try { start = dt(input.callStart, 'Call Start Time'); } catch (e) { if (mode === 'logged') fail(CALL_TIME_MSG); throw e; }
    if (!start) fail(mode === 'logged' ? CALL_TIME_MSG : 'Call Start Time is required.');
    let secs = null;
    if (mode === 'logged') { try { secs = secsOf(input); } catch (e) { fail(CALL_TIME_MSG); } if (!secs) fail(CALL_TIME_MSG);
      if (start > localStamp()) fail('Call Start Time cannot be in the future for a call that already happened.'); }
    const ownerId = assignee(u, input.ownerId, undefined, 'call owner');
    const name = entity === 'lead' ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim() : `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
    const subject = str(input.subject, 200) || defaultCallSubject(mode, callType, name);
    let rem = null; if (mode === 'scheduled' && input.reminder != null && String(input.reminder) !== '') { rem = Number(input.reminder); if (!CALL_REMINDER_MINUTES.includes(rem)) fail('Pick a reminder from the list.'); }
    const outbound = callType === 'Outbound' && mode === 'logged';
    const a = { id: nid('ca'), entity, entityId: parent.id, kind: 'call', subject, body: str(input.description !== undefined ? input.description : input.body, 4000), status: 'done', dueDate: null,
      occurredOn: mode === 'logged' ? start.slice(0, 10) : localDate(), ownerId, system: false, createdBy: u.id, createdAt: now(), doneAt: mode === 'logged' ? now() : null, modifiedBy: u.id, modifiedAt: now(),
      callMode: mode, callStatus: status, callType, callStart: start, callDurationSec: secs, callDuration: secs == null ? null : Math.ceil(secs / 60),
      fromNumber: x.phone(input.fromNumber, 'From Number'), toNumber: x.phone(input.toNumber, 'To Number'), relatedEntity, relatedId,
      callReminder: rem, callReminderAt: rem ? minusMinutes(start, rem) : null,
      callOutcome: outbound ? opt('callOutcome', input.callOutcome, 'Outbound Call Outcome') : '', reasonNotInterested: outbound ? str(input.reasonNotInterested, 200) : '', callNotes: outbound ? str(input.callNotes, 4000) : '',
      voiceRecording: null, completedAt: mode === 'logged' ? now() : null };
    if (mode === 'logged') a.voiceRecording = await voice(u, a, input.voiceRecording);
    if (mode === 'logged') touchContact(a);
    db().crmActivities.push(a); save(); return actOut(a);
  }
  const api = {
    async scheduleCrmCall(input) { return saveCall('scheduled', input); },
    async logCrmCall(input) { return saveCall('logged', input); },
    async getCrmCall(id) { const u = crmUser(); return actOut(callOf(u, id)); },
    // Mark as Completed -> Complete: status Completed + Call Duration (MM minutes SS seconds, above zero)
    async completeCrmCall(id, input = {}) {
      const u = crmEditor(); const a = callOf(u, id); if (!callOpen(a)) fail('This call is already completed.');
      const secs = secsOf(input); if (!secs) fail(CALL_ZERO_MSG);
      Object.assign(a, { callStatus: CALL_COMPLETED, callDurationSec: secs, callDuration: Math.ceil(secs / 60), completedAt: now(), doneAt: now(), occurredOn: a.callStart && a.callStart.slice(0, 10) <= localDate() ? a.callStart.slice(0, 10) : localDate(),
        modifiedBy: u.id, modifiedAt: now() });
      if (input.description != null && str(input.description, 4000)) a.body = str(input.description, 4000);
      touchContact(a); save(); return actOut(a);
    },
    // my open calls whose reminder time has come (shown on CRM Home; nothing is sent)
    async listCrmCallReminders() { const u = crmUser(); const n = localStamp();
      return db().crmActivities.filter((a) => a.kind === 'call' && callOpen(a) && a.ownerId === u.id && a.callReminderAt && a.callReminderAt <= n && seen(u, a.entity, a.entityId)).map(actOut); },
    async getCrmCallRecording(id) { const u = crmUser(); const a = callOf(u, id); const v = a.voiceRecording; if (!v) fail('This call has no voice recording.');
      if (v.kind === 'link') return { kind: 'link', url: v.url };
      const content = await x.fileContent({ id: v.fileId, dataUrl: v.dataUrl, hasFile: v.hasFile });
      return { kind: 'file', name: v.name, mimeType: v.mimeType, dataUrl: content || 'data:text/plain;charset=utf-8,' + encodeURIComponent('FAKE DEMO RECORDING\n' + v.name) }; },
    // CSV of a CRM list view (Clients, Leads, Companies): Admin / Super admin only (John, Nov 3), every download logged. rows = what the list shows.
    async exportCrmList(module, cols = [], rows = []) {
      const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can download CSV files from the CRM lists.');
      const m = { leads: 'leads', contacts: 'contacts', clients: 'contacts', accounts: 'accounts', companies: 'accounts' }[str(module, 20)] || fail('CSV downloads are for the Clients, Leads and Companies lists.');
      if (!Array.isArray(cols) || !cols.length || cols.length > 200) fail('Pick the columns to download.'); if (!Array.isArray(rows) || rows.length > 20000) fail('Too many rows.');
      const d = db(); const ok = m === 'leads' ? (id) => d.crmLeads.some((l) => l.id === id && leadSeen(u, l)) : m === 'contacts' ? (id) => d.contacts.some((c) => c.id === id && contactSeen(u, c)) : (id) => d.crmAccounts.some((a) => a.id === id && accountSeen(u, a));
      rows.forEach((r) => { if (!r || !ok(String(r.id || ''))) fail('That list has a row you cannot see.'); });
      const colsOk = cols.map(([k, l]) => [str(k, 80), str(l, 120)]);
      d.crmListExports ||= []; d.crmListExports.push({ id: nid('cexp'), module: m, rowCount: rows.length, exportedBy: u.id, exportedAt: now() }); save();
      return { name: `crm-${m === 'contacts' ? 'clients' : m === 'accounts' ? 'companies' : 'leads'}.csv`, csv: toCsv(colsOk, rows) };
    },
    async listCrmListExports() { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can see the export log.'); return clone(db().crmListExports || []); },
  };
  return { api };
}
