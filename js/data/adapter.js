/* adapter.js : the ONE seam between the screens and the back end.
 * Screens call `await getAdapter()` and nothing else. Two implementations share the same method names:
 *   mock-adapter.js      fake seed data in localStorage (default; no server, no database)
 *   supabase-adapter.js  Supabase Auth + Postgres RLS (see supabase/migrations). Not run against a hosted project.
 * Chosen by public/config.js (gitignored):  window.CLA_PORTAL_CONFIG = { mode: "mock" } or { mode: "supabase", url, anonKey }.
 * No config.js => mock mode.
 *
 * AUTH CONTRACT (the swappable layer):
 *   mode                     "mock" | "supabase"
 *   listDevUsers()           -> [{id, firstName, lastName, role, isAdmin}]  mock only; supabase returns [] (dev picker hidden)
 *   signInDev(userId)        mock only: dev/fake login, pick a fake user, no password
 *   signIn(email, password)  supabase only (go-live: real users, real logins)
 *   signOut(); getSession() -> profile | null; getMyProfile(); updateMyProfile(patch)
 * DATA CONTRACT (same names in both; see the mock-part-*.js files):
 *   deals:      getWorkQueue, listDeals, getDeal, createDeal, updateDeal, setStage, setDealStatus, listSalesStaff, unreadCount
 *   people:     listContacts, createContact, updateContact, addParticipant (copies current task templates), removeParticipant
 *               Contacts carry contactType: null | 'realtor' | 'lender' | 'buyer_seller' (person-level, for reporting; separate from the
 *               per-file role; CLA staff never have one). createContact / updateContact accept it; adminCreateUser / adminUpdateUser
 *               accept it for outside users; adminListUsers rows carry it.
 *   tasks:      listTasks, getTask, createTask, updateTask, saveTaskForm(id, data, {complete}), uploadForTask,
 *               listTaskTemplates, publishTemplateVersion (Admin), sendTaskReminder, queueOverdueReminders, listOutbox (queued only, never sent)
 *   documents:  listDocuments, addDocument, moveDocument, updateDocumentMeta, getDocumentContent, listDealFolders, createFolder, renameFolder,
 *               listLibrary, addLibraryDocument
 *   messages:   listMessageRecipients, listThreads, getThread, createThread, postMessage, markThreadRead
 *   closing:    listSettlements, createSettlementRequest, getSchedulingLink(token), respondSettlement(token, ...), confirmSettlement, reopenSettlement
 *   other:      listActivity(dealId|null, filters), listNotifications (each with fileNumber + address), notificationCount, markNotificationRead, markAllNotificationsRead
 *   Matt Nov 2: listAllTasks({fileStatus}) (every task you may see, across files, each with its file), getTaskGrid({fileStatus}) (Processor / Admin only).
 *               listDeals rows also carry partyNames + overdueTasks. Filtering / sorting / grouping / the grid layout: task-board.js (shared, pure).
 *   Admin only (isAdmin flag; roles Admin and Super admin; NOT the Processor): adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser (marks removed; history kept),
 *               listTeams (TCs see their own), createTeam, renameTeam, addTeamMember, removeTeamMember
 *   John Nov 2: adminGetUser(id); clients <-> salespeople (many-to-many): adminLinkSalesRep(clientId, salesId), adminUnlinkSalesRep, adminSetSalesReps(clientId, [salesIds]),
 *               listClientSalesReps() (Admin / Processor: all; Sales Person / Sales Team: their own). adminCreateUser accepts isClient + salesIds;
 *               adminUpdateUser accepts salesIds. adminListUsers rows carry files, isClient, salesReps, clients, teams.
 *               Super admin (role 'Super admin'): only a Super admin grants/removes it or deletes/suspends/changes a Super admin.
 *               Nov 2: anyone with Admin access does full order work on ANY file, like the Processor (runsOrders in constants.js).
 *   John Nov 2 (migration 19): several salespeople per order. Deals carry salesPeople [{id, name, role, addedAt}], salesPersonIds, and
 *               salesPersonName (all names, ', '-joined). createDeal({..., processorId, salesIds}) — processorId required when an Admin places it
 *               (a Processor defaults to themselves). Processor / Admin: listProcessors, listCoordinators (John, Nov 2: active 'Transaction Coordinator'
 *               accounts with their contactId; addParticipant refuses anyone else as a file's TC), createDeal/updateDeal also take openDate (no future),
 *               any US state, emdAmount (>= 0) and emdDueDate (migration 20), addDealSalesPerson(dealId, salesId),
 *               removeDealSalesPerson(dealId, salesId), setDealSalesPeople(dealId, salesIds); updateDeal accepts processorId and salesIds.
 * John Nov 2 (migration 22): the CRM, behind the `crm` FEATURE FLAG (features.js; api.features.crm). Off = every method below refuses.
 *               crmMe, listCrmOwners, listCrmLeads / getCrmLead / createCrmLead / updateCrmLead / convertCrmLead(id, {accountId|newAccountName, accountKind, opportunityName, linkExisting}),
 *               listCrmContacts / getCrmContact (orders + totals + salesReps + activities) / createCrmContact / updateCrmContact (CRM fields only),
 *               listCrmAccounts / getCrmAccount / createCrmAccount / updateCrmAccount, listCrmOpportunities / createCrmOpportunity / updateCrmOpportunity / moveCrmOpportunity,
 *               archiveCrmRecord(entity, id, archived) (no CRM deletes), listCrmActivities / logCrmActivity / updateCrmActivity, listCrmFollowUps({ownerId, status}), crmReport({from, to}).
 * There is intentionally NO deleteDocument (or folder delete) in either adapter, for anyone.
 */
let cached = null;
export async function getAdapter() {
  if (cached) return cached;
  const cfg = (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  if (cfg.mode === 'supabase') { const m = await import('./supabase-adapter.js?v=202611022207'); cached = await m.createSupabaseAdapter(cfg); }
  else { const m = await import('./mock-adapter.js?v=202611022207'); cached = m.createMockAdapter(); }
  return cached;
}
