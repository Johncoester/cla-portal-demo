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
 *   tasks:      listTasks, getTask, createTask, updateTask, saveTaskForm(id, data, {complete}), uploadForTask,
 *               listTaskTemplates, publishTemplateVersion (Admin), sendTaskReminder, queueOverdueReminders, listOutbox (queued only, never sent)
 *   documents:  listDocuments, addDocument, moveDocument, updateDocumentMeta, getDocumentContent, listDealFolders, createFolder, renameFolder,
 *               listLibrary, addLibraryDocument
 *   messages:   listMessageRecipients, listThreads, getThread, createThread, postMessage, markThreadRead
 *   closing:    listSettlements, createSettlementRequest, getSchedulingLink(token), respondSettlement(token, ...), confirmSettlement, reopenSettlement
 *   other:      listActivity(dealId|null, filters), listNotifications, notificationCount, markNotificationRead, markAllNotificationsRead
 *   Admin only (isAdmin flag, NOT the Sales Processor): adminListUsers, adminCreateUser, adminUpdateUser, adminDeleteUser (marks removed; history kept),
 *               listTeams (TCs see their own), createTeam, renameTeam, addTeamMember, removeTeamMember
 * There is intentionally NO deleteDocument (or folder delete) in either adapter, for anyone.
 */
let cached = null;
export async function getAdapter() {
  if (cached) return cached;
  const cfg = (typeof window !== 'undefined' && window.CLA_PORTAL_CONFIG) || { mode: 'mock' };
  if (cfg.mode === 'supabase') { const m = await import('./supabase-adapter.js'); cached = await m.createSupabaseAdapter(cfg); }
  else { const m = await import('./mock-adapter.js'); cached = m.createMockAdapter(); }
  return cached;
}
