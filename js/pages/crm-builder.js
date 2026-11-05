// crm-builder.js : the drag-and-drop EMAIL BUILDER (Zoho "Blank" gallery template; Nov 3, video 6). Function first, minimal styling.
// Palette: Image, Text, Button, Columns, Spacer, Divider, Social, HTML, Video (click to add at the end, or drag onto the email).
// Each block: hover controls Move (drag handle, plus up / down) and Delete; click a block for its settings. Text blocks are typed in place with a
// small toolbar that floats over the block. Output = email-safe HTML (crm-templates.js blocksToHtml). Images: Upload from computer or Web URL.
import { html, raw, $, $$, toast, esc } from '../ui.js?v=202611051216';
import { BLOCK_TYPES, IMAGE_SIZES, SPACER_HEIGHTS, ALIGNS, SOCIAL_NETWORKS, newBlock, cleanBlock, blockInner, blockCellStyle, sanitizeHtml, safeImageSrc, MAX_BLOCKS } from '../data/crm-templates.js?v=202611051216';
import { exec, selectionKeeper, linkDialog, openPicker, wireEditablePicker, readFile, IMAGE_MAX_BYTES } from './crm-rte.js?v=202611051216';

const opts = (list, cur) => list.map(([v, l]) => html`<option value="${v}" ${String(v) === String(cur) ? raw('selected') : ''}>${l}</option>`);
const common = (b) => html`<label>Background Color<input type="color" data-set="bg" value="${b.bg || '#ffffff'}"></label>${'padding' in b ? html`<label>Padding (px)<input type="number" min="0" max="60" data-set="padding" value="${b.padding}"></label>` : ''}`;
const alignSel = (b) => html`<label>Alignment<select data-set="align">${opts(ALIGNS, b.align)}</select></label>`;
const imagePick = (prefix, label) => html`<fieldset class="span2" data-img-pick="${prefix}"><legend>${label}</legend>
  <label class="check"><input type="radio" name="${prefix}-from" value="upload" checked> Upload from computer</label> <label class="check"><input type="radio" name="${prefix}-from" value="url"> Web URL</label>
  <div data-from-upload><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-upload="${prefix}"></div>
  <div data-from-url hidden><input placeholder="https://" data-url="${prefix}" maxlength="1000"> <button type="button" class="ghost" data-use-url="${prefix}">Use</button></div></fieldset>`;
function settingsHtml(b) {
  const t = BLOCK_TYPES.find(([k]) => k === b.type)[1];
  const body = (() => { switch (b.type) {
    case 'image': return html`${imagePick('src', 'Image')}<label>Size<select data-set="size">${opts(IMAGE_SIZES, b.size)}</select></label>
      <label>Custom width (px)<input type="number" min="1" max="1200" data-set="width" value="${b.width}"></label><label>Custom height (px, 0 = auto)<input type="number" min="0" max="2000" data-set="height" value="${b.height}"></label>
      ${alignSel(b)}<label>Link<input data-set="link" value="${b.link}" placeholder="https://"></label><label>Alternate Text<input data-set="alt" value="${b.alt}" maxlength="200"></label>${common(b)}`;
    case 'text': return html`<p class="muted small span2">Type in the block; select text for the floating toolbar. Typing # inserts a merge field.</p>${common(b)}`;
    case 'button': return html`<label>Button text<input data-set="text" value="${b.text}" maxlength="120"></label><label>Link<input data-set="link" value="${b.link}" placeholder="https://"></label>${alignSel(b)}
      <label>Button color<input type="color" data-set="color" value="${b.color}"></label><label>Text color<input type="color" data-set="textColor" value="${b.textColor}"></label>${common(b)}`;
    case 'columns': return html`<p class="muted small span2">Type in each column.</p>${common(b)}`;
    case 'spacer': return html`<label>Height<select data-set="height">${opts(SPACER_HEIGHTS.map((h) => [h, h + ' px']), b.height)}</select></label>${common(b)}`;
    case 'divider': return html`<label>Line color<input type="color" data-set="color" value="${b.color}"></label><label>Thickness (px)<input type="number" min="1" max="10" data-set="thickness" value="${b.thickness}"></label>${common(b)}`;
    case 'social': return html`${SOCIAL_NETWORKS.map(([k, l]) => { const cur = (b.links.find((z) => z.network === k) || {}).url || ''; return html`<label>${l} link<input data-social="${k}" value="${cur}" placeholder="https://"></label>`; })}
      <p class="muted small span2">Only networks with a link show in the email.</p>${alignSel(b)}${common(b)}`;
    case 'html': return html`<label class="span2">HTML (scripts and event handlers are removed)<textarea rows="8" data-set="html" spellcheck="false">${b.html}</textarea></label>${common(b)}`;
    case 'video': return html`${imagePick('thumb', 'Thumbnail image')}<label>Video link<input data-set="link" value="${b.link}" placeholder="https://"></label><label>Caption<input data-set="caption" value="${b.caption}" maxlength="200"></label>${alignSel(b)}${common(b)}`;
    default: return ''; } })();
  return html`<h4 data-settings-for="${b.type}">${t} settings</h4><div class="form-grid" data-block-settings>${body}</div>`;
}
const EDITABLE = { text: ['html'], columns: ['left', 'right'] };
function blockView(b, i, n, readOnly) {
  const inner = EDITABLE[b.type] && !readOnly
    ? (b.type === 'text' ? html`<div class="tb-edit" contenteditable="true" data-edit="html">${raw(sanitizeHtml(b.html))}</div>`
      : html`<table role="presentation" width="100%"><tr><td width="50%" valign="top"><div class="tb-edit" contenteditable="true" data-edit="left">${raw(sanitizeHtml(b.left))}</div></td><td width="50%" valign="top"><div class="tb-edit" contenteditable="true" data-edit="right">${raw(sanitizeHtml(b.right))}</div></td></tr></table>`)
    : raw(blockInner(b, { forEditor: true }));
  return html`<div class="tb-block" data-block="${i}" data-type="${b.type}">
    ${readOnly ? '' : html`<div class="tb-ctl" data-ctl><span class="tb-handle" draggable="true" data-drag="${i}" title="Move (drag)">&#10303; Move</span>
      <button type="button" class="ghost" data-up="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="Move up">&uarr;</button><button type="button" class="ghost" data-down="${i}" ${i === n - 1 ? raw('disabled') : ''} aria-label="Move down">&darr;</button>
      <button type="button" class="ghost" data-del="${i}">Delete</button></div>`}
    <div class="tb-render" style="${blockCellStyle(b)}">${inner}</div></div>`;
}

// state: { blocks, pageBg }. fields(): merge fields. onChange(): unsaved flag. Returns { body, mount(root) -> { getBlocks, getPageBg } }
export function builder(state, { fields, onChange = () => {}, readOnly = false } = {}) {
  let blocks = (state.blocks || []).map((b) => { try { return cleanBlock(b); } catch (e) { return null; } }).filter(Boolean);
  let pageBg = state.pageBg || ''; let sel = -1;
  const body = html`<div class="tb-wrap" data-builder>
    ${readOnly ? '' : html`<div class="tb-palette" data-palette><h4>Blocks</h4>${BLOCK_TYPES.map(([k, l]) => html`<button type="button" class="ghost tb-pal" draggable="true" data-add="${k}">${l}</button>`)}
      <p class="muted small">Click to add, or drag onto the email.</p>
      <label class="small">Page background<input type="color" data-page-bg value="${pageBg || '#f4f4f4'}"></label></div>`}
    <div class="tb-canvas-wrap"><div class="tb-canvas" data-canvas></div></div>
    ${readOnly ? '' : html`<div class="tb-settings" data-settings><p class="muted">Click a block to change its settings.</p></div>`}
    <div class="tb-float" data-float hidden>
      <button type="button" data-fcmd="bold"><b>B</b></button><button type="button" data-fcmd="italic"><i>I</i></button><button type="button" data-fcmd="underline"><u>U</u></button>
      <button type="button" data-fcmd="justifyLeft" title="Align left">&#8676;</button><button type="button" data-fcmd="justifyCenter" title="Center">&#8596;</button><button type="button" data-fcmd="justifyRight" title="Align right">&#8677;</button>
      <select data-fsize aria-label="Size"><option value="">Size</option><option value="2">13</option><option value="3">16</option><option value="4">18</option><option value="5">24</option><option value="6">32</option></select>
      <input type="color" data-fcolor aria-label="Color"><button type="button" data-fcmd="link">Link</button><button type="button" data-fcmd="unlink">Unlink</button><button type="button" data-fcmd="field"># Field</button></div></div>`;
  function mount(root) {
    const canvas = $('[data-canvas]', root); const panel = $('[data-settings]', root); const float = $('[data-float]', root);
    let activeEdit = null, keeper = null;
    const changed = () => onChange();
    const draw = () => { canvas.style.backgroundColor = pageBg || '#f4f4f4';
      canvas.innerHTML = String(blocks.length ? html`${blocks.map((b, i) => blockView(b, i, blocks.length, readOnly))}` : html`<p class="muted tb-empty" data-empty>${readOnly ? 'No blocks.' : 'Empty email: click or drag a block from the palette.'}</p>`);
      if (readOnly) return;
      $$('.tb-block', canvas).forEach((el) => { const i = +el.dataset.block; if (i === sel) el.classList.add('selected');
        el.addEventListener('click', (e) => { if (e.target.closest('[data-ctl]')) return; if (sel !== i) { sel = i; $$('.tb-block', canvas).forEach((z) => z.classList.toggle('selected', +z.dataset.block === i)); showSettings(); } }); });
      $$('[data-up]', canvas).forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, +b.dataset.up - 1)));
      $$('[data-down]', canvas).forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, +b.dataset.down + 1)));
      $$('[data-del]', canvas).forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.del; blocks.splice(i, 1); sel = -1; showSettings(); draw(); changed(); }));
      $$('[data-drag]', canvas).forEach((h) => h.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'move:' + h.dataset.drag); e.dataTransfer.effectAllowed = 'move'; }));
      $$('.tb-edit', canvas).forEach((ed) => { const i = +ed.closest('.tb-block').dataset.block; const k = selectionKeeper(ed);
        ed.addEventListener('focus', () => { activeEdit = ed; keeper = k; const r = ed.getBoundingClientRect(); float.hidden = false; float.style.top = (r.top + window.scrollY - float.offsetHeight - 4) + 'px'; float.style.left = (r.left + window.scrollX) + 'px'; });
        ed.addEventListener('input', () => { blocks[i][ed.dataset.edit] = ed.innerHTML; changed(); });
        if (fields) wireEditablePicker(ed, k, fields); }); };
    const move = (from, to) => { if (to < 0 || to >= blocks.length || from === to) return; const [b] = blocks.splice(from, 1); blocks.splice(to, 0, b); sel = to; draw(); showSettings(); changed(); };
    const add = (type, at = blocks.length) => { if (blocks.length >= MAX_BLOCKS) { toast(`At most ${MAX_BLOCKS} blocks.`, 'err'); return; } blocks.splice(at, 0, newBlock(type)); sel = at; draw(); showSettings(); changed(); };
    function rerenderSel() { const el = $(`.tb-block[data-block="${sel}"] .tb-render`, canvas); if (!el) return; const b = blocks[sel];
      el.setAttribute('style', blockCellStyle(b)); if (!EDITABLE[b.type]) el.innerHTML = blockInner(b, { forEditor: true }); }
    function showSettings() { if (!panel) return; if (sel < 0 || !blocks[sel]) { panel.innerHTML = String(html`<p class="muted">Click a block to change its settings.</p>`); return; }
      const b = blocks[sel]; panel.innerHTML = String(settingsHtml(b));
      $$('[data-set]', panel).forEach((inp) => { const ev = inp.tagName === 'SELECT' || inp.type === 'color' ? 'change' : 'input'; inp.addEventListener(ev, () => { const k = inp.dataset.set;
        let v = inp.type === 'number' || k === 'height' ? Number(inp.value) : inp.value; if (k === 'bg' && v === '#ffffff') v = '';
        if (k === 'html') v = inp.value; b[k] = v; try { const c = cleanBlock(b); if (k !== 'html' && k !== 'link') Object.assign(b, c); } catch (e) { /* kept until saved */ } rerenderSel(); changed(); });
        if (inp.dataset.set === 'link') inp.addEventListener('change', () => { const c = cleanBlock(b); if (inp.value && !c.link) toast('That link is not a web address (http:// or https://); it will be left out.', 'err'); b.link = c.link; inp.value = c.link; rerenderSel(); }); });
      $$('[data-social]', panel).forEach((inp) => inp.addEventListener('change', () => { const net = inp.dataset.social; const others = b.links.filter((l) => l.network !== net);
        b.links = SOCIAL_NETWORKS.map(([k]) => (k === net ? { network: k, url: inp.value.trim() } : others.find((l) => l.network === k))).filter(Boolean);
        const c = cleanBlock(b); if (inp.value.trim() && !(c.links.find((l) => l.network === net) || {}).url) toast('That link is not a web address; it will be left out.', 'err'); rerenderSel(); changed(); }));
      $$('[data-img-pick]', panel).forEach((fs) => { const key = fs.dataset.imgPick;
        $$(`input[name="${key}-from"]`, fs).forEach((r) => r.addEventListener('change', () => { const up = r.value === 'upload' && r.checked; if (!r.checked) return; $('[data-from-upload]', fs).hidden = !up; $('[data-from-url]', fs).hidden = up; }));
        $(`[data-upload="${key}"]`, fs).addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > IMAGE_MAX_BYTES) { toast(`That image is over ${Math.round(IMAGE_MAX_BYTES / 1000)} KB; use a smaller one or a web URL.`, 'err'); return; }
          const src = safeImageSrc(await readFile(f)); if (!src) { toast('Only PNG, JPG, GIF or WEBP images.', 'err'); return; } b[key] = src; rerenderSel(); changed(); });
        $(`[data-use-url="${key}"]`, fs).addEventListener('click', () => { const src = safeImageSrc($(`[data-url="${key}"]`, fs).value); if (!src) { toast('Enter an http(s) image address.', 'err'); return; } b[key] = src; rerenderSel(); changed(); }); }); }
    if (!readOnly) {
      $$('[data-add]', root).forEach((p) => { p.addEventListener('click', () => add(p.dataset.add)); p.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'new:' + p.dataset.add); }); });
      const pg = $('[data-page-bg]', root); pg.addEventListener('change', () => { pageBg = pg.value; canvas.style.backgroundColor = pageBg; changed(); });
      canvas.addEventListener('dragover', (e) => { e.preventDefault(); });
      canvas.addEventListener('drop', (e) => { e.preventDefault(); const d = e.dataTransfer.getData('text/plain'); const over = e.target.closest('.tb-block');
        let at = blocks.length; if (over) { const r = over.getBoundingClientRect(); at = +over.dataset.block + (e.clientY > r.top + r.height / 2 ? 1 : 0); }
        if (d.startsWith('new:')) add(d.slice(4), at); else if (d.startsWith('move:')) { const from = +d.slice(5); move(from, at > from ? at - 1 : at); } });
      // floating text toolbar
      float.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') e.preventDefault(); });
      const runF = (fn) => { if (!activeEdit) return; keeper.restore(); fn(); keeper.keep(); activeEdit.dispatchEvent(new Event('input')); };
      $$('[data-fcmd]', float).forEach((btn) => btn.addEventListener('click', () => { const c = btn.dataset.fcmd;
        if (c === 'link') { const t = keeper && keeper.range ? keeper.range.toString() : ''; linkDialog(t, ({ href, text, target }) => runF(() => exec('insertHTML', sanitizeHtml(`<a href="${esc(href)}" target="${target}">${esc(text)}</a>`)))); return; }
        if (c === 'field') { if (fields) openPicker(fields(), btn.getBoundingClientRect(), (t) => runF(() => exec('insertText', t))); return; }
        runF(() => exec(c)); }));
      $('[data-fsize]', float).addEventListener('change', (e) => { if (e.target.value) runF(() => exec('fontSize', e.target.value)); e.target.value = ''; });
      $('[data-fcolor]', float).addEventListener('change', (e) => runF(() => exec('foreColor', e.target.value)));
      document.addEventListener('mousedown', (e) => { if (!float.contains(e.target) && !e.target.closest('.tb-edit') && !e.target.closest('#modal') && !e.target.closest('[data-merge-picker]')) float.hidden = true; });
    }
    draw();
    return { getBlocks: () => blocks.map(cleanBlock), getPageBg: () => pageBg, select: (i) => { sel = i; draw(); showSettings(); } };
  }
  return { body, mount };
}
