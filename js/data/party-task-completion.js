/* MF-057 (Matt Landsberg, confirmed Nov 16 2026, 10:45 AM ET). Source: Portal Feedback Nov 16, FF-086 item 2.
 * Party tasks are one copy per person (deal participant), not one shared task per side.
 * When two or more buyers, or two or more sellers, each have a copy of the same task,
 * that task counts as complete only after every person on that side has finished their own copy.
 * Until then it stays open for staff views, the task list, the Task Grid and dashboard counts.
 * One buyer or one seller is unchanged: their own copy is the whole task.
 * Each person still completes only their own copy. This file is the rule MF-053 can call. */
const OPEN = ['todo', 'in_progress', 'blocked'];
export const PARTY_TASK_ROLES = ['Client-Buyer', 'Client-Seller'];

const field = (task, camel, snake) => (task ? (task[camel] != null && task[camel] !== '' ? task[camel] : task[snake]) : null);

export function partyTaskGroupKey(task) {
  if (!task) return '';
  const role = field(task, 'assignedRole', 'assigned_role') || '';
  if (!PARTY_TASK_ROLES.includes(role)) return '';
  const dealId = field(task, 'dealId', 'deal_id') || '';
  const code = String(field(task, 'templateCode', 'template_code') || '').trim();
  const title = String(task.title || '').trim().toLowerCase();
  const identity = code ? `tpl:${code}` : `task:${title}`;
  return `${dealId}|${role}|${identity}`;
}

/* A person is the participant the copy was made for. A task with no participant and no owner
 * is one shared assignment, not a second buyer or seller. */
export function partyPersonKey(task) {
  const participant = field(task, 'participantId', 'participant_id');
  if (participant) return `p:${participant}`;
  const owner = field(task, 'ownerProfileId', 'owner_profile_id') || task.ownerId || null;
  return owner ? `o:${owner}` : '';
}

export function partyPersonName(task) {
  const name = String(task.ownerName || task.personName || task.owner_name || '').trim();
  if (name) return name;
  return (field(task, 'assignedRole', 'assigned_role') === 'Client-Seller') ? 'Seller' : 'Buyer';
}

function remainingText(waiting, role) {
  const side = role === 'Client-Seller' ? 'seller' : 'buyer';
  const names = waiting.map((p) => p.name);
  const distinct = new Set(names.map((n) => n.toLowerCase()));
  const generic = names.every((n) => n === 'Buyer' || n === 'Seller');
  if (generic || distinct.size < names.length) {
    const n = names.length;
    return n === 1 ? `1 ${side} still needs to finish` : `${n} ${side}s still need to finish`;
  }
  return `Still needed: ${names.join(', ')}`;
}

/* Shallow-copies only the rows that belong to a multi-person buyer or seller task.
 * Everyone else is returned as the same object, with no partyProgress. */
export function annotatePartyTaskProgress(tasks) {
  const groups = new Map();
  for (const task of tasks || []) {
    const key = partyTaskGroupKey(task);
    const person = partyPersonKey(task);
    if (!key || !person || !task || task.status === 'cancelled') continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const progressById = new Map();
  for (const copies of groups.values()) {
    const people = new Map();
    for (const task of copies) {
      const person = partyPersonKey(task);
      if (!people.has(person)) people.set(person, []);
      people.get(person).push(task);
    }
    if (people.size < 2) continue;
    const personRows = [...people.entries()].map(([person, rows]) => ({
      person,
      finished: rows.every((row) => row.status === 'done'),
      name: partyPersonName(rows[0]),
      rows,
    }));
    const done = personRows.filter((row) => row.finished).length;
    const role = field(copies[0], 'assignedRole', 'assigned_role');
    const waiting = personRows.filter((row) => !row.finished);
    const progress = {
      done,
      total: personRows.length,
      complete: done === personRows.length,
      label: `${done} of ${personRows.length} done`,
      remaining: waiting.map((row) => row.name),
      remainingLabel: remainingText(waiting, role),
    };
    for (const row of personRows) {
      for (const task of row.rows) if (task.id != null) progressById.set(task.id, progress);
    }
  }
  return (tasks || []).map((task) => {
    const progress = task && progressById.get(task.id);
    return progress ? { ...task, partyProgress: progress } : task;
  });
}

export function partyTaskStillOpen(task) {
  return !!(task && task.partyProgress && task.partyProgress.complete === false);
}

/* Done copies of an unfinished multi-person task, so a list that loaded only open rows
 * can still show "1 of 2 done" and keep that task on the incomplete list. */
export function partyTaskCopiesStillOpen(openRows, doneRows) {
  const annotated = annotatePartyTaskProgress([...(openRows || []), ...(doneRows || [])]);
  const seen = new Set((openRows || []).filter((task) => task && task.id != null).map((task) => task.id));
  return annotated.filter((task) => task && task.id != null && !seen.has(task.id) && partyTaskStillOpen(task) && task.status === 'done');
}

/* Staff open / overdue counts. A finished copy still counts as open until every person
 * on that side has finished. It does not count as overdue. One person on the side is unchanged. */
export function staffTaskCounts(tasks, today) {
  const rows = annotatePartyTaskProgress(tasks || []);
  let open = 0;
  let overdue = 0;
  for (const task of rows) {
    if (!task || task.status === 'cancelled') continue;
    const personallyOpen = OPEN.includes(task.status);
    if (!personallyOpen && !partyTaskStillOpen(task)) continue;
    open += 1;
    const due = task.dueDate || task.due_date;
    if (personallyOpen && due && today && due < today) overdue += 1;
  }
  return { open, overdue };
}

/* Task Grid cell for one file. Buyers and sellers with two or more people stay pending
 * until each of them is done, and carry the "N of M done" line. One person, and agent
 * tasks, keep the previous rule: the cell is done when every live copy is done. */
export function partyTaskGridCell(copies, today) {
  const live = (copies || []).filter((task) => task && task.status !== 'cancelled');
  const empty = { state: 'na', total: 0, done: 0, label: '', remaining: [], remainingLabel: '', taskIds: [], dueDate: null };
  if (!live.length) return empty;
  const annotated = annotatePartyTaskProgress(live);
  const progress = annotated.find((task) => task.partyProgress)?.partyProgress || null;
  const doneCopies = live.filter((task) => task.status === 'done');
  const openCopies = live.filter((task) => OPEN.includes(task.status));
  const dueOf = (task) => task.dueDate || task.due_date || null;
  const total = progress ? progress.total : live.length;
  const done = progress ? progress.done : doneCopies.length;
  const complete = progress ? progress.complete : doneCopies.length === live.length;
  const dueDate = openCopies.map(dueOf).filter(Boolean).sort()[0] || null;
  const base = {
    total,
    done,
    label: progress && !progress.complete ? progress.label : '',
    remaining: progress && !progress.complete ? progress.remaining : [],
    remainingLabel: progress && !progress.complete ? progress.remainingLabel : '',
    taskIds: live.map((task) => task.id),
    dueDate,
  };
  if (complete) return { ...base, state: 'done' };
  if (openCopies.some((task) => { const due = dueOf(task); return !!(due && today && due < today); })) return { ...base, state: 'overdue' };
  return { ...base, state: 'pending' };
}
