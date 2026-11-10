/* Shape a hosted thread list for the conversations page.
 * The database returns threads, messages, and participants separately. The page reads lastBody and participants. */

function personName(profile) {
  const name = `${profile && profile.firstName || ''} ${profile && profile.lastName || ''}`.trim();
  return name || 'Participant';
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
      participants: parts.map((p) => ({ id: p.profileId, name: nameOf(p.profileId), role: (who.get(p.profileId) || {}).role || '' })),
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
