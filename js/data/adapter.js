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
 *   signIn(email, password)  supabase mode only, after John confirms that switch on CLA Portal Live Test
 *   signOut(); getSession() -> profile | null; getMyProfile(); updateMyProfile(patch)
 * DATA CONTRACT (same names in both; see the mock-part-*.js files):
 *   deals:      getWorkQueue, listDeals, getDeal, createDeal, updateDeal, setStage, setDealStatus, listSalesStaff, unreadCount
 *   people:     listContacts, createContact, updateContact, addParticipant (copies current task templates), removeParticipant
 *               Contacts carry contactType: null | 'realtor' | 'lender' | 'buyer_seller' (person-level, for reporting; separate from the
 *               per-file role; CLA staff never have one). createContact / updateContact accept it; adminCreateUser / adminUpdateUser
 *               accept it for outside users; adminListUsers rows carry it.
 *   tasks:      listTasks, getTask, createTask, updateTask, saveTaskForm(id, data, {complete}), uploadForTask,
 *               listTaskTemplates, publishTemplateVersion (Admin), sendTaskReminder, queueOverdueReminders, listOutbox (queued only, never sent)
 *   documents:  listDocuments, addDocument, moveDocument, updateDocumentMeta, shareDocumentWithClient (staff: share an upload with the buyer), shareDocumentWithSeller (staff: the same for the seller), getDocumentContent, listDealFolders, createFolder, renameFolder,
 *               listLibrary, addLibraryDocument
 *   messages:   listMessageRecipients, listThreads, getThread, createThread, postMessage, markThreadRead
 *   file mail:  orderMailUnread() -> { [dealId]: { portal, gmail, total } } for files with unread mail (portal threads this person is on, plus Gmail).
 *               filePortalUnread(dealId), fileEmailUnreadCount(dealId), emailReadCursor(dealId), markDealEmailsRead(dealId).
 *               Gmail read state is per person (deal_email_reads, migration 20261110030000). If that table is not there yet, the cursor stays in this browser and the page still opens.
 *               Buyers, sellers, and agents do not receive deal_emails; their count is portal threads only.
 *   closing:    listSettlements, createSettlementRequest, getSchedulingLink(token), respondSettlement(token, ...), confirmSettlement, reopenSettlement
 *   other:      listActivity(dealId|null, filters), listNotifications (each with fileNumber + address), notificationCount, markNotificationRead, markAllNotificationsRead
 *   Matt Nov 2: listAllTasks({fileStatus}) (every task you may see, across files, each with its file), getTaskGrid({fileStatus}) (Processor / Admin only).
 *   John Nov 4 (FILE-FIRST): listMyTasks({fileStatus = 'Open'}) = my own tasks on EVERY file I am on in one list, each with its file and myRoles / myRoleLabel (my role on that file). SQL: public.my_task_list (migration 45).
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
 * Janine, Nov 10 (migration 20261112070000, public.user_ui_prefs): getUserUiPrefs(module) -> {module, prefs:{order}, updatedAt} | null.
 *               saveUserUiPrefs(module, {order}) upserts that person's row. module is leads, contacts, accounts, or deals.
 *               The list paints from this browser, then asks once per list per session when that list opens, and writes after a short pause.
 *               If the call fails, the list keeps the browser copy and shows no error.
 * Nov 3 (migration 27): CRM EMAIL TEMPLATES (same flag). NOTHING IS SENT: sendCrmTestEmail always refuses ("Sending will be turned on when Gmail is connected.").
 *               listCrmEmailFolders() -> {canCreate, folders}, createCrmEmailFolder(name) / renameCrmEmailFolder(id, name) (Admin / Super admin),
 *               listCrmEmailTemplates / getCrmEmailTemplate / createCrmEmailTemplate({module, kind, name, subject, body|blocks, pageBg, status, folderId})
 *               / updateCrmEmailTemplate (creator or Admin; module + kind fixed) / duplicateCrmEmailTemplate(id, {name, folderId}) (Save As)
 *               / retireCrmEmailTemplate(id, retired) (no delete), setCrmTemplateFavorite(id, on), addCrmTemplateAttachment(id, file) (PDF / PNG / JPG)
 *               / detachCrmTemplateAttachment(id, fileId, detached) (file kept), getCrmSignature / saveCrmSignature(html), crmMergeFields(module),
 *               previewCrmEmail({templateId|draft, recordId}), listCrmTemplatesFor(entity), composeCrmEmail(templateId, entity, recordId),
 *               logCrmEmailDraft(templateId, entity, recordId) ("Email drafted (not sent)" activity), sendCrmTestEmail() (always refuses).
 * There is intentionally NO deleteDocument (or folder delete) in either adapter, for anyone.
 * Matt Nov 3b (migration 31; mock storage v23): createDeal also takes lenderName / lenderContact / lenderPhone / lenderEmail and sourceOfBusiness
 *               (a CRM Settings Lead Source value; staff only: getDeal returns sourceOfBusiness + sourceOfBusinessLabel to CLA staff, '' to anyone else);
 *               updateDeal accepts sourceOfBusiness. listSourceOptions() -> [{value, label}] (Processor / Admin). addParticipant(dealId, contactId, role,
 *               {entity: {name, type, repName, repTitle, repPhone, repEmail}}) for a buyer / seller entity; setParticipantEntity(dealId, participantId, entity|null).
 *               getDeal participants carry entity (rep phone / email blank for the other side's outside users). No API change for the task grid.
 */
let loading = null;
export function getAdapter() {
  if (!loading) loading = loadAdapter();
  return loading;
}
async function loadAdapter() {
  const cfg = (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  if (cfg.mode === 'supabase') { const m = await import('./supabase-adapter.js?v=202611182110'); return m.createSupabaseAdapter(cfg); }
  const m = await import('./mock-adapter.js?v=202611182120');
  return m.createMockAdapter();
}
