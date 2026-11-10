/* [SUPABASE] Gmail phase 1 (John, Nov 9; migration 20261109200000). The edge functions do all Google work; the page never holds a token.
 *   gmail-oauth-start (start | disconnect), gmail-send (also dryRun), gmail-sync (Check for replies). Reads: gmail_my_context(), deal_emails (RLS).
 * File email templates (migration 20261109220000): Admin > Email Templates + "Use template" on a file Email tab. Not CRM templates. */
import { SEED_SHARED as FILE_EMAIL_SEED, cleanTemplateInput, participantsFromContacts } from './file-email-templates.js?v=202611102000';
import { browserStorage, countUnreadEmails, gmailUnreadByDeal, laterIso, localCursorMap, mergeMailUnread, portalUnreadByDeal, readLocalCursor, writeLocalCursor } from './file-email-unread.js?v=202611100930';

async function paged(make) {
  const size = 1000;
  const all = [];
  for (let from = 0; from < 10000; from += size) {
    const res = await make().range(from, from + size - 1);
    if (res.error) return { data: null, error: res.error };
    const rows = res.data || [];
    all.push(...rows);
    if (rows.length < size) return { data: all, error: null };
  }
  return { data: all, error: null };
}

async function portalUnreadMap(sb, camel, userId) {
  const partsRes = await sb.from('thread_participants').select('thread_id,last_read_at').eq('profile_id', userId);
  if (partsRes.error) return {};
  const parts = camel(partsRes.data) || [];
  const ids = parts.map((p) => p.threadId).filter(Boolean);
  if (!ids.length) return {};
  const threads = [];
  const messages = [];
  for (let i = 0; i < ids.length; i += 80) {
    const slice = ids.slice(i, i + 80);
    const [tRes, mRes] = await Promise.all([
      sb.from('threads').select('id,deal_id').in('id', slice),
      sb.from('messages').select('thread_id,created_at,author_id').in('thread_id', slice).limit(5000),
    ]);
    if (tRes.error || mRes.error) return {};
    threads.push(...(camel(tRes.data) || []));
    messages.push(...(camel(mRes.data) || []));
  }
  return portalUnreadByDeal({ parts, threads, messages, userId });
}

async function portalUnreadForDeal(sb, camel, userId, dealId) {
  const threadsRes = await sb.from('threads').select('id,deal_id').eq('deal_id', dealId);
  if (threadsRes.error) return 0;
  const threads = camel(threadsRes.data) || [];
  const ids = threads.map((t) => t.id).filter(Boolean);
  if (!ids.length) return 0;
  const [partsRes, msgRes] = await Promise.all([
    sb.from('thread_participants').select('thread_id,last_read_at').eq('profile_id', userId).in('thread_id', ids),
    sb.from('messages').select('thread_id,created_at,author_id').in('thread_id', ids).limit(5000),
  ]);
  if (partsRes.error || msgRes.error) return 0;
  const map = portalUnreadByDeal({ parts: camel(partsRes.data) || [], threads, messages: camel(msgRes.data) || [], userId });
  return map[dealId] || 0;
}

async function gmailUnreadMap(sb, camel, userId) {
  const res = await paged(() => sb.from('deal_emails').select('deal_id,sent_at,sent_by,direction,mailbox_profile_id').order('sent_at', { ascending: false }));
  if (res.error) return {};
  let reads = [];
  try {
    const r = await sb.from('deal_email_reads').select('deal_id,read_at').eq('profile_id', userId).limit(5000);
    if (!r.error && r.data) reads = camel(r.data) || [];
  } catch (e) { reads = []; }
  return gmailUnreadByDeal(camel(res.data) || [], reads, { userId, localReadAt: localCursorMap(browserStorage(), userId) });
}

export function gmailSupabase({ sb, ok, camel }) {
  const call = async (name, body) => {
    const res = await sb.functions.invoke(name, { body });
    if (res.error) {
      let msg = 'The Gmail service did not answer. Nothing was sent.'; let extra = {};
      try { const j = await res.error.context.json(); if (j && typeof j.error === 'string' && j.error.length < 600) { msg = j.error; extra = j; } } catch (e) { /* keep the generic line */ }
      const err = new Error(msg); err.refused = Array.isArray(extra.refused) ? extra.refused : []; err.connectGmail = extra.connectGmail === true; err.to = typeof extra.to === 'string' ? extra.to : ''; throw err;
    }
    return res.data || {};
  };
  const uid = async () => (await sb.auth.getUser()).data.user.id;
  const thisUser = async () => {
    try { const { data } = await sb.auth.getUser(); return (data && data.user && data.user.id) || ''; }
    catch (e) { return ''; }
  };
  const cursorFor = async (dealId, userId) => {
    let server = '';
    let persisted = false;
    try {
      const res = await sb.from('deal_email_reads').select('read_at').eq('profile_id', userId).eq('deal_id', dealId).maybeSingle();
      if (!res.error) { persisted = true; server = (res.data && (res.data.read_at || res.data.readAt)) || ''; }
    } catch (e) { persisted = false; }
    return { readAt: laterIso(server, readLocalCursor(browserStorage(), userId, dealId)), persisted };
  };
  return {
    async getGmailStatus() {
      const c = ok(await sb.rpc('gmail_my_context')) || {};
      return { available: true, allowed: !!c.allowed, viewAs: !!c.viewAs, connected: !!c.mailbox, mailbox: c.mailbox || null, status: c.mailboxStatus || null,
        signatureHtml: c.signatureHtml || '', lastSyncAt: c.lastSyncAt || null, firstName: c.firstName || '', lastName: c.lastName || '', role: c.role || '',
        signatureSource: c.signatureSource || '', signatureSyncedAt: c.signatureSyncedAt || null, signatureScope: !!c.signatureScope };
    },
    async connectGmail() {
      const r = await call('gmail-oauth-start', { action: 'start' });
      if (!r.url || !/^https:\/\/accounts\.google\.com\//.test(r.url)) throw new Error('Google sign-in did not start.');
      return r.url;
    },
    async disconnectGmail() { return call('gmail-oauth-start', { action: 'disconnect' }); },
    async refreshGmailSignature() { return call('gmail-oauth-start', { action: 'refresh_signature' }); },
    async saveGmailSignature(htmlText) { ok(await sb.rpc('gmail_set_signature', { p_html: String(htmlText || '') })); return true; },
    async listDealEmails(dealId) { return camel(ok(await sb.from('deal_emails').select('*').eq('deal_id', dealId).order('sent_at', { ascending: false }).limit(300))) || []; },
    async sendDealEmail(input = {}) {
      return call('gmail-send', { dealId: input.dealId, to: input.to || [], cc: input.cc || [], bcc: input.bcc || [], subject: input.subject || '', html: input.html || '',
        documentIds: input.documentIds || [], uploadIds: input.uploadIds || [], pendingUploads: input.pendingUploads || [], templateKey: input.templateKey || null, replyToEmailId: input.replyToEmailId || null, dryRun: input.dryRun === true });
    },
    async checkGmailReplies() { return call('gmail-sync', { mode: 'user' }); },
    // Portal invite email (Nov 9): gmail-send builds the email from the invite row and sends it from the inviter's own Gmail. Never throws:
    // the page always gets an outcome and keeps the copy link on screen when it was not sent.
    async sendInviteEmail({ kind, token } = {}) {
      try { const r = await call('gmail-send', { invite: { kind, token } }); return { sent: r.sent === true, to: r.to || '', from: r.from || '', subject: r.subject || '' }; }
      catch (e) { return { sent: false, to: e.to || '', error: e.message, connectGmail: !!e.connectGmail, refused: e.refused || [] }; }
    },
    async listFileEmailTemplates({ includeInactive = false } = {}) {
      let q = sb.from('email_templates').select('*').order('name');
      if (!includeInactive) q = q.eq('active', true);
      return camel(ok(await q)) || [];
    },
    async getFileEmailTemplate(id) {
      const row = camel(ok(await sb.from('email_templates').select('*').eq('id', id).maybeSingle()));
      if (!row) throw new Error('Template not found.');
      return row;
    },
    async createFileEmailTemplate(input = {}) {
      const v = cleanTemplateInput(input); const id = await uid();
      const row = { name: v.name, subject: v.subject, body_html: v.bodyHtml, scope: 'shared', category: v.category || '', active: v.active,
        owner_profile_id: null, attach_doc_types: v.attachDocTypes || [], default_recipient_roles: v.defaultRecipientRoles || [],
        created_by: id, updated_by: id, updated_at: new Date().toISOString() };
      return camel(ok(await sb.from('email_templates').insert(row).select('*').single()));
    },
    async updateFileEmailTemplate(id, input = {}) {
      const v = cleanTemplateInput(input); const me = await uid();
      const patch = { name: v.name, subject: v.subject, body_html: v.bodyHtml, category: v.category || '', active: v.active, scope: 'shared',
        owner_profile_id: null, attach_doc_types: v.attachDocTypes || [], default_recipient_roles: v.defaultRecipientRoles || [],
        updated_by: me, updated_at: new Date().toISOString() };
      return camel(ok(await sb.from('email_templates').update(patch).eq('id', id).select('*').single()));
    },
    async duplicateFileEmailTemplate(id, { name } = {}) {
      const src = camel(ok(await sb.from('email_templates').select('*').eq('id', id).maybeSingle()));
      if (!src) throw new Error('Template not found.');
      const me = await uid();
      const row = { name: String(name || `Copy of ${src.name}`).slice(0, 120), subject: src.subject || '', body_html: src.bodyHtml || '',
        scope: 'shared', owner_profile_id: null, category: src.category || '', active: true,
        attach_doc_types: src.attachDocTypes || src.attach_doc_types || [], default_recipient_roles: src.defaultRecipientRoles || src.default_recipient_roles || [],
        created_by: me, updated_by: me, updated_at: new Date().toISOString() };
      return camel(ok(await sb.from('email_templates').insert(row).select('*').single()));
    },
    async setFileEmailTemplateActive(id, active = false) {
      const me = await uid();
      return camel(ok(await sb.from('email_templates').update({ active: !!active, updated_by: me, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()));
    },
    // Email tab uses readFileShell (participants: []). Load parties + processor profile email for template merge only — does not change the shell or reintroduce processor enrichment on every deal read.
    async loadDealEmailContext(dealId) {
      const [contacts, entities, dealRow] = await Promise.all([
        sb.rpc('deal_contacts', { p_deal: dealId }),
        sb.rpc('deal_entities', { p_deal: dealId }),
        sb.from('deals').select('processor_id').eq('id', dealId).maybeSingle(),
      ]);
      const participants = participantsFromContacts(ok(contacts) || [], ok(entities) || []);
      const deal = camel(ok(dealRow)) || {};
      let processorEmail = ''; let processorName = '';
      if (deal.processorId) {
        const p = camel(ok(await sb.from('profiles').select('email, first_name, last_name').eq('id', deal.processorId).maybeSingle())) || {};
        processorEmail = String(p.email || '').trim();
        processorName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
      }
      return { participants, processorEmail, processorName, processorId: deal.processorId || null };
    },
    // Open Orders icon: portal threads this person is on, plus Gmail on files they can already open.
    // A missing deal_email_reads table (migration not applied) leaves Gmail unread on the browser cursor. Never throws.
    async orderMailUnread() {
      const id = await thisUser();
      if (!id) return {};
      const [portal, gmail] = await Promise.all([
        portalUnreadMap(sb, camel, id).catch(() => ({})),
        gmailUnreadMap(sb, camel, id).catch(() => ({})),
      ]);
      return mergeMailUnread(portal, gmail);
    },
    async filePortalUnread(dealId) {
      const id = await thisUser();
      if (!id || !dealId) return 0;
      try { return await portalUnreadForDeal(sb, camel, id, dealId); }
      catch (e) { return 0; }
    },
    async emailReadCursor(dealId) {
      const id = await thisUser();
      if (!id || !dealId) return { readAt: '', persisted: false };
      return cursorFor(dealId, id);
    },
    async fileEmailUnreadCount(dealId) {
      const id = await thisUser();
      if (!id || !dealId) return 0;
      try {
        const res = await sb.from('deal_emails').select('deal_id,sent_at,sent_by,direction,mailbox_profile_id').eq('deal_id', dealId).order('sent_at', { ascending: false }).limit(500);
        if (res.error) return 0;
        const cursor = await cursorFor(dealId, id);
        return countUnreadEmails(camel(res.data) || [], { userId: id, readAt: cursor.readAt });
      } catch (e) { return 0; }
    },
    // Opening the Email tab. Writes deal_email_reads when that table exists; always remembers this browser too.
    async markDealEmailsRead(dealId) {
      const id = await thisUser();
      if (!id || !dealId) return { saved: false, local: false };
      const at = new Date().toISOString();
      let saved = false;
      try {
        const res = await sb.from('deal_email_reads').upsert({ profile_id: id, deal_id: dealId, read_at: at }, { onConflict: 'profile_id,deal_id' });
        saved = !res.error;
      } catch (e) { saved = false; }
      return { saved, local: writeLocalCursor(browserStorage(), id, dealId, at), at };
    },
  };
}

export function gmailMock() {
  const off = async () => { throw new Error('Gmail works on CLA Portal Live Test only.'); };
  const store = FILE_EMAIL_SEED.map((t, i) => ({ id: `fet-seed-${i + 1}`, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, scope: 'shared',
    ownerProfileId: null, category: t.category || '', active: true, attachDocTypes: t.attachDocTypes || [], defaultRecipientRoles: t.defaultRecipientRoles || [],
    seedKey: t.key, createdAt: '2026-11-09T00:00:00Z', updatedAt: '2026-11-09T00:00:00Z' }));
  return {
    async getGmailStatus() { return { available: false, allowed: false, connected: false }; },
    connectGmail: off, disconnectGmail: off, saveGmailSignature: off, refreshGmailSignature: off,
    async listDealEmails() { return []; }, sendDealEmail: off, checkGmailReplies: off,
    async orderMailUnread() { return {}; },
    async filePortalUnread() { return 0; },
    async fileEmailUnreadCount() { return 0; },
    async emailReadCursor() { return { readAt: '', persisted: false }; },
    async markDealEmailsRead() { return { saved: false, local: false }; },
    async sendInviteEmail() { return { sent: false, error: 'Demo: nothing is emailed. Copy the link instead.', demo: true }; },
    async listFileEmailTemplates({ includeInactive = false } = {}) { return store.filter((t) => includeInactive || t.active).map((t) => ({ ...t })); },
    async getFileEmailTemplate(id) { const t = store.find((x) => x.id === id); if (!t) throw new Error('Template not found.'); return { ...t }; },
    createFileEmailTemplate: off, updateFileEmailTemplate: off, duplicateFileEmailTemplate: off, setFileEmailTemplateActive: off,
    async loadDealEmailContext() { return { participants: [], processorEmail: '', processorName: '', processorId: null }; },
  };
}
