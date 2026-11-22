/* Shape a hosted thread list for the conversations page.
 * The database returns threads, messages, and participants separately. The page reads lastBody and participants. */

function personName(profile) {
  const name = `${profile && profile.firstName || ''} ${profile && profile.lastName || ''}`.trim();
  return name || roleText(profile && profile.role) || 'Participant';
}

// FF-070 (Janine's video, Nov 12; Francis Feedback ticket): a seller saw the processor as "Participant" because profiles row
// security hides CLA staff from outside users. thread_people (migration 20261116140000) returns only a display name and a role
// for people in the caller's own conversations; it fills the names profiles could not.
const FILE_ROLE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
export function roleText(role) { const r = String(role || ''); return Object.prototype.hasOwnProperty.call(FILE_ROLE, r) ? FILE_ROLE[r] : r; }
export async function readThreadPeople(sb, threadIds) {
  const ids = [...new Set((threadIds || []).filter(Boolean))].slice(0, 200);
  if (!ids.length || !sb || typeof sb.rpc !== 'function') return [];
  try { const r = await sb.rpc('thread_people', { p_threads: ids }); return r && !r.error && Array.isArray(r.data) ? r.data : []; } catch (e) { return []; }
}
// profiles: camel rows the viewer could read; people: thread_people rows. A readable profile keeps its own name; the role shown is
// the file role from thread_people when there is one (Seller, Buyer's agent), else the CLA role.
export function withThreadPeople(profiles = [], people = []) {
  const out = new Map((profiles || []).map((p) => [p.id, { ...p }]));
  (people || []).forEach((x) => {
    const id = x.profile_id || x.profileId; if (!id) return;
    const have = out.get(id) || { id, firstName: '', lastName: '', role: '' };
    const named = `${have.firstName || ''} ${have.lastName || ''}`.trim();
    out.set(id, { ...have, firstName: named ? have.firstName : (x.display_name || x.displayName || ''), lastName: named ? have.lastName : '', role: roleText(x.role) || roleText(have.role) });
  });
  return [...out.values()];
}

export function shapePortalThreads({ threads = [], messages = [], participants = [], profiles = [], userId = '' } = {}) {
  const who = new Map((profiles || []).map((p) => [p.id, p]));
  const nameOf = (id) => personName(who.get(id));
  return (threads || []).map((thread) => {
    const msgs = (messages || []).filter((m) => m.threadId === thread.id)
      .slice()
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const parts = (participants || []).filter((p) => p.threadId === thread.id);
    const mine = parts.find((p) => p.profileId === userId);
    const since = mine && mine.lastReadAt ? String(mine.lastReadAt) : '';
    const last = msgs[msgs.length - 1];
    return {
      ...thread,
      messages: msgs,
      participantIds: parts.map((p) => p.profileId),
      participants: parts.map((p) => ({ id: p.profileId, name: nameOf(p.profileId), role: roleText((who.get(p.profileId) || {}).role) })),
      count: msgs.length,
      lastAt: last ? last.createdAt : (thread.createdAt || ''),
      lastBody: last ? String(last.body || '') : '',
      lastFrom: last ? nameOf(last.authorId) : '',
      unread: msgs.filter((m) => m.authorId !== userId && (!since || String(m.createdAt || '') > since)).length,
      hasFiles: msgs.some((m) => /Files on this order/i.test(String(m.body || ''))),
      staffCoordinated: !!thread.staffCoordinated,
    };
  }).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')));
}

/* A row the page can render even when a list is only partially filled in. */
export function presentThread(thread, { userId = '' } = {}) {
  if (thread && typeof thread.lastBody === 'string' && Array.isArray(thread.participants)) return thread;
  const shaped = shapePortalThreads({
    threads: [thread || {}],
    messages: thread && thread.messages || [],
    participants: (thread && thread.participantIds || []).map((id) => ({ threadId: thread.id, profileId: id })),
    profiles: (thread && thread.participants || []).map((p) => ({ id: p.id, firstName: p.name || '', lastName: '', role: p.role || '' })),
    userId,
  })[0];
  return {
    ...shaped,
    lastBody: thread && thread.lastBody != null ? String(thread.lastBody) : shaped.lastBody,
    lastFrom: thread && thread.lastFrom != null ? String(thread.lastFrom) : shaped.lastFrom,
    participants: Array.isArray(thread && thread.participants) ? thread.participants : shaped.participants,
    unread: thread && thread.unread != null ? thread.unread : shaped.unread,
    count: thread && thread.count != null ? thread.count : shaped.count,
    hasFiles: !!(thread && thread.hasFiles) || shaped.hasFiles,
  };
}
