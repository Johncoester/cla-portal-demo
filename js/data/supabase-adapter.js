/* [SUPABASE] Skeleton of the real adapter. NOT connected to any project and NOT tested against one.
 * Implemented: sign-in/out/session and a few reads/writes to show the pattern (RLS in supabase/migrations does the access control).
 * Everything else throws "not implemented yet" and is the next piece of work (see docs/PLAN.md). Method names match mock-adapter.js. */
import { buildTaskGrid, groupOfRole } from './task-board.js?v=202611140100';
import { localDate, fileRoleLabel, moneyAmount, viewOnly } from './constants.js?v=202611101015';
import { officeDate } from './office-date.js?v=202611102100';
import { clientActivityFrom } from './client-activity.js?v=202611102100';
import { assertRecipients, messageText } from './portal-message.js?v=202611101015';
import { planDocumentBatch } from './document-batch.js?v=202611101015';
import { featureFlags } from './features.js?v=202611070139';
import { accountingSupabase } from './supabase-accounting.js?v=202611141000';
import { payoffsSupabase } from './supabase-payoffs.js?v=202611070139';
import { titleSupabase } from './supabase-title.js?v=202611112200';
import { policySupabase } from './supabase-policy.js?v=202611112100';
import { fundingSupabase } from './supabase-funding.js?v=202611131900';
import { postClosingSupabase } from './supabase-postclosing.js?v=202611111900';
import { wiresSupabase } from './supabase-wires.js?v=202611111800';
import { modulesSupabase } from './supabase-modules.js?v=202611101015';
import { roleAccessSupabase } from './supabase-role-access.js?v=202611100100';   // John, Nov 9: Admin > Role access
import { taskSwitchesSupabase } from './supabase-task-switches.js?v=202611141400';
import { callItemsSupabase } from './supabase-callitems.js?v=202611101015';
import { automationPart } from './automation.js?v=202611101015';
import { runsOrders as runsOrdersCI } from './constants.js?v=202611101015';
import { crmSupabase } from './supabase-crm.js?v=202611141100';
import { hrSupabase } from './supabase-hr.js?v=202611100130';
import { feedbackNov4Supabase } from './supabase-feedback-nov4.js?v=202611130900';
import { officesSupabase } from './supabase-offices.js?v=202611101015';
import { closingLocationSupabase } from './supabase-closing-location.js?v=202611120500';
import { tcSupabase } from './supabase-tc.js?v=202611140800';
import { emailSendersSupabase } from './supabase-email-senders.js?v=202611101015';
import { gmailSupabase } from './supabase-gmail.js?v=202611140900';
import { nov5Supabase } from './supabase-nov5.js?v=202611141400';
import { orderOverviewSupabase, profileReadAllowed } from './supabase-order-overview.js?v=202611141400';
import { agentInviteSupabase } from './supabase-agent-invite.js?v=202611140100';
import { staffSupabase } from './supabase-staff.js?v=202611141400';
import { staffFeedbackSupabase } from './supabase-staff-feedback.js?v=202611080400';
import { withoutHiddenProfiles, PROCESSOR_PICK_ROLES } from './place-order.js?v=202611092320';
import { CLOSER_STAFF_ROLES } from './closer.js?v=202611101015';
import { coordinatorRoster, duplicateOrders } from './order-duplicates.js?v=202611101700';
import { processorFields, missingProcessorIds, nameOfProfile } from './processor-assign.js?v=202611091600';
import { propertyAddressOf } from './nov5-rules.js?v=202611131900';
import { HOSTED_TASK_COLUMNS, fetchHostedTask, fetchHostedTaskRows, mapHostedTaskList, viewerOnFile } from './task-actions.js?v=202611141400';
import { fetchDashboard, indexDashboardExtras, decorateDashboardDeals, shapeDashboardTask } from './dashboard-load.js?v=202611140700';
import { readHostedAgentTask, submitHostedAgentTask, hostedAgentTaskView } from './agent-task-host.js?v=202611091050';
import { contactInsertRow } from './contact-insert.js?v=202611101200';
import { assertContactSaved, contactSaveMiss, duplicatePartyMessage, sameParty } from './contact-save.js?v=202611101130';
import { lenderExtras, lenderColumnsTouched, lenderColumnWrite, lossPayeeSuggestions, cleanLenderRole } from './lender-file.js?v=202611101200';
import { fileTitleOf } from './party-name.js?v=202611102000';
import { parcelInput } from './parcels.js?v=202611141400';
import { earnestDealPatch, earnestTouched } from './earnest-commission.js?v=202611141000';
import { cleanParcel } from './address-fill.js?v=202611141400';
import { earnestDealPatch, earnestTouched } from './earnest-commission.js?v=202611141000';
import { claRepresentationCode, claRepresentationLabel } from './cla-representation.js?v=202611090950';
import { withMyAcknowledgements } from './agreement-link.js?v=202611091030';
import { filterListedDocuments, shapeListedDocument } from './document-list.js?v=202611091030';
import { authEventAction, carriedReads, gatherReads, identitySlot, mapLimit, navigationReads, profileFlight, speculativeReads } from './read-batch.js?v=202611111200';
const SB = 'https://esm.sh/@supabase/supabase-js@2.45.4';   // pinned. Used only after John confirms the login switch on CLA Portal Live Test.
const todo = (n) => async () => { throw new Error('Supabase adapter: ' + n + ' is not implemented yet.'); };
// These stay reachable with no user session. Everything else under /rest/v1/ is skipped after sign-out,
// because the publishable key is not a JWT and PostgREST answers 401.
const PUBLIC_REST = /\/rest\/v1\/rpc\/(portal_invite_lookup|agent_invite_lookup|hr_invite_lookup|scheduling_get|scheduling_respond)(?:\?|$)/;
export function shouldQuietRest(url, signedOut) {
  const u = String(url || '');
  if (!signedOut || !u.includes('/rest/v1/') || PUBLIC_REST.test(u)) return false;
  return true;
}
export function quietRestResponse(url) {
  const rpc = String(url || '').includes('/rest/v1/rpc/');
  return new Response(rpc ? 'null' : '[]', { status: 200, headers: { 'content-type': 'application/json' } });
}

export async function createSupabaseAdapter(cfg) {
  if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('Supabase mode needs a project URL and a publishable key. There is no mock fallback.');
  if (typeof localStorage !== 'undefined') { try { localStorage.removeItem('cla-portal-new:data:v30'); } catch (e) { /* a browser that blocks storage still must not load fixtures */ } }
  const { createClient } = await import(SB);
  let signedOut = false;
  const sb = createClient(cfg.url, cfg.anonKey, {
    global: {
      fetch(input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (shouldQuietRest(url, signedOut)) return Promise.resolve(quietRestResponse(url));
        return fetch(input, init);
      },
    },
  });
  const ident = identitySlot();
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const camel = (o) => Array.isArray(o) ? o.map(camel) : o && typeof o === 'object'
    ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), camel(v)])) : o;
  // per-file roles (migration 10) + self-representation (migration 11): my role(s) on each order I can see. role = primary (agent first),
  // roles = all I hold there, label = 'Buyer + Buyer's Agent' for an agent buying for themselves. Outside users get the roles/labels across files.
  const loadFileRoles = async () => new Map((ok(await sb.rpc('my_file_roles_full')) || []).map((r) => [r.deal_id, r]));
  const fileRoles = () => sessionCache('roles', loadFileRoles);
  const ORDER = ['Buyer Agent', 'Listing Agent', "Buyer + Buyer's Agent", 'Seller + Listing Agent', 'Client-Buyer', 'Client-Seller'];
  const sorted = (xs) => [...new Set(xs)].filter((r) => ORDER.includes(r)).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  // staff only (RPC returns nothing to outside users): "Agent is a party" badge = a client who is also their side's agent on the order
  const loadParties = async () => { const m = new Map(); (ok(await sb.rpc('agent_parties')) || []).forEach((r) => { if (!m.has(r.deal_id)) m.set(r.deal_id, []); m.get(r.deal_id).push({ contactId: r.contact_id, name: r.name, label: r.label }); }); return m; };
  const parties = () => sessionCache('parties', loadParties);
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
      procNames = Promise.resolve().then(async () => {
        if (!(await profileReadAllowed(sb))) return { data: [], error: null };
        return sb.from('profiles').select('id, first_name, last_name').in('role', PROCESSOR_PICK_ROLES);
      }).then((r) => { if (r.error) { procNames = null; return new Map(); } return new Map((r.data || []).map((p) => [p.id, nameOfProfile(p)])); }, () => { procNames = null; return new Map(); });
    }
    return procNames;
  };
  const withProcessorNames = async (deals, names) => {
    const miss = missingProcessorIds(deals, names);
    if (miss.length && await profileReadAllowed(sb)) { try { const r = await sb.from('profiles').select('id, first_name, last_name').in('id', miss); (r.data || []).forEach((p) => names.set(p.id, nameOfProfile(p))); } catch (e) { /* names stay blank */ } }
    return names;
  };
  const types = async (ids) => new Map(ids.length ? (ok(await sb.rpc('contact_types', { p_ids: [...new Set(ids)] })) || []).map((r) => [r.contact_id, r.contact_type]) : []);
  const withRole = (d, r, pm) => ({ ...d, myRole: r && r.role, myRoles: (r && r.roles) || [], myRoleLabel: r && r.label, selfRep: !!(r && r.self_rep), agentParties: pm.get(d.id) || [] });
  const profile = profileFlight();
  const nav = navigationReads();
  let fileGen = 0;
  const shareReads = nav.share.bind(nav);
  const storedKey = (key) => {
    const k = String(key);
    if (k.includes('#')) return k;
    if (k.startsWith('deal:') || k.startsWith('shell:') || k.startsWith('overview:')) return k + '#' + fileGen;
    return k;
  };
  nav.share = (id, key, fn) => shareReads(id, storedKey(key), fn);
  const dropFileReads = () => { fileGen += 1; sessionBox.clear(); };
  const early = speculativeReads();
  // speed (Nov 9): one order's reads carried across navigations for 30s, so a tab switch inside the same order reuses them.
  // Same person only. Any write (wrapper at the end), a real sign-out, or another person drops them. Keys carry storedKey's
  // generation, so dropFileReads() also retires carried order reads.
  const carry = carriedReads({ ttlMs: 30000 });
  const CARRY_KEY = /^(deal|shell|taskrows|docs|overview|listDealFolders|listSignatureRequests|listEntityDocRequests):/;
  let openingNav = false;
  let navSerial = 0;
  let openNavId = 0;
  let authUserFlight = null;
  let authUserFlightOwner = 0;
  let lastGoodUser = null;
  let lastHeld = null;
  const navStops = new Map();
  const AUTH_TRIES = 2;
  const AUTH_BACKOFF_MS = 200;
  const authStatus = (error) => Number(error && (error.status || error.statusCode) || 0);
  const authMessage = (error) => String(error && error.message || error || '');
  // A dropped connection is not a sign-out. 401/403 is. SIGNED_OUT is handled in onAuthStateChange.
  const authRejected = (error) => { const status = authStatus(error); return status === 401 || status === 403; };
  const transientAuthFailure = (error) => {
    if (!error || authRejected(error)) return false;
    const status = authStatus(error);
    if (status >= 500) return true;
    return /failed to fetch|network|timeout|load failed|econnreset|authretryablefetcherror/i.test(authMessage(error));
  };
  async function readAuthUser() {
    let lastError = null;
    for (let attempt = 0; attempt < AUTH_TRIES; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, AUTH_BACKOFF_MS));
      let res;
      try { res = await sb.auth.getUser(); }
      catch (error) {
        lastError = error;
        if (authRejected(error)) return { data: { user: null }, signedOut: true };
        if (transientAuthFailure(error) && attempt + 1 < AUTH_TRIES) continue;
        if (transientAuthFailure(error) && lastGoodUser) return { data: { user: lastGoodUser }, signedOut: false, cached: true };
        throw error;
      }
      const user = res && res.data && res.data.user || null;
      const error = res && res.error || null;
      if (user && user.id) return { data: { user }, signedOut: false };
      if (authRejected(error)) return { data: { user: null }, signedOut: true };
      if (error && transientAuthFailure(error)) {
        lastError = error;
        if (attempt + 1 < AUTH_TRIES) continue;
        if (lastGoodUser) return { data: { user: lastGoodUser }, signedOut: false, cached: true };
        throw error;
      }
      if (lastGoodUser) return { data: { user: lastGoodUser }, signedOut: false, cached: true };
      return { data: { user: null }, signedOut: true };
    }
    if (lastError && transientAuthFailure(lastError) && lastGoodUser) return { data: { user: lastGoodUser }, signedOut: false, cached: true };
    if (lastError) throw lastError;
    return { data: { user: null }, signedOut: true };
  }
  function fetchAuthUser() {
    const owner = openNavId;
    if (owner && authUserFlight && authUserFlightOwner === owner) return authUserFlight;
    const flight = readAuthUser();
    if (!owner) { flight.catch(() => {}); return flight; }
    authUserFlight = flight;
    authUserFlightOwner = owner;
    flight.catch(() => { if (authUserFlight === flight) { authUserFlight = null; authUserFlightOwner = 0; } });
    return flight;
  }
  let sessionUser = '';
  const sessionBox = new Map();
  function clearSessionCache() { sessionBox.clear(); sessionUser = ''; }
  // Survives tab changes. A new sign-in, or a write that bumps fileGen, reads again.
  function sessionCache(key, load) {
    const id = nav.userId() || pendingAuthId || (ident.current() && ident.current().id) || '';
    if (!id) return Promise.resolve().then(load);
    if (id !== sessionUser) { sessionBox.clear(); sessionUser = id; }
    const full = id + '#' + fileGen + ':' + key;
    let hit = sessionBox.get(full);
    if (!hit) {
      hit = Promise.resolve().then(load);
      sessionBox.set(full, hit);
      hit.catch(() => { if (sessionBox.get(full) === hit) sessionBox.delete(full); });
    }
    return hit;
  }
  function dropAuth() {
    ident.invalidate();
    clearSessionCache();
    procNames = null;
    authUserFlight = null;
    authUserFlightOwner = 0;
    lastGoodUser = null;
    lastHeld = null;
    profile.clear();
    nav.clear();
    early.clear();
    carry.clear();
  }
  function remember(person) {
    if (!person || !person.id) return person;
    lastHeld = person;
    lastGoodUser = { id: person.id, email: person.email || '' };
    return person;
  }
  function confirmedSignOut() {
    clearSessionCache();
    lastGoodUser = null;
    lastHeld = null;
    profile.clear();
    nav.clear();
    early.clear();
    carry.clear();
    ident.forget();
  }
  let pendingAuthId = '';
  sb.auth.onAuthStateChange((event, session) => {
    const token = session && session.access_token || '';
    if (token) signedOut = false;
    else if (event === 'SIGNED_OUT') signedOut = true;
    const nextId = session && session.user && session.user.id || '';
    const held = ident.current();
    const action = authEventAction(event, nextId, held && held.id || '', nav.userId(), pendingAuthId);
    if (event === 'SIGNED_OUT') pendingAuthId = '';
    else if (nextId) pendingAuthId = nextId;
    if (action === 'drop') dropAuth();
    if (event === 'PASSWORD_RECOVERY') { try { sessionStorage.setItem('cla-portal-recovery', '1'); } catch (e) { /* the reset screen also checks the flag */ } if (!/recovery/.test(location.hash)) location.hash = '#/login'; }
  });
  const fileRead = (key, fn) => {
    const who = nav.userId() || pendingAuthId || '';
    const k = storedKey(key);
    if (!CARRY_KEY.test(k)) return early.read(who, k, fn, nav);
    const held = carry.get(who, k);
    if (held) return early.read(who, k, () => held, nav);
    const read = early.read(who, k, fn, nav);
    carry.keep(who, k, read);
    return read;
  };
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
      const auth = await fetchAuthUser();
      const user = auth && auth.data && auth.data.user;
      if (ticket !== ident.generation() || openNavId !== navAt) continue;
      if (auth && auth.signedOut) { if (ticket === ident.generation() && openNavId === navAt) confirmedSignOut(); return null; }
      if (!user) {
        if (lastHeld && lastHeld.id) return lastHeld;
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
      const kept = ident.hold(loaded, ticket);
      if (kept) return remember(kept);
      return kept;
    }
    return lastHeld && lastHeld.id ? lastHeld : null;
  };
  function attachScheduled(d) {
    if (!d || (!d.scheduledAt && !d.scheduledLocation)) return d;
    const at = d.scheduledAt ? String(d.scheduledAt).replace(' ', 'T').slice(0, 16) : '';
    d.scheduledClosing = { at, location: d.scheduledLocation || '', officeId: d.scheduledOfficeId || null, officeName: '', note: d.scheduledNote || '', confirmedByRole: d.scheduledByRole || '', confirmedAt: d.scheduledConfirmedAt || null };
    return d;
  }
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
    d.fileTitle = fileTitleOf(d.participants) || d.fileTitle || '';
    const src = got.source[0]; d.sourceOfBusiness = src ? src.value : ''; d.sourceOfBusinessLabel = src ? src.label : '';
    attachScheduled(d);
    // Who CLA represents (deals.cla_representation, migration 20261109150000): shown to CLA staff only; null = not recorded
    if (ident.current() && ident.current().role === 'Outside user') { d.claRepresentation = null; d.claRepresentationLabel = ''; d.closerName = ''; d.closerProfileId = null; } else { d.claRepresentation = d.claRepresentation || null; d.claRepresentationLabel = claRepresentationLabel(d.claRepresentation); d.closerName = d.closerName || ''; d.closerProfileId = d.closerProfileId || null; }
    return withRole(d, got.roles.get(d.id), got.parties);
  }
  async function fetchFileShell(id) {
    const [raw, names] = await Promise.all([sb.from('deals').select('*').eq('id', id).single(), processorNames()]);
    const row = camel(ok(raw));
    Object.assign(row, processorFields(row, names)); row.tcUserId = row.tcUserId || null; row.tcName = row.tcUserId ? (names.get(row.tcUserId) || '') : '';
    row.address = `${row.street}, ${row.city}, ${row.state} ${row.zip}`;
    attachScheduled(row);
    row.participants = [];
    row.salesPeople = [];
    row.salesPersonIds = [];
    row.county = row.county || '';
    row.fileTitle = '';
    row.sourceOfBusiness = '';
    row.sourceOfBusinessLabel = '';
    if (ident.current() && ident.current().role === 'Outside user') {
      row.closerName = ''; row.closerProfileId = null;
      const roles = await fileRoles();
      return withRole(row, roles.get(row.id), new Map());
    }
    row.closerName = row.closerName || ''; row.closerProfileId = row.closerProfileId || null;
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
      const auth = await readAuthUser(); const user = auth && auth.data && auth.data.user; if (auth && auth.signedOut || !user) throw new Error('Please sign in.');
      if (Object.keys(row).length) ok(await sb.from('profiles').update(row).eq('id', user.id));
      profile.begin(); ident.forget(); return me();
    },
    async getSession() {
      const ticket = ident.generation();
      const navAt = openNavId;
      const auth = await fetchAuthUser();
      const user = auth && auth.data && auth.data.user;
      if (ticket !== ident.generation() || openNavId !== navAt) return null;
      if (auth && auth.signedOut) { confirmedSignOut(); return null; }
      if (!user) return lastHeld && lastHeld.id ? lastHeld : null;
      const cached = ident.current();
      if (cached && cached.id === user.id && nav.userId() === user.id) return cached;
      if (ticket !== ident.generation() || openNavId !== navAt) return null;
      profile.begin();
      if (!openingNav && !early.adopt(nav, user.id, ticket, ident.generation())) return null;
      const loaded = await meFrom(user);
      if (ticket !== ident.generation() || openNavId !== navAt || !loaded || loaded.id !== user.id) return lastHeld && lastHeld.id === (user && user.id) ? lastHeld : null;
      const kept = ident.hold(loaded, ticket);
      if (kept) return remember(kept);
      return lastHeld && lastHeld.id === user.id ? lastHeld : null;
    },
    authGeneration() { return ident.generation(); },
    async signOut() { signedOut = true; dropAuth(); await sb.auth.signOut(); },
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
    async loadDashboard(opts = {}) {
      const raw = await fetchDashboard(sb, opts);
      const extra = indexDashboardExtras(raw);
      let taskRows = (raw.taskRows || []).map(shapeDashboardTask);
      let u = ident.current() || await me();
      if ((!u || !u.id) && lastHeld && lastHeld.id) u = lastHeld;
      const staff = !!(u && (u.isAdmin || runsOrdersCI(u)));
      if (!staff && taskRows.length) {
        const ids = [...new Set(taskRows.map((t) => t.dealId).filter(Boolean))];
        const onFile = new Map(await Promise.all(ids.map(async (id) => [id, await viewerOnFile(sb, id, u)])));
        taskRows = taskRows.map((t) => {
          const f = onFile.get(t.dealId) || { participantIds: [], roles: [] };
          const shaped = mapHostedTaskList([{ ...t, deal_id: t.dealId }], u, [], { myParticipantIds: f.participantIds, fileRoles: f.roles })[0];
          return { ...shaped, deal: t.deal, dealId: t.dealId };
        });
      } else if (u) {
        taskRows = taskRows.map((t) => ({ ...mapHostedTaskList([t], u, [], {})[0], deal: t.deal, dealId: t.dealId }));
      }
      const today = new Date().toISOString().slice(0, 10);
      taskRows.forEach((t) => { t.overdue = !!(t.dueDate && t.dueDate < today && ['todo', 'in_progress', 'blocked'].includes(t.status)); });
      const openRows = decorateDashboardDeals(raw.openRows, extra, taskRows);
      const otherRows = decorateDashboardDeals(raw.otherRows, extra, taskRows);
      return { openRows, openTotal: raw.openTotal, otherRows, otherTotal: raw.otherTotal, closedTotal: raw.closedTotal, tasks: taskRows, taskTotal: raw.taskTotal, limit: opts.openLimit };
    },
    // participants come from deal_contacts() (migration 13): the other side's agent/client keep their names but phone/email are blank for outside users
    async getDeal(id) { return fetchDeal(id); },
    async readDeal(id) { return fileRead('deal:' + id, () => fetchDeal(id)); },
    async readFileShell(id) { return fileRead('shell:' + id, () => fetchFileShell(id)); },
    // John, Nov 2 (migration 19): several salespeople per order; the Processor and Admins add/remove them (RPCs check the role + file access)
    async listPreprocessors() { return camel(ok(await sb.from('profiles').select('id, first_name, last_name, role, status').eq('role', 'Preprocessor').eq('status', 'active').order('first_name'))); },
    async listActiveStaff() {
      const u = await me();
      const rows = camel(ok(await sb.from('profiles').select('id, first_name, last_name, role, status, is_demo').in('role', CLOSER_STAFF_ROLES).eq('status', 'active').order('last_name').order('first_name'))) || [];
      return rows.filter((p) => !!p.isDemo === !!(u && u.isDemo)).map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, role: p.role, status: 'active' }));
    },
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
      if (!String(input.county || '').trim()) { const { autoCounty } = await import('./county-auto.js?v=202611131900'); input = { ...input, county: (await autoCounty(input)).county }; }   // live40: county from the ZIP when left blank (no schema change)
      const { data: { user } } = await sb.auth.getUser();
      const row = { street: input.street, city: input.city, state: String(input.state || '').toUpperCase(), zip: input.zip || '', county: String(input.county || '').trim(), transaction_type: input.transactionType || 'Purchase',
        open_date: input.openDate || officeDate(), closing_date: input.closingDate || null, purchase_price: refi ? null : moneyAmount(input.purchasePrice), loan_amount: moneyAmount(input.loanAmount),
        emd_amount: refi ? null : moneyAmount(input.emdAmount), emd_due_date: refi ? null : input.emdDueDate || null, notes: input.notes || '', processor_id: input.processorId || null, preprocessor_user_id: input.preprocessorUserId || null, created_by: user.id,
        lender_name: input.lenderName || '', lender_contact: input.lenderContact || '', lender_phone: input.lenderPhone || '', lender_email: String(input.lenderEmail || '').trim().toLowerCase(), loss_payee_name: input.lossPayeeName || '',
        primary_residence: refi || String(input.state || '').toUpperCase() !== 'MD' ? '' : String(input.primaryResidence || ''), first_time_buyer: refi || String(input.state || '').toUpperCase() !== 'MD' ? '' : String(input.firstTimeBuyer || '') };   // Maryland purchases only (John, Nov 6)
      if (input.tcUserId) row.tc_user_id = input.tcUserId;   // John, Nov 9: blank = the database auto-assigns (a TC who opens it, else the agents' team TC)
      if (String(input.closerName || '').trim() || input.closerProfileId) { row.closer_name = String(input.closerName || ''); row.closer_profile_id = input.closerProfileId || null; }
      if (input.closingTime) row.closing_time = String(input.closingTime);
      if (input.claRepresentation !== undefined) row.cla_representation = claRepresentationCode(input.claRepresentation);   // Both / Buyer only / Seller only; absent = not recorded
      const wrote = lenderColumnWrite(input); if (wrote) { row.lender_address = wrote.lenderAddress; row.cpl_address = wrote.cplAddress; row.cpl_same_as_lender = wrote.cplSameAsLender; row.mortgage_broker_name = wrote.mortgageBrokerName; }
      if (input.parcelId !== undefined || input.parcelIds !== undefined) { const parcels = parcelInput(input); row.parcel_id = parcels.parcelId || null; row.parcel_ids = parcels.parcelIds; }
      const earnest = earnestDealPatch(input, { refinance: refi }); if (Object.keys(earnest.financial).length) row.financial = earnest.financial;
      const d = camel(ok(await sb.from('deals').insert(row).select().single()));
      if (String(input.sourceOfBusiness || '').trim()) ok(await sb.rpc('set_deal_source', { p_deal: d.id, p_source: input.sourceOfBusiness }));   // migration 31 (staff-only table)
      const ids = [].concat(input.salesIds || []).filter(Boolean); if (ids.length) ok(await sb.rpc('set_deal_sales_people', { p_deal: d.id, p_sales: ids }));
      return { ...d, address: `${d.street}, ${d.city}, ${d.state} ${d.zip}` }; },
    async updateDeal(id, patch) {
      const map = { street: 'street', city: 'city', state: 'state', zip: 'zip', county: 'county', openDate: 'open_date', closingDate: 'closing_date', purchasePrice: 'purchase_price', loanAmount: 'loan_amount',
        emdAmount: 'emd_amount', emdDueDate: 'emd_due_date', lenderName: 'lender_name', lenderContact: 'lender_contact', lenderEmail: 'lender_email', lenderPhone: 'lender_phone', lossPayeeName: 'loss_payee_name', notes: 'notes', processorId: 'processor_id', preprocessorUserId: 'preprocessor_user_id', tcUserId: 'tc_user_id', primaryResidence: 'primary_residence', firstTimeBuyer: 'first_time_buyer', closerName: 'closer_name', closerProfileId: 'closer_profile_id', closingTime: 'closing_time',
        buyerSignStatus: 'buyer_sign_status', sellerSignStatus: 'seller_sign_status', buyerSignedOn: 'buyer_signed_on', sellerSignedOn: 'seller_signed_on', buyerPlaceKind: 'buyer_place_kind', sellerPlaceKind: 'seller_place_kind', buyerOfficeId: 'buyer_office_id', sellerOfficeId: 'seller_office_id', buyerSigningDate: 'buyer_signing_date', sellerSigningDate: 'seller_signing_date', buyerSigningTime: 'buyer_signing_time', sellerSigningTime: 'seller_signing_time', buyerManualStreet: 'buyer_manual_street', buyerManualCity: 'buyer_manual_city', buyerManualState: 'buyer_manual_state', buyerManualZip: 'buyer_manual_zip', sellerManualStreet: 'seller_manual_street', sellerManualCity: 'seller_manual_city', sellerManualState: 'seller_manual_state', sellerManualZip: 'seller_manual_zip', closingManualStreet: 'closing_manual_street', closingManualCity: 'closing_manual_city', closingManualState: 'closing_manual_state', closingManualZip: 'closing_manual_zip' };
      const money = new Set(['purchase_price', 'loan_amount', 'emd_amount']); const dates = new Set(['open_date', 'closing_date', 'emd_due_date']); const row = {};
      for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) { const v = patch[k];
        row[col] = money.has(col) ? moneyAmount(v) : dates.has(col) || col === 'processor_id' || col === 'preprocessor_user_id' || col === 'tc_user_id' || col === 'closer_profile_id' ? (v || null) : v; }
      if (row.open_date === null) delete row.open_date;
      if (row.closing_time != null) { const t = String(row.closing_time).trim(); if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('Enter a time as HH:MM, or clear it.'); row.closing_time = t; }
      if (patch.claRepresentation !== undefined) row.cla_representation = claRepresentationCode(patch.claRepresentation);   // '' = not recorded (null)
      if (patch.parcelId !== undefined || patch.parcelIds !== undefined) { const parcels = parcelInput(patch); row.parcel_id = parcels.parcelId || null; row.parcel_ids = parcels.parcelIds; }
      if (earnestTouched(patch)) { const earnest = earnestDealPatch(patch, { refinance: false }); row.financial = earnest.financial; }
      if (lenderColumnsTouched(patch)) { const x = lenderExtras(patch);
        if (patch.lenderAddress !== undefined) row.lender_address = x.lenderAddress;
        if (patch.cplAddress !== undefined || patch.cplSameAsLender !== undefined) row.cpl_address = x.cplAddress;
        if (patch.cplSameAsLender !== undefined) row.cpl_same_as_lender = x.cplSameAsLender;
        if (patch.mortgageBrokerName !== undefined) row.mortgage_broker_name = x.mortgageBrokerName; }
      if (patch.state !== undefined && String(patch.state || '').toUpperCase() !== 'MD') { row.primary_residence = ''; row.first_time_buyer = ''; }
      if (patch.lenderHistory !== undefined) row.lender_history = Array.isArray(patch.lenderHistory) ? patch.lenderHistory.slice(0, 20) : [];
      if (Object.keys(row).length) ok(await sb.from('deals').update(row).eq('id', id));
      if (patch.sourceOfBusiness !== undefined) ok(await sb.rpc('set_deal_source', { p_deal: id, p_source: patch.sourceOfBusiness || '' }));
      if (patch.salesIds !== undefined) ok(await sb.rpc('set_deal_sales_people', { p_deal: id, p_sales: [].concat(patch.salesIds || []) }));
      return a.getDeal(id); },
    // contacts: unique email (contacts_email_uq); a new contact has no login and no invite is sent
    async createContact(input) { return camel(ok(await sb.from('contacts').insert(contactInsertRow(input)).select().single())); },
    async updateContact(id, patch) {
      if (!id) throw new Error('This contact was not saved. Nothing was changed.');
      const row = {};
      for (const [k, col] of [['firstName', 'first_name'], ['lastName', 'last_name'], ['email', 'email'], ['phone', 'phone'], ['company', 'company'], ['contactType', 'contact_type']]) {
        if (!patch || patch[k] === undefined) continue;
        row[col] = k === 'contactType' ? (patch[k] || null) : k === 'email' ? String(patch[k] || '').trim().toLowerCase() : patch[k];
      }
      if (patch && patch.lenderRole !== undefined) row.lender_role = cleanLenderRole(patch.lenderRole, patch.contactType || 'lender');
      if (!Object.keys(row).length) throw new Error('Nothing to save on this contact.');
      let saved;
      try { saved = camel(ok(await sb.from('contacts').update(row).eq('id', id).select().single())); }
      catch (e) { throw contactSaveMiss(e); }
      if (!saved || !saved.id) throw new Error('This contact was not saved. Nothing was changed.');
      assertContactSaved(patch, saved);
      dropFileReads();
      return saved;
    },
    async listLossPayeeClauses(lenderName) {
      const name = String(lenderName || '').replace(/[%_,]/g, '').trim();
      if (!name) return [];
      const rows = camel(ok(await sb.from('deals').select('lender_name, loss_payee_name, open_date').ilike('lender_name', name))) || [];
      return lossPayeeSuggestions(rows, lenderName);
    },
    // participants: the triggers (migrations 10, 11, 20) enforce outside-user roles, self-representation pairs and "TC = Transaction Coordinator accounts only"
    // Matt, Nov 3b: opts.entity = { name, type, repName, repTitle, repPhone, repEmail } on a buyer / seller row (set_participant_entity, migration 31)
    async addParticipant(dealId, contactId, role, opts = {}) {
      const contact = camel(ok(await sb.from('contacts').select('id, first_name, last_name, email, company').eq('id', contactId).maybeSingle()));
      if (!contact) throw new Error('Contact not found.');
      const onFile = (ok(await sb.rpc('deal_contacts', { p_deal: dealId })) || []).map((r) => ({ role: r.role, contactId: r.contact_id, contact: { id: r.contact_id, firstName: r.first_name, lastName: r.last_name, email: r.email, company: r.company } }));
      if (sameParty(onFile, contact, role)) throw new Error(duplicatePartyMessage(contact, role));
      const p = ok(await sb.from('deal_participants').insert({ deal_id: dealId, contact_id: contactId, role }).select('id').single());
      if (opts && opts.entity) ok(await sb.rpc('set_participant_entity', { p_participant: p.id, p_entity: opts.entity }));
      dropFileReads();
      return { ok: true, id: p.id };
    },
    async setParticipantEntity(dealId, participantId, entity) { return ok(await sb.rpc('set_participant_entity', { p_participant: participantId, p_entity: entity || null })); },
    async listSourceOptions() { return ok(await sb.rpc('source_of_business_options')) || []; },
    async listCoordinators() {
      const u = await me();
      const fromRpc = (ok(await sb.rpc('coordinator_choices')) || []).map((r) => camel(r));
      let profiles = [];
      try {
        profiles = camel(ok(await sb.from('profiles').select('id, first_name, last_name, email, phone, is_demo, role, status').eq('role', 'Transaction Coordinator').eq('status', 'active'))) || [];
      } catch (e) {
        const visible = new Set((camel(ok(await sb.from('profiles').select('id'))) || []).map((p) => p.id));
        return fromRpc.filter((r) => r.contactId && visible.has(r.profileId));
      }
      const known = fromRpc.filter((r) => r.profileId && r.contactId).map((r) => ({ id: r.contactId, profileId: r.profileId, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone, company: r.company }));
      const plan = coordinatorRoster(profiles, known, u);
      return plan.rows.filter((r) => r.contactId).map((r) => ({ profileId: r.profileId, contactId: r.contactId, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone, company: r.company }));
    },
    async findDuplicateOrders({ street, city, state, zip, buyerIds, sellerIds } = {}) {
      const u = await me();
      if (!u || !runsOrdersCI(u)) throw new Error('Only a Processor or Admin can do this.');
      const st = String(state || '').trim().toUpperCase();
      if (!String(street || '').trim() || !String(city || '').trim() || !st) return [];
      const deals = camel(ok(await sb.from('deals').select('id, file_number, street, city, state, zip, status').eq('state', st).neq('status', 'Cancelled'))) || [];
      const ids = deals.map((d) => d.id);
      const parts = ids.length ? camel(ok(await sb.from('deal_participants').select('deal_id, contact_id, role').in('deal_id', ids).in('role', ['Client-Buyer', 'Client-Seller']))) || [] : [];
      const orders = deals.map((d) => ({ id: d.id, fileNumber: d.fileNumber, street: d.street, city: d.city, state: d.state, zip: d.zip, status: d.status,
        buyerIds: parts.filter((p) => p.dealId === d.id && p.role === 'Client-Buyer').map((p) => p.contactId),
        sellerIds: parts.filter((p) => p.dealId === d.id && p.role === 'Client-Seller').map((p) => p.contactId) }));
      return duplicateOrders({ street, city, state: st, zip, buyerIds, sellerIds, orders });
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
    async postMessage(threadId, body) { const auth = await readAuthUser(); const user = auth && auth.data && auth.data.user; if (!user || auth.signedOut) throw new Error('Please sign in.'); return camel(ok(await sb.from('messages').insert({ thread_id: threadId, author_id: user.id, body }).select().single())); },
    // activity log: RLS returns rows to CLA staff only (migration 13)
    async listActivity(dealId) {
      return fileRead('activity#' + fileGen + ':' + (dealId || ''), async () => {
        let q = sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(300);
        q = dealId ? q.eq('deal_id', dealId) : q.is('deal_id', null);
        const items = camel(ok(await q));
        return { items, total: items.length, types: [...new Set(items.map((a) => a.action.split('.')[0]))].sort(), actors: [] };
      });
    },
    // Buyers, sellers, and agents never read activity_log. Their tab is the documents,
    // messages, and own tasks they can already open. A failed read is omitted, not an error.
    async listMyActivity(dealId) {
      const u = ident.current() || await me();
      if (!u) return [];
      const safe = async (read) => { try { const rows = await read(); return Array.isArray(rows) ? rows : []; } catch (e) { return []; } };
      const [docs, threads, tasks] = await Promise.all([
        safe(() => a.listDocuments(dealId)),
        safe(() => a.listThreads(dealId)),
        safe(() => a.listTasks(dealId)),
      ]);
      let names = new Map();
      try {
        const people = await a.listMessageRecipients(dealId);
        names = new Map((people || []).filter((p) => p && p.id).map((p) => [p.id, `${p.firstName || ''} ${p.lastName || ''}`.trim()]));
      } catch (e) { names = new Map(); }
      return clientActivityFrom({ user: u, documents: docs, threads, tasks, names });
    },
    // tasks.form_data is NOT selectable (column grant); answers come from get_task_form for the owner / processor / coordinator / Admin only
    async listTasks(dealId) {
      const raw = fileRead('taskrows:' + dealId, () => fetchHostedTaskRows(sb, dealId));
      let u = ident.current() || await me();
      if ((!u || !u.id) && lastHeld && lastHeld.id) u = lastHeld;
      // A moved navigation or a blip is not a sign-out. Throwing here rejects the overview batch and the page reports "Please sign in."
      if (!u || !u.id) return [];
      if (nav.userId() && nav.userId() !== u.id) return [];
      // Francis (Nov 6): a task copy for the viewer's own file-party row counts as theirs. CLA staff who run orders skip this read.
      // A one-off has no owner. The buyer's account role is Outside user; Client-Buyer is only the role on this file.
      const onFileP = (u.isAdmin || runsOrdersCI(u)) ? Promise.resolve({ participantIds: [], roles: [] }) : viewerOnFile(sb, dealId, u);
      const got = await raw; const onFile = await onFileP;
      if (nav.userId() && nav.userId() !== u.id) return [];
      return mapHostedTaskList(got.rows, u, got.off, { myParticipantIds: onFile.participantIds, fileRoles: onFile.roles });
    },
    // Dashboard (speed, Nov 9): listTasks for many files at once -> Map(dealId -> the same list listTasks gives). One paged tasks read
    // and one switches read instead of a tasks read and a switches read per file. The viewer's party rows and file roles
    // (viewerOnFile) are still read per file for people who do not run orders, as listTasks does.
    async listTasksForDeals(dealIds) {
      const ids = [...new Set((dealIds || []).filter(Boolean))];
      const out = new Map(ids.map((id) => [id, []]));
      if (!ids.length) return out;
      let u = ident.current() || await me();
      if ((!u || !u.id) && lastHeld && lastHeld.id) u = lastHeld;
      if (!u || !u.id) return out;
      if (nav.userId() && nav.userId() !== u.id) return out;
      const PAGE = 1000;   // PostgREST returns at most 1000 rows per request: page until a short page
      const chunks = []; for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));   // keeps the URL short
      const rows = (await mapLimit(chunks, 4, async (part) => {
        const got = [];
        for (let from = 0; ; from += PAGE) {
          const page = ok(await sb.from('tasks').select(HOSTED_TASK_COLUMNS).in('deal_id', part).order('created_at').order('id').range(from, from + PAGE - 1)) || [];
          got.push(...page);
          if (page.length < PAGE) return got;
        }
      })).flat();
      let off = [];
      if (rows.some((t) => t.template_code)) off = (ok(await sb.from('task_template_switches').select('code').eq('enabled', false)) || []).map((r) => r.code);
      const byDeal = new Map(ids.map((id) => [id, []]));
      rows.forEach((t) => { if (byDeal.has(t.deal_id)) byDeal.get(t.deal_id).push(t); });
      const staff = u.isAdmin || runsOrdersCI(u);
      const onFile = new Map();
      if (!staff) await mapLimit(ids.filter((id) => byDeal.get(id).length), 4, async (id) => { onFile.set(id, await viewerOnFile(sb, id, u)); });
      if (nav.userId() && nav.userId() !== u.id) return new Map(ids.map((id) => [id, []]));
      byDeal.forEach((list, id) => { const f = onFile.get(id) || { participantIds: [], roles: [] }; out.set(id, mapHostedTaskList(list, u, off, { myParticipantIds: f.participantIds, fileRoles: f.roles })); });
      return out;
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
    async saveBuyerSsn(id, ssn) { return ok(await sb.rpc('save_buyer_ssn', { p_task: id, p_ssn: ssn })); },
    async readBuyerSsn(id) { return ok(await sb.rpc('read_buyer_ssn', { p_task: id })) || ''; },
    async savePartySsn(id, subject, ssn) { return ok(await sb.rpc('save_party_ssn', { p_task: id, p_subject: subject, p_ssn: ssn })); },
    async readPartySsn(id, subject) { return ok(await sb.rpc('read_party_ssn', { p_task: id, p_subject: subject })) || ''; },
    async getSpouse(dealId) { return camel(ok(await sb.rpc('get_spouse', { p_deal: dealId }))) || []; },
    async saveSpouse(dealId, participantId, input) { return camel(ok(await sb.rpc('save_spouse', { p_deal: dealId, p_participant: participantId, p_data: input }))); },
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
    async createSettlementRequest(dealId, { slots, location, note, officeId }) { return camel(ok(await sb.rpc('create_settlement_request', { p_deal: dealId, p_slots: slots, p_location: location || '', p_note: note || '', p_office: officeId || null }))[0]); },
    async confirmSettlement(id, slotIndex) { ok(await sb.rpc('confirm_settlement', { p_settlement: id, p_slot: slotIndex + 1 })); },
    async reopenSettlement(id, { slots, note } = {}) { return camel(ok(await sb.rpc('reopen_settlement', { p_settlement: id, p_slots: slots || null, p_note: note || null }))[0]); },
    async getSchedulingLink(tok) { return ok(await sb.rpc('scheduling_get', { p_token: tok })); },   // anon OK
    async respondSettlement(tok, { picks, note, name, location, officeId }) { ok(await sb.rpc('scheduling_respond', { p_token: tok, p_picks: picks.map((i) => i + 1), p_name: name, p_note: note || '', p_location: location || '', p_office: officeId || '' })); },
    async updateTask(id, patch = {}) {
      if (patch.dueDate !== undefined) {
        const due = patch.dueDate ? String(patch.dueDate).slice(0, 10) : null;
        ok(await sb.rpc('set_task_due_override', { p_task: id, p_due: due }));
      }
      if (patch.audiences !== undefined) {
        const list = Array.isArray(patch.audiences) ? patch.audiences.filter(Boolean) : (patch.audiences ? [patch.audiences] : []);
        ok(await sb.from('tasks').update({ audiences: list.length ? list : null }).eq('id', id).select('id').single());
      }
      if (patch.status != null) return ok(await sb.rpc('set_task_status', { p_task: id, p_status: patch.status }));
      return ok(await sb.from('tasks').select('id, deal_id, title, status, due_date, assigned_role, audiences').eq('id', id).single());
    },
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
    async confirmClosing(dealId, { at, location, note, proposalId, officeId, closingManualStreet, closingManualCity, closingManualState, closingManualZip } = {}) {
      const typed = location === 'Typed address' && closingManualStreet;
      ok(await sb.from('deals').update({
        closing_manual_street: typed ? closingManualStreet : '', closing_manual_city: typed ? (closingManualCity || '') : '',
        closing_manual_state: typed ? (closingManualState || '') : '', closing_manual_zip: typed ? (closingManualZip || '') : '',
      }).eq('id', dealId));
      ok(await sb.rpc('confirm_closing', { p_deal: dealId, p_at: at || null, p_location: location || null, p_note: note || '', p_proposal: proposalId || null, p_office: typed ? null : (officeId || null) }));
    },
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
  const removeParty = a.removeParticipant && a.removeParticipant.bind(a);
  if (removeParty) a.removeParticipant = async (...args) => { const r = await removeParty(...args); dropFileReads(); return r; };
  // Dev-only pickers stay off. E-sign candidate picking stays unwired; signing itself stays disabled below.
  for (const n of ['pickPerson', 'signInDev', 'listSignatureCandidates']) a[n] = todo(n);
  // CRM (John, Nov 2; migration 22): only when the `crm` flag is on (default OFF in supabase mode; features.js). The database has its own switch too.
  a.features = featureFlags(cfg);
  Object.assign(a, crmSupabase({ sb, ok, camel, me, flags: a.features }));
  // ACCOUNTING (John, Nov 3; migration 34): only when features.accounting === true (off by default everywhere) AND the database switch is on.
  Object.assign(a, accountingSupabase({ sb, ok, flags: a.features }));
  // PAYOFFS / HOA / FFB / GROUND RENT (John, Nov 4; migration 42): same switches as accounting, staff only
  Object.assign(a, payoffsSupabase({ sb, ok, flags: a.features, api: a }));
  // TITLE: existing title tables. Staff RLS. Nothing is sent and no SSN is stored.
  Object.assign(a, titleSupabase({ sb, ok, flags: a.features, me }));
  // FINAL POLICY: existing policy tables. Staff RLS. Issuance stays queued-only.
  Object.assign(a, policySupabase({ sb, ok, flags: a.features, me }));
  // FUNDING: existing funding_records and related tables. Staff RLS. Nothing is sent.
  Object.assign(a, fundingSupabase({ sb, ok, flags: a.features, me }));
  // Post-Closing and E-Recording: existing scanback and recording tables. Staff RLS. Outbox is queued only.
  Object.assign(a, postClosingSupabase({ sb, ok, flags: a.features, me }));
  // WIRES: existing wire_records / escrow_accounts / wire_audit_log. Staff RLS via fwp_staff('wires'). No bank send.
  Object.assign(a, wiresSupabase({ sb, ok, flags: a.features, me }));
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
          const known = !!(lastGoodUser && pendingAuthId && pendingAuthId === lastGoodUser.id);
          if (known) warmFile(hint);
          const userFlight = fetchAuthUser();
          const raced = await Promise.race([
            userFlight.then((result) => ({ result })),
            stopped.then(() => ({ stopped: true })),
          ]);
          if (raced.stopped || openNavId !== myNav) return empty;
          const auth = raced.result || {};
          const user = auth.data && auth.data.user;
          if (openNavId !== myNav) return empty;
          if (ticket !== ident.generation()) { early.clear(); continue; }
          if (auth.signedOut || !user) { if (auth.signedOut) confirmedSignOut(); return empty; }
          if (!early.adopt(nav, user.id, ticket, ident.generation())) {
            if (openNavId !== myNav) return empty;
            early.clear();
            continue;
          }
          const mods = a.getModuleAccess ? a.getModuleAccess().then((m) => m || {}).catch(() => ({})) : Promise.resolve({});
          const hr = nav.share(user.id, 'hr-extras', () => hrSessionExtras());
          hr.catch(() => {});
          const demo = a.demoViewStatus().catch(() => null);
          if (!known) warmFile(hint);
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
          remember(kept);
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
  // Staff create and resend invite links here. The page then calls sendInviteEmail (gmail-send) from the inviter's Gmail. Accepting a link goes through the accept-invite function, not a browser sign-up.
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
      ok(await sb.from('messages').insert({ thread_id: thread, author_id: user.id, body: note.slice(0, 4000), body_html: messageText(bodyHtml).clean || '' }));
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
  a.cancelSignatureRequest = async () => { throw new Error(NOT_ENABLED); };
  const shareRead = (name) => {
    const orig = a[name] && a[name].bind(a);
    if (!orig) return;
    a[name] = (id, ...rest) => (rest.length || id == null ? orig(id, ...rest) : fileRead(name + ':' + id, () => orig(id)));
  };
  ['listThreads', 'listDealFolders', 'listSignatureRequests', 'listEntityDocRequests'].forEach(shareRead);
  function warmFile(hint) {
    if (!hint || !hint.dealId || hint.gated) return;
    const id = hint.dealId;
    const tab = hint.tab || 'overview';
    if (tab === 'overview') {
      fileRead('deal:' + id, () => fetchDeal(id));
      fileRead('taskrows:' + id, () => fetchHostedTaskRows(sb, id));
      fileRead('docs:' + id, () => rawDocs(id));
      if (a.listThreads) a.listThreads(id).catch(() => null);
      if (a.readOverview) a.readOverview(id).catch(() => null);
      return;
    }
    fileRead('shell:' + id, () => fetchFileShell(id));
    if (tab === 'activity' && a.listActivity) a.listActivity(id).catch(() => null);
    if (tab === 'tasks') fileRead('taskrows:' + id, () => fetchHostedTaskRows(sb, id));
    if (tab === 'documents') {
      fileRead('docs:' + id, () => rawDocs(id));
      if (a.listDealFolders) a.listDealFolders(id).catch(() => null);
      if (a.listSignatureRequests) a.listSignatureRequests(id).catch(() => null);
      if (a.listEntityDocRequests) a.listEntityDocRequests(id).catch(() => null);
    }
  }
  a.dropFileReads = dropFileReads;
  // CARRY: every method that is not a read is treated as a write. It drops the carried order reads before it runs and again when it
  // settles, so the refresh after a save reads fresh. A read named like a write only costs a re-read; never the other way round.
  const READ_ONLY = /^(list|get|read|preview|search|find)[A-Z]|^(demoViewStatus|notificationCount|unreadCount|authGeneration|beginNavigation|sessionUser|crmMe|crmMergeFields|crmRelatedEmails|crmReport|hrMe|closingLocationFlags|closingLocationPrompt|writeSerial)$/;
  let writes = 0; const wrote = () => { writes += 1; carry.clear(); };
  Object.keys(a).forEach((name) => {
    const fn = a[name]; if (typeof fn !== 'function' || READ_ONLY.test(name)) return;
    a[name] = function (...args) { wrote(); let out; try { out = fn.apply(this, args); } finally { if (out && typeof out.then === 'function') Promise.resolve(out).then(wrote, wrote); else wrote(); } return out; };
  });
  a.writeSerial = () => writes;
  return a;
}
