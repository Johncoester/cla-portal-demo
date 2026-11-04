/* [SUPABASE] CRM EMAIL TEMPLATES for supabase-crm.js (Nov 3, migration 27). Same names / shapes as mock-part-crm-templates.js.
 * NOT run against a hosted project (best effort; the mock adapter is the tested one). NOTHING IS SENT: sendCrmTestEmail always refuses.
 * Template files need the private CRM storage bucket, which is not set up yet (as for record attachments), so uploads refuse here. */
import { MODULE_CODES, moduleLabel, GMAIL_NOTE, mergeFieldsFor, renderTemplate, sanitizeHtml, cleanBlocks, cssColor, personalFolderId, isPersonalFolder, cleanFolderName } from './crm-templates.js?v=202611041516';
import { canUseCrm, crmReadOnly } from './crm.js?v=202611041516';
import { localDate } from './constants.js?v=202611041516';

export function crmTemplatesSupabase({ sb, ok, camel, me, on, one, self }) {
  const who = async () => { on(); const u = await me(); if (!canUseCrm(u)) throw new Error('The CRM is for CLA staff only.'); return u; };
  const staffName = async (id) => { if (!id) return ''; const s = await self.listCrmAssignees().catch(() => []); const p = s.find((z) => z.id === id); return p ? p.name : ''; };
  const folderIdOf = (t) => (t.personal_owner ? personalFolderId(t.personal_owner) : t.folder_id);
  async function out(u, t, folders, favs) {
    const f = await (async () => { const links = ok(await sb.from('crm_email_template_files').select('*').eq('template_id', t.id)) || [];
      const files = links.length ? ok(await sb.from('crm_attachments').select('id, name, size, mime_type').in('id', links.map((l) => l.attachment_id))) || [] : [];
      return links.map((l) => { const x = files.find((z) => z.id === l.attachment_id) || {}; return { id: l.attachment_id, name: x.name || '', size: x.size || 0, mimeType: x.mime_type || '', attachedAt: l.attached_at, detached: !!l.detached_at, detachedAt: l.detached_at }; }); })();
    const fid = folderIdOf(t);
    return { id: t.id, name: t.name, module: t.module, moduleLabel: moduleLabel(t.module), folderId: fid, folderName: isPersonalFolder(fid) ? (u.id === t.personal_owner ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'Personal') : (folders.find((z) => z.id === fid) || {}).name || '',
      personal: isPersonalFolder(fid), subject: t.subject, kind: t.kind, body: t.body, blocks: t.blocks || [], pageBg: t.page_bg || '', status: t.status, retired: !!t.retired_at, retiredAt: t.retired_at,
      createdBy: t.created_by, createdAt: t.created_at, modifiedBy: t.modified_by, modifiedAt: t.modified_at, createdByName: await staffName(t.created_by), modifiedByName: await staffName(t.modified_by),
      favorite: favs.includes(t.id), canEdit: !crmReadOnly(u) && (u.isAdmin || t.created_by === u.id), attachments: f.filter((a) => !a.detached), detachedAttachments: f.filter((a) => a.detached), stats: { opened: null, bounced: null, clicked: null } };
  }
  const folders = async () => ok(await sb.from('crm_email_folders').select('*').order('name')) || [];
  const favIds = async (u) => (ok(await sb.from('crm_email_favorites').select('template_id, on').eq('user_id', u.id)) || []).filter((r) => r.on).map((r) => r.template_id);
  const row = async (id) => { const t = ok(await sb.from('crm_email_templates').select('*').eq('id', id).maybeSingle()); if (!t) throw new Error('Template not found.'); return t; };
  const where = (u, folderId) => { const id = folderId || personalFolderId(u.id); if (isPersonalFolder(id)) { if (id !== personalFolderId(u.id)) throw new Error('You can only save into shared folders or your own folder.'); return { folder_id: null, personal_owner: u.id }; } return { folder_id: id, personal_owner: null }; };
  const tIn = (v) => { const o = {}; if (v.name !== undefined) o.name = String(v.name).trim(); if (v.subject !== undefined) o.subject = String(v.subject).replace(/[\r\n]+/g, ' ').trim();
    if (v.body !== undefined) o.body = sanitizeHtml(v.body); if (v.blocks !== undefined) o.blocks = cleanBlocks(v.blocks); if (v.pageBg !== undefined) o.page_bg = cssColor(v.pageBg); if (v.status !== undefined) o.status = v.status; return o; };
  const record = async (m, id) => (m === 'lead' ? self.getCrmLead(id) : m === 'contact' ? self.getCrmContact(id) : m === 'account' ? self.getCrmAccount(id) : (await self.listCrmOpportunities()).find((o) => o.id === id) || Promise.reject(new Error('Opportunity not found.')));
  const sig = async (u) => ((ok(await sb.from('crm_user_signatures').select('html').eq('user_id', u.id).maybeSingle()) || {}).html || '');
  async function merged(u, t, recordId) { const row0 = recordId ? await record(t.module, recordId) : null; const cfg = await self.getCrmSettings();
    const r = renderTemplate(t, row0, cfg, { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role }, await sig(u));
    return { ...r, to: row0 ? row0.email || '' : '', recordName: row0 ? row0.name || '' : '', attachments: t.attachments || [], template: { id: t.id, name: t.name, module: t.module, moduleLabel: moduleLabel(t.module) }, sendNote: GMAIL_NOTE }; }
  const api = {
    async listCrmEmailFolders() { const u = await who(); const fs = await folders(); return { canCreate: !!u.isAdmin, folders: [...fs.map((f) => ({ id: f.id, name: f.name, kind: 'shared', count: 0 })), { id: personalFolderId(u.id), name: `${u.firstName || ''} ${u.lastName || ''}`.trim(), kind: 'personal', count: 0 }] }; },
    async createCrmEmailFolder(name) { await who(); return camel(await one(sb.from('crm_email_folders').insert({ name: cleanFolderName(name) }))); },
    async renameCrmEmailFolder(id, name) { await who(); return camel(await one(sb.from('crm_email_folders').update({ name: cleanFolderName(name) }).eq('id', id))); },
    async listCrmEmailTemplates() { const u = await who(); const [fs, fv] = await Promise.all([folders(), favIds(u)]); const rows = ok(await sb.from('crm_email_templates').select('*')) || [];
      return Promise.all(rows.map((t) => out(u, t, fs, fv))); },
    async getCrmEmailTemplate(id) { const u = await who(); return out(u, await row(id), await folders(), await favIds(u)); },
    async createCrmEmailTemplate(v = {}) { const u = await who(); if (!MODULE_CODES.includes(v.module)) throw new Error('Choose the module (Leads, Clients, Companies or Opportunities).');
      const t = await one(sb.from('crm_email_templates').insert({ module: v.module, kind: v.kind === 'builder' ? 'builder' : 'html', ...tIn(v), ...where(u, v.folderId) })); return out(u, t, await folders(), []); },
    async updateCrmEmailTemplate(id, v = {}) { const u = await who(); const o = tIn(v); if (v.folderId !== undefined) Object.assign(o, where(u, v.folderId));
      return out(u, await one(sb.from('crm_email_templates').update(o).eq('id', id)), await folders(), await favIds(u)); },
    async duplicateCrmEmailTemplate(id, { name, folderId } = {}) { const u = await who(); const s = await row(id);
      const t = await one(sb.from('crm_email_templates').insert({ name: name || `Copy of ${s.name}`.slice(0, 120), module: s.module, kind: s.kind, subject: s.subject, body: s.body, blocks: s.blocks, page_bg: s.page_bg, status: s.status, copied_from: s.id, ...where(u, folderId) }));
      return out(u, t, await folders(), []); },
    async retireCrmEmailTemplate(id, retired = true) { const u = await who(); return out(u, await one(sb.from('crm_email_templates').update({ retired_at: retired ? new Date().toISOString() : null }).eq('id', id)), await folders(), await favIds(u)); },
    async setCrmTemplateFavorite(id, on2 = true) { const u = await who(); ok(await sb.from('crm_email_favorites').upsert({ user_id: u.id, template_id: id, on: !!on2 })); return { favorite: !!on2 }; },
    async addCrmTemplateAttachment() { on(); throw new Error('CRM attachments are not set up on this portal yet.'); },
    async detachCrmTemplateAttachment(id, fileId, detached = true) { const u = await who(); ok(await sb.from('crm_email_template_files').update({ detached_at: detached ? new Date().toISOString() : null }).eq('template_id', id).eq('attachment_id', fileId));
      return out(u, await row(id), await folders(), await favIds(u)); },
    async getCrmSignature() { const u = await who(); const s = ok(await sb.from('crm_user_signatures').select('*').eq('user_id', u.id).maybeSingle()) || {}; return { html: s.html || '', modifiedAt: s.modified_at || null }; },
    async saveCrmSignature(h) { const u = await who(); const r = await one(sb.from('crm_user_signatures').upsert({ user_id: u.id, html: sanitizeHtml(h || '') })); return { html: r.html, modifiedAt: r.modified_at }; },
    async crmMergeFields(module) { await who(); return mergeFieldsFor(module, await self.getCrmSettings()); },
    async previewCrmEmail({ templateId = '', draft = null, recordId = '' } = {}) { const u = await who();
      const t = templateId ? await this.getCrmEmailTemplate(templateId) : { ...draft, body: sanitizeHtml(draft.body || ''), blocks: cleanBlocks(draft.blocks || []), attachments: [] }; return merged(u, t, recordId); },
    async listCrmTemplatesFor(entity) { const all = await this.listCrmEmailTemplates(); return all.filter((t) => t.module === entity && !t.retired && t.status === 'active').sort((a, b) => a.name.localeCompare(b.name)); },
    async composeCrmEmail(templateId, entity, recordId) { const u = await who(); const t = await this.getCrmEmailTemplate(templateId);
      if (t.retired) throw new Error('This template is retired.'); if (t.status !== 'active') throw new Error('This template is a draft; save it (Save Now) before using it.');
      if (entity && entity !== t.module) throw new Error(`This template is for ${moduleLabel(t.module)}.`); return merged(u, t, recordId); },
    async logCrmEmailDraft(templateId, entity, recordId) { const m = await this.composeCrmEmail(templateId, entity, recordId);
      return self.logCrmActivity({ entity, entityId: recordId, kind: 'email', subject: `Email drafted (not sent): ${m.subject}`.slice(0, 200), body: `From template "${m.template.name}". Nothing was sent.\n\n${m.text}`.slice(0, 4000), occurredOn: localDate() }); },
    async sendCrmTestEmail() { on(); throw new Error(GMAIL_NOTE); },
  };
  return api;
}
