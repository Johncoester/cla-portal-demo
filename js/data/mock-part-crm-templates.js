/* mock adapter: CRM EMAIL TEMPLATES (John / Janine, Nov 3; Zoho video 6). FAKE DATA ONLY. NOTHING IS EVER SENT: no outbox entry, no email.
 * Templates (one module each; Name, Module, Subject + a written (HTML) body or builder blocks; Active or Draft), folders (Admin / Super admin create
 * and rename shared folders; every user has a personal folder only they see), favorites (per user), attachments (PDF / PNG / JPG in the same file
 * store as record attachments; NEVER deleted, only detached), per-user signature (${User Signature}), preview / compose merged against a record.
 * Retire = hidden (undo with restore); there is no delete of any kind. Processor: read-only (view, preview, compose, copy; own signature + favorites).
 * TC and outside users: no CRM. Mirrored by migration 27 (crm_email_folders, crm_email_templates, crm_email_template_files, crm_email_favorites, crm_user_signatures). */
import { MODULE_CODES, moduleLabel, TEMPLATE_STATUSES, ATTACH_EXT, NAME_MAX, SUBJECT_MAX, BODY_MAX, SIGNATURE_MAX, GMAIL_NOTE, mergeFieldsFor, renderTemplate, sanitizeHtml, cleanBlocks, cssColor,
  personalFolderId, isPersonalFolder, cleanFolderName, ensureEmailTemplates, htmlToText } from './crm-templates.js?v=202611041817';
import { crmReadOnly } from './crm.js?v=202611041817';

export function crmTemplatesPart(x, h) {
  const { save, now, fail, str, clone, nameOf, nid, prof, localDate, C } = x;
  const { db: db0, cfg, crmUser, crmEditor, entityOf, leadOut, contactOut, accountOut, oppOut, actOut, baseApi } = h;
  const db = () => ensureEmailTemplates(db0(), { seed: false });   // older data without the collections (the v18 -> v19 upgrade seeds them)
  const folderOf = (id) => db().crmEmailFolders.find((f) => f.id === id);
  const visible = (u, t) => !isPersonalFolder(t.folderId) || t.folderId === personalFolderId(u.id);
  const tplOf = (u, id) => { const t = db().crmEmailTemplates.find((z) => z.id === str(id, 60)); if (!t || !visible(u, t)) fail('Template not found.'); return t; };
  const mayEdit = (u, t) => !crmReadOnly(u) && (u.isAdmin || t.createdBy === u.id);
  const editable = (u, id) => { const t = tplOf(u, id); if (crmReadOnly(u)) fail('The Processor has read-only access to the CRM.'); if (!mayEdit(u, t)) fail('Only the person who made this template (or an Admin) can change it.'); return t; };
  const admin = () => { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can create or rename template folders.'); return u; };
  const folderName = (id) => { if (isPersonalFolder(id)) { const p = prof(id.slice(9)); return p ? `${p.firstName} ${p.lastName}`.trim() : 'Personal'; } return (folderOf(id) || {}).name || ''; };
  const favs = (u) => (db().crmEmailFavorites[u.id] ||= []);
  const fileRow = (id) => db().crmAttachments.find((f) => f.id === id);
  const attOut = (t, all = false) => (t.attachments || []).filter((a) => all || !a.detachedAt).map((a) => { const f = fileRow(a.fileId) || {};
    return { id: a.fileId, name: f.name || '(missing file)', size: f.size || 0, mimeType: f.mimeType || '', attachedAt: a.attachedAt, attachedByName: nameOf(a.attachedBy), detached: !!a.detachedAt, detachedAt: a.detachedAt || null }; });
  const out = (u, t) => ({ ...clone(t), moduleLabel: moduleLabel(t.module), folderName: folderName(t.folderId), personal: isPersonalFolder(t.folderId), createdByName: nameOf(t.createdBy), modifiedByName: nameOf(t.modifiedBy),
    favorite: favs(u).includes(t.id), retired: !!t.retiredAt, canEdit: mayEdit(u, t), attachments: attOut(t), detachedAttachments: attOut(t, true).filter((a) => a.detached),
    stats: { opened: null, bounced: null, clicked: null } });   // tracking starts when Gmail is connected
  // a folder this person may save into: a shared folder, or their own personal folder
  const folderFor = (u, v) => { const id = str(v, 80) || personalFolderId(u.id); if (isPersonalFolder(id)) { if (id !== personalFolderId(u.id)) fail('You can only save into shared folders or your own folder.'); return id; }
    if (!folderOf(id)) fail('Pick a folder from the list.'); return id; };
  const status = (v, d) => { const s = str(v, 20) || d; if (!TEMPLATE_STATUSES.some(([k]) => k === s)) fail('Status must be Active or Draft.'); return s; };
  function fields(u, t, input, create) {
    const has = (k) => create || input[k] !== undefined;
    if (has('name')) { t.name = str(input.name, 500).replace(/[\u0000-\u001f]/g, ''); if (!t.name) fail('Template Name is required.'); if (t.name.length > NAME_MAX) fail(`Template Name can be at most ${NAME_MAX} characters.`); }
    if (has('subject')) { t.subject = str(input.subject, 1000).replace(/[\r\n\u0000-\u001f]/g, ' '); if (!t.subject) fail('Subject is required.'); if (t.subject.length > SUBJECT_MAX) fail(`Subject can be at most ${SUBJECT_MAX} characters.`); }
    if (has('kind')) { const k = create ? str(input.kind, 20) || 'html' : str(input.kind, 20); if (!['html', 'builder'].includes(k)) fail('Pick a written email or the builder.'); if (!create && k !== t.kind) fail('A written template cannot turn into a builder one (or back); use Save As.'); t.kind = k; }
    if (has('body')) { const b = sanitizeHtml(String(input.body == null ? '' : input.body)); if (b.length > BODY_MAX) fail('The email is too large for this demo (images make it big; use smaller images or web links).'); t.body = t.kind === 'html' ? b : ''; }
    if (has('blocks')) t.blocks = t.kind === 'builder' ? cleanBlocks(input.blocks || []) : [];
    if (t.kind === 'builder' && JSON.stringify(t.blocks).length > BODY_MAX) fail('The email is too large for this demo (images make it big; use smaller images or web links).');
    if (has('pageBg')) t.pageBg = cssColor(input.pageBg);
    if (has('status')) t.status = status(input.status, 'active');
    if (has('folderId')) t.folderId = folderFor(u, input.folderId);
  }
  // the record a template is merged against, as the screens see it (only records this person may see)
  const rowFor = (u, module, id) => { const r = entityOf(u, module, str(id, 60));
    return module === 'lead' ? leadOut(u, r) : module === 'contact' ? contactOut(u, r) : module === 'account' ? accountOut(u, r) : oppOut(u, r); };
  const mine = (u) => { const p = prof(u.id) || {}; return { firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, role: p.role }; };
  const sigOf = (u) => (db().crmSignatures[u.id] || {}).html || '';
  function merged(u, t, entity, recordId) {
    let row = null; if (recordId) { if (entity && entity !== t.module) fail(`This template is for ${moduleLabel(t.module)}; it cannot be used on a ${moduleLabel(entity).replace(/s$/, '').toLowerCase()}.`); row = rowFor(u, t.module, recordId); }
    const r = renderTemplate(t, row, cfg(), mine(u), sigOf(u));
    return { ...r, to: row ? row.email || '' : '', recordName: row ? row.name || '' : '', attachments: attOut(t), template: { id: t.id, name: t.name, module: t.module, moduleLabel: moduleLabel(t.module) }, sendNote: GMAIL_NOTE };
  }

  const api = {
    // ---------- folders ----------
    async listCrmEmailFolders() { const u = crmUser(); const d = db(); const ts = d.crmEmailTemplates.filter((t) => visible(u, t) && !t.retiredAt);
      const shared = d.crmEmailFolders.slice().sort((a, b) => a.name.localeCompare(b.name)).map((f) => ({ id: f.id, name: f.name, kind: 'shared', count: ts.filter((t) => t.folderId === f.id).length, createdByName: nameOf(f.createdBy) }));
      const pid = personalFolderId(u.id); return { canCreate: !!u.isAdmin, folders: [...shared, { id: pid, name: folderName(pid), kind: 'personal', count: ts.filter((t) => t.folderId === pid).length }] }; },
    async createCrmEmailFolder(name) { const u = admin(); const n = cleanFolderName(name); const d = db();
      if (d.crmEmailFolders.some((f) => f.name.toLowerCase() === n.toLowerCase())) fail(`A folder called "${n}" already exists.`);
      const f = { id: nid('ef'), name: n, position: d.crmEmailFolders.length + 1, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now() }; d.crmEmailFolders.push(f); save(); return clone(f); },
    async renameCrmEmailFolder(id, name) { const u = admin(); const f = folderOf(str(id, 60)) || fail(isPersonalFolder(id) ? 'A personal folder is named after its user.' : 'Folder not found.'); const n = cleanFolderName(name);
      if (db().crmEmailFolders.some((z) => z.id !== f.id && z.name.toLowerCase() === n.toLowerCase())) fail(`A folder called "${n}" already exists.`);
      f.name = n; f.modifiedBy = u.id; f.modifiedAt = now(); save(); return clone(f); },
    // ---------- templates ----------
    async listCrmEmailTemplates() { const u = crmUser(); return db().crmEmailTemplates.filter((t) => visible(u, t)).map((t) => out(u, t)); },
    async getCrmEmailTemplate(id) { const u = crmUser(); return out(u, tplOf(u, id)); },
    async createCrmEmailTemplate(input = {}) { const u = crmEditor(); const module = str(input.module, 20); if (!MODULE_CODES.includes(module)) fail('Choose the module (Leads, Clients, Companies or Opportunities).');
      const t = { id: nid('et'), module, attachments: [], retiredAt: null, retiredBy: null, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now() };
      fields(u, t, input, true); db().crmEmailTemplates.push(t); save(); return out(u, t); },
    async updateCrmEmailTemplate(id, patch = {}) { const u = crmUser(); const t = editable(u, id);
      if (patch.module !== undefined && patch.module !== t.module) fail('A template stays tied to its module; use Save As to make one for another module.');
      fields(u, t, patch, false); t.modifiedBy = u.id; t.modifiedAt = now(); save(); return out(u, t); },
    // Save As: a copy (same module, body, blocks and attached files: the files are shared, never copied or removed) in a folder of your choice
    async duplicateCrmEmailTemplate(id, { name, folderId, status: st } = {}) { const u = crmEditor(); const src = tplOf(u, id);
      const t = { ...clone(src), id: nid('et'), attachments: (src.attachments || []).filter((a) => !a.detachedAt).map((a) => ({ fileId: a.fileId, attachedBy: u.id, attachedAt: now(), detachedAt: null, detachedBy: null })),
        retiredAt: null, retiredBy: null, createdBy: u.id, createdAt: now(), modifiedBy: u.id, modifiedAt: now(), copiedFrom: src.id };
      fields(u, t, { name: name || `Copy of ${src.name}`.slice(0, NAME_MAX), folderId, status: st || src.status }, false); db().crmEmailTemplates.push(t); save(); return out(u, t); },
    // Retire = hidden from lists and from Compose; Restore undoes it. There is no delete.
    async retireCrmEmailTemplate(id, retired = true) { const u = crmUser(); const t = editable(u, id); t.retiredAt = retired ? t.retiredAt || now() : null; t.retiredBy = retired ? u.id : null; t.modifiedBy = u.id; t.modifiedAt = now(); save(); return out(u, t); },
    async setCrmTemplateFavorite(id, on = true) { const u = crmUser(); const t = tplOf(u, id); const f = favs(u); const i = f.indexOf(t.id); if (on && i < 0) f.push(t.id); if (!on && i >= 0) f.splice(i, 1); save(); return { favorite: !!on }; },
    // ---------- attachments (PDF / PNG / JPG). Kept forever in the file store; a template only detaches them (and can re-attach). ----------
    async addCrmTemplateAttachment(id, { name, mimeType, size, dataUrl } = {}) { const u = crmUser(); const t = editable(u, id);
      const full = str(name, 400).replace(/[\\/]/g, '_') || fail('A file name is required.'); const dot = full.lastIndexOf('.'); const ext = dot > 0 ? full.slice(dot + 1).toLowerCase() : '';
      if (!ATTACH_EXT.includes(ext)) fail(`Template attachments can be PDF, PNG or JPG files${ext ? ` (not .${ext})` : ''}.`);
      if (!(Number(size) >= 0) || Number(size) > C.MAX_UPLOAD_BYTES) fail(`File is too large (limit ${Math.round(C.MAX_UPLOAD_BYTES / 1e5) / 10} MB).`);
      if ((t.attachments || []).filter((a) => !a.detachedAt).length >= 10) fail('At most 10 attachments per template.');
      const f = { id: nid('cfile'), entity: 'template', entityId: t.id, name: full.slice(0, 200), mimeType: str(mimeType, 100) || (ext === 'pdf' ? 'application/pdf' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext)), size: Number(size) || 0, dataUrl: dataUrl || null, uploadedBy: u.id, createdAt: now() };
      await x.keepFile(f); db().crmAttachments.push(f); (t.attachments ||= []).push({ fileId: f.id, attachedBy: u.id, attachedAt: now(), detachedAt: null, detachedBy: null });
      t.modifiedBy = u.id; t.modifiedAt = now(); save(); return out(u, t); },
    async detachCrmTemplateAttachment(id, fileId, detached = true) { const u = crmUser(); const t = editable(u, id); const a = (t.attachments || []).find((z) => z.fileId === str(fileId, 60)) || fail('That file is not on this template.');
      a.detachedAt = detached ? a.detachedAt || now() : null; a.detachedBy = detached ? u.id : null; t.modifiedBy = u.id; t.modifiedAt = now(); save(); return out(u, t); },
    async getCrmAttachmentContent(id) { const f = db().crmAttachments.find((z) => z.id === id);
      if (f && f.entity === 'template') { const u = crmUser(); tplOf(u, f.entityId); const content = await x.fileContent(f);
        return { name: f.name, mimeType: f.mimeType, dataUrl: content || 'data:text/plain;charset=utf-8,' + encodeURIComponent('FAKE DEMO FILE\n' + f.name) }; }
      return baseApi.getCrmAttachmentContent(id); },
    // ---------- signature (each user edits their own; Processor included: it is their own, not CRM data) ----------
    async getCrmSignature() { const u = crmUser(); const s = db().crmSignatures[u.id] || {}; return { html: s.html || '', modifiedAt: s.modifiedAt || null }; },
    async saveCrmSignature(html) { const u = crmUser(); const s = sanitizeHtml(String(html == null ? '' : html)); if (s.length > SIGNATURE_MAX) fail('The signature is too long (use a smaller image or a web link).');
      db().crmSignatures[u.id] = { html: s, modifiedAt: now() }; save(); return { html: s, modifiedAt: db().crmSignatures[u.id].modifiedAt }; },
    // ---------- merge fields / preview / compose ----------
    async crmMergeFields(module) { crmUser(); if (!MODULE_CODES.includes(module)) fail('Unknown module.'); return mergeFieldsFor(module, cfg()); },
    // preview a saved template (templateId) or the unsaved editor contents (draft), optionally merged against a record of the template's module
    async previewCrmEmail({ templateId = '', draft = null, recordId = '' } = {}) { const u = crmUser();
      let t; if (templateId) t = tplOf(u, templateId); else { if (!draft || !MODULE_CODES.includes(draft.module)) fail('Choose the module first.');
        t = { module: draft.module, kind: draft.kind === 'builder' ? 'builder' : 'html', subject: str(draft.subject, SUBJECT_MAX), body: sanitizeHtml(draft.body || ''), blocks: cleanBlocks(draft.blocks || []), pageBg: cssColor(draft.pageBg), attachments: [] }; }
      return merged(u, t, t.module, recordId); },
    // the Active templates of a record's module (Compose email from template)
    async listCrmTemplatesFor(entity) { const u = crmUser(); return db().crmEmailTemplates.filter((t) => visible(u, t) && t.module === entity && !t.retiredAt && t.status === 'active').map((t) => out(u, t)).sort((a, b) => a.name.localeCompare(b.name)); },
    // Compose = the template merged with the record, to copy into your own mail program. NOTHING IS SENT.
    async composeCrmEmail(templateId, entity, recordId) { const u = crmUser(); const t = tplOf(u, templateId);
      if (t.retiredAt) fail('This template is retired.'); if (t.status !== 'active') fail('This template is a draft; save it (Save Now) before using it.');
      if (!recordId) fail('Open the record to compose from.'); return merged(u, t, str(entity, 20), recordId); },
    // optional: note on the record that an email was drafted from a template (a log only; "last contacted" does not move: nothing was sent)
    async logCrmEmailDraft(templateId, entity, recordId) { const u = crmEditor(); const t = tplOf(u, templateId); const m = merged(u, t, str(entity, 20), recordId);
      const a = { id: nid('ca'), entity: t.module, entityId: str(recordId, 60), kind: 'email', subject: `Email drafted (not sent): ${m.subject || t.name}`.slice(0, 200), body: `From template "${t.name}". Nothing was sent.\n\n${m.text}`.slice(0, 4000),
        status: 'done', dueDate: null, occurredOn: localDate(), ownerId: u.id, system: false, templateId: t.id, createdBy: u.id, createdAt: now(), doneAt: now(), modifiedBy: u.id, modifiedAt: now() };
      db0().crmActivities.push(a); save(); return actOut(a); },
    // shown in the screens, never works yet: there is no mail connection in this build
    async sendCrmTestEmail() { crmUser(); fail(GMAIL_NOTE); },
  };
  return { api, htmlToText };
}
