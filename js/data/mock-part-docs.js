/* mock adapter: contacts, participants, documents (deal files). NOTE: there is no delete for documents, for anyone (Admin included). */
import { cleanEntity } from './mock-part-nov3b.js?v=202611120100';
import { cleanLenderRole } from './lender-file.js?v=202611101200';
import { isRefi, REFI_BLOCKED_ROLES, refiRoleMsg } from './constants.js?v=202611101015';
import { acceptDocType } from './document-type.js?v=202611100945';
import { assertContactSaved, duplicatePartyMessage, sameParty } from './contact-save.js?v=202611101130';
export function contactsTasksDocs(x) {
  const { load, save, nid, needUser, needProcessor, isManager, notViewOnly, seesAll, dealsFor, dealOr404, onDeal, fileRole, log, prof, nameOf, roleOf, fullName, folderOf, docVisible, participantsOf, notify, dealProfileIds, clone, now, fail, str, emailOk, C } = x;
  // u = the deal-scoped viewer (optional). A pure buyer never gets the name, role or id of another party who uploaded a file CLA staff shared with
  // them (e.g. the listing agent): it reads "CLA Title & Escrow" (John, Nov 4). Staff get buyerShareable = the Share-with-buyer switch applies.
  const staffLogin = (pid) => { const p = prof(pid); return !!p && !C.isOutside(p.role); };
  // SELLER MIRROR (Nov 4): a pure seller sees "CLA Title & Escrow" for a buyer-side upload CLA shared with them (their own listing agent's uploads keep his name)
  const sellerMasked = (z, u) => !!u && !!z.dealId && x.pureSeller(u) && z.uploadedBy !== u.id && !staffLogin(z.uploadedBy) && x.personSide(z.uploadedBy, z.dealId) !== 'seller';
  const sellerShareable = (z, u, f) => !!u && !!z.dealId && x.isStaffView(u) && !staffLogin(z.uploadedBy) && !x.fileRoles(z.uploadedBy, z.dealId).includes('Client-Seller') && x.personSide(z.uploadedBy, z.dealId) !== 'seller' && !x.isWireDoc(z) && z.visibility !== 'staff' && !(f && f.staffOnly);
  const docOut = (z, u) => { const masked = (!!u && z.dealId && x.pureBuyer(u) && z.uploadedBy !== u.id && !staffLogin(z.uploadedBy)) || sellerMasked(z, u);
    const f = folderOf(z.folderId);
    return { ...z, wireInstructions: x.isWireDoc(z), dataUrl: undefined, hasContent: !!(z.dataUrl || z.hasFile), uploadedBy: masked ? null : z.uploadedBy,
      uploadedByName: masked ? 'CLA Title & Escrow' : nameOf(z.uploadedBy), uploadedByRole: masked ? 'Shared with you by CLA Title' : x.fileRoleText(z.uploadedBy, z.dealId), folderName: (f || {}).name || '',
      sharedWithClient: z.sharedWithClient === true, sharedWithClientBy: z.sharedWithClientBy || null, sharedWithClientByName: z.sharedWithClientBy ? nameOf(z.sharedWithClientBy) : '', sharedWithClientAt: z.sharedWithClientAt || null,
      sharedWithSeller: z.sharedWithSeller === true, sharedWithSellerBy: z.sharedWithSellerBy || null, sharedWithSellerByName: z.sharedWithSellerBy ? nameOf(z.sharedWithSellerBy) : '', sharedWithSellerAt: z.sharedWithSellerAt || null,
      // the client's own "Shared with you by CLA Title" pill: the buyer reads the buyer flag, the seller the seller flag (never the other side's)
      sharedWithMe: !!u && ((x.pureBuyer(u) && z.sharedWithClient === true) || (x.pureSeller(u) && z.sharedWithSeller === true && sellerMasked(z, u))),
      sellerShareable: sellerShareable(z, u, f),
      buyerShareable: !!u && !!z.dealId && x.isStaffView(u) && !staffLogin(z.uploadedBy) && !x.fileRoles(z.uploadedBy, z.dealId).includes('Client-Buyer') && z.visibility !== 'staff' && !(f && f.staffOnly) }; };
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
      const companyName = str(input.company, 120);
      const given = str(input.firstName, 80);
      if (!given && !companyName) fail('A name or a company name is required.');
      const c = { id: nid('c'), profileId: null, firstName: given, lastName: str(input.lastName, 80),
        email: str(input.email, 200).toLowerCase(), phone: x.phone(input.phone), company: companyName, contactType: ctype(input.contactType), createdBy: u.id, createdAt: now() };
      try { c.lenderRole = cleanLenderRole(input.lenderRole, c.contactType); } catch (e) { fail(e.message); }
      if (c.email && !emailOk(c.email)) fail('Email is not valid.');
      if (c.email && d.contacts.some((z) => z.email === c.email)) fail('A contact with this email already exists.');
      if (c.email && d.profiles.some((z) => z.email === c.email && z.status !== 'removed')) fail('A user with this email already exists.');
      d.contacts.push(c); save(); return clone(c);
    },
    async updateContact(id, patch) {
      needProcessor(); const c = load().contacts.find((z) => z.id === id) || fail('Contact not found.');
      ['firstName', 'lastName', 'company'].forEach((k) => { if (patch[k] != null) c[k] = str(patch[k], 120); }); if (patch.phone != null) c.phone = x.phone(patch.phone);
      if (!c.firstName && !c.company) fail('A name or a company name is required.');
      if (patch.email != null) { const e = str(patch.email, 200).toLowerCase(); if (e && !emailOk(e)) fail('Email is not valid.');
        if (e && e !== c.email && load().contacts.some((z) => z.id !== c.id && z.email === e)) fail('A contact with this email already exists.'); c.email = e; }
      if (patch.contactType !== undefined) { const t = ctype(patch.contactType, c.profileId && prof(c.profileId)); if (t !== (c.contactType || null)) log(null, needUser().id, 'contact.type', 'contact', c.id, `Contact type of ${fullName(c)} set to ${C.contactTypeLabel(t) || 'not set'}`); c.contactType = t; }
      if (patch.lenderRole !== undefined || patch.contactType !== undefined) { try { c.lenderRole = cleanLenderRole(patch.lenderRole !== undefined ? patch.lenderRole : c.lenderRole, c.contactType); } catch (e) { fail(e.message); } }
      const p = c.profileId && prof(c.profileId); if (p) { p.firstName = c.firstName; p.lastName = c.lastName; p.phone = c.phone; }
      save(); return assertContactSaved(patch, clone(c));
    },
    // Matt, Nov 3 (b): opts.entity = a buyer / seller who is an entity (name, type, Entity Representative); see cleanEntity
    async addParticipant(dealId, contactId, role, opts = {}) {
      const u = needProcessor(); const d = load(); const deal = d.deals.find((z) => z.id === dealId) || fail('Order not found.');
      if (!C.PARTICIPANT_ROLES.includes(role)) fail('Unknown role.');
      if (isRefi(deal) && REFI_BLOCKED_ROLES.includes(role)) fail(refiRoleMsg(role));   // John, Nov 3: refinance = borrower(s), salespeople, Processor, Lender (migration 32)
      const c = d.contacts.find((z) => z.id === contactId) || fail('Contact not found.');
      const onFile = d.participants.filter((p) => p.dealId === dealId && p.role === role).map((p) => ({ role: p.role, contactId: p.contactId, contact: d.contacts.find((z) => z.id === p.contactId) || {} }));
      if (sameParty(onFile, c, role)) fail(duplicatePartyMessage(c, role));
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
        .map((z) => docOut(z, u)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
    async addDocument(dealId, { name, description, mimeType, size, dataUrl, visibility, folderId, docType, wireInstructions }) {
      let u = needUser(); u = onDeal(u, dealId); notViewOnly(u);
      const doc = x.newDoc(u, { name, description, mimeType, size, dataUrl, visibility, docType, wireInstructions }); doc.dealId = dealId;
      if (folderId) { const f = folderOf(folderId); if (!f || f.dealId !== dealId) fail('That folder is not part of this order.'); doc.folderId = f.id; } else doc.folderId = null;
      await x.keepFile(doc); load().documents.push(doc); log(dealId, u.id, 'document.uploaded', 'document', doc.id, `Uploaded ${doc.name}`);
      // notified = the people who can open it AS THEY ACT ON THIS ORDER (scoped: a buyer is not told about a listing agent's upload, Nov 4)
      notify(dealProfileIds(dealId).filter((pid) => docVisible(x.scopeTo(prof(pid), dealId), doc)), { kind: 'document', dealId, title: `${nameOf(u.id)} uploaded ${doc.name}`, link: `#/deals/${dealId}/documents` }, u.id);
      save(); return clone(docOut(doc, u));
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
      if (patch.visibility != null) { patch.visibility = buyerVis(u, patch.visibility); if (!C.DOC_VISIBILITY.includes(patch.visibility)) fail('Unknown visibility.'); visCheck(u, patch.visibility); z.visibility = patch.visibility; }
      // wire instructions (John, Nov 3): CLA staff mark / unmark a file. A file whose NAME says wire instructions always stays marked.
      if (patch.wireInstructions != null) { const want = patch.wireInstructions === true || patch.wireInstructions === 'on' || patch.wireInstructions === 'true';
        if (!x.isStaffView(u) || C.viewOnly(u)) fail('Only CLA Title staff can mark wire instructions.');
        if (!want && x.isWireDocName(z.name)) fail('This file is named as wire instructions, so it stays buyer-only. Upload it again under another name if it is not.');
        if (z.wireInstructions !== want) log(z.dealId, u.id, 'document.updated', 'document', id, `${want ? 'Marked' : 'Unmarked'} ${z.name} as wire instructions`); z.wireInstructions = want; }
      log(z.dealId, u.id, 'document.updated', 'document', id, `Updated details of ${z.name}`); save(); return true;
    },
    // SHARE WITH CLIENT (John, Nov 4): CLA staff (processor / coordinator / Admin, not view-only) share another party's upload, e.g. the listing
    // agent's, with the buyer(s) on the file, or stop sharing it. Stored on the document (sharedWithClient, sharedWithClientBy, sharedWithClientAt =
    // who / when it was last shared); every change is in the activity log. Nothing is deleted; turning it off keeps who shared it before.
    async shareDocumentWithClient(id, share = true) {
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); if (!z.dealId) fail('Library files are shared from the Library.');
      u = onDeal(u, z.dealId); if (!x.isStaffView(u) || !isManager(u) || C.viewOnly(u)) fail('Only CLA Title staff (processor, coordinator or Admin) can share a document with the buyer.');
      const on = share === true || share === 'true' || share === 'on';
      if (on) { const f = folderOf(z.folderId); if (z.visibility === 'staff' || (f && f.staffOnly)) fail('This file is staff-only. Change "Who can see it" first.');
        if (staffLogin(z.uploadedBy)) fail('CLA staff uploads already reach the buyer through "Who can see it".');
        if (x.fileRoles(z.uploadedBy, z.dealId).includes('Client-Buyer')) fail('This is the buyer\'s own upload.'); }
      if ((z.sharedWithClient === true) === on) return clone(docOut(z, u));
      z.sharedWithClient = on; if (on) { z.sharedWithClientBy = u.id; z.sharedWithClientAt = now(); }
      log(z.dealId, u.id, on ? 'document.shared_client' : 'document.unshared_client', 'document', z.id, on ? `Shared ${z.name} with the buyer` : `Stopped sharing ${z.name} with the buyer`);
      if (on) { const buyers = dealProfileIds(z.dealId).filter((pid) => { const v = x.scopeTo(prof(pid), z.dealId); return x.pureBuyer(v) && docVisible(v, z); });
        notify(buyers, { kind: 'document', dealId: z.dealId, title: `CLA Title shared a document with you: ${z.name}`, link: `#/deals/${z.dealId}/documents` }, u.id); }
      save(); return clone(docOut(z, u));
    },
    // SHARE WITH SELLER (seller mirror, Nov 4): the same staff action for the seller side. Its own typed flag (sharedWithSeller / By / At) so a file
    // CLA shares with the buyer never reaches the seller (and back). Typical use: the buyer's agent's upload the seller needs (e.g. a signed addendum).
    async shareDocumentWithSeller(id, share = true) {
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.'); if (!z.dealId) fail('Library files are shared from the Library.');
      u = onDeal(u, z.dealId); if (!x.isStaffView(u) || !isManager(u) || C.viewOnly(u)) fail('Only CLA Title staff (processor, coordinator or Admin) can share a document with the seller.');
      const on = share === true || share === 'true' || share === 'on';
      if (on) { const f = folderOf(z.folderId); if (z.visibility === 'staff' || (f && f.staffOnly)) fail('This file is staff-only. Change "Who can see it" first.');
        if (x.isWireDoc(z)) fail('Wire instructions are buyer-only and are never shared with the seller.');
        if (staffLogin(z.uploadedBy)) fail('CLA staff uploads already reach the seller through "Who can see it".');
        if (x.fileRoles(z.uploadedBy, z.dealId).includes('Client-Seller')) fail('This is the seller\'s own upload.');
        if (x.personSide(z.uploadedBy, z.dealId) === 'seller') fail('The seller already sees uploads from the seller side.'); }
      if ((z.sharedWithSeller === true) === on) return clone(docOut(z, u));
      z.sharedWithSeller = on; if (on) { z.sharedWithSellerBy = u.id; z.sharedWithSellerAt = now(); }
      log(z.dealId, u.id, on ? 'document.shared_seller' : 'document.unshared_seller', 'document', z.id, on ? `Shared ${z.name} with the seller` : `Stopped sharing ${z.name} with the seller`);
      if (on) { const sellers = dealProfileIds(z.dealId).filter((pid) => { const v = x.scopeTo(prof(pid), z.dealId); return x.pureSeller(v) && docVisible(v, z); });
        notify(sellers, { kind: 'document', dealId: z.dealId, title: `CLA Title shared a document with you: ${z.name}`, link: `#/deals/${z.dealId}/documents` }, u.id); }
      save(); return clone(docOut(z, u));
    },
    async getDocumentContent(id) {
      let u = needUser(); const z = load().documents.find((q) => q.id === id) || fail('Document not found.');
      if (z.dealId) u = onDeal(u, z.dealId); if (!docVisible(u, z)) fail('Document not found.');
      log(z.dealId, u.id, 'document.viewed', 'document', id, `Opened ${z.name}`); save(); const content = await x.fileContent(z);
      return { name: z.name, mimeType: z.mimeType, dataUrl: content || ('data:text/plain;charset=utf-8,' + encodeURIComponent(`FAKE DEMO FILE\n${z.name}\n(Seed documents have no real content.)\n`)) };
    },
  };
  // A buyer or seller 'Share with CLA Title' is their own side (staff and their agent). An old 'staff' choice is stored that way too.
  const buyerVis = (u, vis) => ((u.role === 'Client-Buyer' || u.role === 'Client-Seller') && vis === 'staff' ? (C.sideOf(u.role) || vis) : vis);
  const visCheck = (u, vis) => { if (C.visibilityChoices(u.role, u.isAdmin).includes(vis)) return;
    if (vis === 'staff') fail(C.isClient(u.role) ? 'Clients cannot make staff-only documents.' : 'Only CLA staff can make staff-only documents.');
    if (C.isClient(u.role)) fail('Clients share files with CLA Title (and their own agent) only.');
    fail(`You can share a file with everyone on the order${C.sideOf(u.role) ? ` or your own side (${C.sideOf(u.role)} side)` : ''} only.`); };
  // shared by deal uploads, task ID uploads and the Library
  // DOCUMENT TYPE (Matt, Oct 31): optional; sellers choose from the seller list (payoff statement, HOA docs, deed ...), the buyer side from the general list, staff from all.
  // Listed types and a short free-text label (Miscellaneous/Other) are both stored in docType.
  const docTypeOf = (_u, v) => acceptDocType(v);
  x.docTypeOf = docTypeOf;
  x.newDoc = (u, { name, description, mimeType, size, dataUrl, visibility, docType, wireInstructions }) => {
    const full = String(name == null ? '' : name).trim().replace(/[\\/]/g, '_'); if (!full) fail('A file name is required.');
    const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
    if (!ext) fail(`Files without an extension are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
    if (!C.ALLOWED_UPLOAD_EXT.includes(ext)) fail(`.${ext} files are not allowed. Allowed: ${C.ALLOWED_UPLOAD_EXT.join(', ')}.`);
    const n = full.length > 200 ? full.slice(0, 199 - ext.length) + '.' + ext : full;   // long names are cut but keep their extension
    if (!(size >= 0) || size > C.MAX_UPLOAD_BYTES) fail(`File is too large (demo limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
    const vis = buyerVis(u, C.DOC_VISIBILITY.includes(visibility) ? visibility : C.visibilityChoices(u.role, u.isAdmin)[0]);   // default: 'all' for staff/agents, own side for clients
    visCheck(u, vis);
    return { id: nid('doc'), dealId: null, folderId: null, name: n, description: str(description, 500), mimeType: str(mimeType, 100) || 'application/octet-stream', size: Number(size) || 0,
      dataUrl: dataUrl || null, uploadedBy: u.id, visibility: vis, docType: docTypeOf(u, docType), sharedWithClient: false, sharedWithClientBy: null, sharedWithClientAt: null,
      // wire instructions (John, Nov 3): staff may mark a file; any file NAMED as wire instructions is marked whoever uploads it. Buyer clients + staff only.
      wireInstructions: x.isWireDocName(n) || (!!wireInstructions && wireInstructions !== 'false' && x.isStaffView(u)), createdAt: now() };
  };
  x.docOut = docOut;
  return api;
}
