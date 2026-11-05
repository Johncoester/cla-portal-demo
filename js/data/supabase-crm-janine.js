/* [SUPABASE] Janine, Nov 3 (migration 37): company duplicate check, meeting invite PREVIEW (+ .ics), import log. Same names / shapes as mock-part-crm-janine.js.
 * NOT run against a hosted project (best effort; the mock adapter is the tested one). NOTHING is sent: an invite is a preview row + an .ics built in the browser.
 * CSV import (preview / run) is not wired to Supabase yet: it refuses with a clear message (the demo build has the full flow). */
import { buildIcs, INVITE_NOTE } from './crm-janine.js?v=202611042116';
export function crmJanineSupabase({ sb, ok, camel, on, rpc, me, self }) {
  const NOT_YET = 'CSV import is not connected to the live database yet (it works in the demo build). Nothing was imported.';
  return {
    async findCrmCompanyDuplicate({ name = '', exceptId = null } = {}) { return (await rpc('crm_company_duplicate', { p_name: name, p_except: exceptId })) || null; },
    async previewCrmImport() { on(); throw new Error(NOT_YET); },
    async runCrmImport() { on(); throw new Error(NOT_YET); },
    async listCrmImports() { on(); return camel(ok(await sb.from('crm_imports').select('*').order('created_at', { ascending: false })) || []).map((r) => ({ ...r, at: r.createdAt, by: r.createdBy, byName: '', fileName: r.fileName })); },
    async previewCrmMeetingInvite(id) { on();
      const m = await self.getCrmMeeting(id); const u = await me();
      const people = []; for (const p of m.participants || []) {
        if (p.type === 'lead') { const r = ok(await sb.from('crm_leads').select('first_name, last_name, email').eq('id', p.id).maybeSingle()); if (r) people.push({ key: p.key, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email || '', type: 'Lead' }); }
        else if (p.type === 'contact') { const r = ok(await sb.from('contacts').select('first_name, last_name, email').eq('id', p.id).maybeSingle()); if (r) people.push({ key: p.key, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email || '', type: 'Client' }); }
        else people.push({ key: p.key, name: p.name, email: '', type: 'User' }); }
      const organizer = { name: m.hostName || '', email: m.hostId === (u && u.id) ? (u.email || '') : '' };
      const to = people.filter((p) => p.email && p.email !== organizer.email); const noEmail = people.filter((p) => !p.email);
      const when = m.allDay ? `${m.startsAt} (all day)` : `${String(m.startsAt).replace('T', ' ')} to ${String(m.endsAt).replace('T', ' ')} (Eastern Time)`;
      const subject = `Invitation: ${m.subject} @ ${when}`;
      const body = [`You are invited to: ${m.subject}`, `When: ${when}`, m.location ? `Where: ${m.location}` : '', organizer.name ? `Host: ${organizer.name}` : '', m.body ? `\n${m.body}` : ''].filter(Boolean).join('\n');
      const row = ok(await sb.from('crm_meeting_invites').insert({ meeting_id: id, to_emails: to.map((p) => p.email) }).select('id').single());
      const previews = (ok(await sb.from('crm_meeting_invites').select('id').eq('meeting_id', id)) || []).length;
      return { id: row.id, meetingId: id, status: 'preview', sent: false, note: INVITE_NOTE, organizer, to, noEmail, subject, body, ics: buildIcs(m, organizer, to),
        icsName: `${String(m.subject).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting'}.ics`, previews }; },
    async listCrmMeetingInvites(id) { on(); return camel(ok(await sb.from('crm_meeting_invites').select('*').eq('meeting_id', id).order('created_at')) || []); },
  };
}
