/* [SUPABASE] Gmail phase 1 (John, Nov 9; migration 20261109200000). The edge functions do all Google work; the page never holds a token.
 *   gmail-oauth-start (start | disconnect), gmail-send (also dryRun), gmail-sync (Check for replies). Reads: gmail_my_context(), deal_emails (RLS). */
export function gmailSupabase({ sb, ok, camel }) {
  const call = async (name, body) => {
    const res = await sb.functions.invoke(name, { body });
    if (res.error) {
      let msg = 'The Gmail service did not answer. Nothing was sent.'; let extra = {};
      try { const j = await res.error.context.json(); if (j && typeof j.error === 'string' && j.error.length < 600) { msg = j.error; extra = j; } } catch (e) { /* keep the generic line */ }
      const err = new Error(msg); err.refused = Array.isArray(extra.refused) ? extra.refused : []; throw err;
    }
    return res.data || {};
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
    // Refresh from Gmail: the edge function reads your current Gmail signature (read-only) and stores it as the portal signature
    async refreshGmailSignature() { return call('gmail-oauth-start', { action: 'refresh_signature' }); },
    async saveGmailSignature(htmlText) { ok(await sb.rpc('gmail_set_signature', { p_html: String(htmlText || '') })); return true; },
    async listDealEmails(dealId) { return camel(ok(await sb.from('deal_emails').select('*').eq('deal_id', dealId).order('sent_at', { ascending: false }).limit(300))) || []; },
    async sendDealEmail(input = {}) {
      return call('gmail-send', { dealId: input.dealId, to: input.to || [], cc: input.cc || [], bcc: input.bcc || [], subject: input.subject || '', html: input.html || '',
        documentIds: input.documentIds || [], templateKey: input.templateKey || null, replyToEmailId: input.replyToEmailId || null, dryRun: input.dryRun === true });
    },
    async checkGmailReplies() { return call('gmail-sync', { mode: 'user' }); },
  };
}
// mock / demo mode: Gmail is never connected there
export function gmailMock() {
  const off = async () => { throw new Error('Gmail works on CLA Portal Live Test only.'); };
  return { async getGmailStatus() { return { available: false, allowed: false, connected: false }; }, connectGmail: off, disconnectGmail: off, saveGmailSignature: off, refreshGmailSignature: off,
    async listDealEmails() { return []; }, sendDealEmail: off, checkGmailReplies: off };
}
