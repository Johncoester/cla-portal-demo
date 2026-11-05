// crm-rte.js : a small RICH TEXT EDITOR for CRM email templates and signatures (Nov 3, Zoho video 6). No libraries: contenteditable + execCommand.
// Toolbar as in Zoho: font, size, color, background color, page background color, bold / italic / underline / strikethrough, sub / superscript,
// alignment (incl. justify), outdent / indent, lists, link (Add Link dialog), remove link, image (Upload from computer / Web URL, width / height px),
// table, horizontal rule, Insert field (and typing #), Insert Code, Edit HTML, Survey (not available yet). Every HTML that leaves the editor is
// sanitized (crm-templates.js sanitizeHtml: no scripts, no event handlers, no javascript: links). Function first, minimal styling.
import { html, raw, $, $$, toast, modal, closeModal, esc } from '../ui.js?v=202611052321';
import { sanitizeHtml, safeLink, safeImageSrc } from '../data/crm-templates.js?v=202611052321';

export const IMAGE_MAX_BYTES = 400_000;   // uploaded images are stored inside the template (demo storage is small); bigger: use a web link
const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New', 'Tahoma'];
const SIZES = [['1', '10 px'], ['2', '13 px'], ['3', '16 px'], ['4', '18 px'], ['5', '24 px'], ['6', '32 px'], ['7', '48 px']];
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read the file.')); r.readAsDataURL(f); });

// ---------- selection helpers (toolbar buttons and dialogs must act on the editor's last selection) ----------
export function selectionKeeper(el) {
  let range = null;
  const keep = () => { const s = window.getSelection(); if (s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) range = s.getRangeAt(0).cloneRange(); };
  ['keyup', 'mouseup', 'input', 'focus'].forEach((ev) => el.addEventListener(ev, keep));
  document.addEventListener('selectionchange', keep);
  const restore = () => { const saved = range; el.focus(); range = saved;   // focus() fires keep() with the caret at the start; put the remembered range back
    if (!range) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); range = r; } const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); };
  return { keep, restore, get range() { return range; } };
}
export const exec = (cmd, val = null) => { document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor'); return document.execCommand(cmd, false, val); };
const insertHtml = (h) => exec('insertHTML', sanitizeHtml(h));

// ---------- dialogs ----------
// Add Link: Text to display, Link Type (Web URL / Email), URL, Target (default New Window)
export function linkDialog(selectedText, done) {
  const m = modal('Add Link', html`<form id="link-form" class="form-grid" novalidate>
    <label>Text to display<input name="text" maxlength="300" value="${selectedText || ''}" data-link-text></label>
    <label>Link Type<select name="type" data-link-type><option value="url">Web URL</option><option value="email">Email</option></select></label>
    <label class="span2">URL<input name="url" maxlength="1000" placeholder="https://" data-link-url></label>
    <label>Target<select name="target" data-link-target><option value="_blank">New Window</option><option value="_self">Same Window</option></select></label>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit" data-link-ok>Insert</button></div></form>`);
  $('#link-form', m).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; const type = f.type.value; let url = f.url.value.trim();
    if (type === 'email' && url && !/^mailto:/i.test(url)) url = 'mailto:' + url;
    const href = safeLink(url); if (!href || (type === 'email' && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href))) { $('[data-form-err]', f).textContent = type === 'email' ? 'Enter an email address.' : 'Enter a web address (http:// or https://).'; return; }
    const text = f.text.value.trim() || href.replace(/^mailto:/i, ''); closeModal(); done({ href, text, target: f.target.value }); });
}
// Insert Image: Upload from computer or Web URL; width / height in px; alternate text
export function imageDialog(done, { title = 'Insert Image' } = {}) {
  const m = modal(title, html`<form id="img-form" class="form-grid" novalidate>
    <div class="span2"><label class="check"><input type="radio" name="from" value="upload" checked data-img-from="upload"> Upload from computer</label>
      <label class="check"><input type="radio" name="from" value="url" data-img-from="url"> Web URL</label></div>
    <label class="span2" data-img-upload>Image file (PNG, JPG, GIF, WEBP; up to ${Math.round(IMAGE_MAX_BYTES / 1000)} KB)<input type="file" name="file" accept="image/png,image/jpeg,image/gif,image/webp" data-img-file></label>
    <label class="span2" data-img-urlrow hidden>Image URL<input name="url" maxlength="1000" placeholder="https://" data-img-url></label>
    <label>Width (px)<input name="width" type="number" min="1" max="1200" placeholder="auto" data-img-w></label>
    <label>Height (px)<input name="height" type="number" min="1" max="2000" placeholder="auto" data-img-h></label>
    <label class="span2">Alternate Text<input name="alt" maxlength="200" data-img-alt></label>
    <p class="err-text span2" data-form-err></p>
    <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit" data-img-ok>Insert</button></div></form>`);
  const f = $('#img-form', m);
  $$('[data-img-from]', f).forEach((r) => r.addEventListener('change', () => { const up = f.from.value === 'upload'; $('[data-img-upload]', f).hidden = !up; $('[data-img-urlrow]', f).hidden = up; }));
  f.addEventListener('submit', async (e) => { e.preventDefault(); const err = $('[data-form-err]', f); err.textContent = ''; let src = '';
    try { if (f.from.value === 'upload') { const file = f.file.files[0]; if (!file) throw new Error('Choose an image file.'); if (file.size > IMAGE_MAX_BYTES) throw new Error(`That image is over ${Math.round(IMAGE_MAX_BYTES / 1000)} KB; use a smaller one or a web URL.`);
        src = safeImageSrc(await readFile(file)); if (!src) throw new Error('Only PNG, JPG, GIF or WEBP images.'); }
      else { src = safeImageSrc(f.url.value); if (!src) throw new Error('Enter an http(s) image address.'); } } catch (x) { err.textContent = x.message; return; }
    const w = Math.round(Number(f.width.value)) || 0, h = Math.round(Number(f.height.value)) || 0; closeModal(); done({ src, width: w > 0 ? Math.min(w, 1200) : 0, height: h > 0 ? Math.min(h, 2000) : 0, alt: f.alt.value.trim() }); });
}
export const imgTag = ({ src, width, height, alt }) => `<img src="${esc(src)}" alt="${esc(alt || '')}"${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''} style="max-width: 100%;${height ? ` height: ${height}px` : ' height: auto'}">`;

// ---------- merge-field picker (typing # or the Insert field button) ----------
let picker = null;
export function closePicker() { if (picker) { picker.remove(); picker = null; } }
// fields: [{label, token, group}]; at: a DOMRect to place it under; onPick(token)
export function openPicker(fields, at, onPick) {
  closePicker(); const el = document.createElement('div'); el.className = 'merge-picker'; el.setAttribute('data-merge-picker', '');
  el.innerHTML = String(html`<input type="search" placeholder="Search fields" data-picker-q aria-label="Search merge fields"><ul data-picker-list></ul><p class="muted small">Pick a field (Esc closes)</p>`);
  document.body.appendChild(el); picker = el;
  const r = at || { left: 100, bottom: 100 }; el.style.left = Math.max(8, Math.min(window.innerWidth - 330, r.left + window.scrollX)) + 'px'; el.style.top = (r.bottom + window.scrollY + 4) + 'px';
  const list = $('[data-picker-list]', el); const q = $('[data-picker-q]', el);
  const draw = () => { const s = q.value.trim().toLowerCase(); const rows = fields.filter((f) => !s || f.token.toLowerCase().includes(s));
    let g = ''; list.innerHTML = rows.map((f) => { const head = f.group !== g ? `<li class="mp-group">${esc(f.group)}</li>` : ''; g = f.group;
      return head + `<li data-token="${esc(f.token)}" tabindex="0">${esc(f.label)} <span class="muted small">${esc(f.token)}</span></li>`; }).join('') || '<li class="muted">No field matches.</li>'; };
  draw(); q.addEventListener('input', draw);
  const pick = (li) => { const t = li && li.dataset.token; if (!t) return; closePicker(); onPick(t); };
  list.addEventListener('mousedown', (e) => { e.preventDefault(); pick(e.target.closest('[data-token]')); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    if (e.key === 'Enter') { e.preventDefault(); pick(e.target.closest('[data-token]') || $('[data-token]', list)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); const items = $$('[data-token]', list); const i = items.indexOf(document.activeElement); (items[i + 1] || items[0])?.focus(); } });
  setTimeout(() => { q.focus(); document.addEventListener('mousedown', function off(e) { if (picker && !picker.contains(e.target)) { closePicker(); document.removeEventListener('mousedown', off); } }); }, 0);
  return el;
}
// a plain <input> (Subject): typing # opens the picker; the # is replaced by the field
export function wireInputPicker(input, getFields) {
  input.addEventListener('input', (e) => { if (e.data !== '#') return; const pos = input.selectionStart;
    openPicker(getFields(), input.getBoundingClientRect(), (t) => { const v = input.value; const at = v[pos - 1] === '#' ? pos - 1 : pos; input.value = v.slice(0, at) + t + v.slice(at === pos - 1 ? pos : pos); input.focus(); input.setSelectionRange(at + t.length, at + t.length); input.dispatchEvent(new Event('change')); }); });
}
export function insertIntoInput(input, t) { const s = input.selectionStart ?? input.value.length; const e2 = input.selectionEnd ?? s; input.value = input.value.slice(0, s) + t + input.value.slice(e2); input.focus(); input.setSelectionRange(s + t.length, s + t.length); }
// contenteditable: typing # opens the picker; the # is removed and the field inserted where it was
export function wireEditablePicker(el, keeper, getFields) {
  el.addEventListener('input', (e) => { if (e.data !== '#') return; keeper.keep(); const r = keeper.range; const rect = r && r.getBoundingClientRect && r.getBoundingClientRect();
    openPicker(getFields(), rect && rect.bottom ? rect : el.getBoundingClientRect(), (t) => { keeper.restore(); const sel = window.getSelection(); const rr = sel.rangeCount && sel.getRangeAt(0);
      if (rr && rr.startContainer.nodeType === 3 && rr.startOffset > 0 && rr.startContainer.data[rr.startOffset - 1] === '#') { rr.setStart(rr.startContainer, rr.startOffset - 1); sel.removeAllRanges(); sel.addRange(rr); }
      exec('insertText', t); keeper.keep(); el.dispatchEvent(new Event('input')); }); });
}

// ---------- the editor ----------
// opts: { fields: () => [...], mini: false, pageBg: '' }. Returns { body, mount(root) -> ctl { getHtml, setHtml, getPageBg, insertToken, el } }
export function richEditor(key, html0, opts = {}) {
  const mini = !!opts.mini; const b = (cmd, label, title, extra = '') => html`<button type="button" class="rte-b" data-cmd="${cmd}" title="${title}" aria-label="${title}" ${raw(extra)}>${raw(label)}</button>`;
  const body = html`<div class="rte" data-rte-wrap="${key}">
    <div class="rte-toolbar" data-rte-toolbar>
      ${mini ? '' : html`<select data-font title="Font" aria-label="Font"><option value="">Font</option>${FONTS.map((f) => html`<option value="${f}">${f}</option>`)}</select>`}
      <select data-size title="Font size" aria-label="Font size"><option value="">Size</option>${SIZES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
      <label class="rte-color" title="Font color">A<input type="color" data-fore value="#000000" aria-label="Font color"></label>
      ${mini ? '' : html`<label class="rte-color" title="Font background color">bg<input type="color" data-hilite value="#ffff00" aria-label="Font background color"></label>
      <label class="rte-color" title="Page background color">page<input type="color" data-pagebg value="${opts.pageBg || '#ffffff'}" aria-label="Page background color"></label>`}
      ${b('bold', '<b>B</b>', 'Bold')}${b('italic', '<i>I</i>', 'Italic')}${b('underline', '<u>U</u>', 'Underline')}${b('strikeThrough', '<s>S</s>', 'Strikethrough')}
      ${mini ? '' : html`${b('subscript', 'x<sub>2</sub>', 'Subscript')}${b('superscript', 'x<sup>2</sup>', 'Superscript')}`}
      ${b('justifyLeft', '&#8676;', 'Align left')}${b('justifyCenter', '&#8596;', 'Align center')}${b('justifyRight', '&#8677;', 'Align right')}${mini ? '' : b('justifyFull', '&#8801;', 'Justify')}
      ${mini ? '' : html`${b('outdent', '&#8678;', 'Outdent')}${b('indent', '&#8680;', 'Indent')}${b('insertUnorderedList', '&bull; list', 'Bulleted list')}${b('insertOrderedList', '1. list', 'Numbered list')}`}
      ${b('link', 'Link', 'Insert link')}${b('unlink', 'Unlink', 'Remove link')}${b('image', 'Image', 'Insert image')}
      ${mini ? '' : html`${b('table', 'Table', 'Insert table')}${b('insertHorizontalRule', 'HR', 'Horizontal rule')}`}
      ${opts.fields ? b('field', '# Insert field', 'Insert a merge field') : ''}
      ${mini ? '' : b('code', '&lt;/&gt; Insert Code', 'Insert HTML code')}
      ${b('html', 'Edit HTML', 'Edit the HTML source', 'data-html-toggle')}
      ${opts.compose ? html`${b('removeFormat', 'Clear', 'Clear formatting')}${b('undo', '&#8630; Undo', 'Undo')}${b('redo', '&#8631; Redo', 'Redo')}` : ''}
      ${mini || opts.compose ? '' : html`<button type="button" class="rte-b" disabled title="Survey links are not available yet" data-survey>Survey (not available yet)</button>`}
    </div>
    <div class="rte-area" contenteditable="true" data-rte="${key}" style="${opts.pageBg ? `background-color: ${opts.pageBg}` : ''}">${raw(sanitizeHtml(html0 || ''))}</div>
    <textarea class="rte-src" data-rte-src="${key}" hidden rows="14" spellcheck="false" aria-label="HTML source"></textarea></div>`;
  function mount(root) {
    const wrap = $(`[data-rte-wrap="${key}"]`, root); const el = $(`[data-rte="${key}"]`, wrap); const src = $(`[data-rte-src="${key}"]`, wrap); const keeper = selectionKeeper(el);
    let pageBg = opts.pageBg || ''; let srcMode = false;
    const run = (fn) => { if (srcMode) { toast('Switch back from Edit HTML first.', 'err'); return; } keeper.restore(); fn(); keeper.keep(); el.dispatchEvent(new Event('input')); };
    const selText = () => { const r = keeper.range; return r ? r.toString() : ''; };
    $$('[data-cmd]', wrap).forEach((btn) => { btn.addEventListener('mousedown', (e) => e.preventDefault()); btn.addEventListener('click', () => { const c = btn.dataset.cmd;
      if (c === 'link') { const t = selText(); linkDialog(t, ({ href, text, target }) => run(() => insertHtml(`<a href="${esc(href)}" target="${target}">${esc(text)}</a>`))); return; }
      if (c === 'image') { imageDialog((img) => run(() => insertHtml(imgTag(img)))); return; }
      if (c === 'table') { const m = modal('Insert table', html`<form id="tbl-form" class="form-grid"><label>Rows<input name="rows" type="number" min="1" max="20" value="2"></label><label>Columns<input name="cols" type="number" min="1" max="10" value="2"></label>
          <div class="span2"><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit">Insert</button></div></form>`);
        $('#tbl-form', m).addEventListener('submit', (e) => { e.preventDefault(); const r = Math.min(20, Math.max(1, +e.target.rows.value || 1)), k = Math.min(10, Math.max(1, +e.target.cols.value || 1)); closeModal();
          run(() => insertHtml(`<table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%">${'<tr>' + '<td>&nbsp;</td>'.repeat(k) + '</tr>'.repeat(1)}${('<tr>' + '<td>&nbsp;</td>'.repeat(k) + '</tr>').repeat(r - 1)}</table><p><br></p>`)); }); return; }
      if (c === 'code') { const m = modal('Insert Code', html`<form id="code-form"><p class="muted small">Paste HTML. Scripts, event handlers and unsafe links are removed.</p><textarea name="code" rows="10" style="width: 100%" data-code-text></textarea>
          <p><button class="ghost" type="button" data-close>Cancel</button> <button class="m-btn" type="submit" data-code-ok>Insert</button></p></form>`, { wide: true });
        $('#code-form', m).addEventListener('submit', (e) => { e.preventDefault(); const code = e.target.code.value; closeModal(); run(() => insertHtml(code)); }); return; }
      if (c === 'field') { keeper.keep(); openPicker(opts.fields(), btn.getBoundingClientRect(), (t) => run(() => exec('insertText', t))); return; }
      if (c === 'html') { srcMode = !srcMode; if (srcMode) { src.value = sanitizeHtml(el.innerHTML); src.hidden = false; el.hidden = true; btn.classList.add('on'); }
        else { el.innerHTML = sanitizeHtml(src.value); src.hidden = true; el.hidden = false; btn.classList.remove('on'); el.dispatchEvent(new Event('input')); } return; }
      run(() => exec(c)); }); });
    const f = $('[data-font]', wrap); if (f) f.addEventListener('change', () => { if (f.value) run(() => exec('fontName', f.value)); f.value = ''; });
    const sz = $('[data-size]', wrap); sz.addEventListener('change', () => { if (sz.value) run(() => exec('fontSize', sz.value)); sz.value = ''; });
    const fore = $('[data-fore]', wrap); fore.addEventListener('change', () => run(() => exec('foreColor', fore.value)));
    const hil = $('[data-hilite]', wrap); if (hil) hil.addEventListener('change', () => run(() => exec('hiliteColor', hil.value)));
    const pb = $('[data-pagebg]', wrap); if (pb) pb.addEventListener('change', () => { pageBg = pb.value === '#ffffff' ? '' : pb.value; el.style.backgroundColor = pageBg; el.dispatchEvent(new Event('input')); });
    if (opts.fields) wireEditablePicker(el, keeper, opts.fields);
    return { el, keeper, getHtml: () => sanitizeHtml(srcMode ? src.value : el.innerHTML), setHtml: (h) => { el.innerHTML = sanitizeHtml(h); }, getPageBg: () => pageBg,
      insertToken: (t) => run(() => exec('insertText', t)) };
  }
  return { body, mount };
}
// copy text to the clipboard (with a fallback for browsers that refuse navigator.clipboard)
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); const okc = document.execCommand('copy'); t.remove(); return okc; }
}
export { readFile };
