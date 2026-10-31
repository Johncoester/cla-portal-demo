/* [SUPABASE] Skeleton of the real adapter. NOT connected to any project and NOT tested against one.
 * Implemented: sign-in/out/session and a few reads/writes to show the pattern (RLS in supabase/migrations does the access control).
 * Everything else throws "not implemented yet" and is the next piece of work (see docs/PLAN.md). Method names match mock-adapter.js. */
const SB = 'https://esm.sh/@supabase/supabase-js@2.45.4';   // pinned; vendor locally before go-live
const TASK_COLS = 'id, deal_id, title, description, assigned_role, status, due_date, completed_at, completed_by, created_by, created_at, kind, participant_id, owner_profile_id, template_id, template_code, template_version, saved_at, saved_by';
const todo = (n) => async () => { throw new Error('Supabase adapter: ' + n + ' is not implemented yet.'); };

export async function createSupabaseAdapter(cfg) {
  const { createClient } = await import(SB);
  const sb = createClient(cfg.url, cfg.anonKey);
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
  // per-file roles (migration 10) + self-representation (migration 11): my role(s) on each order I can see. role = primary (agent first),
  // roles = all I hold there, label = 'Buyer + Buyer's Agent' for an agent buying for themselves. Outside users get the roles/labels across files.
  const fileRoles = async () => new Map((ok(await sb.rpc('my_file_roles_full')) || []).map((r) => [r.deal_id, r]));
  const ORDER = ['Buyer Agent', 'Listing Agent', "Buyer + Buyer's Agent", 'Seller + Listing Agent', 'Client-Buyer', 'Client-Seller'];
  const sorted = (xs) => [...new Set(xs)].filter((r) => ORDER.includes(r)).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  // staff only (RPC returns nothing to outside users): "Agent is a party" badge = a client who is also their side's agent on the order
  const parties = async () => { const m = new Map(); (ok(await sb.rpc('agent_parties')) || []).forEach((r) => { if (!m.has(r.deal_id)) m.set(r.deal_id, []); m.get(r.deal_id).push({ contactId: r.contact_id, name: r.name, label: r.label }); }); return m; };
  const withRole = (d, r, pm) => ({ ...d, myRole: r && r.role, myRoles: (r && r.roles) || [], myRoleLabel: r && r.label, selfRep: !!(r && r.self_rep), agentParties: pm.get(d.id) || [] });
  const me = async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return null;
    const p = camel(ok(await sb.rpc('my_profile')));   // migration 13: own row incl. phone/email (other people's come masked from deal_contacts)
    const rs = p.role === 'Outside user' ? [...(await fileRoles()).values()] : [];
    p.fileRoles = sorted(rs.flatMap((r) => r.roles || [])); p.fileLabels = sorted(rs.map((r) => r.label));
    return p;
  };
  const a = {
    // ---- auth (real logins at go-live; the dev picker is mock-only) ----
    async listDevUsers() { return []; },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); return me(); },
    async getSession() { return me(); },
    async signOut() { await sb.auth.signOut(); },
    async resetDemoData() {},
    async getMyProfile() { return me(); },
    // ---- examples of the pattern ----
    // status tabs (Open / Closed / On Hold / Cancelled / All): filter server-side, same contract as the mock (status missing or 'All' = every order)
    async listDeals({ status } = {}) { const [roles, pm] = [await fileRoles(), await parties()]; let q = sb.from('deals').select('*'); if (status && status !== 'All') q = q.eq('status', status);
      return camel(ok(await q.order('open_date', { ascending: false }).order('file_number', { ascending: false }))).map((d) => withRole(d, roles.get(d.id), pm)); },
    // participants come from deal_contacts() (migration 13): the other side's agent/client keep their names but phone/email are blank for outside users
    async getDeal(id) { const [roles, pm] = [await fileRoles(), await parties()]; const d = camel(ok(await sb.from('deals').select('*').eq('id', id).single()));
      d.participants = (ok(await sb.rpc('deal_contacts', { p_deal: id })) || []).map((r) => ({ id: r.participant_id, dealId: r.deal_id, contactId: r.contact_id, role: r.role,
        contact: { id: r.contact_id, profileId: r.profile_id, firstName: r.first_name, lastName: r.last_name, company: r.company, email: r.email, phone: r.phone, contactHidden: r.contact_hidden } }));
      return withRole(d, roles.get(d.id), pm); },
    async listContacts(search = '') { return camel(ok(await sb.rpc('contact_directory', { p_search: search }))); },
    // messaging (migration 13): recipients = CLA staff + own side for outside users; a conversation never mixes the two sides
    async listMessageRecipients(dealId) { return camel(ok(await sb.rpc('message_recipients', { p_deal: dealId }))); },
    async createThread(dealId, { subject, participantIds, body }) { return { id: ok(await sb.rpc('create_thread', { p_deal: dealId, p_subject: subject, p_participants: participantIds, p_body: body })) }; },
    async postMessage(threadId, body) { const { data: { user } } = await sb.auth.getUser(); return camel(ok(await sb.from('messages').insert({ thread_id: threadId, author_id: user.id, body }).select().single())); },
    // activity log: RLS returns rows to CLA staff only (migration 13)
    async listActivity(dealId) { let q = sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(300); q = dealId ? q.eq('deal_id', dealId) : q.is('deal_id', null);
      const items = camel(ok(await q)); return { items, total: items.length, types: [...new Set(items.map((a) => a.action.split('.')[0]))].sort(), actors: [] }; },
    // tasks.form_data is NOT selectable (column grant); answers come from get_task_form for the owner / processor / coordinator / Admin only
    async listTasks(dealId) { return camel(ok(await sb.from('tasks').select(TASK_COLS).eq('deal_id', dealId).order('created_at'))); },
    async getTask(id) {
      const t = camel(ok(await sb.from('tasks').select(TASK_COLS).eq('id', id).single()));
      if (t.kind === 'form') { const r = await sb.rpc('get_task_form', { p_task: id }); if (r.error) t.formHidden = true; else t.formData = r.data || {}; }
      return t;
    },
    async saveTaskForm(id, data, { complete = false } = {}) { return ok(await sb.rpc('save_task_form', { p_task: id, p_data: data, p_complete: complete })); },
    // ---- round 2 RPCs (same names as SQL) ----
    async adminDeleteUser(id) { ok(await sb.rpc('admin_delete_user', { p_user: id })); },
    async publishTemplateVersion(code, patch) { return ok(await sb.rpc('publish_template_version', { p_code: code, p_title: patch.title, p_description: patch.description, p_due_days: patch.dueDays })); },
    async setTemplateAgentRoles(code, roles) { return { code, agentRoles: ok(await sb.rpc('set_template_agent_roles', { p_code: code, p_roles: roles })) }; },   // migration 9
    async sendTaskReminder(id) { return { queued: ok(await sb.rpc('queue_task_reminder', { p_task: id })) }; },
    async queueOverdueReminders() { return { queued: ok(await sb.rpc('queue_overdue_reminders')) }; },
    async listOutbox() { return camel(ok(await sb.from('outbox').select('*').order('created_at', { ascending: false }))); },
    async listNotifications({ limit = 20 } = {}) { return camel(ok(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit))); },
    async notificationCount() { const r = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null); if (r.error) throw new Error(r.error.message); return r.count || 0; },
    async markNotificationRead(id) { ok(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)); },
    async markAllNotificationsRead() { ok(await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)); },
    // closing: tokens come back ONCE from create/reopen (only hashes are stored), unlike the mock which keeps them
    async createSettlementRequest(dealId, { slots, location, note }) { return camel(ok(await sb.rpc('create_settlement_request', { p_deal: dealId, p_slots: slots, p_location: location, p_note: note }))[0]); },
    async confirmSettlement(id, slotIndex) { ok(await sb.rpc('confirm_settlement', { p_settlement: id, p_slot: slotIndex + 1 })); },
    async reopenSettlement(id, { slots, note } = {}) { return camel(ok(await sb.rpc('reopen_settlement', { p_settlement: id, p_slots: slots || null, p_note: note || null }))[0]); },
    async getSchedulingLink(tok) { return ok(await sb.rpc('scheduling_get', { p_token: tok })); },   // anon OK
    async respondSettlement(tok, { picks, note, name }) { ok(await sb.rpc('scheduling_respond', { p_token: tok, p_picks: picks.map((i) => i + 1), p_name: name, p_note: note || '' })); },
    async updateTask(id, patch) { return ok(await sb.rpc('set_task_status', { p_task: id, p_status: patch.status })); },
    async listDocuments(dealId) { return camel(ok(await sb.from('documents').select('*').eq('deal_id', dealId))); },
    // NOTE: there is intentionally no deleteDocument anywhere.
    // ---- Matt, Oct 31, priority 2 (migration 14) ----
    async listAgreements(dealId) {
      const [{ data: { user } }, ags] = [await sb.auth.getUser(), camel(ok(await sb.from('agreements').select('*').order('code')))];
      const mine = camel(ok(await sb.from('agreement_acks').select('*').eq('deal_id', dealId).eq('profile_id', user.id)));
      const roles = (await fileRoles()).get(dealId); const staff = !(roles && roles.roles && roles.roles.length);
      const out = { agreements: ags.map((g) => { const m = mine.find((k) => k.agreementCode === g.code && k.version === g.version); return { ...g, myAck: m ? { at: m.acknowledgedAt, roleLabel: m.roleLabel } : null }; }), needed: !staff };
      out.pending = out.needed ? out.agreements.filter((g) => !g.myAck).length : 0;
      if (staff) { const rows = camel(ok(await sb.rpc('agreement_status', { p_deal: dealId }))) || []; const m = new Map();
        rows.forEach((r) => { if (!m.has(r.profileId)) m.set(r.profileId, { profileId: r.profileId, name: r.name, roleLabel: '', acks: {} }); m.get(r.profileId).acks[r.agreementCode] = r.acknowledgedAt ? { at: r.acknowledgedAt } : null; });
        out.people = [...m.values()]; }
      return out;
    },
    async acknowledgeAgreement(dealId, code) { return { id: ok(await sb.rpc('acknowledge_agreement', { p_deal: dealId, p_code: code })) }; },
    async getWireInstructions(dealId) { const w = camel(ok(await sb.rpc('wire_instructions', { p_deal: dealId }))); return { ...w, amountNote: 'Your exact amount comes from your Closing Disclosure / settlement statement.' }; },
    async listClosingProposals(dealId) { return camel(ok(await sb.from('closing_proposals').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))).map((p) => ({ ...p, at: String(p.proposedAt).slice(0, 16) })); },
    async proposeClosing(dealId, { at, location, note }) { return { id: ok(await sb.rpc('propose_closing', { p_deal: dealId, p_at: at, p_location: location, p_note: note || '' })) }; },
    async confirmClosing(dealId, { at, location, note, proposalId } = {}) { ok(await sb.rpc('confirm_closing', { p_deal: dealId, p_at: at || null, p_location: location || null, p_note: note || '', p_proposal: proposalId || null })); },
    // e-sign: the RPCs stand in for the provider (esign.js DemoProvider); a DocuSign / Dropbox Sign Edge Function would call the same tables
    async requestSignature(docId, { signerIds, message }) { return { id: ok(await sb.rpc('request_signature', { p_doc: docId, p_signers: signerIds, p_message: message || '' })) }; },
    async listSignatureRequests(dealId) { return camel(ok(await sb.from('signature_requests').select('*, signers:signature_signers(*)').eq('deal_id', dealId).order('requested_at', { ascending: false }))); },
    async signDocument(requestId, { typedName, adopt }) { return { status: ok(await sb.rpc('sign_document', { p_request: requestId, p_typed_name: typedName, p_adopt: adopt === true || adopt === 'on' })) }; },
    async cancelSignatureRequest(id) { ok(await sb.rpc('cancel_signature_request', { p_request: id })); return true; },
  };
  for (const n of ['pickPerson', 'signInDev', 'updateMyProfile', 'getWorkQueue', 'unreadCount', 'createDeal', 'updateDeal', 'setStage', 'setDealStatus',
    'createContact', 'updateContact', 'addParticipant', 'removeParticipant', 'createTask', 'addDocument', 'updateDocumentMeta', 'getDocumentContent',
    'listThreads', 'getThread', 'markThreadRead', 'adminListUsers', 'adminUpdateUser', 'adminCreateUser',
    // round 2 still to wire (tables/RPCs exist in migrations 4-6; adminCreateUser needs an Edge Function with the service role)
    'listSalesStaff', 'moveDocument', 'uploadForTask', 'listTaskTemplates', 'listTeams', 'createTeam', 'renameTeam', 'addTeamMember', 'removeTeamMember',
    'listLibrary', 'listDealFolders', 'createFolder', 'renameFolder', 'addLibraryDocument', 'listSettlements',
    'listSignatureCandidates']) a[n] = todo(n);   // migration 14: candidates = deal_contacts() + document visibility (to wire)
  return a;
}
