/* Staff screens that were still throwing "not implemented yet" in supabase mode.
 * Reads and writes go through the existing tables and RLS. This file does not create logins
 * and does not contain a service-role key. Nothing is emailed. */
import { uploadBytes as blobOf, uploadFileName } from './upload-bytes.js?v=202611120900';
const day = (d) => new Date(d).toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const full = (p) => `${p.firstName || ''} ${p.lastName || ''}`.trim();
const safeName = (n, mime) => uploadFileName(n, mime);
const sideOf = (role) => ({ 'Buyer Agent': 'buyer', 'Client-Buyer': 'buyer', 'Listing Agent': 'seller', 'Client-Seller': 'seller' }[role] || 'staff');
// A client task upload is buyer or seller. Staff and library uploads stay staff. 'all' is never sent from a task.
export function taskUploadVisibility(role) {
  const side = sideOf(role);
  if (side === 'buyer' || side === 'seller') return side;
  if (/Seller/.test(role || '')) return 'seller';
  if (/Buyer|Client/.test(role || '')) return 'buyer';
  return 'staff';
}
export const LOGIN_CLOSED = 'Creating a login is closed here. Add the employee in HR and copy the invite link (#/hr/add). Agents use Agent Invites (#/agent-invites). Nothing is emailed.';

export function staffSupabase({ sb, ok, camel, me, api }) {
  const uid = async () => { const u = await me(); if (!u) throw new Error('Please sign in.'); return u; };
  const needAdmin = async () => { const u = await uid(); if (!u.isAdmin) throw new Error('User management is for Admins only.'); return u; };
  const uploadDoc = async ({ dealId, folderId, file, visibility }) => {
    const u = await uid();
    const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
    if (!id) throw new Error('This browser cannot mint a document id.');
    const name = safeName(file.name, file.mimeType);
    const path = dealId ? `${dealId}/${id}/${name}` : `library/${folderId}/${id}/${name}`;
    const up = await sb.storage.from('deal-documents').upload(path, await blobOf(file), { contentType: file.mimeType || 'application/octet-stream', upsert: false });
    if (up.error) throw new Error(up.error.message || 'The document bucket refused the upload.');
    const row = { id, deal_id: dealId || null, folder_id: folderId || null, name, description: file.description || '', mime_type: file.mimeType || 'application/octet-stream', size_bytes: file.size || 0, storage_path: path, visibility: visibility || 'all', uploaded_by: u.id, doc_type: file.docType || '', wire_instructions: file.wireInstructions === true };
    // Insert without RETURNING. A buyer who cannot yet read the new row back gets the same
    // "new row violates row-level security policy" error as a failed check, and the file is lost.
    const ins = await sb.from('documents').insert(row);
    if (ins.error) throw new Error(ins.error.message || 'The document was not saved.');
    return { id, name, dealId: dealId || null, visibility: row.visibility };
  };
  const directory = async () => {
    await needAdmin();
    const profiles = camel(ok(await sb.from('profiles').select('id, email, first_name, last_name, phone, role, is_admin, status').order('last_name'))) || [];
    const contacts = camel(ok(await sb.from('contacts').select('id, profile_id, contact_type'))) || [];
    const parts = camel(ok(await sb.from('deal_participants').select('deal_id, contact_id, role'))) || [];
    const deals = camel(ok(await sb.from('deals').select('id, file_number'))) || [];
    const links = camel(ok(await sb.from('client_sales_reps').select('client_id, sales_id, created_at'))) || [];
    const members = camel(ok(await sb.from('team_members').select('team_id, profile_id'))) || [];
    const teams = camel(ok(await sb.from('teams').select('id, name'))) || [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const dealNo = new Map(deals.map((d) => [d.id, d.fileNumber]));
    const contactOf = new Map(contacts.filter((c) => c.profileId).map((c) => [c.profileId, c]));
    const person = (id) => { const p = byId.get(id) || {}; return { id, name: full(p), role: p.role || '', status: p.status || '' }; };
    return profiles.map((p) => {
      const c = contactOf.get(p.id);
      const files = p.role === 'Outside user' && c ? parts.filter((z) => z.contactId === c.id).map((z) => ({ dealId: z.dealId, fileNumber: dealNo.get(z.dealId) || '', role: z.role })) : [];
      return { ...p, contactType: (c && c.contactType) || null, files, isClient: p.role === 'Outside user' && (files.length > 0 || links.some((l) => l.clientId === p.id)),
        salesReps: links.filter((l) => l.clientId === p.id).map((l) => ({ ...person(l.salesId), createdAt: l.createdAt })),
        clients: links.filter((l) => l.salesId === p.id).map((l) => person(l.clientId)),
        teams: members.filter((m) => m.profileId === p.id).map((m) => (teams.find((t) => t.id === m.teamId) || {}).name).filter(Boolean) };
    });
  };
  return {
    async listSalesStaff() {
      await uid();
      const rows = camel(ok(await sb.from('profiles').select('id, first_name, last_name, role, status').in('role', ['Sales Person', 'Sales Team']).eq('status', 'active').order('first_name'))) || [];
      return rows.map((p) => ({ ...p, name: full(p) }));
    },
    async adminListUsers() { return directory(); },
    async adminGetUser(id) { const row = (await directory()).find((u) => u.id === id); if (!row) throw new Error('User not found.'); return row; },
    async adminCreateUser() { throw new Error(LOGIN_CLOSED); },
    async adminUpdateUser(id, patch = {}) {
      await needAdmin();
      const row = {};
      if (patch.firstName != null) row.first_name = String(patch.firstName);
      if (patch.lastName != null) row.last_name = String(patch.lastName);
      if (patch.phone != null) row.phone = String(patch.phone);
      if (patch.role != null) row.role = patch.role;
      if (patch.status != null) row.status = patch.status;
      if (patch.isAdmin != null) row.is_admin = patch.isAdmin === true || patch.isAdmin === 'on' || patch.isAdmin === 'true';
      if (Object.keys(row).length) ok(await sb.from('profiles').update(row).eq('id', id).select('id').single());
      if (patch.contactType !== undefined) {
        const c = (camel(ok(await sb.from('contacts').select('id, profile_id').eq('profile_id', id))) || [])[0];
        if (c) ok(await sb.from('contacts').update({ contact_type: patch.contactType || null }).eq('id', c.id));
      }
      if (patch.salesIds != null) ok(await sb.rpc('admin_set_sales_reps', { p_client: id, p_sales: [].concat(patch.salesIds) }));
      return this.adminGetUser(id);
    },
    async listTeams() {
      await uid();
      const teams = camel(ok(await sb.from('teams').select('*').order('name'))) || [];
      const members = camel(ok(await sb.from('team_members').select('*'))) || [];
      const profiles = camel(ok(await sb.from('profiles').select('id, first_name, last_name, role'))) || [];
      const byId = new Map(profiles.map((p) => [p.id, p]));
      return teams.map((t) => ({ ...t, members: members.filter((m) => m.teamId === t.id).map((m) => { const p = byId.get(m.profileId) || {}; return { ...m, name: full(p), role: p.role || '' }; }) }));
    },
    async createTeam(name) {
      const u = await uid(); const n = String(name || '').trim(); if (!n) throw new Error('Team name is required.');
      const t = camel(ok(await sb.from('teams').insert({ name: n, created_by: u.id }).select().single()));
      return { ...t, members: [] };
    },
    async renameTeam(teamId, name) {
      const n = String(name || '').trim(); if (!n) throw new Error('Team name is required.');
      ok(await sb.from('teams').update({ name: n }).eq('id', teamId).select('id').single());
      return (await this.listTeams()).find((t) => t.id === teamId);
    },
    async addTeamMember(teamId, profileId, memberRole) {
      const u = await uid();
      let role = memberRole;
      if (!role) { const p = camel(ok(await sb.from('profiles').select('role').eq('id', profileId).single())); role = p.role === 'Transaction Coordinator' ? 'coordinator' : 'agent'; }
      ok(await sb.from('team_members').insert({ team_id: teamId, profile_id: profileId, member_role: role, added_by: u.id }).select().single());
      return true;
    },
    async removeTeamMember(teamId, profileId) {
      await uid();
      const r = await sb.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId);
      if (r.error) throw new Error(r.error.message);
      return true;
    },
    async createTask(dealId, input = {}) {
      const u = await uid();
      const title = String(input.title || '').trim(); if (!title) throw new Error('Task title is required.');
      const audiences = Array.isArray(input.audiences) ? input.audiences.filter(Boolean) : (input.audiences ? [input.audiences] : []);
      return camel(ok(await sb.from('tasks').insert({ deal_id: dealId, title, description: input.description || '', assigned_role: input.assignedRole || 'Processor', status: 'todo', due_date: input.dueDate || null, audiences: audiences.length ? audiences : null, kind: 'simple', created_by: u.id }).select('id, deal_id, title, description, assigned_role, status, due_date, audiences, kind, created_by').single()));
    },
    async listTaskTemplates() {
      await uid();
      const rows = camel(ok(await sb.from('task_templates').select('*').order('code').order('version', { ascending: false }))) || [];
      const used = camel(ok(await sb.from('tasks').select('template_id'))) || [];
      const n = {}; for (const t of used) if (t.templateId) n[t.templateId] = (n[t.templateId] || 0) + 1;
      return rows.map((t) => ({ ...t, agentRoles: t.agentRoles || [], locked: !!t.clientOnly, copies: n[t.id] || 0, publishedByName: '', fields: t.fields || [] }));
    },
    async setStage(id, stage) {
      const s = Number(stage); if (!Number.isInteger(s) || s < 0 || s > 9) throw new Error('Unknown stage.');
      const cur = camel(ok(await sb.from('deals').select('status').eq('id', id).single()));
      const row = { stage: s }; if (s === 9 && cur.status === 'Open') row.status = 'Closed';
      ok(await sb.from('deals').update(row).eq('id', id));
      return api.getDeal(id);
    },
    async setDealStatus(id, status) {
      if (!['Open', 'Closed', 'On Hold', 'Cancelled'].includes(status)) throw new Error('Unknown status.');
      ok(await sb.from('deals').update({ status }).eq('id', id));
      return api.getDeal(id);
    },
    async removeParticipant(dealId, participantId) {
      await uid();
      const tasks = camel(ok(await sb.from('tasks').select('id, status').eq('participant_id', participantId))) || [];
      for (const t of tasks) if (['todo', 'in_progress', 'blocked'].includes(t.status)) ok(await sb.from('tasks').update({ status: 'cancelled' }).eq('id', t.id));
      const r = await sb.from('deal_participants').delete().eq('id', participantId).eq('deal_id', dealId);
      if (r.error) throw new Error(r.error.message);
      return true;
    },
    async getWorkQueue(already = null) {
      const deals = already && already.deals ? already.deals : await api.listDeals({ status: 'All' });
      const open = deals.filter((d) => d.status === 'Open');
      const ids = open.map((d) => d.id);
      const tasks = ids.length ? camel(ok(await sb.from('tasks').select('id, deal_id, status, due_date, assigned_role').in('deal_id', ids))) || [] : [];
      const today = day(new Date()); const soon = plusDays(21);
      const openTask = (t) => ['todo', 'in_progress', 'blocked'].includes(t.status);
      const clientWait = (t) => ['todo', 'in_progress'].includes(t.status) && /^Client/.test(t.assignedRole || '');
      const attention = open.map((q) => ({ deal: q, overdue: tasks.filter((t) => t.dealId === q.id && openTask(t) && t.dueDate && t.dueDate < today).length,
        blocked: tasks.filter((t) => t.dealId === q.id && t.status === 'blocked').length, waitingOnClients: tasks.filter((t) => t.dealId === q.id && clientWait(t)).length }))
        .filter((r) => r.overdue || r.blocked || r.waitingOnClients);
      return { assigned: open.length, totalAssigned: deals.length, blockedOnClients: tasks.filter(clientWait).length,
        overdueTasks: tasks.filter((t) => openTask(t) && t.dueDate && t.dueDate < today).length, closingsToday: open.filter((q) => q.closingDate === today).length,
        closingSoon: open.filter((q) => q.closingDate && q.closingDate >= today && q.closingDate <= soon).sort((a, b) => a.closingDate.localeCompare(b.closingDate)),
        needsAttention: attention, unreadMessages: await this.unreadCount() };
    },
    async unreadCount() {
      const u = await uid();
      const parts = camel(ok(await sb.from('thread_participants').select('thread_id, last_read_at').eq('profile_id', u.id))) || [];
      if (!parts.length) return 0;
      const msgs = camel(ok(await sb.from('messages').select('thread_id, created_at, author_id').in('thread_id', parts.map((p) => p.threadId)))) || [];
      return msgs.filter((m) => { if (m.authorId === u.id) return false; const p = parts.find((x) => x.threadId === m.threadId); return p && (!p.lastReadAt || m.createdAt > p.lastReadAt); }).length;
    },
    async listLibrary() {
      await uid();
      const folders = camel(ok(await sb.from('folders').select('*').eq('scope', 'library').order('name'))) || [];
      const docs = camel(ok(await sb.from('documents').select('*').is('deal_id', null))) || [];
      return folders.map((f) => ({ ...f, documents: docs.filter((d) => d.folderId === f.id).sort((a, b) => a.name.localeCompare(b.name)) }));
    },
    async listDealFolders(dealId) {
      await uid();
      const folders = camel(ok(await sb.from('folders').select('*').eq('scope', 'deal').eq('deal_id', dealId))) || [];
      const docs = camel(ok(await sb.from('documents').select('id, folder_id').eq('deal_id', dealId))) || [];
      return [...folders.map((f) => ({ ...f, count: docs.filter((d) => d.folderId === f.id).length })), { id: '', name: 'Unfiled', scope: 'deal', dealId, virtual: true, count: docs.filter((d) => !d.folderId).length }];
    },
    async createFolder({ scope, dealId, name, staffOnly } = {}) {
      const u = await uid(); const n = String(name || '').trim(); if (!n) throw new Error('Folder name is required.');
      if (scope !== 'library' && scope !== 'deal') throw new Error('Unknown folder type.');
      return camel(ok(await sb.from('folders').insert({ scope, deal_id: scope === 'library' ? null : dealId, name: n, staff_only: scope === 'library' && !!staffOnly, created_by: u.id }).select().single()));
    },
    async renameFolder(id, name) {
      const n = String(name || '').trim(); if (!n) throw new Error('Folder name is required.');
      return camel(ok(await sb.from('folders').update({ name: n }).eq('id', id).select().single()));
    },
    async addLibraryDocument(folderId, file) {
      const f = camel(ok(await sb.from('folders').select('id, scope, staff_only').eq('id', folderId).single()));
      if (!f || f.scope !== 'library') throw new Error('Pick a Library folder.');
      return uploadDoc({ folderId, file, visibility: 'all' });
    },
    async updateDocumentMeta(id, patch = {}) {
      const row = {};
      if (patch.description != null) row.description = patch.description;
      if (patch.visibility != null) row.visibility = patch.visibility;
      if (patch.docType != null) row.doc_type = patch.docType;
      if (patch.wireInstructions != null) row.wire_instructions = patch.wireInstructions === true || patch.wireInstructions === 'on' || patch.wireInstructions === 'true';
      if (Object.keys(row).length) ok(await sb.from('documents').update(row).eq('id', id));
      return true;
    },
    async moveDocument(id, folderId) { ok(await sb.from('documents').update({ folder_id: folderId || null }).eq('id', id)); return true; },
    async uploadForTask(taskId, file) {
      const t = camel(ok(await sb.from('tasks').select('id, deal_id, title, assigned_role').eq('id', taskId).single()));
      const folders = camel(ok(await sb.from('folders').select('id, name').eq('deal_id', t.dealId).eq('name', 'IDs & personal'))) || [];
      const doc = await uploadDoc({ dealId: t.dealId, folderId: folders[0] ? folders[0].id : null, file, visibility: taskUploadVisibility(t.assignedRole) });
      return { id: doc.id, name: doc.name };
    },
    async listSettlements(dealId) {
      const rows = camel(ok(await sb.from('settlements').select('id, deal_id, status, round, slots, location, note, confirmed_slot, history, created_by, created_at, confirmed_at').eq('deal_id', dealId).order('created_at', { ascending: false }))) || [];
      const ids = rows.map((r) => r.id);
      const resp = ids.length ? camel(ok(await sb.from('settlement_responses').select('*').in('settlement_id', ids))) || [] : [];
      const who = camel(ok(await sb.from('profiles').select('id, first_name, last_name'))) || [];
      const name = (id) => { const p = who.find((x) => x.id === id); return p ? full(p) : ''; };
      return rows.map((s) => ({ ...s, confirmedSlot: s.confirmedSlot == null ? null : s.confirmedSlot - 1, createdByName: name(s.createdBy),
        tokens: { buyer: '', seller: '' }, myLink: null, history: s.history || [],
        responses: resp.filter((r) => r.settlementId === s.id && r.round === s.round).map((r) => ({ ...r, picks: (r.picks || []).map((n) => n - 1) })) }));
    },
  };
}
