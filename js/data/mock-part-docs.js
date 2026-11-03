/* mock adapter: contacts, participants, documents (deal files). NOTE: there is no delete for documents, for anyone (Admin included). */
import { cleanEntity } from './mock-part-nov3b.js?v=202611031532';
export function contactsTasksDocs(x) {
  const { load, save, nid, needUser, needProcessor, isManager, notViewOnly, seesAll, dealsFor, dealOr404, onDeal, fileRole, log, prof, nameOf, roleOf, fullName, folderOf, docVisible, participantsOf, notify, dealProfileIds, clone, now, fail, str, emailOk, C } = x;
  const docOut = (z) => ({ ...z, wireInstructions: x.isWireDoc(z), dataUrl: undefined, hasContent: !!(z.dataUrl || z.hasFile), uploadedByName: nameOf(z.uploadedBy), uploadedByRole: x.fileRoleText(z.uploadedBy, z.dealId), folderName: (folderOf(z.folderId) || {}).name || '' });
  // CONTACT TYPE (John, Nov 2): '' / null = not set; otherwise one of the fixed codes. A contact with a CLA staff login has none.
  const ctype = (v, login) => { const s = str(v, 20); if (!s) return null; if (!C.CONTACT_TYPE_CODES.includes(s)) fail('Pick a contact type from the list (Realtor, Lender or Buyer/Seller).');
    if (login && login.status !== 'removed' && !C.isOutside(login.role)) fail('CLA staff have no contact type.'); return s; };
  const api = {
    // ---------- Contacts & participants ----------
    async listContacts(search = '') {
      let u = needUser(); const d = load(); const q = search.toLowerCase(); let list = d.contacts;
      if (!(C.runsOrders(u) || u.isAdmin)) {   // the contacts this person can see on their orders, with the same contact-info rule as the order (opposing side: no phone/email)
        const seen = new Map(); dealsFor(u).forEach((z) => participantsOf(z.id, x.scopeTo(u, z.id)).forEach((p) => { if (p.contact && (!seen.has(p.contactId) || seen.get(p.contactId).contactHidden)) seen.set(p.contactId, p.contact); }));
        list = [...seen.values()]; }
      return clone(list.filter((c) => !q || `${fullName(c)} ${c.email} ${c.company}`.toLowerCase().includes(q)).sort((a, b) => fullName(a).localeCompare(fullName(b))));
    },
    async createContact(input) {
      const u = needProcessor(); const d = load();
      const c = { id: nid('c'), profileId: null, firstName: str(input.firstName, 80) || fail('First name is required.'), lastName: str(input.lastName, 80),
        email: str(input.email, 200).toLowerCase(), phone: x.phone(input.phone), company: str(input.company, 120), contactType: ctype(input.contactType), createdBy: u.id, createdAt: now() };
      if (c.email && !emailOk(c.email)) fail('Email is not valid.');
      if (c.email && d.contacts.some((z) => z.email === c.email)) fail('A contact with this email already exists.');
      if (c.email && d.profiles.some((z) => z.email === c.email && z.status !== 'removed')) fail('A user with this email already exists.');
      d.contacts.push(c); save(); return clone(c);
    },
    async updateContact(id, patch) {
      needProcessor(); const c = load().contacts.find((z) => z.id === id) || fail('Contact not found.');
      ['firstName', 'lastName', 'company'].forEach((k) => { if (patch[k] != null) c[k] = str(patch[k], 120); }); if (patch.phone != null) c.phone = x.phone(patch.phone);
      if (!c.firstName) fail('First name is required.');
      if (patch.email != null) { const e = str(patch.email, 200).toLowerCase(); if (e && !emailOk(e)) fail('Email is not valid.');
        if (e && e !== c.email && load().contacts.some((z) => z.id !== c.id && z.email === e)) fail('A contact with this email already exists.'); c.email = e; }
      if (patch.contactType !== undefined) { const t = ctype(patch.contactType, c.profileId && prof(c.profileId)); if (t !== (c.contactType || null)) log(null, needUser().id, 'contact.type', 'contact', c.id, `Contact type of ${fullName(c)} set to ${C.contactTypeLabel(t) || 'not set'}`); c.contactType = t; }
      const p = c.profileId && prof(c.profileId); if (p) { p.firstName = c.firstName; p.lastName = c.lastName; p.phone = c.phone; }
      save(); return clone(c);
    },
    // Matt, Nov 3 (b): opts.entity = a buyer / seller who is an entity (name, type, Entity Representative); see cleanEntity
    async addParticipant(dealId, contactId, role, opts = {}) {
      const u = needProcessor(); const d = load(); d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      if (!C.PARTICIPANT_ROLES.includes(role)) fail('Unknown role.'); const c = d.contacts.find((z) => z.id === contactId) || fail('Contact not found.');
      if (d.participants.some((p) => p.dealId === dealId && p.contactId === contactId && p.role === role)) fail('That person already has this role on the order.');
      // per-file roles: an outside user's login takes its permissions from this row, so keep it unambiguous
      const login = c.profileId && prof(c.profileId);
      if (login && login.status !== 'removed' && C.isOutside(login.role)) {
        if (C.DEAL_ROLES.includes(role) && !C.OUTSIDE_FILE_ROLES.includes(role)) fail('An outside user cannot be added as CLA staff. Pick Buyer Agent, Listing Agent, Client-Buyer or Client-Seller.');
        // one agent/client role per order, EXCEPT an agent buying or selling for themselves: Client-Buyer + Buyer Agent, or Client-Seller + Listing Agent
        const has = d.participants.filter((p) => p.dealId === dealId && p.contactId === contactId && C.OUTSIDE_FILE_ROLES.includes(p.role));
        if (has.length && C.OUTSIDE_FILE_ROLES.includes(role) && !(has.length === 1 && C.pairAllowed(has[0].role, role)))
          fail(`This person is already the ${has.map((h) => h.role).join(' and ')} on this order. Only an agent buying or selling for themselves can hold two roles (Client-Buyer + Buyer Agent, or Client-Seller + Listing Agent); remove that role first.`);
      } else if (login && login.status !== 'removed' && C.OUTSIDE_FILE_ROLES.includes(role)) fail('This is a CLA staff login, so it keeps its staff role on every order. Agents and clients need an outside-user login.');
      // John, Nov 2: a file's Transaction Coordinator must be an ACTIVE user whose account role is exactly 'Transaction Coordinator' (not a Processor, salesperson, agent or a contact without a login)
      if (role === 'Transaction Coordinator' && !(login && login.status === 'active' && login.role === 'Transaction Coordinator'))
        fail('Only an active user with the Transaction Coordinator role can be the Transaction Coordinator on an order.');
      const entity = cleanEntity(opts && opts.entity, role, x);
      const p = { id: nid('dp'), dealId, contactId, role, createdAt: now(), ...(entity ? { entity } : {}) }; d.participants.push(p);
      log(dealId, u.id, 'participant.added', 'contact', contactId, `${fullName(c)} added as ${role}`);
      const n = x.makeCopies(dealId, p, u.id); save(); return { ok: true, tasksCreated: n };
    },
    async removeParticipant(dealId, participantId) {   // removes the link to this order only; the contact, their documents and messages stay; their open task copies are cancelled
      const u = needProcessor(); const d = load(); const i = d.participants.findIndex((p) => p.id === participantId && p.dealId === dealId); if (i < 0) fail('Participant not found.');
      const c = d.contacts.find((z) => z.id === d.participants[i].contactId); const role = d.participants[i].role; d.participants.splice(i, 1);
      d.tasks.filter((t) => t.participantId === participantId && ['todo', 'in_progress', 'blocked'].includes(t.status)).forEach((t) => { t.status = 'cancelled'; });
      log(dealId, u.id, 'participant.removed', 'contact', c && c.id, `${c ? fullName(c) : 'Contact'} removed from role ${role}`); save(); return true;
    },
    // ---------- Documents: list / add / move / edit details / open. There is NO delete, by design. ----------
    async listDocuments(dealId, { folderId } = {}) {
      let u = needUser(); u = onDeal(u, dealId);
      return clone(load().documents.filter((z) => z.dealId === dealId && docVisible(u, z) && (folderId === undefined || (folderId === '' ? !z.folderId : z.folderId === folderId)))
        .map(docOut).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async addDocument(dealId, { name, description, mimeType, size, dataUrl, visibility, folderId, docType, wireInstructions }) {
      let u = needUser(); u = onDeal(u, dealId); notViewOnly(u);
      const doc = x.newDoc(u, { name, description, mimeType, size, dataUrl, visibility, docType, wireInstructions }); doc.dealId = dealId;
      if (folderId) { const f = folderOf(folderId); if (!f || f.dealId !== dealId) fail('That folder is not part of this order.'); doc.folderId = f.id; } else doc.folderId = null;
      await x.keepFile(doc); load().documents.push(doc); log(dealId, u.id, 'document.uploaded', 'document', doc.id, `Uploaded ${doc.name}`);
      notify(dealProfileIds(dealId).filter((pid) => docVisible(prof(pid), doc)), { kind: 'document', dealId, title: `${nameOf(u.id)} uploaded ${doc.name}`, link: `#/deals/${dealId}/documents` }, u.id);
      save(); return clone(docOut(doc));
    },
    async moveDocument(id, folderId) {   // file a document into another folder of the same order (processor / coordinator)
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); if (!z.dealId) fail('Use the Library to manage library files.');
      u = onDeal(u, z.dealId); if (!isManager(u)) fail('Only the processor or coordinator can move documents.');
      if (folderId) { const f = folderOf(folderId); if (!f || f.dealId !== z.dealId) fail('That folder is not part of this order.'); }
      z.folderId = folderId || null; log(z.dealId, u.id, 'document.moved', 'document', id, `Moved ${z.name} to ${folderId ? folderOf(folderId).name : 'Unfiled'}`); save(); return true;
    },
    async updateDocumentMeta(id, patch) {   // description / visibility only. Files are never replaced or removed.
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); if (z.dealId) u = onDeal(u, z.dealId); else if (!docVisible(u, z)) fail('Document not found.');
      if (!(C.runsOrders(u) || z.uploadedBy === u.id)) fail('Only the uploader or a processor can edit this document.');
      if (patch.description != null) z.description = str(patch.description, 500);
      if (patch.docType != null) z.docType = docTypeOf(u, patch.docType);
      if (patch.visibility != null) { if (!C.DOC_VISIBILITY.includes(patch.visibility)) fail('Unknown visibility.'); visCheck(u, patch.visibility); z.visibility = patch.visibility; }
      // wire instructions (John, Nov 3): CLA staff mark / unmark a file. A file whose NAME says wire instructions always stays marked.
      if (patch.wireInstructions != null) { const want = patch.wireInstructions === true || patch.wireInstructions === 'on' || patch.wireInstructions === 'true';
        if (!x.isStaffView(u) || C.viewOnly(u)) fail('Only CLA Title staff can mark wire instructions.');
        if (!want && x.isWireDocName(z.name)) fail('This file is named as wire instructions, so it stays buyer-only. Upload it again under another name if it is not.');
        if (z.wireInstructions !== want) log(z.dealId, u.id, 'document.updated', 'document', id, `${want ? 'Marked' : 'Unmarked'} ${z.name} as wire instructions`); z.wireInstructions = want; }
      log(z.dealId, u.id, 'document.updated', 'document', id, `Updated details of ${z.name}`); save(); return true;
    },
    async getDocumentContent(id) {
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.');
      if (z.dealId) u = onDeal(u, z.dealId); if (!docVisible(u, z)) fail('Document not found.');
      log(z.dealId, u.id, 'document.viewed', 'document', id, `Opened ${z.name}`); save(); const content = await x.fileContent(z);
      return { name: z.name, mimeType: z.mimeType, dataUrl: content || ('data:text/plain;charset=utf-8,' + encodeURIComponent(`FAKE DEMO FILE\n${z.name}\n(Seed documents have no real content.)\n`)) };
    },
  };
  // u = the deal-scoped user. Outside users: 'all' or their own side only (never staff-only, never the other side).
  const visCheck = (u, vis) => { if (C.visibilityChoices(u.role, u.isAdmin).includes(vis)) return;
    if (vis === 'staff') fail(C.isClient(u.role) ? 'Clients cannot make staff-only documents.' : 'Only CLA staff can make staff-only documents.');
    if (C.isClient(u.role)) fail('Clients share files with CLA Title (and their own agent) only.');
    fail(`You can share a file with everyone on the order${C.sideOf(u.role) ? ` or your own side (${C.sideOf(u.role)} side)` : ''} only.`); };
  // shared by deal uploads, task ID uploads and the Library
  // DOCUMENT TYPE (Matt, Oct 31): optional; sellers choose from the seller list (payoff statement, HOA docs, deed ...), the buyer side from the general list, staff from all.
  const docTypeOf = (u, v) => { const s = str(v, 60); if (!s) return ''; const ok = x.isStaffView(u) ? C.DOC_TYPES : C.docTypeChoices(u.role); if (!ok.includes(s)) fail('Pick a document type from the list.'); return s; };
  x.docTypeOf = docTypeOf;
  x.newDoc = (u, { name, description, mimeType, size, dataUrl, visibility, docType, wireInstructions }) => {
    const full = String(name == null ? '' : name).trim().replace(/[\\/]/g, '_'); if (!full) fail('A file name is required.');
    const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
    if (!ext) fail(`Files without an extension are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
    if (!C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`.${ext} files are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
    const n = full.length > 200 ? full.slice(0, 199 - ext.length) + '.' + ext : full;   // long names are cut but keep their extension
    if (!(size >= 0) || size > C.MAX_UPLOAD_BYTES) fail(`File is too large (demo limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
    const vis = C.DOC_VISIBILITY.includes(visibility) ? visibility : C.visibilityChoices(u.role, u.isAdmin)[0];   // default: 'all' for staff/agents, own side for clients
    visCheck(u, vis);
    return { id: nid('doc'), dealId: null, folderId: null, name: n, description: str(description, 500), mimeType: str(mimeType, 100) || 'application/octet-stream', size: Number(size) || 0,
      dataUrl: dataUrl || null, uploadedBy: u.id, visibility: vis, docType: docTypeOf(u, docType),
      // wire instructions (John, Nov 3): staff may mark a file; any file NAMED as wire instructions is marked whoever uploads it. Buyer clients + staff only.
      wireInstructions: x.isWireDocName(n) || (!!wireInstructions && wireInstructions !== 'false' && x.isStaffView(u)), createdAt: now() };
  };
  x.docOut = docOut;
  return api;
}
