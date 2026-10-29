/* mock adapter: tasks. Templates (versioned definitions) are separate from each participant's task COPY; a copy records templateId + templateVersion.
 * Intake forms: save partial work, validate, mark complete. Reminders are QUEUED in an outbox only and never sent. Tasks are cancelled, never deleted. */
import { validateForm, fieldActive } from './templates.js';
export function tasksAndForms(x) {
  const { load, save, nid, needUser, needAdmin, isManager, dealOr404, dealsFor, log, prof, nameOf, ownerOf, taskVisible, formDataVisible, notify, dealProfileIds, folderOf, clone, now, fail, str, C } = x;
  const OPEN = ['todo', 'in_progress', 'blocked'];
  const tpl = (id) => load().taskTemplates.find((t) => t.id === id);
  const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const taskOr404 = (u, id) => { const t = load().tasks.find((z) => z.id === id) || fail('Task not found.'); dealOr404(u, t.dealId); if (!taskVisible(u, t)) fail('Task not found.'); return t; };
  const canFill = (u, t) => t.kind === 'form' && t.status !== 'cancelled' && (ownerOf(t) === u.id || isManager(u));
  const out = (u, t) => { const o = clone(t); o.ownerId = ownerOf(t); o.ownerName = o.ownerId ? nameOf(o.ownerId) : ''; o.mine = o.ownerId === u.id || (!t.participantId && t.assignedRole === u.role);
    o.canFill = canFill(u, t); o.canTick = t.kind === 'simple' && t.status !== 'cancelled' && (isManager(u) || (!t.participantId && t.assignedRole === u.role && ['todo', 'done'].includes(t.status)));
    if (!formDataVisible(u, t)) { o.formData = {}; o.formHidden = true; } return o; };
  // Copy the CURRENT version of every template that applies to this participant's role. Never duplicates an open copy.
  x.makeCopies = (dealId, p, actorId) => {
    const d = load(); let n = 0;
    d.taskTemplates.filter((t) => t.active && t.roles.includes(p.role)).forEach((t) => {
      if (d.tasks.some((z) => z.participantId === p.id && z.templateCode === t.code && z.status !== 'cancelled')) return;
      d.tasks.push({ id: nid('t'), dealId, participantId: p.id, templateId: t.id, templateCode: t.code, templateVersion: t.version, kind: 'form', title: t.title, description: t.description,
        assignedRole: p.role, status: 'todo', dueDate: addDays(t.dueDays || 7), formData: {}, savedAt: null, completedAt: null, completedBy: null, createdBy: actorId, createdAt: now() }); n++;
    });
    if (n) { const c = d.contacts.find((z) => z.id === p.contactId); if (c && c.profileId) notify([c.profileId], { kind: 'task', dealId, title: `${n} new task(s) for you on this order`, link: `#/deals/${dealId}/tasks` }, actorId); }
    return n;
  };
  function queueReminder(u, t) {
    const d = load(); const deal = d.deals.find((z) => z.id === t.dealId); const today = now().slice(0, 10);
    let to = t.participantId ? [ownerOf(t)] : dealProfileIds(t.dealId).filter((pid) => (prof(pid) || {}).role === t.assignedRole);
    to = to.filter((pid) => pid && prof(pid) && prof(pid).status === 'active');
    let n = 0;
    to.forEach((pid) => {
      if (d.outbox.some((o) => o.taskId === t.id && o.toProfileId === pid && o.createdAt.slice(0, 10) === today)) return;   // one per task/person/day
      const p = prof(pid);
      d.outbox.push({ id: nid('ob'), channel: 'email', status: 'queued', toProfileId: pid, toEmail: p.email, subject: `Reminder: ${t.title} (${deal.fileNumber})`,
        body: `Hi ${p.firstName}, this is a reminder about "${t.title}" for ${deal.street}, ${deal.city}.${t.dueDate ? ' Due ' + t.dueDate + '.' : ''} Please sign in to the portal to finish it.`,
        taskId: t.id, dealId: t.dealId, createdBy: u.id, createdAt: now(), sentAt: null });
      notify([pid], { kind: 'reminder', dealId: t.dealId, title: `Reminder: ${t.title}`, link: `#/deals/${t.dealId}/tasks` }, u.id); n++;
    });
    if (n) log(t.dealId, u.id, 'reminder.queued', 'task', t.id, `Reminder queued for ${t.title} (${n} recipient(s); not sent - outbox only)`);
    return n;
  }
  return {
    async listTasks(dealId) {
      const u = needUser(); dealOr404(u, dealId);
      return load().tasks.filter((t) => t.dealId === dealId && taskVisible(u, t)).map((t) => out(u, t))
        .sort((a, b) => ((a.status === 'done' || a.status === 'cancelled') - (b.status === 'done' || b.status === 'cancelled')) || (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    },
    async getTask(id) {
      const u = needUser(); const t = taskOr404(u, id); const o = out(u, t); const tp = t.templateId ? tpl(t.templateId) : null;
      o.fields = tp ? clone(tp.fields) : []; o.template = tp ? { id: tp.id, code: tp.code, version: tp.version, title: tp.title } : null;
      if (!o.formHidden) { o.documents = load().documents.filter((z) => z.dealId === t.dealId && o.fields.some((f) => f.type === 'doc' && t.formData[f.k] === z.id)).map((z) => ({ id: z.id, name: z.name })); }
      return o;
    },
    async createTask(dealId, input) {
      const u = needUser(); dealOr404(u, dealId); if (!isManager(u)) fail('Only the processor or transaction coordinator can add tasks.');
      const role = C.ROLES.includes(input.assignedRole) ? input.assignedRole : 'Sales Processor';
      const t = { id: nid('t'), dealId, participantId: null, templateId: null, templateCode: null, templateVersion: null, kind: 'simple', title: str(input.title, 200) || fail('Task title is required.'),
        description: str(input.description, 1000), assignedRole: role, status: 'todo', dueDate: str(input.dueDate, 10) || null, formData: {}, savedAt: null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() };
      load().tasks.push(t); log(dealId, u.id, 'task.created', 'task', t.id, `Task added: ${t.title}`);
      notify(dealProfileIds(dealId).filter((pid) => (prof(pid) || {}).role === role), { kind: 'task', dealId, title: `New task: ${t.title}`, link: `#/deals/${dealId}/tasks` }, u.id);
      save(); return clone(t);
    },
    async updateTask(id, patch) {
      const u = needUser(); const t = taskOr404(u, id);
      if (!isManager(u)) {   // everyone else may only tick/untick a simple task assigned to their own role; intake forms are completed with saveTaskForm
        if (t.kind !== 'simple' || t.participantId || Object.keys(patch).some((k) => k !== 'status') || t.assignedRole !== u.role || !['todo', 'done'].includes(patch.status)) fail('You can only complete tasks assigned to you.');
      }
      if (patch.title != null) t.title = str(patch.title, 200) || fail('Task title is required.');
      if (patch.description != null) t.description = str(patch.description, 1000);
      if (patch.dueDate !== undefined) t.dueDate = str(patch.dueDate, 10) || null;
      if (patch.assignedRole != null && patch.assignedRole !== t.assignedRole) { if (t.participantId) fail('A participant task stays with that participant.'); if (!C.ROLES.includes(patch.assignedRole)) fail('Unknown role.'); t.assignedRole = patch.assignedRole; }
      if (patch.status != null && patch.status !== t.status) {
        if (!C.TASK_STATUSES.includes(patch.status)) fail('Unknown task status.');
        if (t.kind === 'form' && patch.status === 'done') { const tp = tpl(t.templateId); const r = validateForm(tp.fields, t.formData, true); if (r.errors.length) fail('The form is not complete yet: ' + r.errors[0].msg); }
        t.status = patch.status; t.completedAt = patch.status === 'done' ? now() : null; t.completedBy = patch.status === 'done' ? u.id : null;
        log(t.dealId, u.id, 'task.status', 'task', t.id, `${t.title}: ${patch.status}`);
      }
      save(); return clone(t);
    },
    // Intake forms. complete=false saves partial work (only filled values are checked). complete=true validates required fields and marks the task done.
    async saveTaskForm(id, input, { complete = false } = {}) {
      const u = needUser(); const t = taskOr404(u, id); if (!canFill(u, t)) fail('You cannot fill in this task.');
      const tp = tpl(t.templateId) || fail('Task template missing.');
      const r = validateForm(tp.fields, input || {}, complete);
      for (const f of tp.fields.filter((z) => z.type === 'doc' && r.data[z.k] && fieldActive(z, r.data))) {
        const doc = load().documents.find((z) => z.id === r.data[f.k]); if (!doc || doc.dealId !== t.dealId) r.errors.push({ k: f.k, msg: `${f.label}: upload the file again.` });
      }
      if (r.errors.length) { const e = new Error(r.errors.map((z) => z.msg).join(' ')); e.fieldErrors = r.errors; throw e; }
      t.formData = r.data; t.savedAt = now();
      if (complete) { t.status = 'done'; t.completedAt = now(); t.completedBy = u.id; log(t.dealId, u.id, 'task.completed', 'task', t.id, `${t.title}: completed`);
        const deal = load().deals.find((z) => z.id === t.dealId); notify([deal.processorId], { kind: 'task', dealId: t.dealId, title: `${nameOf(u.id)} completed ${t.title}`, link: `#/deals/${t.dealId}/tasks/${t.id}` }, u.id); }
      else { if (t.status !== 'blocked') t.status = 'in_progress'; t.completedAt = null; t.completedBy = null; log(t.dealId, u.id, 'task.saved', 'task', t.id, `${t.title}: progress saved`); }
      save(); return clone(out(u, t));
    },
    // Upload a file for a form field (e.g. photo ID). Filed under "IDs & personal", visible to the owner's side only.
    async uploadForTask(id, file) {
      const u = needUser(); const t = taskOr404(u, id); if (!canFill(u, t)) fail('You cannot fill in this task.');
      const side = C.sideOf(t.assignedRole); const doc = x.newDoc(u, { ...file, visibility: side || 'staff' }); doc.dealId = t.dealId;
      const f = load().folders.find((z) => z.dealId === t.dealId && z.name === 'IDs & personal'); doc.folderId = f ? f.id : null;
      load().documents.push(doc); log(t.dealId, u.id, 'document.uploaded', 'document', doc.id, `Uploaded ${doc.name} for ${t.title}`); save(); return { id: doc.id, name: doc.name };
    },
    // ---------- Templates ----------
    async listTaskTemplates() {
      const u = needUser(); if (!(u.isAdmin || isManager(u))) fail('Task templates are for staff.');
      const d = load(); return clone(d.taskTemplates.map((t) => ({ ...t, copies: d.tasks.filter((z) => z.templateId === t.id).length, publishedByName: nameOf(t.publishedBy) }))
        .sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version));
    },
    async publishTemplateVersion(code, patch) {   // Admin: new version; existing copies keep the version they were made from
      const u = needAdmin(); const d = load(); const cur = d.taskTemplates.filter((t) => t.code === code).sort((a, b) => b.version - a.version)[0] || fail('Template not found.');
      const nv = { ...clone(cur), id: `tt-${code}-v${cur.version + 1}`, version: cur.version + 1, title: str(patch.title, 200) || cur.title, description: patch.description != null ? str(patch.description, 1000) : cur.description,
        dueDays: patch.dueDays ? Math.max(1, Math.min(90, Number(patch.dueDays) || cur.dueDays)) : cur.dueDays, active: true, publishedBy: u.id, publishedAt: now() };
      d.taskTemplates.filter((t) => t.code === code).forEach((t) => { t.active = false; }); d.taskTemplates.push(nv);
      log(null, u.id, 'template.published', 'template', nv.id, `Published ${nv.title} v${nv.version}`); save(); return clone(nv);
    },
    // ---------- Reminders: QUEUED ONLY. Nothing is ever sent from this build. ----------
    async sendTaskReminder(id) {
      const u = needUser(); const t = taskOr404(u, id); if (!isManager(u)) fail('Only the processor or coordinator can queue reminders.');
      if (!OPEN.includes(t.status)) fail('Only open tasks get reminders.'); const n = queueReminder(u, t); save(); return { queued: n };
    },
    async queueOverdueReminders() {
      const u = needUser(); if (!isManager(u)) fail('Only the processor or coordinator can queue reminders.');
      const today = now().slice(0, 10); const ids = new Set(dealsFor(u).filter((q) => q.status === 'Open').map((q) => q.id)); let n = 0;
      load().tasks.filter((t) => ids.has(t.dealId) && OPEN.includes(t.status) && t.dueDate && t.dueDate < today).forEach((t) => { n += queueReminder(u, t); });
      save(); return { queued: n };
    },
    async listOutbox() {
      const u = needUser(); if (!(u.isAdmin || isManager(u))) fail('The outbox is for staff.');
      const ids = new Set(dealsFor(u).map((q) => q.id));
      return clone(load().outbox.filter((o) => u.isAdmin || ids.has(o.dealId)).map((o) => ({ ...o, toName: nameOf(o.toProfileId), fileNumber: (load().deals.find((q) => q.id === o.dealId) || {}).fileNumber })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
  };
}
