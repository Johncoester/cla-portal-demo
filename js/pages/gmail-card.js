// Profile Setting > Gmail (John, Nov 9: Gmail phase 1, CLA Portal Live Test). Connect / Disconnect your own @clatitle.com Gmail and keep the
// signature the portal adds to every email you send (the Gmail API does not add your Gmail signature).
import { html, raw, $, guard, toast, fmtDateTime } from '../ui.js?v=202611070139';
import { editorHtml, mountEditor } from './compose.js?v=202611090935';
import { GMAIL_RESULT, TEST_ALLOWLIST_NOTE } from '../data/gmail-email.js?v=202611091345';
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
        <h3 class="small">Email signature (added to every email you send from the portal)</h3>
        <div data-gmail-sig-editor>${editorHtml('gmail-sig')}</div>
        <p><button type="button" class="m-btn" data-gmail-sig-save>Save signature</button></p>` : html`
        <p data-gmail-off>Send and receive email inside a file from your own <strong>@clatitle.com</strong> Gmail. Google will ask you to allow the portal to <em>send</em> email as you and <em>read</em> email; the portal only keeps messages in threads started from a file.</p>
        <p class="small muted">${TEST_ALLOWLIST_NOTE}</p>
        <p><button type="button" class="m-btn" data-gmail-connect>Connect Gmail</button></p>`}
    </div>`;
}
export function mountGmailCard(root, api, g, refresh) {
  const card = $('[data-gmail-card]', root); if (!card) return;
  if (typeof history !== 'undefined' && /[?&]gmail=/.test(location.hash)) { try { history.replaceState(null, '', '#/profile'); } catch (e) { /* keep the hash */ } }
  const c = $('[data-gmail-connect]', card);
  if (c) c.addEventListener('click', guard(async () => { c.disabled = true; try { const url = await api.connectGmail(); location.assign(url); } finally { c.disabled = false; } }));
  const d = $('[data-gmail-disconnect]', card);
  if (d) d.addEventListener('click', guard(async () => {
    if (!confirm('Disconnect Gmail? The portal stops sending and checking replies, and its access is removed at Google. Emails already on files stay.')) return;
    const r = await api.disconnectGmail(); toast(r.revoked ? 'Gmail disconnected (access removed at Google)' : 'Gmail disconnected here. Google did not confirm; you can also remove "CLA Portal" at myaccount.google.com > Security.', r.revoked ? 'ok' : 'err'); refresh(); }));
  const ed = $('[data-gmail-sig-editor]', card);
  if (ed) { const ctl = mountEditor(ed); ctl.box.innerHTML = g.signatureHtml || '';
    $('[data-gmail-sig-save]', card).addEventListener('click', guard(async () => { await api.saveGmailSignature(ctl.html); toast('Signature saved'); })); }
}
