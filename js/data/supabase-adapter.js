/* [SUPABASE] Skeleton of the real adapter. NOT connected to any project and NOT tested against one.
 * Implemented: sign-in/out/session and a few reads/writes to show the pattern (RLS in supabase/migrations does the access control).
 * Everything else throws "not implemented yet" and is the next piece of work (see docs/PLAN.md). Method names match mock-adapter.js. */
import { buildTaskGrid, groupOfRole } from './task-board.js?v=202611091600';
import { localDate, fileRoleLabel, moneyAmount, viewOnly } from './constants.js?v=202611090935';
import { assertRecipients, messageText } from './portal-message.js?v=202611090935';
import { planDocumentBatch } from './document-batch.js?v=202611090935';
import { featureFlags } from './features.js?v=202611070139';
import { accountingSupabase } from './supabase-accounting.js?v=202611091140';
import { payoffsSupabase } from './supabase-payoffs.js?v=202611070139';
import { modulesSupabase } from './supabase-modules.js?v=202611090935';
import { roleAccessSupabase } from './supabase-role-access.js?v=202611100100';   // John, Nov 9: Admin > Role access
import { taskSwitchesSupabase } from './supabase-task-switches.js?v=202611090935';
import { callItemsSupabase } from './supabase-callitems.js?v=202611090935';
import { automationPart } from './automation.js?v=202611091345';
import { runsOrders as runsOrdersCI } from './constants.js?v=202611090935';
import { crmSupabase } from './supabase-crm.js?v=202611091240';
import { hrSupabase } from './supabase-hr.js?v=202611100130';
import { feedbackNov4Supabase } from './supabase-feedback-nov4.js?v=202611091240';
import { officesSupabase } from './supabase-offices.js?v=202611090935';
import { closingLocationSupabase } from './supabase-closing-location.js?v=202611090935';
import { tcSupabase } from './supabase-tc.js?v=202611090935';
import { emailSendersSupabase } from './supabase-email-senders.js?v=202611090935';
import { gmailSupabase } from './supabase-gmail.js?v=202611100930';
import { nov5Supabase } from './supabase-nov5.js?v=202611091030';
import { orderOverviewSupabase } from './supabase-order-overview.js?v=202611100930';
import { agentInviteSupabase } from './supabase-agent-invite.js?v=202611100130';
import { staffSupabase } from './supabase-staff.js?v=202611082000';
import { staffFeedbackSupabase } from './supabase-staff-feedback.js?v=202611080400';
import { withoutHiddenProfiles, PROCESSOR_PICK_ROLES } from './place-order.js?v=202611092320';
import { processorFields, missingProcessorIds, nameOfProfile } from './processor-assign.js?v=202611091600';
import { propertyAddressOf } from './nov5-rules.js?v=202611090935';
import { fetchHostedTask, fetchHostedTaskRows, mapHostedTaskList, viewerParticipantIds } from './task-actions.js?v=202611090935';
import { readHostedAgentTask, submitHostedAgentTask, hostedAgentTaskView } from './agent-task-host.js?v=202611091050';
import { contactInsertRow } from './contact-insert.js?v=202611070139';
import { claRepresentationCode, claRepresentationLabel } from './cla-representation.js?v=202611090950';
import { withMyAcknowledgements } from './agreement-link.js?v=202611091030';
import { filterListedDocuments, shapeListedDocument } from './document-list.js?v=202611091030';
import { authEventAction, gatherReads, identitySlot, navigationReads, profileFlight, speculativeReads } from './read-batch.js?v=202611082200';
const SB = 'https://esm.sh/@supabase/supabase-js@2.45.4';   // pinned. Used only after John confirms the login switch on CLA Portal Live Test.
const todo = (n) => async () => { throw new Error('Supabase adapter: ' + n + ' is not implemented yet.'); };

export async function createSupabaseAdapter(cfg) {
  if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('Supabase mode needs a project URL and a publishable key. There is no mock fallback.');
  if (typeof localStorage !== 'undefined') { try { localStorage.removeItem('cla-portal-new:data:v30'); } catch (e) { /* a browser that blocks storage still must not load fixtures */ } }
  const { createClient } = await import(SB);
  const sb = createClient(cfg.url, cfg.anonKey);
  const ident = identitySlot();
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
  // task_board / task_grid rows -> the same shape the mock's listAllTasks returns (task + its file)
  const boardRows = (rows) => camel(rows || []).map((t) => ({ ...t, ownerId: t.ownerProfileId, ownerName: t.ownerName || '', personName: t.ownerName || '', group: groupOfRole(t.assignedRole),
    deal: { id: t.dealId, fileNumber: t.fileNumber, street: t.street, city: t.city, state: t.state, zip: t.zip, address: `${t.street}, ${t.city}, ${t.state} ${t.zip}`, closingDate: t.closingDate, status: t.dealStatus } }));
  // migration 19: deal_sales_list() = the salespeople on each order the caller can open (names via the RPC; profiles RLS hides staff from outside users)
  const titles = async (dealId) => new Map((ok(await sb.rpc('deal_file_titles', dealId ? { p_deal: dealId } : {})) || []).map((r) => [r.deal_id, r.file_title || '']));
  const salesMap = async (dealId) => { const m = new Map(); (ok(await sb.rpc('deal_sales_list', dealId ? { p_deal: dealId } : {})) || []).forEach((r) => {
    if (!m.has(r.deal_id)) m.set(r.deal_id, []); m.get(r.deal_id).push({ id: r.sales_id, name: r.name, role: r.role, addedAt: r.added_at }); }); return m; };
  const salesFields = (xs = []) => ({ salesPeople: xs, salesPersonIds: xs.map((x) => x.id), salesPersonName: xs.map((x) => x.name).join(', ') });
  // John, Nov 9: real Processor names on hosted orders (deals rows only carry processor_id). One small staff-name read, shared for 5 minutes
  // and run alongside the other list reads; a Processor whose role later changed is looked up once by id. A failed read just leaves names blank.
  let procNames = null; let procNamesAt = 0;
  const processorNames = () => {
    if (!procNames || Date.now() - procNamesAt > 300000) {
      procNamesAt = Date.now();
      procNames = Promise.resolve().then(() => sb.from('profiles').select('id, first_name, last_name').in('role', PROCESSOR_PICK_ROLES))
        .then((r) => { if (r.error) { procNames = null; return new Map(); } return new Map((r.data || []).map((p) => [p.id, nameOfProfile(p)])); }, () => { procNames = null; return new Map(); });
    }
    return procNames;
  };
  const withProcessorNames = async (deals, names) => {
    const miss = missingProcessorIds(deals, names);
    if (miss.length) { try { const r = await sb.from('profiles').select('id, first_name, last_name').in('id', miss); (r.data || []).forEach((p) => names.set(p.id, nameOfProfile(p))); } catch (e) { /* names stay blank */ } }
    return names;
  };
  const types = async (ids) => new Map(ids.length ? (ok(await sb.rpc('contact_types', { p_ids: [...new Set(ids)] })) || []).map((r) => [r.contact_id, r.contact_type]) : []);
  const withRole = (d, r, pm) => ({ ...d, myRole: r && r.role, myRoles: (r && r.roles) || [], myRoleLabel: r && r.label, selfRep: !!(r && r.self_rep), agentParties: pm.get(d.id) || [] });
  const profile = profileFlight();
  const nav = navigationReads();
  const early = speculativeReads();
  let openingNav = false;
  let navSerial = 0;
  let openNavId = 0;
  let authUserFlight = null;
  let authUserFlightOwner = 0;
  const navStops = new Map();
  function fetchAuthUser() {
    const owner = openNavId;
    if (owner && authUserFlight && authUserFlightOwner === owner) return authUserFlight;
    const flight = sb.auth.getUser();
    if (!owner) { flight.catch(() => {}); return flight; }
    authUserFlight = flight;
    authUserFlightOwner = owner;
    flight.catch(() => { if (authUserFlight === flight) { authUserFlight = null; authUserFlightOwner = 0; } });
    return flight;
  }
  function dropAuth() {
    ident.invalidate();
    procNames = null;
    authUserFlight = null;
    authUserFlightOwner = 0;
    profile.clear();
    nav.clear();
    early.clear();
  }
  let pendingAuthId = '';
  sb.auth.onAuthStateChange((event, session) => {
    const nextId = session && session.user && session.user.id || '';
    const held = ident.current();
    const action = authEventAction(event, nextId, held && held.id || '', nav.userId(), pendingAuthId);
    if (event === 'SIGNED_OUT') pendingAuthId = '';
    else if (nextId) pendingAuthId = nextId;
    if (action === 'drop') dropAuth();
    if (event === 'PASSWORD_RECOVERY') { try { sessionStorage.setItem('cla-portal-recovery', '1'); } catch (e) { /* the reset screen also checks the flag */ } if (!/recovery/.test(location.hash)) location.hash = '#/login'; }
  });
  const fileRead = (key, fn) => early.read(nav.userId() || pendingAuthId, key, fn, nav);
  const meFrom = (who) => profile.load(who, async () => {
      const raw = ok(await sb.rpc('my_profile'));   // profiles row only; user_metadata is never a role
      if (!raw) return { id: who.id, email: who.email || '', firstName: '', lastName: '', role: '', status: 'unprovisioned', unprovisioned: true, isAdmin: false };
      const p = camel(raw);
      const rs = p.role === 'Outside user' ? [...(await fileRoles()).values()] : [];
      p.fileRoles = sorted(rs.flatMap((r) => r.roles || [])); p.fileLabels = sorted(rs.map((r) => r.label));
      return p;
    });
  const me = async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const ticket = ident.generation();
      const navAt = openNavId;
      const cached = ident.current();
      if (cached && cached.id && nav.userId() === cached.id) return cached;
      const { data: { user } } = await fetchAuthUser();
      if (ticket !== ident.generation() || openNavId !== navAt) continue;
      if (!user) {
        if (ticket !== ident.generation() || openNavId !== navAt) return null;
        profile.clear(); nav.clear(); early.clear(); ident.forget();
        return null;
      }
      if (nav.userId() !== user.id) {
        if (ticket !== ident.generation() || openNavId !== navAt) continue;
        profile.begin();
        ident.forget();
        if (!openingNav && !early.adopt(nav, user.id, ticket, ident.generation())) continue;
      }
      const loaded = await meFrom(user);
      if (ticket !== ident.generation() || openNavId !== navAt || !loaded || loaded.id !== user.id) continue;
      return ident.hold(loaded, ticket);
    }
    return null;
  };
  async function fetchDeal(id) {
    const got = await gatherReads({
      roles: fileRoles,
      parties: parties,
      row: async () => camel(ok(await sb.from('deals').select('*').eq('id', id).single())),
      contacts: async () => ok(await sb.rpc('deal_contacts', { p_deal: id })) || [],
      sales: () => salesMap(id),
      titles: () => titles(id),
      entities: async () => ok(await sb.rpc('deal_entities', { p_deal: id })) || [],
      source: async () => ok(await sb.rpc('deal_source', { p_deal: id })) || [],
      procs: () => processorNames(),
    });
    const d = got.row;
    // John, Nov 9: the file's Transaction Coordinator (deals.tc_user_id) is looked up with the same one-shot by-id name read
    const nm = await withProcessorNames([d, { processorId: d.tcUserId || null }], new Map(got.procs));
    Object.assign(d, processorFields(d, nm)); d.tcUserId = d.tcUserId || null; d.tcName = d.tcUserId ? (nm.get(d.tcUserId) || '') : '';
    d.participants = got.contacts.map((r) => ({ id: r.participant_id, dealId: r.deal_id, contactId: r.contact_id, role: r.role,
      contact: { id: r.contact_id, profileId: r.profile_id, firstName: r.first_name, lastName: r.last_name, company: r.company, email: r.email, phone: r.phone, contactHidden: r.contact_hidden } }));
    const ct = await types(d.participants.map((p) => p.contactId)); d.participants.forEach((p) => { p.contact.contactType = ct.get(p.contactId) || null; });
    Object.assign(d, salesFields(got.sales.get(id))); d.county = d.county || ''; d.fileTitle = got.titles.get(id) || '';
    const ents = new Map(got.entities.map((r) => [r.participant_id, { name: r.name, type: r.entity_type || '', repName: r.rep_name || '', repTitle: r.rep_title || '', repPhone: r.rep_phone || '', repEmail: r.rep_email || '' }]));
    d.participants.forEach((p) => { p.entity = ents.get(p.id) || null; });
    const src = got.source[0]; d.sourceOfBusiness = src ? src.value : ''; d.sourceOfBusinessLabel = src ? src.label : '';
    // Who CLA represents (deals.cla_representation, migration 20261109150000): shown to CLA staff only; null = not recorded
    if (ident.current() && ident.current().role === 'Outside user') { d.claRepresentation = null; d.claRepresentationLabel = ''; } else { d.claRepresentation = d.claRepresentation || null; d.claRepresentationLabel = claRepresentationLabel(d.claRepresentation); }
    return withRole(d, got.roles.get(d.id), got.parties);
  }
  async function fetchFileShell(id) {
    const [raw, names] = await Promise.all([sb.from('deals').select('*').eq('id', id).single(), processorNames()]);
    const row = camel(ok(raw));
    Object.assign(row, processorFields(row, names)); row.tcUserId = row.tcUserId || null; row.tcName = row.tcUserId ? (names.get(row.tcUserId) || '') : '';
    row.address = `${row.street}, ${row.city}, ${row.state} ${row.zip}`;
    row.participants = [];
    row.salesPeople = [];
    row.salesPersonIds = [];
    row.county = row.county || '';
    row.fileTitle = '';
    row.sourceOfBusiness = '';
    row.sourceOfBusinessLabel = '';
    if (ident.current() && ident.current().role === 'Outside user') {
      const roles = await fileRoles();
      return withRole(row, roles.get(row.id), new Map());
    }
    return withRole(row, null, new Map());
  }
  const rawDocs = async (id) => camel(ok(await sb.from('documents').select('*').eq('deal_id', id)));
  const a = {
    mode: 'supabase',
    // ---- auth (real logins; the dev picker and ?as= links are mock-only and ignored in this mode) ----
    async listDevUsers() { return []; },
    async listDemoPersonas() { return camel(ok(await sb.rpc('list_demo_personas')) || []); },
    async startDemoView(userId) { return camel(ok(await sb.rpc('start_demo_view', { p_target: userId }))); },
    async stopDemoView() { return camel(ok(await sb.rpc('stop_demo_view'))); },
    async demoViewStatus() { return fileRead('demo', async () => camel(ok(await sb.rpc('demo_view_status')) || { active: false })); },
    async requestVoicePass(action) {
      const res = await sb.functions.invoke('voice-token', { body: { action: action === 'mint' ? 'mint' : 'check' } });
      if (res.error) {
        let message = 'Voice is not available on this sign-in.';
        let status = 0;
        try { const body = await res.error.context.json(); if (body && typeof body.error === 'string' && body.error.length < 200 && !/xai-|bearer|api[_-]?key/i.test(body.error)) message = body.error; status = res.error.context.status || 0; } catch (e) { /* keep the generic line */ }
        return { ok: false, status, message };
      }
      return { ok: true, status: 200, data: res.data || {} };
    },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); return me(); },
    async requestPasswordReset(email) { const { error } = await sb.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: 'https://johncoester.github.io/cla-portal-demo/' }); if (error) throw new Error(error.message); return { ok: true }; },
    async updatePassword(password) { const { data, error } = await sb.auth.updateUser({ password: String(password || '') }); if (error) throw new Error(error.message); return data; },
    async provisionPortalUser(input) { return ok(await sb.rpc('provision_portal_user', { p_user: input.userId, p_role: input.role, p_first: input.firstName, p_last: input.lastName || '' })); },
    async submitPortalFeedback(body, page) { return ok(await sb.rpc('submit_portal_feedback', { p_body: body, p_page: page || '' })); },
    async listPortalFeedback() { return ok(await sb.rpc('list_portal_feedback')) || []; },
    async updateMyProfile(patch = {}) {
      if (patch.role != null || patch.isAdmin != null || patch.status != null) throw new Error('Role and access are assigned by an administrator.');
      const row = {};
      if (patch.firstName != null) row.first_name = String(patch.firstName); if (patch.lastName != null) row.last_name = String(patch.lastName); if (patch.phone != null) row.phone = String(patch.phone);
      const { data: { user } } = await sb.auth.getUser(); if (!user) throw new Error('Please sign in.');
      if (Object.keys(row).length) ok(await sb.from('profiles').update(row).eq('id', user.id));
      profile.begin(); ident.forget(); return me();
    },
    async getSession() {
      const ticket = ident.generation();
      const navAt = openNavId;
      const { data: { user } } = await sb.auth.getUser();
      if (ticket !== ident.generation() || openNavId !== navAt) return null;
      if (!user) {
        if (ticket !== ident.generation() || openNavId !== navAt) return null;
        profile.clear(); nav.clear(); early.clear(); ident.forget();
        return null;
      }
      const cached = ident.current();
      if (cached && cached.id === user.id && nav.userId() === user.id) return cached;
      if (ticket !== ident.generation() || openNavId !== navAt) return null;
      profile.begin();
      if (!openingNav && !early.adopt(nav, user.id, ticket, ident.generation())) return null;
      const loaded = await meFrom(user);
      if (ticket !== ident.generation() || openNavId !== navAt || !loaded || loaded.id !== user.id) return null;
      return ident.hold(loaded, ticket);
    },
    authGeneration() { return ident.generation(); },
    async signOut() { dropAuth(); await sb.auth.signOut(); },
    async resetDemoData() {},
    async getMyProfile() { return me(); },
    // John, Nov 2 (migration 23): file titles from deal_file_titles(p_deal) = the buyers' / sellers' last names the caller may see, in the order added
    // ---- examples of the pattern ----
    // status tabs (Open / Closed / On Hold / Cancelled / All): filter server-side, same contract as the mock (status missing or 'All' = every order)
    // Matt, Nov 2: + partyNames (search by name) and overdueTasks (filter) from deal_list_extras() (migration 16; RLS-scoped like the rest)
    async listDeals({ status } = {}) {
      let q = sb.from('deals').select('*'); if (status && status !== 'All') q = q.eq('status', status);
      const got = await gatherReads({
        roles: fileRoles,
        parties: parties,
        extras: async () => ok(await sb.rpc('deal_list_extras')) || [],
        sales: () => salesMap(),
        titles: () => titles(),
        procs: () => processorNames(),
        rows: async () => camel(ok(await q.order('open_date', { ascending: false }).order('file_number', { ascending: false }))) || [],
      });
      const ex = new Map(got.extras.map((r) => [r.deal_id, r]));
      const pn = await withProcessorNames(got.rows, new Map(got.procs));
      return got.rows.map((d) => ({ ...withRole(d, got.roles.get(d.id), got.parties),
        address: `${d.street}, ${d.city}, ${d.state} ${d.zip}`, displayName: propertyAddressOf(d), county: d.county || '', fileTitle: got.titles.get(d.id) || '', partyNames: (ex.get(d.id) || {}).party_names || [], overdueTasks: (ex.get(d.id) || {}).overdue_tasks || 0, ...salesFields(got.sales.get(d.id)), ...processorFields(d, pn) }));
    },
    // participants come from deal_contacts() (migration 13): the other side's agent/client keep their names but phone/email are blank for outside users
    async getDeal(id) { return fetchDeal(id); },
    async readDeal(id) { return fileRead('deal:' + id, () => fetchDeal(id)); },
    async readFileShell(id) { return fileRead('shell:' + id, () => fetchFileShell(id)); },
    // John, Nov 2 (migration 19): several salespeople per order; the Processor and Admins add/remove them (RPCs check the role + file access)
    async listPreprocessors() { return camel(ok(await sb.from('profiles').select('id, first_name, last_name, role, status').eq('role', 'Preprocessor').eq('status', 'active').order('first_name'))); },
    async listProcessors() {
      const u = await me();
      const shape = (res) => (camel(ok(res)) || []).filter((p) => !!p.isDemo === !!(u && u.isDemo)).map((p) => ({ ...p, name: `${p.firstName} ${p.lastName}` }));
      const narrow = () => sb.from('profiles').select('id, first_name, last_name, role, status, is_demo').in('role', PROCESSOR_PICK_ROLES).eq('status', 'active').order('first_name');
      const wide = () => sb.from('profiles').select('id, first_name, last_name, email, role, status, is_demo').in('role', PROCESSOR_PICK_ROLES).eq('status', 'active').order('first_name');
      let timer;
      const raced = await new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
        Promise.resolve(wide()).then((res) => resolve(res), () => resolve(null));
      });
      if (timer) clearTimeout(timer);
      if (raced && !raced.error) return shape(raced);
      return shape(await narrow());
    },
    // John, Nov 2 (migration 20): Place Order. Open Date (backdating OK, never future), any US state, EMD amount / due date; the DB re-checks all of it.
    async createDeal(input) {
      // Refinance (John, Nov 3): no purchase price / EMD; migration 32 (private.deal_refi_guard) refuses them, and sellers / realtors / a TC on the file
      const refi = input.transactionType === 'Refinance';
      if (!String(input.county || '').trim()) { const { autoCounty } = await import('./county-auto.js?v=202611090935'); input = { ...input, county: (await autoCounty(input)).county }; }   // live40: county from the ZIP when left blank (no schema change)
      const { data: { user } } = await sb.auth.getUser();
      const row = { street: input.street, city: input.city, state: String(input.state || '').toUpperCase(), zip: input.zip || '', county: String(input.county || '').trim(), transaction_type: input.transactionType || 'Purchase',
        open_date: input.openDate || localDate(), closing_date: input.closingDate || null, purchase_price: refi ? null : moneyAmount(input.purchasePrice), loan_amount: moneyAmount(input.loanAmount),
        emd_amount: refi ? null : moneyAmount(input.emdAmount), emd_due_date: refi ? null : input.emdDueDate || null, notes: input.notes || '', processor_id: input.processorId || null, preprocessor_user_id: input.preprocessorUserId || null, created_by: user.id,
        lender_name: input.lenderName || '', lender_contact: input.lenderContact || '', lender_phone: input.lenderPhone || '', lender_email: String(input.lenderEmail || '').trim().toLowerCase(), loss_payee_name: input.lossPayeeName || '',
        primary_residence: refi || String(input.state || '').toUpperCase() !== 'MD' ? '' : String(input.primaryResidence || ''), first_time_buyer: refi || String(input.state || '').toUpperCase() !== 'MD' ? '' : String(input.firstTimeBuyer || '') };   // Maryland purchases only (John, Nov 6)
      if (input.tcUserId) row.tc_user_id = input.tcUserId;   // John, Nov 9: blank = the database auto-assigns (a TC who opens it, else the agents' team TC)
      if (input.claRepresentation !== undefined) row.cla_representation = claRepresentationCode(input.claRepresentation);   // Both / Buyer only / Seller only; absent = not recorded
      const d = camel(ok(await sb.from('deals').insert(row).select().single()));
      if (String(input.sourceOfBusiness || '').trim()) ok(await sb.rpc('set_deal_source', { p_deal: d.id, p_source: input.sourceOfBusiness }));   // migration 31 (staff-only table)
      const ids = [].concat(input.salesIds || []).filter(Boolean); if (ids.length) ok(await sb.rpc('set_deal_sales_people', { p_deal: d.id, p_sales: ids }));
      return { ...d, address: `${d.street}, ${d.city}, ${d.state} ${d.zip}` }; },
    async updateDeal(id, patch) {
      const map = { street: 'street', city: 'city', state: 'state', zip: 'zip', county: 'county', openDate: 'open_date', closingDate: 'closing_date', purchasePrice: 'purchase_price', loanAmount: 'loan_amount',
        emdAmount: 'emd_amount', emdDueDate: 'emd_due_date', lenderName: 'lender_name', lenderContact: 'lender_contact', lenderEmail: 'lender_email', lenderPhone: 'lender_phone', lossPayeeName: 'loss_payee_name', notes: 'notes', processorId: 'processor_id', preprocessorUserId: 'preprocessor_user_id', tcUserId: 'tc_user_id', primaryResidence: 'primary_residence', firstTimeBuyer: 'first_time_buyer' };
      const money = new Set(['purchase_price', 'loan_amount', 'emd_amount']); const dates = new Set(['open_date', 'closing_date', 'emd_due_date']); const row = {};
      for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) { const v = patch[k];
        row[col] = money.has(col) ? moneyAmount(v) : dates.has(col) || col === 'processor_id' || col === 'preprocessor_user_id' || col === 'tc_user_id' ? (v || null) : v; }
      if (row.open_date === null) delete row.open_date;
      if (patch.claRepresentation !== undefined) row.cla_representation = claRepresentationCode(patch.claRepresentation);   // '' = not recorded (null)
      if (patch.state !== undefined && String(patch.state || '').toUpperCase() !== 'MD') { row.primary_residence = ''; row.first_time_buyer = ''; }
      if (Object.keys(row).length) ok(await sb.from('deals').update(row).eq('id', id));
      if (patch.sourceOfBusiness !== undefined) ok(await sb.rpc('set_deal_source', { p_deal: id, p_source: patch.sourceOfBusiness || '' }));
      if (patch.salesIds !== undefined) ok(await sb.rpc('set_deal_sales_people', { p_deal: id, p_sales: [].concat(patch.salesIds || []) }));
      return a.getDeal(id); },
    // contacts: unique email (contacts_email_uq); a new contact has no login and no invite is sent
    async createContact(input) { return camel(ok(await sb.from('contacts').insert(contactInsertRow(input)).select().single())); },
    async updateContact(id, patch) { const row = {}; for (const [k, col] of [['firstName', 'first_name'], ['lastName', 'last_name'], ['email', 'email'], ['phone', 'phone'], ['company', 'company'], ['contactType', 'contact_type']])
      if (patch[k] !== undefined) row[col] = k === 'contactType' ? (patch[k] || null) : k === 'email' ? String(patch[k] || '').toLowerCase() : patch[k];
      return camel(ok(await sb.from('contacts').update(row).eq('id', id).select().single())); },
    // participants: the triggers (migrations 10, 11, 20) enforce outside-user roles, self-representation pairs and "TC = Transaction Coordinator accounts only"
    // Matt, Nov 3b: opts.entity = { name, type, repName, repTitle, repPhone, repEmail } on a buyer / seller row (set_participant_entity, migration 31)
    async addParticipant(dealId, contactId, role, opts = {}) { const p = ok(await sb.from('deal_participants').insert({ deal_id: dealId, contact_id: contactId, role }).select('id').single());
      if (opts && opts.entity) ok(await sb.rpc('set_participant_entity', { p_participant: p.id, p_entity: opts.entity })); return { ok: true, id: p.id }; },
    async setParticipantEntity(dealId, participantId, entity) { return ok(await sb.rpc('set_participant_entity', { p_participant: participantId, p_entity: entity || null })); },
    async listSourceOptions() { return ok(await sb.rpc('source_of_business_options')) || []; },
    async listCoordinators() {
      const rows = (ok(await sb.rpc('coordinator_choices')) || []).map((r) => camel(r));
      const visible = new Set((camel(ok(await sb.from('profiles').select('id'))) || []).map((p) => p.id));
      return rows.filter((r) => visible.has(r.profileId));
    },
    async addDealSalesPerson(dealId, salesId) { ok(await sb.rpc('add_deal_sales_person', { p_deal: dealId, p_sales: salesId })); return (await a.getDeal(dealId)).salesPeople; },
    async removeDealSalesPerson(dealId, salesId) { ok(await sb.rpc('remove_deal_sales_person', { p_deal: dealId, p_sales: salesId })); return (await a.getDeal(dealId)).salesPeople; },
    // migration 46: the Title Sales Rep card on the agent Parties grid (public work contact only: name, work phone, work email)
    async listSalesRepContacts(dealId) { return (ok(await sb.rpc('agent_sales_rep_contacts', { p_deal: dealId })) || []).map((r) => ({ id: r.sales_id, name: r.name, phone: r.work_phone, email: r.work_email })); },
    async setDealSalesPeople(dealId, salesIds) { ok(await sb.rpc('set_deal_sales_people', { p_deal: dealId, p_sales: salesIds })); return (await a.getDeal(dealId)).salesPeople; },
    // contact type (migration 21): contact_directory() / deal_contacts() keep their shape; types come from contact_types(ids)
    async listContacts(search = '') {
      const cs = camel(ok(await sb.rpc('contact_directory', { p_search: search }))) || [];
      const wanted = [...new Set(cs.map((c) => c.profileId).filter(Boolean))];
      const visible = new Set(wanted.length ? (camel(ok(await sb.from('profiles').select('id').in('id', wanted))) || []).map((p) => p.id) : []);
      const real = withoutHiddenProfiles(cs, visible);
      const t = await types(real.map((c) => c.id));
      return real.map((c) => ({ ...c, contactType: t.get(c.id) || null }));
    },
    // messaging (migration 13): recipients = CLA staff + own side for outside users; a conversation never mixes the two sides
    // John, Nov 3 (migration 29): wire_recipients = the same list cut to the buyer(s) + staff; wireOk drives the Share Files wire mode
    async listMessageRecipients(dealId, { wire = false } = {}) {
      const w = camel(ok(await sb.rpc('wire_recipients', { p_deal: dealId }))) || []; if (wire) return w.map((r) => ({ ...r, wireOk: true }));
      const ids = new Set(w.map((r) => r.id)); return (camel(ok(await sb.rpc('message_recipients', { p_deal: dealId }))) || []).map((r) => ({ ...r, wireOk: ids.has(r.id) }));
    },
    async createThread(dealId, { subject, participantIds, body }) { return { id: ok(await sb.rpc('create_thread', { p_deal: dealId, p_subject: subject, p_participants: participantIds, p_body: body })) }; },
    async postMessage(threadId, body) { const { data: { user } } = await sb.auth.getUser(); return camel(ok(await sb.from('messages').insert({ thread_id: threadId, author_id: user.id, body }).select().single())); },
    // activity log: RLS returns rows to CLA staff only (migration 13)
    async listActivity(dealId) { let q = sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(300); q = dealId ? q.eq('deal_id', dealId) : q.is('deal_id', null);
      const items = camel(ok(await q)); return { items, total: items.length, types: [...new Set(items.map((a) => a.action.split('.')[0]))].sort(), actors: [] }; },
    // tasks.form_data is NOT selectable (column grant); answers come from get_task_form for the owner / processor / coordinator / Admin only
    async listTasks(dealId) {
      const raw = fileRead('taskrows:' + dealId, () => fetchHostedTaskRows(sb, dealId));
      const ticket = ident.generation();
      const u = ident.current() || await me();
      if (!u || ticket !== ident.generation()) throw new Error('Please sign in.');
      if (nav.userId() && nav.userId() !== u.id) throw new Error('Please sign in.');
      // Francis (Nov 6): a task copy for the viewer's own file-party row counts as theirs. CLA staff who run orders skip this read.
      const mineIds = (u.isAdmin || runsOrdersCI(u)) ? Promise.resolve([]) : viewerParticipantIds(sb, dealId, u);
      const got = await raw; const myParticipantIds = await mineIds;
      if (ticket !== ident.generation() || (nav.userId() && nav.userId() !== u.id)) throw new Error('Please sign in.');
      return mapHostedTaskList(got.rows, u, got.off, { myParticipantIds });
    },
    async getTask(id) { return fetchHostedTask(sb, id, await me()); },
    async getAgentTask(id) {
      const user = await me();
      const row = await readHostedAgentTask(sb, id);
      let task = null;
      try { task = await fetchHostedTask(sb, id, user); } catch (e) { task = null; }
      const view = hostedAgentTaskView(row, task);
      view.canSubmit = !!(task && task.mine && view.status !== 'cancelled' && view.status !== 'done' && !viewOnly(user));
      return view;
    },
    async submitAgentTask(id, answers) {
      await submitHostedAgentTask(sb, id, answers);
      const view = await this.getAgentTask(id);
      return { ...view, status: 'done', submitted: true, canSubmit: false, answers: view.answersHidden ? null : answers };
    },
    // Matt, Nov 3 (migration 26): entity documents requested from buyers / sellers acting as an entity (person, processor, coordinator, Admin)
    async listEntityDocRequests(dealId) { return camel(ok(await sb.rpc('entity_doc_requests', { p_deal: dealId }))); },
    async saveTaskForm(id, data, { complete = false } = {}) { return ok(await sb.rpc('save_task_form', { p_task: id, p_data: data, p_complete: complete })); },
    // ---- round 2 RPCs (same names as SQL) ----
    async adminDeleteUser(id) { ok(await sb.rpc('admin_delete_user', { p_user: id })); },
    // ---- John, Nov 2 (migration 17): clients <-> salespeople. Writes go through Admin RPCs; the table is readable by Admin / Processor (all) and Sales (own links) ----
    async listClientSalesReps() { return camel(ok(await sb.from('client_sales_reps').select('client_id, sales_id, created_at').order('created_at'))); },
    async adminLinkSalesRep(clientId, salesId) { ok(await sb.rpc('admin_link_sales_rep', { p_client: clientId, p_sales: salesId })); return this.listClientSalesReps().then((r) => r.filter((l) => l.clientId === clientId)); },
    async adminUnlinkSalesRep(clientId, salesId) { ok(await sb.rpc('admin_unlink_sales_rep', { p_client: clientId, p_sales: salesId })); return this.listClientSalesReps().then((r) => r.filter((l) => l.clientId === clientId)); },
    async adminSetSalesReps(clientId, salesIds) { ok(await sb.rpc('admin_set_sales_reps', { p_client: clientId, p_sales: salesIds || [] })); return this.listClientSalesReps().then((r) => r.filter((l) => l.clientId === clientId)); },
    async publishTemplateVersion(code, patch) { return ok(await sb.rpc('publish_template_version', { p_code: code, p_title: patch.title, p_description: patch.description, p_due_days: patch.dueDays })); },
    async setTemplateAgentRoles(code, roles) { return { code, agentRoles: ok(await sb.rpc('set_template_agent_roles', { p_code: code, p_roles: roles })) }; },   // migration 9
    async sendTaskReminder() { throw new Error('CLA Portal Live Test does not send email. Nothing was queued.'); },
    async queueOverdueReminders() { throw new Error('CLA Portal Live Test does not send email. Nothing was queued.'); },
    async listOutbox() { return camel(ok(await sb.from('outbox').select('*').order('created_at', { ascending: false }))); },
    // Matt, Nov 2: my_notifications() adds the order's file number + address (blank once the person can no longer open that order)
    async listNotifications({ limit = 20 } = {}) { return camel(ok(await sb.rpc('my_notifications', { p_limit: limit }))); },
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
    async listDocuments(dealId, { folderId } = {}) { const rows = (await fileRead('docs:' + dealId, () => rawDocs(dealId))) || []; return filterListedDocuments(rows, folderId).map((d) => shapeListedDocument(d)); },   // folder filter + stored size/content flag (no extra query)
    // ---- Matt, Nov 2 (migration 16): cross-file task list + Processor / Admin task grid. task_board / task_grid are SECURITY INVOKER (RLS decides). ----
    async listAllTasks({ fileStatus = 'All' } = {}) {
      const who = ident.current();
      const run = async () => boardRows(ok(await sb.rpc('task_board', { p_file_status: fileStatus })));
      if (!who || !who.id) return run();
      return nav.share(who.id, 'task-board:' + fileStatus, run);
    },
    // FILE-FIRST combined list (John, Nov 4; migration 45): my tasks on every file I am on, each with my role on that file
    async listMyTasks({ fileStatus = 'Open' } = {}) { return boardRows(ok(await sb.rpc('my_task_list', { p_file_status: fileStatus }))).map((t) => ({ ...t, mine: true, myRoles: t.myRoles || [], myRoleLabel: fileRoleLabel(t.myRoles || []) })); },
    async getTaskGrid({ fileStatus = 'Open' } = {}) {
      const u = await me(); if (!u || !u.isAdmin) throw new Error('Only an Admin or Super admin can open the task grid.');
      const fs = fileStatus || 'Open';
      return nav.share(u.id, 'grid:' + fs, async () => {
        let q = sb.from('deals').select('id, file_number, street, city, state, zip, closing_date, status'); if (fs !== 'All') q = q.eq('status', fs);
        const [rawRows, rawDeals] = await Promise.all([sb.rpc('task_grid', { p_file_status: fs }), q]);
        const rows = boardRows(ok(rawRows));
        const deals = camel(ok(rawDeals)).map((d) => ({ ...d, address: `${d.street}, ${d.city}, ${d.state} ${d.zip}` }));
        return buildTaskGrid(rows, deals, localDate());
      }); },
    // NOTE: there is intentionally no deleteDocument anywhere.
    // ---- Matt, Oct 31, priority 2 (migration 14) ----
    async listAgreements(dealId) {
      // Francis, Nov 9: staff = account role (Processor/TC/Admin…), not "no file roles". A Processor with a
      // deal_contacts row must still see the ack status table and must not be asked to acknowledge.
      const [u, ags] = [await me(), camel(ok(await sb.from('agreements').select('*').order('code')))];
      if (!u || !u.id) throw new Error('Please sign in.');
      const mine = camel(ok(await sb.from('agreement_acks').select('*').eq('deal_id', dealId).eq('profile_id', u.id)));
      const staff = u.role !== 'Outside user' && !u.accountRole;
      const out = { agreements: withMyAcknowledgements(ags, mine), needed: !staff };
      out.pending = out.needed ? out.agreements.filter((g) => !g.myAck).length : 0;
      if (staff) { const rows = camel(ok(await sb.rpc('agreement_status', { p_deal: dealId }))) || []; const m = new Map();
        rows.forEach((r) => { const code = r.agreementCode || r.code; if (!code || !r.profileId) return; if (!m.has(r.profileId)) m.set(r.profileId, { profileId: r.profileId, name: r.name, roleLabel: '', acks: {} }); m.get(r.profileId).acks[code] = (r.acknowledgedAt || r.at) ? { at: r.acknowledgedAt || r.at } : null; });
        out.people = [...m.values()]; }
      return out;
    },
    async acknowledgeAgreement(dealId, code) { return { id: ok(await sb.rpc('acknowledge_agreement', { p_deal: dealId, p_code: code })) }; },
    async getWireInstructions(dealId) { const w = camel(ok(await sb.rpc('wire_instructions', { p_deal: dealId }))); return { ...w, amountNote: 'Your exact amount comes from your Closing Disclosure / settlement statement.' }; },
    async listClosingProposals(dealId) { return camel(ok(await sb.from('closing_proposals').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }))).map((p) => ({ ...p, at: String(p.proposedAt).slice(0, 16) })); },
    async proposeClosing(dealId, { at, location, note, officeId }) { return { id: ok(await sb.rpc('propose_closing', { p_deal: dealId, p_at: at, p_location: location, p_note: note || '', p_office: officeId || null })) }; },
    async confirmClosing(dealId, { at, location, note, proposalId, officeId } = {}) { ok(await sb.rpc('confirm_closing', { p_deal: dealId, p_at: at || null, p_location: location || null, p_note: note || '', p_proposal: proposalId || null, p_office: officeId || null })); },
    // e-sign: the RPCs stand in for the provider (esign.js DemoProvider); a DocuSign / Dropbox Sign Edge Function would call the same tables
    async requestSignature() { throw new Error('E-sign is not enabled on CLA Portal Live Test. Nothing was sent.'); },
    async listSignatureRequests(dealId) { return camel(ok(await sb.from('signature_requests').select('*, signers:signature_signers(*)').eq('deal_id', dealId).order('requested_at', { ascending: false }))); },
    async signDocument() { throw new Error('E-sign is not enabled on CLA Portal Live Test. Nothing was sent.'); },
    // SHARE WITH BUYER (John, Nov 4; migration 60): CLA staff open another party's upload to the pure Client-Buyer; documents.shared_with_client(_by/_at) are typed, reportable columns
    async shareDocumentWithClient(docId, share = true) { ok(await sb.rpc('share_document_with_client', { p_doc: docId, p_share: share !== false })); return true; },
    // SHARE WITH SELLER (seller mirror, Nov 4; migration 65): the same for the pure Client-Seller; documents.shared_with_seller(_by/_at) typed, reportable columns
    async shareDocumentWithSeller(docId, share = true) { ok(await sb.rpc('share_document_with_seller', { p_doc: docId, p_share: share !== false })); return true; },
    async cancelSignatureRequest(id) { ok(await sb.rpc('cancel_signature_request', { p_request: id })); return true; },
  };
  const NOT_ENABLED = 'This action is not enabled on CLA Portal Live Test. Nothing was sent, queued, or saved as if it had succeeded.';
  Object.assign(a, staffSupabase({ sb, ok, camel, me, api: a }));
  // Dev-only pickers stay off. E-sign candidate picking stays unwired; signing itself stays disabled below.
  for (const n of ['pickPerson', 'signInDev', 'listSignatureCandidates']) a[n] = todo(n);
  // CRM (John, Nov 2; migration 22): only when the `crm` flag is on (default OFF in supabase mode; features.js). The database has its own switch too.
  a.features = featureFlags(cfg);
  Object.assign(a, crmSupabase({ sb, ok, camel, me, flags: a.features }));
  // ACCOUNTING (John, Nov 3; migration 34): only when features.accounting === true (off by default everywhere) AND the database switch is on.
  Object.assign(a, accountingSupabase({ sb, ok, flags: a.features }));
  // PAYOFFS / HOA / FFB / GROUND RENT (John, Nov 4; migration 42): same switches as accounting, staff only
  Object.assign(a, payoffsSupabase({ sb, ok, flags: a.features, api: a }));
  // MODULE SWITCHES (John, Nov 3; migration 35): Admin-only Live switch per module; off = beta (Admins only)
  Object.assign(a, modulesSupabase({ sb, ok, me, flags: a.features }));
  Object.assign(a, roleAccessSupabase({ sb, ok, me }));   // John, Nov 9: role_module_access, read once (cached) in parallel with the module switches
  { const gma = a.getModuleAccess; a.getModuleAccess = async function (...args) { const ra = a.loadRoleAccess().catch(() => []); const m = await gma.apply(this, args); await ra; return m; }; }
  Object.assign(a, taskSwitchesSupabase({ sb, ok, me }));   // John, Nov 4 (migration 49): Task Templates > Task switches (Admin only)
  Object.assign(a, callItemsSupabase({ sb, ok, me }));   // John, Nov 3 call (migration 38): underwriter splits, agent birthdate
  Object.assign(a, agentInviteSupabase({ sb, ok, me }));   // John, Nov 4 (migration 41): agent invites (nothing sent), agent profiles, the clients' agent card
  { const { hrSessionExtras, ...hrApi } = hrSupabase({ sb, ok, me }); Object.assign(a, hrApi);   // HR workspace, Phase 1 (Nov 4, migration 47): the session carries hrRole / hrEmployeeId / hrHasReports
    const gs = a.getSession; a.getSession = async function () { const u = await gs.call(this); if (!u) return u; return { ...u, ...(await nav.share(u.id, 'hr-extras', () => hrSessionExtras())) }; };
    a.beginNavigation = async function (hint) {
      const myNav = ++navSerial;
      const stopOlder = navStops.get(openNavId);
      openNavId = myNav;
      if (stopOlder) stopOlder();
      let stopMine = () => {};
      const stopped = new Promise((resolve) => { stopMine = () => resolve(true); navStops.set(myNav, stopMine); });
      openingNav = true;
      const empty = { user: null, hr: Promise.resolve({}), demo: Promise.resolve(null), mods: Promise.resolve({}) };
      try {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (openNavId !== myNav) return empty;
          const ticket = ident.generation();
          profile.begin();
          ident.forget();
          early.clear();
          nav.clear();
          const hinted = pendingAuthId;
          const earlyProfile = hinted ? meFrom({ id: hinted }) : null;
          if (earlyProfile) earlyProfile.catch(() => {});
          const userFlight = fetchAuthUser();
          warmFile(hint);
          const raced = await Promise.race([
            userFlight.then((result) => ({ result })),
            stopped.then(() => ({ stopped: true })),
          ]);
          if (raced.stopped || openNavId !== myNav) return empty;
          const { data: { user } } = raced.result;
          if (openNavId !== myNav) return empty;
          if (ticket !== ident.generation()) { early.clear(); continue; }
          if (!user) { profile.clear(); nav.clear(); early.clear(); ident.forget(); return empty; }
          if (!early.adopt(nav, user.id, ticket, ident.generation())) {
            if (openNavId !== myNav) return empty;
            early.clear();
            continue;
          }
          const mods = a.getModuleAccess ? a.getModuleAccess().then((m) => m || {}).catch(() => ({})) : Promise.resolve({});
          const hr = nav.share(user.id, 'hr-extras', () => hrSessionExtras());
          hr.catch(() => {});
          const demo = a.demoViewStatus().catch(() => null);
          let loaded = earlyProfile && user.id === hinted ? await earlyProfile : null;
          if (openNavId !== myNav) return empty;
          if (ticket !== ident.generation()) { nav.clear(); early.clear(); ident.forget(); continue; }
          if (!loaded || loaded.id !== user.id) {
            profile.begin();
            loaded = await meFrom(user);
            if (openNavId !== myNav) return empty;
            if (ticket !== ident.generation()) { nav.clear(); early.clear(); ident.forget(); continue; }
          }
          if (openNavId !== myNav) return empty;
          if (!loaded || loaded.id !== user.id) { ident.forget(); continue; }
          const kept = ident.hold(loaded, ticket);
          if (!kept) { if (openNavId !== myNav) return empty; continue; }
          return { user: kept, hr, demo, mods };
        }
        if (openNavId === myNav) early.clear();
        return empty;
      } finally {
        navStops.delete(myNav);
        if (openNavId === myNav) { openNavId = 0; openingNav = false; }
        if (authUserFlightOwner === myNav) { authUserFlight = null; authUserFlightOwner = 0; }
      }
    }; }
  Object.assign(a, feedbackNov4Supabase({ sb, ok, me }));
  Object.assign(a, closingLocationSupabase({ sb, ok }));   // John, Nov 4 (migration 58): where each buyer / seller will be at closing
  Object.assign(a, officesSupabase({ sb, ok, me }, { listClosingProposals: a.listClosingProposals }));   // John, Nov 4 (migration 57): Admin > Offices + the closing office picker   // John + Janine, Nov 4 (migration 56): closing office default, disbursement, search columns   // John, Nov 4 (migration 41): agent invites (nothing sent), agent profiles, the clients' agent card
  Object.assign(a, automationPart(a, { runsOrders: runsOrdersCI, me }));   // Email sellers and agents: preview only, nothing sent
  Object.assign(a, tcSupabase({ sb, ok, camel, api: a }));   // John, Nov 5 (migration 71): TC contract / EMD / ALTA / all-parties thread
  Object.assign(a, emailSendersSupabase({ sb, ok, me }));
  Object.assign(a, gmailSupabase({ sb, ok, camel }));   // John, Nov 9: Gmail phase 1 (own @clatitle.com mailbox, TEST only)
  Object.assign(a, nov5Supabase({ sb, ok, camel, me }));
  Object.assign(a, orderOverviewSupabase({ sb, ok, camel, me: async () => ident.current() || me(), api: a }));
  a.readOverview = (dealId) => fileRead('overview:' + dealId, () => a.getOrderOverview(dealId));
  // Staff create and resend invite links here (nothing is emailed). Accepting a link goes through the accept-invite function, not a browser sign-up.
  Object.assign(a, staffFeedbackSupabase({ sb, ok, camel }));
  a.claRepresentationReady = true;   // deals.cla_representation exists on TEST (20261109150000)
  a.sendMessage = async ({ dealId, threadId, subject, to, bodyHtml, files } = {}) => {
    const user = await me();
    if (!user || !user.id) throw new Error('Please sign in.');
    if (viewOnly(user)) throw new Error('This sign-in cannot send messages.');
    const { text } = messageText(bodyHtml);
    const incoming = Array.isArray(files) ? files : [];
    if (!text && !incoming.length) throw new Error('Write a message first.');
    let thread = threadId || '';
    if (thread) {
      const parts = camel(ok(await sb.from('thread_participants').select('profile_id').eq('thread_id', thread))) || [];
      if (!parts.some((p) => p.profileId === user.id)) throw new Error('You are not part of this conversation.');
      const row = camel(ok(await sb.from('threads').select('deal_id').eq('id', thread).single()));
      dealId = row.dealId;
    } else {
      const allowed = (await a.listMessageRecipients(dealId)).map((p) => p.id);
      const ids = assertRecipients(to, allowed);
      const created = ok(await sb.rpc('create_thread', { p_deal: dealId, p_subject: subject || (incoming.length ? 'Shared files' : 'New conversation'), p_participants: ids, p_body: text || '(file shared)' }));
      thread = created && created.id ? created.id : created;
    }
    const names = [];
    try { names.push(...((await a.listDocuments(dealId)) || []).map((d) => d.name)); } catch (e) { /* a list the caller cannot read does not add names */ }
    const plan = planDocumentBatch(incoming, { existingNames: names });
    const savedFiles = []; const failedFiles = [...plan.rejected];
    for (const file of plan.accepted) {
      if (file.wireInstructions && user.role === 'Outside user') { failedFiles.push({ name: file.name, reason: 'Only CLA Title staff can attach wire instructions.' }); continue; }
      try {
        const saved = await a.addDocument(dealId, { name: file.name, description: file.description || '', mimeType: file.mimeType || file.type || '', size: file.size || 0, dataUrl: file.dataUrl || null, file, visibility: file.wireInstructions ? 'buyer' : (file.visibility || 'all'), docType: file.docType || '', wireInstructions: !!file.wireInstructions });
        savedFiles.push({ id: saved.id, name: saved.name || file.name }); names.push(file.name);
      } catch (e) { failedFiles.push({ name: file.name, reason: e && e.message ? e.message : 'The upload failed.' }); }
    }
    if (threadId) {
      if (!text && !savedFiles.length) throw new Error(failedFiles[0] ? failedFiles[0].reason : 'Write a message first.');
      const note = savedFiles.length ? `${text || '(file shared)'}\n\nFiles on this order: ${savedFiles.map((f) => f.name).join(', ')}` : text;
      ok(await sb.from('messages').insert({ thread_id: thread, author_id: user.id, body: note.slice(0, 4000), body_html: messageText(bodyHtml).clean || null }));
    } else if (savedFiles.length) {
      ok(await sb.from('messages').insert({ thread_id: thread, author_id: user.id, body: `Files on this order: ${savedFiles.map((f) => f.name).join(', ')}`.slice(0, 4000) }));
    }
    return { id: thread, threadId: thread, sent: false, emailed: false, deliveredInPortal: true, status: 'in_portal', savedFiles, failedFiles };
  };
  a.getThreadDetail = async (id) => {
    const user = await me();
    const t = await a.getThread(id);
    const parts = camel(ok(await sb.from('thread_participants').select('profile_id').eq('thread_id', id))) || [];
    const ids = parts.map((p) => p.profileId).filter(Boolean);
    if (user && !ids.includes(user.id)) throw new Error('You are not part of this conversation.');
    const profiles = ids.length ? camel(ok(await sb.from('profiles').select('id, first_name, last_name, role').in('id', ids))) || [] : [];
    const who = (pid) => profiles.find((p) => p.id === pid);
    return { ...t, participantIds: ids, participants: ids.map((pid) => { const p = who(pid); return { id: pid, name: p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : 'Participant', role: p ? p.role : '', wireOk: true }; }),
      messages: (t.messages || []).map((m) => ({ ...m, authorName: (who(m.authorId) && `${who(m.authorId).firstName || ''} ${who(m.authorId).lastName || ''}`.trim()) || 'Participant', mine: !!(user && m.authorId === user.id), body: m.body || '', attachments: m.attachments || [] })) };
  };
  a.previewCrmImport = async () => { throw new Error('External CRM import is not authorized on this test portal. Nothing was imported.'); };
  a.runCrmImport = async () => { throw new Error('External CRM import is not authorized on this test portal. Nothing was imported.'); };
  a.cancelSignatureRequest = async () => { throw new Error(NOT_ENABLED); };
  const shareRead = (name) => {
    const orig = a[name] && a[name].bind(a);
    if (!orig) return;
    a[name] = (id, ...rest) => (rest.length || id == null ? orig(id, ...rest) : fileRead(name + ':' + id, () => orig(id)));
  };
  ['listThreads', 'listActivity', 'listDealFolders', 'listSignatureRequests', 'listEntityDocRequests'].forEach(shareRead);
  function warmFile(hint) {
    if (!hint || !hint.dealId || hint.gated) return;
    const id = hint.dealId;
    const tab = hint.tab || 'overview';
    if (tab === 'overview') {
      fileRead('deal:' + id, () => fetchDeal(id));
      fileRead('taskrows:' + id, () => fetchHostedTaskRows(sb, id));
      fileRead('docs:' + id, () => rawDocs(id));
      if (a.listThreads) a.listThreads(id).catch(() => null);
      if (a.listActivity) a.listActivity(id).catch(() => null);
      if (a.readOverview) a.readOverview(id).catch(() => null);
      return;
    }
    fileRead('shell:' + id, () => fetchFileShell(id));
    if (tab === 'tasks') fileRead('taskrows:' + id, () => fetchHostedTaskRows(sb, id));
    if (tab === 'documents') {
      fileRead('docs:' + id, () => rawDocs(id));
      if (a.listDealFolders) a.listDealFolders(id).catch(() => null);
      if (a.listSignatureRequests) a.listSignatureRequests(id).catch(() => null);
      if (a.listEntityDocRequests) a.listEntityDocRequests(id).catch(() => null);
    }
  }
  return a;
}
