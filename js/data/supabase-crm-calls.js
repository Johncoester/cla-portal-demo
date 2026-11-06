/* [SUPABASE] Calls (Zoho video 11, migration 33) + Admin-only CRM list CSV downloads. Same names / shapes as mock-part-crm-calls.js.
 * NOT run against a hosted project (best effort; the mock adapter is the tested one). The database (private.crm_call_guard,
 * crm_complete_call, crm_list_export) enforces the rules. Voice recordings: links only here (no 'crm' storage bucket yet). Nothing is sent. */
import { durationSeconds, defaultCallSubject, CALL_TIME_MSG } from './crm-calls.js?v=202611060404';
import { toCsv } from './crm.js?v=202611060404';

export function crmCallsSupabase({ sb, ok, camel, on, one, actOut, staff }) {
  const secs = (v) => (v.callDurationSec != null && v.callDurationSec !== '' ? Number(v.callDurationSec) : durationSeconds(v.durationMin, v.durationSec));
  const callIn = (mode, v) => {
    const entity = v.callToEntity || v.entity; const id = v.callToId || v.entityId;
    if (!v.callStart || (mode === 'logged' && !(secs(v) > 0))) throw new Error(CALL_TIME_MSG);
    const type = v.callType || 'Outbound'; const o = {
      entity, entity_id: id, kind: 'call', call_mode: mode, call_type: type, call_status: mode === 'logged' ? 'Completed' : 'Scheduled',
      call_start: new Date(v.callStart).toISOString(), subject: String(v.subject || '').trim() || defaultCallSubject(mode, type, v.callToName || ''),
      from_number: v.fromNumber || null, to_number: v.toNumber || null, related_entity: v.relatedId ? v.relatedEntity || 'account' : null, related_id: v.relatedId || null,
      owner_id: v.ownerId || undefined, body: v.description || null };
    if (mode === 'scheduled') o.call_reminder = v.reminder ? Number(v.reminder) : null;
    else { o.call_duration_sec = secs(v); if (type === 'Outbound') { o.call_outcome = v.callOutcome || null; o.reason_not_interested = v.reasonNotInterested || null; o.call_notes = v.callNotes || null; }
      const rec = v.voiceRecording; if (rec && rec.kind === 'file') throw new Error('Voice recording files are not set up on this portal yet; paste a link.');
      if (rec && rec.kind === 'link' && rec.url) o.voice_recording_url = rec.url; }
    return o; };
  const save = async (mode, v) => { on(); return actOut(await one(sb.from('crm_activities').insert(callIn(mode, v || {}))), await staff()); };
  return {
    async scheduleCrmCall(v) { return save('scheduled', v); },
    async logCrmCall(v) { return save('logged', v); },
    async completeCrmCall(id, v = {}) { on(); const s = durationSeconds(v.durationMin, v.durationSec);
      ok(await sb.rpc('crm_complete_call', { p_id: id, p_seconds: s, p_description: v.description || null })); return this.getCrmCall(id); },
    async getCrmCall(id) { on(); const a = ok(await sb.from('crm_activities').select('*').eq('id', id).eq('kind', 'call').maybeSingle()); if (!a) throw new Error('Call not found.'); return actOut(a, await staff()); },
    async listCrmCallReminders() { on(); const ppl = await staff(); return (ok(await sb.rpc('crm_call_reminders')) || []).map((a) => actOut(a, ppl)); },
    async getCrmCallRecording(id) { const c = await this.getCrmCall(id); if (!c.voiceRecordingUrl) throw new Error('This call has no recording.'); return { kind: 'link', url: c.voiceRecordingUrl }; },
    async exportCrmList(module, cols = [], rows = []) { on(); const m = { clients: 'contacts', companies: 'accounts' }[module] || module;
      ok(await sb.rpc('crm_list_export', { p_module: m, p_rows: rows.length }));   // refuses anyone but an Admin / Super admin (42501) and logs it
      return { name: `crm-${m === 'contacts' ? 'clients' : m === 'accounts' ? 'companies' : 'leads'}.csv`, csv: toCsv(cols, rows) }; },
    async listCrmListExports() { on(); return camel(ok(await sb.from('crm_list_exports').select('*').order('exported_at', { ascending: false })) || []); },
  };
}
