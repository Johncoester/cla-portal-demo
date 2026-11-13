// compose.js (Francis, Nov 3): the message composer used by Share Files, the Parties "Message" buttons and Inbox replies.
// Rich text (Bold, Italic, Underline, bullet / numbered list, Link, Clear formatting) on a contenteditable box; the adapter sanitizes what is stored.
// Files: Upload File / + Add File / drag-and-drop; Send stays disabled while files are still being read ("wait for the upload to finish").
import { html, raw, $, $$, guard, modal, closeModal, toast, fmtSize } from '../ui.js?v=202611161500';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isWireDocName, WIRE_BUYER_ONLY } from '../data/constants.js?v=202611101015';
import { explainRecipients, recipientLabel } from '../data/message-recipients.js?v=202611110900';
import { NO_LOGIN_TAG, NO_INVITE_TAG, canShareInvite, noLoginContactId, noLoginNote, shareInviteToast } from '../data/share-invite.js?v=202611191100';
import { autoSendInvite } from '../data/invite-send.js?v=202611191600';
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });
const TOOLS = [['bold', 'B', 'Bold'], ['italic', 'I', 'Italic'], ['underline', 'U', 'Underline'], ['insertUnorderedList', '\u2022 List', 'Bulleted list'], ['insertOrderedList', '1. List', 'Numbered list'], ['link', 'Link', 'Insert link'], ['removeFormat', 'Clear', 'Clear formatting']];
export const editorHtml = (id = 'rte') => html`<div class="rte-bar" role="toolbar" aria-label="Formatting">${TOOLS.map(([c, l, t]) => html`<button type="button" class="ghost" data-cmd="${c}" title="${t}" aria-label="${t}">${l}</button>`)}</div>
  <div class="rte-box" id="${id}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Message" data-rte></div>`;
export function mountEditor(root) {
  const box = $('[data-rte]', root);
  $$('[data-cmd]', root).forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  $$('[data-cmd]', root).forEach((b) => b.addEventListener('click', () => { box.focus(); const c = b.dataset.cmd;
    if (c === 'link') { const u = prompt('Link address (https://...)'); if (!u) return; if (!/^(https?:\/\/|mailto:)/i.test(u.trim())) { toast('Links must start with http://, https:// or mailto:', 'err'); return; } document.execCommand('createLink', false, u.trim()); return; }
    if (c === 'removeFormat') { document.execCommand('removeFormat'); document.execCommand('unlink'); return; }
    document.execCommand(c); }));
  return { get html() { return box.innerHTML; }, get text() { return box.textContent.trim(); }, clear() { box.innerHTML = ''; }, box };
}
// file picker + drop zone. Returns { files (read), busy, mount(root) }
export function filesHtml() { return html`<div class="dropzone" data-drop tabindex="0">Drag and drop files here, or <button type="button" class="ghost" data-add-file>+ Add File</button>
  <input type="file" data-file-input multiple hidden><span class="muted small"> (${ALLOWED_UPLOAD_EXT.join(', ')}; demo limit ${MAX_UPLOAD_BYTES / 1e6} MB each)</span></div><ul class="plain" data-file-list></ul>`; }
export function mountFiles(root, onBusy = () => {}) {
  const list = []; let busy = 0; const ul = $('[data-file-list]', root); const input = $('[data-file-input]', root);
  const draw = () => { onBusy(busy); ul.innerHTML = list.map((f, i) => `<li data-file-row="${i}">${f.ready ? '\u2705' : '\u23f3 uploading\u2026'} ${f.name.replace(/[<>&"]/g, '')} <span class="muted small">${fmtSize(f.size)}</span> <button type="button" class="ghost" data-unpick="${i}" aria-label="Remove ${f.name.replace(/[<>&"]/g, '')} from this message">&times;</button></li>`).join('');
    $$('[data-unpick]', ul).forEach((b) => b.addEventListener('click', () => { list.splice(Number(b.dataset.unpick), 1); draw(); })); };
  const add = async (fl) => { for (const f of [...fl]) { if (f.size > MAX_UPLOAD_BYTES) { toast(`${f.name} is too large for this demo.`, 'err'); continue; }
    const item = { name: f.name, size: f.size, mimeType: f.type, ready: false, dataUrl: null }; list.push(item); busy++; onBusy(busy); draw();
    try { item.dataUrl = await readFile(f); item.ready = true; } catch (e) { toast(e.message, 'err'); list.splice(list.indexOf(item), 1); } busy--; onBusy(busy); draw(); } };
  $('[data-add-file]', root).addEventListener('click', () => input.click()); input.addEventListener('change', () => { add(input.files); input.value = ''; });
  const dz = $('[data-drop]', root); ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  dz.addEventListener('dragleave', () => dz.classList.remove('over')); dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); add(e.dataTransfer.files); });
  return { get files() { return list.filter((f) => f.ready).map(({ name, size, mimeType, dataUrl }) => ({ name, size, mimeType, dataUrl })); }, get busy() { return busy > 0; }, add,
    get wireNamed() { return list.some((f) => isWireDocName(f.name)); } };
}
// New Conversation (Share Files / Message a party): To (party dropdown), Subject, message, files, Send
// WIRE INSTRUCTIONS (John, Nov 3): CLA staff can mark the files as wire instructions; then (and whenever a file is named as wire instructions) only the
// buyer clients can be picked in To. Agents are never offered. The adapter refuses it anyway.
export async function composeModal({ api, deal, go, user }, { title = 'New Conversation', to = '', subject = '', withFiles = true } = {}) {
  const people = await api.listMessageRecipients(deal.id); const staff = !!user && !user.accountRole && user.role !== 'Outside user';
  // FF-055 / MF-048: for CLA staff the list also has file contacts with an email and no portal login. Picking one invites them and holds the share.
  const inviteId = (p) => (staff ? noLoginContactId(p, (deal && deal.participants) || []) : '');
  // someone with no login whose file role cannot be invited (a lender contact, for example) is listed but cannot be picked
  const noInvite = (p) => !!inviteId(p) && !canShareInvite(p, (deal && deal.participants) || []);
  const explained = explainRecipients({ myRole: (deal && (deal.myRole || (user && user.role))) || '', participants: (deal && deal.participants) || [], allowed: people });
  const m = modal(title, html`<form id="cmpf" class="form-grid" novalidate>
    <label class="span2">To<select name="to" required data-to><option value="">Choose a recipient&hellip;</option>${explained.selectable.map((p) => html`<option value="${p.id}" ${p.id === to && !noInvite(p) ? raw('selected') : ''} ${inviteId(p) ? raw('data-no-login') : ''} ${noInvite(p) ? raw('disabled data-no-invite') : ''}>${recipientLabel(p)}${inviteId(p) ? ` - ${noInvite(p) ? NO_INVITE_TAG : NO_LOGIN_TAG}` : ''}</option>`)}</select></label>
    <p class="span2 notice info" data-invite-note hidden></p>
    ${explained.unavailable.length ? html`<ul class="span2 muted small" data-recipients-unavailable>${explained.unavailable.map((p) => html`<li>${p.name} (${p.role}): ${p.reason}</li>`)}</ul>` : html`<p class="span2 muted small" data-recipients-note>The list is people on your side of this file who have a portal login, plus CLA Title staff on the file. The other side is not listed.</p>`}
    <label class="span2">Subject<input name="subject" maxlength="150" value="${subject}" data-subject></label>
    <div class="span2"><span>Message</span>${editorHtml('cmp-rte')}</div>
    ${withFiles ? html`<div class="span2"><span>Files</span> <button type="button" class="m-btn" data-upload-file>Upload File</button>${filesHtml()}</div>` : ''}
    ${withFiles && staff ? html`<label class="check span2"><input type="checkbox" name="wire" data-wire-mark> These files are wire instructions (buyer clients and CLA Title only; never agents)</label>` : ''}
    <p class="span2 notice warn" data-wire-only hidden>${WIRE_BUYER_ONLY} Only the buyer(s) on this file can be picked.</p>
    <p class="muted small span2">You can message CLA Title staff and people on your own side of this order. Shared files are kept on the order's Documents tab (they can never be deleted).</p>
    <div class="span2"><button class="m-btn" type="submit" data-send>Send</button> <button type="button" class="ghost" data-close>Cancel</button></div></form>`, { wide: true });
  const ed = mountEditor(m); const send = $('[data-send]', m); const toSel = $('[data-to]', m); const mark = $('[data-wire-mark]', m);
  let fl = null; const wireMode = () => !!((mark && mark.checked) || (fl && fl.wireNamed));
  const syncWire = () => { const on = wireMode(); $('[data-wire-only]', m).hidden = !on;
    [...toSel.options].forEach((o) => { if (!o.value) return; const p = people.find((z) => z.id === o.value); const bad = on && p && !p.wireOk; o.disabled = bad || o.hasAttribute('data-no-invite'); o.hidden = bad; if (bad && o.selected) toSel.value = ''; }); syncInvite(); };
  fl = withFiles ? mountFiles(m, (b) => { send.disabled = b > 0; send.textContent = b > 0 ? 'Waiting for upload\u2026' : 'Send'; syncWire(); }) : null;
  if (mark) mark.addEventListener('change', syncWire);
  function syncInvite() { const p = people.find((z) => z.id === toSel.value); const note = $('[data-invite-note]', m); const on = !!(p && inviteId(p)); note.hidden = !on; note.textContent = on ? noLoginNote(p) : ''; }
  toSel.addEventListener('change', syncInvite); syncInvite();
  if (withFiles) $('[data-upload-file]', m).addEventListener('click', () => $('[data-file-input]', m).click());
  $('#cmpf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (fl && fl.busy) throw new Error('Wait for the upload to finish.'); const f = e.target;
    if (!f.to.value) throw new Error('Pick who to send it to.'); if (!ed.text && !(fl && fl.files.length)) throw new Error('Write a message or add a file.');
    const picked = people.find((z) => z.id === f.to.value); const invitee = picked ? inviteId(picked) : '';
    const t = await api.sendMessage({ dealId: deal.id, to: [f.to.value], subject: f.subject.value, bodyHtml: ed.html, files: fl ? fl.files.map((z) => ({ ...z, wireInstructions: !!(mark && mark.checked) })) : [], ...(invitee ? { inviteContactId: invitee } : {}) });
    if (invitee) {   // held for someone with no portal login: email the invite now (the same portal mailbox as File Contacts > Invite to portal)
      const got = (t && t.invited) || {}; const inv = { ...got, name: got.name || `${picked.firstName || ''} ${picked.lastName || ''}`.trim(), email: got.email || picked.email || '' };
      if (inv.link) { const r = await autoSendInvite(api, 'agent', inv.link); inv.sent = !!r.sent; if (r.to) inv.email = r.to; if (!r.sent) inv.error = r.error || ''; }
      const kept = ((t && t.savedFiles) || []).length; const lost = ((t && t.failedFiles) || []).length;
      closeModal(); toast(`${shareInviteToast(inv, kept)}${lost ? ` ${lost} file(s) were not uploaded.` : ''}`, inv.sent || inv.already ? undefined : 'err'); go(`/deals/${deal.id}/inbox/${t.id}`); return; }
    closeModal(); toast(t && t.failedFiles && t.failedFiles.length ? `${(t.savedFiles || []).length} file(s) kept on the order. ${t.failedFiles.length} not uploaded. Shared with ${recipientLabel(picked || {})}. It was not emailed.` : `Shared with ${recipientLabel(picked || {})}. The message is in the portal and was not emailed.`); go(`/deals/${deal.id}/inbox/${t.id}`); }));
  return m;
}
