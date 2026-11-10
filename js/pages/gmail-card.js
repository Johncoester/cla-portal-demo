// Profile Setting > Gmail (John, Nov 9: Gmail phase 1, CLA Portal Live Test). Connect / Disconnect your own @clatitle.com Gmail and keep the
// signature the portal adds to every email you send (the Gmail API does not add your Gmail signature, so the portal imports it: John, Nov 9 2:06 PM).
import { html, raw, $, $$, guard, toast, fmtDateTime } from '../ui.js?v=202611070139';
import { editorHtml, mountEditor } from './compose.js?v=202611110900';
import { GMAIL_RESULT, TEST_ALLOWLIST_NOTE } from '../data/gmail-email.js?v=202611091801';
export function sigSourceLine(g) {
  const when = g.signatureSyncedAt ? ` (imported ${fmtDateTime(g.signatureSyncedAt)})` : '';
  if (g.signatureSource === 'gmail') return htmlToTextLen(g.signatureHtml) ? `Your Gmail signature${when}.` : `Your Gmail has no signature${when}. Add one in Gmail, then Refresh from Gmail, or type one below.`;
  if (g.signatureSource === 'custom') return 'A signature typed in the portal (override). Refresh from Gmail to use your Gmail signature instead.';
  return htmlToTextLen(g.signatureHtml) ? 'Signature from your CRM profile.' : 'No signature yet.';
}
const htmlToTextLen = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').trim().length;
export function gmailCardHtml(g, note) {
  if (!g || !g.available || !g.allowed) return '';
  const res = GMAIL_RESULT[note];
  return html`<div class="box-title"><h2><span class="h-ico"></span>Gmail</h2></div>
    <div class="card" data-gmail-card>
      ${res ? html`<div class="notice ${res[0] === 'ok' ? 'info' : res[0]}" data-gmail-result="${note}">${res[1]}</div>` : ''}
      ${g.viewAs ? html`<p class="muted" data-gmail-viewas>View as is read-only. Go back to your account to connect Gmail.</p>` : g.connected ? html`
        <p data-gmail-connected>Connected: <strong>${g.mailbox}</strong> ${g.status === 'needs_reconnect' ? html`<span class="pill bad" data-gmail-reconnect>Connect again</span>` : html`<span class="pill ok">connected</span>`}
          ${g.lastSyncAt ? html`<span class="muted small">Replies last checked ${fmtDateTime(g.lastSyncAt)}</span>` : ''}</p>
        <p class="small muted">Emails you send from a file go out from this address and replies in the same thread show up on the file (checked every few minutes). ${TEST_ALLOWLIST_NOTE}</p>
        <p>${g.status === 'needs_reconnect' ? html`<button type="button" class="m-btn" data-gmail-connect>Connect Gmail again</button> ` : ''}<button type="button" class="ghost" data-gmail-disconnect>Disconnect</button></p>
        <h3 class="small">Email signature (added once to every email you send from the portal)</h3>
        ${g.signatureScope ? '' : html`<div class="notice warn" data-gmail-sig-reconnect>Reconnect Gmail to import your signature. <button type="button" class="m-btn" data-gmail-connect>Reconnect Gmail</button></div>`}
        <p class="small muted" data-gmail-sig-source="${g.signatureSource || 'none'}">${sigSourceLine(g)}</p>
        <div data-gmail-sig-preview class="gmail-sig-preview"></div>
        <p><button type="button" class="ghost" data-gmail-sig-refresh ${g.signatureScope ? '' : raw('disabled title="Reconnect Gmail to import your signature"')}>Refresh from Gmail</button></p>
        <details data-gmail-sig-override${g.signatureSource === 'custom' ? raw(' open') : ''}><summary class="small">Use a different signature in the portal (override)</summary>
          <div data-gmail-sig-editor>${editorHtml('gmail-sig')}</div>
          <p><button type="button" class="m-btn" data-gmail-sig-save>Save signature</button> <span class="small muted">Refresh from Gmail puts your Gmail signature back.</span></p></details>` : html`
        <p data-gmail-off>Send and receive email inside a file from your own <strong>@clatitle.com</strong> Gmail. Google will ask you to allow the portal to <em>send</em> email as you and <em>read</em> email; the portal only keeps messages in threads started from a file.</p>
        <p class="small muted">${TEST_ALLOWLIST_NOTE}</p>
        <p><button type="button" class="m-btn" data-gmail-connect>Connect Gmail</button></p>`}
    </div>`;
}
export function mountGmailCard(root, api, g, refresh) {
  const card = $('[data-gmail-card]', root); if (!card) return;
  if (typeof history !== 'undefined' && /[?&]gmail=/.test(location.hash)) { try { history.replaceState(null, '', '#/profile'); } catch (e) { /* keep the hash */ } }
  $$('[data-gmail-connect]', card).forEach((c) => c.addEventListener('click', guard(async () => { c.disabled = true; try { const url = await api.connectGmail(); location.assign(url); } finally { c.disabled = false; } })));
  // signature preview in a sandboxed frame (signature HTML is never put into the page itself)
  const pv = $('[data-gmail-sig-preview]', card);
  if (pv && htmlToTextLen(g.signatureHtml)) { const f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.setAttribute('referrerpolicy', 'no-referrer'); f.title = 'Signature preview';
    f.style.cssText = 'width:100%;min-height:120px;border:1px solid #ddd;background:#fff'; f.srcdoc = `<base target="_blank">${g.signatureHtml}`; pv.appendChild(f); }
  const rf = $('[data-gmail-sig-refresh]', card);
  if (rf && api.refreshGmailSignature) rf.addEventListener('click', guard(async () => { rf.disabled = true;
    try { const r = await api.refreshGmailSignature(); toast(r.empty ? 'Your Gmail has no signature. Add one in Gmail, then Refresh from Gmail.' : 'Signature imported from Gmail', r.empty ? 'err' : 'ok'); refresh(); }
    finally { rf.disabled = false; } }));
  const d = $('[data-gmail-disconnect]', card);
  if (d) d.addEventListener('click', guard(async () => {
    if (!confirm('Disconnect Gmail? The portal stops sending and checking replies, and its access is removed at Google. Emails already on files stay.')) return;
    const r = await api.disconnectGmail(); toast(r.revoked ? 'Gmail disconnected (access removed at Google)' : 'Gmail disconnected here. Google did not confirm; you can also remove "CLA Portal" at myaccount.google.com > Security.', r.revoked ? 'ok' : 'err'); refresh(); }));
  const ed = $('[data-gmail-sig-editor]', card);
  if (ed) { const ctl = mountEditor(ed); ctl.box.innerHTML = g.signatureSource === 'custom' ? safeSig(g.signatureHtml) : '';
    $('[data-gmail-sig-save]', card).addEventListener('click', guard(async () => { await api.saveGmailSignature(ctl.html); toast('Signature saved'); refresh(); })); }
}
// typed overrides only go back into the editor, stripped of anything active (the server sanitizes too)
function safeSig(h) { return String(h || '').replace(/<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<\/?(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src)\s*=\s*("|')?\s*javascript:/gi, '$1=$2#'); }
