// compose.js (Francis, Nov 3): the message composer used by Share Files, the Parties "Message" buttons and Inbox replies.
// Rich text (Bold, Italic, Underline, bullet / numbered list, Link, Clear formatting) on a contenteditable box; the adapter sanitizes what is stored.
// Files: Upload File / + Add File / drag-and-drop; Send stays disabled while files are still being read ("wait for the upload to finish").
import { html, raw, $, $$, guard, modal, closeModal, toast, fmtSize } from '../ui.js?v=202611031733';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_EXT, isWireDocName, WIRE_BUYER_ONLY } from '../data/constants.js?v=202611031733';
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
  const m = modal(title, html`<form id="cmpf" class="form-grid" novalidate>
    <label class="span2">To<select name="to" required data-to><option value="">Choose a recipient&hellip;</option>${people.map((p) => html`<option value="${p.id}" ${p.id === to ? raw('selected') : ''}>${p.firstName} ${p.lastName} (${p.role})</option>`)}</select></label>
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
    [...toSel.options].forEach((o) => { if (!o.value) return; const p = people.find((z) => z.id === o.value); const bad = on && p && !p.wireOk; o.disabled = bad; o.hidden = bad; if (bad && o.selected) toSel.value = ''; }); };
  fl = withFiles ? mountFiles(m, (b) => { send.disabled = b > 0; send.textContent = b > 0 ? 'Waiting for upload\u2026' : 'Send'; syncWire(); }) : null;
  if (mark) mark.addEventListener('change', syncWire);
  if (withFiles) $('[data-upload-file]', m).addEventListener('click', () => $('[data-file-input]', m).click());
  $('#cmpf', m).addEventListener('submit', guard(async (e) => { e.preventDefault(); if (fl && fl.busy) throw new Error('Wait for the upload to finish.'); const f = e.target;
    if (!f.to.value) throw new Error('Pick who to send it to.'); if (!ed.text && !(fl && fl.files.length)) throw new Error('Write a message or add a file.');
    const t = await api.sendMessage({ dealId: deal.id, to: [f.to.value], subject: f.subject.value, bodyHtml: ed.html, files: fl ? fl.files.map((z) => ({ ...z, wireInstructions: !!(mark && mark.checked) })) : [] });
    closeModal(); toast(fl && fl.files.length ? 'Files shared' : 'Message sent'); go(`/deals/${deal.id}/inbox/${t.id}`); }));
  return m;
}
