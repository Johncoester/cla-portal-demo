/* A buyer's, seller's, or agent's Activity tab. Built only from rows those
 * roles can already open: documents on the file, messages in their threads,
 * and their own saved or completed tasks. Nothing here reads activity_log. */

function personName(user) {
  const name = `${(user && user.firstName) || ''} ${(user && user.lastName) || ''}`.trim();
  return name || 'You';
}

function named(names, id, fallback) {
  if (!id) return fallback;
  const hit = names && names.get ? names.get(id) : '';
  return hit || fallback;
}

function clip(text) {
  const body = String(text || '').replace(/\s+/g, ' ').trim();
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

export function clientActivityFrom({ user, documents = [], threads = [], tasks = [], names = new Map() } = {}) {
  const me = user || {};
  const id = me.id || '';
  const myName = personName(me);
  const rows = [];
  for (const doc of documents || []) {
    if (!doc || !doc.id) continue;
    const mine = !!(id && doc.uploadedBy === id);
    const title = doc.name || 'a file';
    rows.push({
      id: `doc:${doc.id}`,
      createdAt: doc.createdAt || '',
      action: 'document.uploaded',
      detail: mine ? `Uploaded ${title}` : `Shared ${title}`,
      actorName: mine ? myName : named(names, doc.uploadedBy, 'CLA Title'),
      actorRole: mine ? (doc.uploadedByRole || me.role || '') : (doc.uploadedByRole || ''),
      mine,
    });
  }
  for (const thread of threads || []) {
    const subject = (thread && thread.subject) || 'Message';
    for (const message of (thread && thread.messages) || []) {
      if (!message || !message.id) continue;
      const mine = !!(id && message.authorId === id);
      const snippet = clip(message.body);
      rows.push({
        id: `msg:${message.id}`,
        createdAt: message.createdAt || (thread && thread.createdAt) || '',
        action: 'message.posted',
        detail: snippet ? `${subject}: ${snippet}` : subject,
        actorName: mine ? myName : named(names, message.authorId, message.authorName || 'Someone on this file'),
        actorRole: '',
        mine,
      });
    }
  }
  for (const task of tasks || []) {
    if (!task || !task.id || !task.mine) continue;
    const done = task.status === 'done' || !!task.completedAt;
    const when = task.completedAt || task.savedAt || '';
    if (!done && !when) continue;
    const title = task.title || 'a task';
    rows.push({
      id: `task:${task.id}:${done ? 'done' : 'saved'}`,
      createdAt: when || task.createdAt || '',
      action: done ? 'task.completed' : 'task.saved',
      detail: done ? `Completed ${title}` : `Saved progress on ${title}`,
      actorName: myName,
      actorRole: task.assignedRole || '',
      mine: true,
    });
  }
  return rows.sort((a, b) => String(b.createdAt || '0').localeCompare(String(a.createdAt || '0')) || String(a.id).localeCompare(String(b.id)));
}
