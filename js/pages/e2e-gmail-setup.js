// One-time TEST setup for the automated email inbox. Admin and Super admin only.
// The client secret is sent once and the boxes are cleared. The page never shows a token.
import { html } from '../ui.js?v=202611070139';

export function e2eGmailSetupHtml(s) {
  if (!s) return '';
  const saved = s.clientSaved === true;
  const closed = s.closed === true;
  const connected = s.connected === true;
  const form = html`<form data-e2e-gmail-form autocomplete="off">
      <label class="span2">Google client ID<input name="clientId" type="password" autocomplete="off" spellcheck="false" required></label>
      <label class="span2">Google client secret<input name="clientSecret" type="password" autocomplete="off" spellcheck="false" required></label>
      <div class="span2"><button class="m-btn" type="submit">Save</button></div></form>`;
  return html`<div class="box-title"><h2><span class="h-ico"></span>Test inbox for the automated email checks</h2></div>
    <div class="card form-grid" data-e2e-gmail-setup>
      <p class="span2">This connects <strong>clatestportal@gmail.com</strong> so the nightly checks can read, send, and trash mail in that inbox. The client id and secret stay in the test project's vault. Nothing here is copied to GitHub.</p>
      <p class="span2" data-e2e-gmail-state>${closed ? 'Connected. This setup is off.' : connected ? 'A connection is already stored. Open the consent page to replace it.' : saved ? 'Client saved. Open the Google consent page and sign in as clatestportal@gmail.com.' : 'Paste the client id and secret from the Google client you just created. The boxes clear when you save.'}</p>
      ${saved && !closed ? '' : closed ? '' : form}
      ${saved && !closed ? html`<p class="span2"><button type="button" class="m-btn" data-e2e-gmail-link>Open the Google consent page</button></p>
        <details class="span2"><summary class="small">Replace the client id</summary>${form}</details>` : ''}
      ${closed ? html`<p class="span2"><button type="button" class="ghost" data-e2e-gmail-reopen>Allow one new consent</button> <span class="small muted">A Google app left in Testing stops the connection after 7 days. Allow a new consent, then open the consent page again as clatestportal@gmail.com.</span></p>` : ''}
      <p class="span2 small bad" data-e2e-gmail-err hidden></p>
    </div>`;
}

export function mountE2eGmailSetup(root, api, refresh) {
  const box = root.querySelector('[data-e2e-gmail-setup]');
  if (!box || !api) return;
  const err = box.querySelector('[data-e2e-gmail-err]');
  const show = (message) => { if (!err) return; err.hidden = !message; err.textContent = message || ''; };
  box.querySelectorAll('[data-e2e-gmail-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    show('');
    const data = new FormData(form);
    const clientId = String(data.get('clientId') || '');
    const clientSecret = String(data.get('clientSecret') || '');
    form.reset();
    try { await api.e2eGmailSaveClient(clientId, clientSecret); refresh(); }
    catch (ex) { show(ex.message || 'The client was not saved.'); }
  }));
  const link = box.querySelector('[data-e2e-gmail-link]');
  if (link) link.addEventListener('click', async () => {
    show('');
    link.disabled = true;
    try {
      const r = await api.e2eGmailConsentLink();
      if (!r || !r.url || !r.url.startsWith('https://aqcervntopidtcazcmlv.supabase.co/functions/v1/e2e-gmail-oauth?start=')) throw new Error('The consent page did not start.');
      location.assign(r.url);
    } catch (ex) { link.disabled = false; show(ex.message || 'The consent page did not start.'); }
  });
  const reopen = box.querySelector('[data-e2e-gmail-reopen]');
  if (reopen) reopen.addEventListener('click', async () => {
    show('');
    reopen.disabled = true;
    try { await api.e2eGmailReopen(); refresh(); }
    catch (ex) { reopen.disabled = false; show(ex.message || 'Consent was not allowed again.'); }
  });
}
