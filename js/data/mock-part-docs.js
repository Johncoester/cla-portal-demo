/* mock adapter, part 2: contacts, participants, tasks, documents. NOTE: there is no delete for documents. */
export function contactsTasksDocs(x) {
  const { load, save, nid, needUser, needProcessor, notViewOnly, dealsFor, dealOr404, log, nameOf, roleOf, fullName, docVisible, participantsOf, contactOf, clone, now, fail, str, emailOk, C } = x;
  const manager = (u) => C.isProcessor(u.role) || u.role === 'Transaction Coordinator';
  return {
    // ---------- Contacts & participants ----------
    async listContacts(search = '') {
      const u = needUser(); const d = load(); const q = search.toLowerCase(); let list = d.contacts;
      if (!C.isProcessor(u.role)) { const ids = new Set(); dealsFor(u).forEach((z) => participantsOf(z.id, u).forEach((p) => ids.add(p.contactId))); list = list.filter((c) => ids.has(c.id)); }
      return clone(list.filter((c) => !q || `${fullName(c)} ${c.email} ${c.company}`.toLowerCase().includes(q)).sort((a, b) => fullName(a).localeCompare(fullName(b))));
    },
    async createContact(input) {
      const u = needProcessor(); const d = load();
      const c = { id: nid('c'), profileId: null, firstName: str(input.firstName, 80) || fail('First name is required.'), lastName: str(input.lastName, 80),
        email: str(input.email, 200).toLowerCase(), phone: str(input.phone, 40), company: str(input.company, 120), createdBy: u.id, createdAt: now() };
      if (c.email && !emailOk(c.email)) fail('Email is not valid.');
      if (c.email && d.contacts.some((z) => z.email === c.email)) fail('A contact with this email already exists.');
      d.contacts.push(c); save(); return clone(c);
    },
    async updateContact(id, patch) {
      needProcessor(); const c = load().contacts.find((z) => z.id === id) || fail('Contact not found.');
      ['firstName', 'lastName', 'phone', 'company'].forEach((k) => { if (patch[k] != null) c[k] = str(patch[k], 120); });
      if (!c.firstName) fail('First name is required.');
      if (patch.email != null) { const e = str(patch.email, 200).toLowerCase(); if (e && !emailOk(e)) fail('Email is not valid.'); c.email = e; }
      const p = c.profileId && load().profiles.find((z) => z.id === c.profileId); if (p) { p.firstName = c.firstName; p.lastName = c.lastName; p.phone = c.phone; }
      save(); return clone(c);
    },
    async addParticipant(dealId, contactId, role) {
      const u = needProcessor(); const d = load(); d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      if (!C.PARTICIPANT_ROLES.includes(role)) fail('Unknown role.'); const c = d.contacts.find((z) => z.id === contactId) || fail('Contact not found.');
      if (d.participants.some((p) => p.dealId === dealId && p.contactId === contactId && p.role === role)) fail('That person already has this role on the order.');
      d.participants.push({ id: nid('dp'), dealId, contactId, role, createdAt: now() }); log(dealId, u.id, 'participant.added', 'contact', contactId, `${fullName(c)} added as ${role}`); save(); return true;
    },
    async removeParticipant(dealId, participantId) {   // removes the link to this order only; the contact, their documents and messages stay
      const u = needProcessor(); const d = load(); const i = d.participants.findIndex((p) => p.id === participantId && p.dealId === dealId); if (i < 0) fail('Participant not found.');
      const c = d.contacts.find((z) => z.id === d.participants[i].contactId); const role = d.participants[i].role; d.participants.splice(i, 1);
      log(dealId, u.id, 'participant.removed', 'contact', c && c.id, `${c ? fullName(c) : 'Contact'} removed from role ${role}`); save(); return true;
    },
    // ---------- Tasks (cancel, never delete) ----------
    async listTasks(dealId) {
      const u = needUser(); dealOr404(u, dealId);
      return clone(load().tasks.filter((t) => t.dealId === dealId).sort((a, b) => ((a.status === 'done') - (b.status === 'done')) || (a.dueDate || '9').localeCompare(b.dueDate || '9')));
    },
    async createTask(dealId, input) {
      const u = needUser(); dealOr404(u, dealId); if (!manager(u)) fail('Only the processor or transaction coordinator can add tasks.');
      const role = C.ROLES.includes(input.assignedRole) ? input.assignedRole : 'Sales Processor';
      const t = { id: nid('t'), dealId, title: str(input.title, 200) || fail('Task title is required.'), description: str(input.description, 1000), assignedRole: role, status: 'todo',
        dueDate: str(input.dueDate, 10) || null, completedAt: null, completedBy: null, createdBy: u.id, createdAt: now() };
      load().tasks.push(t); log(dealId, u.id, 'task.created', 'task', t.id, `Task added: ${t.title}`); save(); return clone(t);
    },
    async updateTask(id, patch) {
      const u = needUser(); const t = load().tasks.find((z) => z.id === id) || fail('Task not found.'); dealOr404(u, t.dealId);
      if (!manager(u)) {   // everyone else may only tick/untick a task assigned to their own role
        if (Object.keys(patch).some((k) => k !== 'status') || t.assignedRole !== u.role || !['todo', 'done'].includes(patch.status)) fail('You can only complete tasks assigned to you.');
      }
      if (patch.title != null) t.title = str(patch.title, 200) || fail('Task title is required.');
      if (patch.description != null) t.description = str(patch.description, 1000);
      if (patch.dueDate !== undefined) t.dueDate = str(patch.dueDate, 10) || null;
      if (patch.assignedRole != null) { if (!C.ROLES.includes(patch.assignedRole)) fail('Unknown role.'); t.assignedRole = patch.assignedRole; }
      if (patch.status != null) {
        if (!C.TASK_STATUSES.includes(patch.status)) fail('Unknown task status.');
        if (patch.status !== t.status) {
          t.status = patch.status; t.completedAt = patch.status === 'done' ? now() : null; t.completedBy = patch.status === 'done' ? u.id : null;
          log(t.dealId, u.id, 'task.status', 'task', t.id, `${t.title}: ${patch.status}`);
        }
      }
      save(); return clone(t);
    },
    // ---------- Documents: list / add / edit details / open. There is NO delete, by design. ----------
    async listDocuments(dealId) {
      const u = needUser(); dealOr404(u, dealId);
      return clone(load().documents.filter((z) => z.dealId === dealId && docVisible(u, z))
        .map((z) => ({ ...z, dataUrl: undefined, hasContent: !!z.dataUrl, uploadedByName: nameOf(z.uploadedBy), uploadedByRole: roleOf(z.uploadedBy) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async addDocument(dealId, { name, description, mimeType, size, dataUrl, visibility }) {
      const u = needUser(); dealOr404(u, dealId); notViewOnly(u);
      const n = str(name, 200).replace(/[\\/]/g, '_'); if (!n) fail('A file name is required.');
      const ext = (n.split('.').pop() || '').toLowerCase(); if (!C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`.${ext} files are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
      if (!(size >= 0) || size > C.MAX_UPLOAD_BYTES) fail(`File is too large (demo limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
      const vis = C.DOC_VISIBILITY.includes(visibility) ? visibility : 'all';
      if (C.isClient(u.role) && vis === 'staff') fail('Clients cannot make staff-only documents.');
      const doc = { id: nid('doc'), dealId, name: n, description: str(description, 500), mimeType: str(mimeType, 100) || 'application/octet-stream', size: Number(size) || 0,
        dataUrl: dataUrl || null, uploadedBy: u.id, visibility: vis, createdAt: now() };
      load().documents.push(doc); log(dealId, u.id, 'document.uploaded', 'document', doc.id, `Uploaded ${doc.name}`); save(); return clone({ ...doc, dataUrl: undefined });
    },
    async updateDocumentMeta(id, patch) {   // description / visibility only. Files are never replaced or removed.
      const u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); dealOr404(u, z.dealId);
      if (!(C.isProcessor(u.role) || z.uploadedBy === u.id)) fail('Only the uploader or a processor can edit this document.');
      if (patch.description != null) z.description = str(patch.description, 500);
      if (patch.visibility != null) { if (!C.DOC_VISIBILITY.includes(patch.visibility)) fail('Unknown visibility.'); if (C.isClient(u.role) && patch.visibility === 'staff') fail('Clients cannot make staff-only documents.'); z.visibility = patch.visibility; }
      log(z.dealId, u.id, 'document.updated', 'document', id, `Updated details of ${z.name}`); save(); return true;
    },
    async getDocumentContent(id) {
      const u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); dealOr404(u, z.dealId); if (!docVisible(u, z)) fail('Document not found.');
      log(z.dealId, u.id, 'document.viewed', 'document', id, `Opened ${z.name}`); save();
      return { name: z.name, mimeType: z.mimeType, dataUrl: z.dataUrl || ('data:text/plain;charset=utf-8,' + encodeURIComponent(`FAKE DEMO FILE\n${z.name}\n(Seed documents have no real content.)\n`)) };
    },
  };
}
