/* crm-templates.js : CRM EMAIL TEMPLATES, the pure part (John / Janine, Nov 3; Zoho video 6 "Creating an Email Template"). FAKE DATA ONLY.
 * Shared by the mock adapter, the supabase adapter, the screens and the tests (no DOM needed):
 *   modules + merge fields (Zoho syntax ${Clients.First Name}, ${User.Email}, ${User Signature}), merging against a record,
 *   an allow-list HTML SANITIZER (no scripts, no event handlers, no javascript: links), the drag-and-drop BUILDER blocks -> email-safe HTML,
 *   the New Template gallery, the folder sidebar views, and the fake seed (3 templates, 4 shared folders).
 * NOTHING HERE SENDS EMAIL. Sending, open / bounce / click tracking and test emails wait for the Gmail connection ("we can tie in Gmail later"). */
import { optLabel, activeFields, customDisplay, builtinHidden } from './crm-config.js?v=202611051319';

export const GMAIL_NOTE = 'Sending will be turned on when Gmail is connected.';
export const STATS_NOTE = 'tracking starts when Gmail is connected';
// a template is tied to ONE module (a Leads template is not offered on a client). Token prefix = the module label; aliases accept Zoho's own names.
export const TEMPLATE_MODULES = [['lead', 'Leads'], ['contact', 'Clients'], ['account', 'Companies'], ['opportunity', 'Opportunities']];
export const MODULE_CODES = TEMPLATE_MODULES.map(([c]) => c);
export const moduleLabel = (m) => (TEMPLATE_MODULES.find(([c]) => c === m) || [null, m])[1];
const MODULE_ALIASES = { leads: 'lead', clients: 'contact', contacts: 'contact', companies: 'account', accounts: 'account', opportunities: 'opportunity', deals: 'opportunity' };
// Janine's two kinds: a regular written email (plain text / HTML editor) and a graphic one (formal message or email blast: the block builder)
export const TEMPLATE_KINDS = [['html', 'Written email (plain text / HTML)'], ['builder', 'Graphic email (drag-and-drop builder)']];
export const TEMPLATE_STATUSES = [['active', 'Active'], ['draft', 'Draft']];
export const ATTACH_EXT = ['pdf', 'png', 'jpg', 'jpeg'];
export const NAME_MAX = 120, SUBJECT_MAX = 250, BODY_MAX = 600_000, SIGNATURE_MAX = 20_000, MAX_BLOCKS = 60, FOLDER_MAX = 60;

// ---------------- merge fields ----------------
const money = (v) => (v == null || v === '' ? '' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const mdy = (v) => { const m = String(v || '').slice(0, 10).split('-'); return m.length === 3 && m[0] ? `${m[1]}/${m[2]}/${m[0]}` : ''; };
const PERSON = (mod) => [
  ['First Name', (r) => r.firstName], ['Last Name', (r) => r.lastName], [mod === 'lead' ? 'Lead Name' : 'Client Name', (r) => r.name], ['Email', (r) => r.email], ['Phone', (r) => r.phone],
  ['Mobile', (r) => r.mobile, 'mobile'], ['Title', (r) => r.title, 'title'], ['Company', (r) => r.companyName || r.company],
  ['Role in Company', (r, c) => optLabel(c, 'roleInCompany', r.roleInCompany, { mark: false }), 'roleInCompany'], ['Lead Source', (r, c) => optLabel(c, 'leadSource', r.leadSource, { mark: false }), 'leadSource'],
  ['Relationship Status', (r, c) => optLabel(c, mod === 'lead' ? 'leadRelationshipStatus' : 'relationshipStatus', r.relationshipStatus, { mark: false }), 'relationshipStatus'],   // Janine, Nov 3: each module its own list
  ['Street', (r) => r.street, 'street'], ['City', (r) => r.city, 'city'], ['State', (r) => r.state, 'state'], ['Zip Code', (r) => r.zip, 'zip'], ['County', (r) => r.county, 'county'],
  ['Real Estate License #', (r) => r.licenseNo, 'licenseNo'], ['Website', (r) => (r.links || {}).website, 'links.website'], [mod === 'lead' ? 'Lead Owner' : 'Client Owner', (r) => r.ownerName]];
const BUILTIN = {
  lead: PERSON('lead'), contact: PERSON('contact'),
  account: [['Company Name', (r) => r.name], ['Type', (r, c) => optLabel(c, 'accountKind', r.kind, { mark: false })], ['Phone', (r) => r.phone, 'phone'], ['Website', (r) => r.website, 'website'],
    ['City', (r) => r.city, 'city'], ['State', (r) => r.state, 'state'], ['Company Owner', (r) => r.ownerName]],
  opportunity: [['Opportunity Name', (r) => r.name], ['Stage', (r, c) => optLabel(c, 'oppStage', r.stage, { mark: false })], ['Opportunity Owner', (r) => r.ownerName], ['Client Name', (r) => r.contactName],
    ['Company Name', (r) => r.accountName], ['Estimated Yearly Volume', (r) => money(r.estVolume)], ['Expected Close', (r) => mdy(r.expectedClose)]] };
const USER_FIELDS = [['First Name', (u) => u.firstName], ['Last Name', (u) => u.lastName], ['Full Name', (u) => `${u.firstName || ''} ${u.lastName || ''}`.trim()], ['Email', (u) => u.email], ['Phone', (u) => u.phone], ['Role', (u) => u.role]];
export const SIGNATURE_TOKEN = '${User Signature}';
export const token = (group, label) => '${' + group + '.' + label + '}';
const scopeOf = (m) => (m === 'account' ? 'account' : 'person');
// what the # picker / Insert field button lists for a module: its fields (hidden built-ins left out; active custom fields included), User fields, the signature
export function mergeFieldsFor(module, cfg) {
  if (!MODULE_CODES.includes(module)) return [];
  const g = moduleLabel(module);
  const own = BUILTIN[module].filter(([, , hideKey]) => !(hideKey && (module !== 'opportunity') && builtinHidden(cfg, scopeOf(module), hideKey))).map(([l]) => ({ label: l, token: token(g, l), group: g }));
  const custom = activeFields(cfg, module).map((f) => ({ label: f.label, token: token(g, f.label), group: g, custom: true }));
  return [...own, ...custom, ...USER_FIELDS.map(([l]) => ({ label: l, token: token('User', l), group: 'User' })), { label: 'User Signature', token: SIGNATURE_TOKEN, group: 'User' }];
}
// one value per token for a record: { 'Clients.First Name': 'Bianca', 'User.Email': ..., 'User Signature': {html} }
export function mergeValues(module, row, cfg, user = {}, signatureHtml = '') {
  const g = moduleLabel(module); const out = {};
  if (row) { BUILTIN[module].forEach(([l, fn]) => { out[`${g}.${l}`] = String(fn(row, cfg) ?? ''); });
    activeFields(cfg, module).forEach((f) => { out[`${g}.${f.label}`] = customDisplay(f, (row.custom || {})[f.id], { money, date: mdy }); }); }
  USER_FIELDS.forEach(([l, fn]) => { out[`User.${l}`] = String(fn(user || {}) ?? ''); });
  out['User Signature'] = { html: sanitizeHtml(signatureHtml || '') };
  return out;
}
const TOKEN_RE = /\$\{([^{}<>]{1,160})\}/g;
const normToken = (t, module) => { let s = String(t).replace(/&nbsp;|\u00a0/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const dot = s.indexOf('.'); if (dot > 0) { const grp = s.slice(0, dot).trim(); const m = MODULE_ALIASES[grp.toLowerCase()]; if (m && m === module) s = moduleLabel(m) + '.' + s.slice(dot + 1).trim(); else if (grp.toLowerCase() === 'user') s = 'User.' + s.slice(dot + 1).trim(); }
  return s; };
const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// replace ${...} tokens. html mode: values are escaped (newlines -> <br>), the signature goes in as sanitized HTML. text mode: plain text.
// A token this template's module does not have (e.g. ${Leads.First Name} in a Clients template) becomes blank and is reported in `unknown`.
export function renderMerge(src, values, module, { mode = 'html' } = {}) {
  const unknown = [];
  const out = String(src == null ? '' : src).replace(TOKEN_RE, (all, inner) => { const k = normToken(inner, module);
    const hit = Object.keys(values).find((z) => z.toLowerCase() === k.toLowerCase());
    if (!hit) { if (!unknown.includes(all)) unknown.push(all); return ''; }
    const v = values[hit];
    if (v && typeof v === 'object') return mode === 'html' ? v.html : htmlToText(v.html);
    return mode === 'html' ? escHtml(v).replace(/\r?\n/g, '<br>') : v; });
  return { out, unknown };
}
// the whole template for one record: subject (text), html, plain text, unknown tokens. Nothing is sent.
export function renderTemplate(t, row, cfg, user, signatureHtml) {
  const vals = mergeValues(t.module, row, cfg, user, signatureHtml);
  const subj = renderMerge(t.subject || '', vals, t.module, { mode: 'text' });
  const body = renderMerge(templateHtml(t), vals, t.module, { mode: 'html' });
  const html = sanitizeHtml(body.out);
  return { subject: subj.out.replace(/[\r\n]+/g, ' ').trim(), html, text: htmlToText(html), unknown: [...new Set([...subj.unknown, ...body.unknown])] };
}
// the template's stored body as email HTML (before merging): the editor's HTML, or the builder blocks rendered
export function templateHtml(t) {
  const bg = cssColor(t.pageBg);
  if (t.kind === 'builder') return blocksToHtml(t.blocks || [], { pageBg: bg });
  const body = sanitizeHtml(t.body || '');
  return bg ? `<div style="background-color: ${bg}; padding: 16px">${body}</div>` : body;
}

// ---------------- HTML sanitizer (allow-list; string based so it runs in Node tests and the browser alike) ----------------
const TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'p', 'br', 'div', 'span', 'font', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'center', 'small', 'big']);
const VOID = new Set(['br', 'hr', 'img']);
const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select', 'title', 'head', 'frame', 'frameset', 'applet', 'xml', 'form', 'button', 'audio', 'video', 'canvas', 'link', 'meta', 'base'];
const ATTRS = new Set(['style', 'align', 'valign', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'bgcolor', 'colspan', 'rowspan', 'color', 'face', 'size', 'title', 'dir', 'role']);
const TAG_ATTRS = { a: ['href', 'target', 'rel'], img: ['src', 'alt'] };
const CSS = new Set(['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'line-height', 'width', 'max-width', 'min-width', 'height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right', 'border-bottom',
  'border-left', 'border-color', 'border-style', 'border-width', 'border-radius', 'border-collapse', 'display', 'vertical-align', 'letter-spacing', 'text-transform', 'white-space', 'table-layout', 'list-style-type', 'text-indent']);
const decodeEnt = (s) => String(s).replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32)).replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d) || 32))
  .replace(/&colon;/gi, ':').replace(/&tab;/gi, '\t').replace(/&newline;/gi, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const attrEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textEsc = (t) => t.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const IS_TOKEN = /^\$\{[^{}<>]{1,160}\}$/;
// a link: http(s), mailto:, tel:, an in-page #anchor, or a merge token. Everything else ('javascript:', 'data:', 'vbscript:' ...) -> ''
export function safeLink(v) {
  const raw = decodeEnt(v).replace(/[\u0000-\u0020\u007f-\u009f]/g, '');
  if (!raw) return ''; if (IS_TOKEN.test(String(v).trim())) return String(v).trim(); if (raw.startsWith('#')) return raw;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return raw.slice(0, 1000);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) && /^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(raw)) return 'https://' + raw.slice(0, 990);   // bare www.x.com
  return '';
}
// an image: http(s) or an uploaded image as data:image/png|jpeg|gif|webp;base64 (never svg: it can carry script)
export function safeImageSrc(v) {
  const s = String(v == null ? '' : v).trim(); if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) return s.replace(/\s+/g, '');
  const l = safeLink(s); return /^https?:\/\//i.test(l) ? l : '';
}
export function cssColor(v) { const s = String(v == null ? '' : v).trim(); return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s) || /^rgba?\(\s*[\d.\s,%]+\)$/i.test(s) || /^[a-z]{3,20}$/i.test(s) ? s : ''; }
export function sanitizeStyle(st) {
  return String(st || '').split(';').map((d) => { const i = d.indexOf(':'); if (i < 0) return ''; const p = d.slice(0, i).trim().toLowerCase(); const v = d.slice(i + 1).trim();
    if (!CSS.has(p) || !v || v.length > 200) return ''; const dv = decodeEnt(v);
    if (/expression|javascript|vbscript|url\s*\(|@import|behavio|binding|[<>\\{}]|\/\*/i.test(dv)) return ''; return `${p}: ${dv.replace(/"/g, "'")}`; }).filter(Boolean).join('; ');
}
export function sanitizeHtml(input) {
  let s = String(input == null ? '' : input);
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/gi, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?(\?>|$)/g, '');
  for (const t of DROP) { const re = new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}\\s*>`, 'gi'); let prev; do { prev = s; s = s.replace(re, ''); } while (s !== prev); }
  const out = []; const stack = []; let last = 0;
  const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g; let m;
  while ((m = TAG_RE.exec(s))) {
    out.push(textEsc(s.slice(last, m.index))); last = TAG_RE.lastIndex;
    const close = !!m[1]; const tag = m[2].toLowerCase();
    if (!TAGS.has(tag)) continue;   // unknown / dangerous tag: dropped (its text stays, escaped)
    if (close) { if (VOID.has(tag)) continue; const i = stack.lastIndexOf(tag); if (i < 0) continue; while (stack.length > i) out.push(`</${stack.pop()}>`); continue; }
    const attrs = []; const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g; let a;
    const allowed = TAG_ATTRS[tag] || [];
    while ((a = ATTR_RE.exec(m[3]))) { const name = a[1].toLowerCase(); const val = a[2] ?? a[3] ?? a[4] ?? '';
      if (name.startsWith('on') || !(ATTRS.has(name) || allowed.includes(name))) continue;
      let v = val;
      if (name === 'href') { v = safeLink(val); if (!v) continue; }
      else if (name === 'src') { v = safeImageSrc(val); if (!v) continue; }
      else if (name === 'style') { v = sanitizeStyle(val); if (!v) continue; }
      else if (name === 'target') { v = val === '_self' ? '_self' : '_blank'; }
      else if (name === 'rel') continue;
      else { v = decodeEnt(val); if (/javascript:|expression\(|[<>]/i.test(v)) continue; }
      if (!attrs.some(([n]) => n === name)) attrs.push([name, v]); }
    if (tag === 'a' && attrs.some(([n, v]) => n === 'target' && v === '_blank')) attrs.push(['rel', 'noopener noreferrer']);
    out.push(`<${tag}${attrs.map(([n, v]) => ` ${n}="${attrEsc(v)}"`).join('')}>`);
    if (!VOID.has(tag)) stack.push(tag);
  }
  out.push(textEsc(s.slice(last)));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}
export function htmlToText(h) {
  return decodeEnt(String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h[1-6]|table|blockquote)>/gi, '\n\n').replace(/<\/(div|li|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<hr[^>]*>/gi, '\n----\n')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => { const tt = t.replace(/<[^>]*>/g, ''); return tt && href && !tt.includes(href) && !href.startsWith('#') ? `${tt} (${href.replace(/&amp;/g, '&')})` : tt; })
    .replace(/<[^>]*>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
// plain text (as typed in "Insert HTML / Plain text") -> HTML paragraphs
export const textToHtml = (t) => String(t || '').split(/\r?\n/).map((l) => escHtml(l)).join('<br>');

// ---------------- the drag-and-drop BUILDER ----------------
export const BLOCK_TYPES = [['image', 'Image'], ['text', 'Text'], ['button', 'Button'], ['columns', 'Columns'], ['spacer', 'Spacer'], ['divider', 'Divider'], ['social', 'Social'], ['html', 'HTML'], ['video', 'Video']];
export const BLOCK_CODES = BLOCK_TYPES.map(([c]) => c);
export const IMAGE_SIZES = [['banner', 'Banner'], ['fit', 'Fit'], ['small', 'Small'], ['medium', 'Medium'], ['original', 'Original'], ['custom', 'Custom']];
export const SPACER_HEIGHTS = [10, 15, 20];
export const ALIGNS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
export const SOCIAL_NETWORKS = [['facebook', 'Facebook', 'f', '#3b5998'], ['instagram', 'Instagram', 'IG', '#c13584'], ['linkedin', 'LinkedIn', 'in', '#0a66c2'], ['x', 'X', 'X', '#000000'], ['youtube', 'YouTube', 'YT', '#cc0000'], ['website', 'Website', 'www', '#555555']];
const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
export function newBlock(type) {
  switch (type) {
    case 'image': return { type, src: '', alt: '', size: 'fit', width: 300, height: 0, align: 'center', link: '', bg: '', padding: 10 };
    case 'text': return { type, html: '<p>Type your text here.</p>', bg: '', padding: 10 };
    case 'button': return { type, text: 'Click here', link: '', align: 'center', color: '#1f5fa8', textColor: '#ffffff', bg: '', padding: 10 };
    case 'columns': return { type, left: '<p>Left column</p>', right: '<p>Right column</p>', bg: '', padding: 10 };
    case 'spacer': return { type, height: 20, bg: '' };
    case 'divider': return { type, color: '#cccccc', thickness: 1, bg: '', padding: 10 };
    case 'social': return { type, align: 'center', links: [{ network: 'facebook', url: '' }, { network: 'instagram', url: '' }, { network: 'linkedin', url: '' }], bg: '', padding: 10 };
    case 'html': return { type, html: '<p>Your HTML here</p>', bg: '', padding: 10 };
    case 'video': return { type, thumb: '', link: '', caption: 'Watch the video', align: 'center', bg: '', padding: 10 };
    default: throw new Error('Pick a block from the palette.');
  }
}
// validate + normalise one stored block (unknown keys dropped; HTML sanitized; links / images checked)
export function cleanBlock(b) {
  if (!b || !BLOCK_CODES.includes(b.type)) throw new Error('Unknown builder block.');
  const d = newBlock(b.type); const o = { type: b.type };
  o.bg = cssColor(b.bg); if ('padding' in d) o.padding = num(b.padding, 0, 60, d.padding);
  if (b.type === 'image') Object.assign(o, { src: safeImageSrc(b.src), alt: clip(b.alt, 200), size: oneOf(b.size, IMAGE_SIZES.map(([k]) => k), 'fit'), width: num(b.width, 1, 1200, 300), height: num(b.height, 0, 2000, 0),
    align: oneOf(b.align, ['left', 'center', 'right'], 'center'), link: safeLink(b.link || '') });
  if (b.type === 'text' || b.type === 'html') o.html = sanitizeHtml(clip(b.html, 100_000));
  if (b.type === 'button') Object.assign(o, { text: clip(b.text, 120) || 'Click here', link: safeLink(b.link || ''), align: oneOf(b.align, ['left', 'center', 'right'], 'center'), color: cssColor(b.color) || d.color, textColor: cssColor(b.textColor) || d.textColor });
  if (b.type === 'columns') Object.assign(o, { left: sanitizeHtml(clip(b.left, 50_000)), right: sanitizeHtml(clip(b.right, 50_000)) });
  if (b.type === 'spacer') o.height = SPACER_HEIGHTS.includes(Number(b.height)) ? Number(b.height) : 20;
  if (b.type === 'divider') Object.assign(o, { color: cssColor(b.color) || '#cccccc', thickness: num(b.thickness, 1, 10, 1) });
  if (b.type === 'social') Object.assign(o, { align: oneOf(b.align, ['left', 'center', 'right'], 'center'),
    links: (Array.isArray(b.links) ? b.links : []).slice(0, 8).filter((l) => l && SOCIAL_NETWORKS.some(([k]) => k === l.network)).map((l) => ({ network: l.network, url: safeLink(l.url || '') })) });
  if (b.type === 'video') Object.assign(o, { thumb: safeImageSrc(b.thumb), link: safeLink(b.link || ''), caption: clip(b.caption, 200), align: oneOf(b.align, ['left', 'center', 'right'], 'center') });
  return o;
}
export function cleanBlocks(list) { const a = Array.isArray(list) ? list : []; if (a.length > MAX_BLOCKS) throw new Error(`At most ${MAX_BLOCKS} blocks.`); return a.map(cleanBlock); }
export const IMAGE_WIDTH = { banner: 600, small: 150, medium: 300 };
const linkWrap = (href, inner) => (href ? `<a href="${attrEsc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner);
// one block -> its email-safe HTML cell content (tables + inline styles; what mail programs understand). `forEditor` shows placeholders for empty images.
export function blockInner(b0, { forEditor = false } = {}) {
  const b = cleanBlock(b0);
  switch (b.type) {
    case 'image': { if (!b.src) return forEditor ? '<div style="border: 1px dashed #999999; padding: 24px; text-align: center; color: #666666">Image: add one in the settings</div>' : '';
      const w = b.size === 'fit' ? '' : b.size === 'original' ? '' : b.size === 'custom' ? b.width : IMAGE_WIDTH[b.size];
      const st = `display: inline-block; border: 0; max-width: 100%; ${b.size === 'fit' || b.size === 'banner' ? 'width: 100%; ' : ''}height: ${b.size === 'custom' && b.height ? b.height + 'px' : 'auto'}`;
      return linkWrap(b.link, `<img src="${attrEsc(b.src)}" alt="${attrEsc(b.alt)}"${w ? ` width="${w}"` : ''}${b.size === 'custom' && b.height ? ` height="${b.height}"` : ''} style="${st}">`); }
    case 'text': case 'html': return b.html;
    case 'button': return `<a href="${attrEsc(b.link || '#')}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 10px 22px; background-color: ${b.color}; color: ${b.textColor}; text-decoration: none; border-radius: 4px; font-weight: bold">${escHtml(b.text)}</a>`;
    case 'columns': return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="50%" valign="top" style="padding-right: 8px">${b.left}</td><td width="50%" valign="top" style="padding-left: 8px">${b.right}</td></tr></table>`;
    case 'spacer': return '&nbsp;';
    case 'divider': return `<hr style="border: 0; border-top: ${b.thickness}px solid ${b.color}; margin: 0">`;
    case 'social': return b.links.map((l) => { const n = SOCIAL_NETWORKS.find(([k]) => k === l.network);
      const icon = `<span style="display: inline-block; min-width: 28px; height: 28px; line-height: 28px; padding: 0 4px; border-radius: 14px; background-color: ${n[3]}; color: #ffffff; text-align: center; font-weight: bold; font-size: 12px; text-decoration: none" title="${n[1]}">${n[2]}</span>`;
      return l.url ? linkWrap(l.url, icon) : forEditor ? icon : ''; }).filter(Boolean).join('&nbsp;');
    case 'video': { const thumb = b.thumb ? `<img src="${attrEsc(b.thumb)}" alt="${attrEsc(b.caption || 'Video')}" width="480" style="display: inline-block; border: 0; max-width: 100%; height: auto">` : (forEditor || b.link ? '<div style="display: inline-block; width: 320px; max-width: 100%; padding: 50px 0; background-color: #222222; color: #ffffff; font-size: 28px">&#9654;</div>' : '');
      return thumb || b.caption ? `${linkWrap(b.link, thumb)}${b.caption ? `<div style="padding-top: 6px">${linkWrap(b.link, '&#9654; ' + escHtml(b.caption))}</div>` : ''}` : ''; }
    default: return '';
  }
}
export function blockCellStyle(b0) {
  const b = cleanBlock(b0);
  if (b.type === 'spacer') return `height: ${b.height}px; line-height: ${b.height}px; font-size: 1px${b.bg ? `; background-color: ${b.bg}` : ''}`;
  return [`padding: ${b.padding}px`, b.bg ? `background-color: ${b.bg}` : '', b.align ? `text-align: ${b.align}` : ''].filter(Boolean).join('; ');
}
// the whole builder email: a 600 px centred column (100% wide on a phone), one row per block
export function blocksToHtml(blocks, { pageBg = '' } = {}) {
  const rows = cleanBlocks(blocks).map((b) => { const inner = blockInner(b); return inner ? `<tr><td style="${blockCellStyle(b)}">${inner}</td></tr>` : ''; }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${cssColor(pageBg) || '#f4f4f4'}"><tr><td align="center" style="padding: 12px 0">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: #ffffff; font-family: Arial, sans-serif; font-size: 14px; color: #222222">${rows}</table></td></tr></table>`;
}

// ---------------- New Template GALLERY (tabs as in Zoho; fake starter layouts) ----------------
const T = (html) => ({ ...newBlock('text'), html });
export const GALLERY_TABS = [['basic', 'Basic'], ['celebrations', 'Celebrations'], ['greeting', 'Greeting'], ['newsletters', 'Newsletters'], ['promotions', 'Promotions'], ['surveys', 'Surveys'], ['thanks', 'Thank You']];
export const GALLERY = {
  basic: [{ key: 'blank', name: 'Blank', blocks: [] }, { key: 'blank-image', name: 'Blank with image', blocks: [{ ...newBlock('image'), size: 'banner' }, T('<p>Type your message here.</p>')] }],
  celebrations: [{ key: 'closing-congrats', name: 'Closing congratulations', blocks: [T('<h2 style="text-align: center">Congratulations, ${Clients.First Name}!</h2>'), T('<p style="text-align: center">Your closing is complete. Welcome home!</p>'), { ...newBlock('spacer'), height: 20 }, T('<p>${User Signature}</p>')] }],
  greeting: [{ key: 'holiday', name: 'Holiday greeting', blocks: [{ ...newBlock('image'), size: 'banner' }, T('<p style="text-align: center">Happy holidays from all of us at CLA Title &amp; Escrow (fake).</p>'), { ...newBlock('divider') }, T('<p>${User Signature}</p>')] }],
  newsletters: [{ key: 'monthly', name: 'Monthly newsletter', blocks: [T('<h2>Monthly update</h2>'), { ...newBlock('columns'), left: '<p><strong>Market news</strong><br>Add a short story here.</p>', right: '<p><strong>Upcoming events</strong><br>Add dates here.</p>' }, { ...newBlock('divider') }, { ...newBlock('social') }] }],
  promotions: [{ key: 'event-flyer', name: 'Event flyer', blocks: [{ ...newBlock('image'), size: 'banner' }, T('<h2 style="text-align: center">Event name</h2><p style="text-align: center">Date, time and place</p>'), { ...newBlock('button'), text: 'RSVP' }] }],
  surveys: [],   // "coming soon": surveys are not available yet
  thanks: [{ key: 'thank-you', name: 'Thank you note', blocks: [T('<p>Hi ${Clients.First Name},</p><p>Thank you for choosing CLA Title &amp; Escrow (fake). It was a pleasure working with you.</p>'), T('<p>${User Signature}</p>')] }],
};
// a starter written for Clients works for another module: its ${Clients.*} tokens are renamed to that module's label
export function starterBlocks(key, module) {
  const s = Object.values(GALLERY).flat().find((z) => z.key === key); if (!s) throw new Error('Pick a layout from the gallery.');
  const label = moduleLabel(module); return JSON.parse(JSON.stringify(s.blocks).replace(/\$\{Clients\./g, '${' + label + '.'));
}

// ---------------- folders (sidebar) ----------------
export const VIEW_FOLDERS = [['all', 'All Templates'], ['favorites', 'Favorites'], ['mine', 'Created by Me'], ['shared', 'Shared with Me'], ['public', 'Public Templates']];
export const personalFolderId = (uid) => 'personal:' + uid;
export const isPersonalFolder = (id) => String(id || '').startsWith('personal:');
// rows = templates the viewer can see (each with folderId, createdBy, favorite, retired, name, subject...). view = a VIEW_FOLDERS key or a folder id.
export function templatesInView(rows, view, meId, { q = '', retired = false, module = '' } = {}) {
  const s = String(q || '').trim().toLowerCase();
  return rows.filter((t) => (retired ? t.retired : !t.retired) && (!module || t.module === module)
    && (view === 'all' || !view ? true : view === 'favorites' ? !!t.favorite : view === 'mine' ? t.createdBy === meId
      : view === 'shared' ? t.createdBy !== meId && !isPersonalFolder(t.folderId) : view === 'public' ? !isPersonalFolder(t.folderId) : t.folderId === view)
    && (!s || [t.name, t.subject, t.moduleLabel, t.folderName, t.createdByName, t.modifiedByName].some((v) => String(v || '').toLowerCase().includes(s))))
    .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
}
export function cleanFolderName(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) throw new Error('Give the folder a name.'); if (s.length > FOLDER_MAX) throw new Error(`A folder name can be at most ${FOLDER_MAX} characters.`); return s;
}

// ---------------- FAKE seed (Janine's two samples + a closing-locations note with a fake PDF) ----------------
export const SEED_FOLDERS = [['ef-events', 'Events / Training'], ['ef-john', 'John'], ['ef-monthly', 'Monthly Campaigns'], ['ef-recruiter', 'Recruiter']];
export function seedEmailTemplates(at = '2026-11-03T15:00:00Z') {
  const folders = SEED_FOLDERS.map(([id, name], i) => ({ id, name, position: i + 1, createdBy: 'u-admin', createdAt: at, modifiedBy: 'u-admin', modifiedAt: at }));
  const base = { pageBg: '', status: 'active', retiredAt: null, retiredBy: null, attachments: [], createdBy: 'u-admin', createdAt: at, modifiedBy: 'u-admin', modifiedAt: at };
  const templates = [
    { ...base, id: 'et-1', name: 'Test Email Template', module: 'contact', folderId: 'ef-john', subject: 'This is a test email', kind: 'html', blocks: [],
      body: '<p>${Clients.First Name},</p><p>This is a test email...</p><p>Best,<br>${User Signature}</p>' },
    { ...base, id: 'et-2', name: 'Test 2 Email Template', module: 'contact', folderId: 'ef-events', subject: 'This is a test 2', kind: 'builder', body: '', pageBg: '#eef3f8',
      blocks: [{ ...newBlock('image'), size: 'banner', alt: 'Bowling tournament banner (add the flyer image)' },
        T('<h2 style="text-align: center"><strong>CLA Title Escrow Wars Bowling Tournament</strong></h2>'),
        T('<p style="text-align: center">Hi ${Clients.First Name}! Grab your team for a night of bowling, prizes and pizza.<br>Friday, December 4, 2026 &middot; 6:00 PM &middot; Fake Lanes, Rockville MD (fake event)</p>'),
        { ...newBlock('spacer'), height: 15 },
        T('<p style="text-align: center"><strong><a href="https://example.test/rsvp/escrow-wars" target="_blank">RSVP here to save your lane</a></strong></p>'),
        { ...newBlock('button'), text: 'RSVP', link: 'https://example.test/rsvp/escrow-wars' }, { ...newBlock('spacer'), height: 20 }, T('<p>${User Signature}</p>')] },
    { ...base, id: 'et-3', name: 'Closing Locations', module: 'lead', folderId: 'ef-monthly', subject: 'Where you can close with CLA, ${Leads.First Name}', kind: 'html', blocks: [],
      body: '<p>Hi ${Leads.First Name},</p><p>We close wherever is easiest for your clients. The attached <strong>Closing Locations Flyer</strong> lists our offices (fake).</p><p>Best,<br>${User Signature}</p>',
      attachments: [{ fileId: 'cfile-et-3', attachedBy: 'u-admin', attachedAt: at, detachedAt: null, detachedBy: null }] },
  ];
  const files = [{ id: 'cfile-et-3', entity: 'template', entityId: 'et-3', name: 'Closing Locations Flyer.pdf', mimeType: 'application/pdf', size: 48213, dataUrl: null, uploadedBy: 'u-admin', createdAt: at }];
  const signatures = { 'u-admin': { html: '<p><strong>King John Admin</strong><br>CLA Title &amp; Escrow (fake)<br>301-555-0109</p>', modifiedAt: at },
    'u-sp': { html: '<p>Sam Salesperson<br>Business Development, CLA Title &amp; Escrow (fake)<br>301-555-0102</p>', modifiedAt: at } };
  return { folders, templates, files, signatures };
}
// v18 -> v19 (and the lazy check): add the template collections and the fake seed where missing. Records, orders, documents are untouched.
export function ensureEmailTemplates(d, { seed = true } = {}) {
  const had = Array.isArray(d.crmEmailTemplates);
  d.crmEmailFolders ||= []; d.crmEmailTemplates ||= []; d.crmEmailFavorites ||= {}; d.crmSignatures ||= {}; d.crmAttachments ||= [];
  if (!had && seed) { const s = seedEmailTemplates();
    s.folders.forEach((f) => { if (!d.crmEmailFolders.some((z) => z.id === f.id || z.name.toLowerCase() === f.name.toLowerCase())) d.crmEmailFolders.push(f); });
    s.templates.forEach((t) => { if (!d.crmEmailTemplates.some((z) => z.id === t.id)) d.crmEmailTemplates.push({ ...t, folderId: d.crmEmailFolders.some((f) => f.id === t.folderId) ? t.folderId : personalFolderId('u-admin') }); });
    s.files.forEach((f) => { if (!d.crmAttachments.some((z) => z.id === f.id)) d.crmAttachments.push(f); });
    Object.entries(s.signatures).forEach(([k, v]) => { if (!d.crmSignatures[k]) d.crmSignatures[k] = v; }); }
  return d;
}
