/* crm-fields.js : CUSTOM FIELDS, Zoho video 8 (Janine / John, Nov 3). The 24 Zoho field types, field properties (tooltip, max characters, required,
 * no duplicates, encrypted = masked in the screens, per-role view / edit permission), the layout sections, and the computed types (Formula,
 * Rollup Summary) with a small safe formula language (numbers, + - * /, parentheses, ${Field Label}). PURE (no storage, no DOM). FAKE DATA ONLY.
 * Limits (basic versions, see docs/CRM.md): Formula = arithmetic on number fields of the same record; Rollup Summary = count / sum / avg / min / max
 * of one related module; Image / File Upload = one file each (kept forever in the record's attachments); "Encrypt" masks the value on screen and in
 * lists / exports (the demo stores it in plain text; real encryption needs the database key setup). */

// [code, Zoho label, notes] in Zoho's palette order (video 8)
export const ZOHO_FIELD_TYPES = [['text', 'Single Line'], ['textarea', 'Multi Line'], ['email', 'Email'], ['phone', 'Phone'], ['dropdown', 'Pick List'], ['multiselect', 'Multi Select'],
  ['date', 'Date'], ['datetime', 'Date/Time'], ['number', 'Number'], ['autonumber', 'Auto Number'], ['currency', 'Currency'], ['decimal', 'Decimal'], ['percent', 'Percent'],
  ['longint', 'Long Integer'], ['checkbox', 'Checkbox'], ['url', 'URL'], ['lookup', 'Lookup'], ['formula', 'Formula'], ['user', 'User'], ['file', 'File Upload'],
  ['image', 'Image Upload'], ['rollup', 'Rollup Summary'], ['radio', 'Radio Button'], ['address', 'Address']];
export const OPTION_TYPES = ['dropdown', 'multiselect', 'radio'];   // own option list ('cf:<id>' in CRM Settings)
export const COMPUTED_TYPES = ['formula', 'rollup', 'autonumber'];   // filled by the CRM, never typed
export const FILE_TYPES = ['file', 'image'];
export const CHAR_TYPES = { text: [255, 255], textarea: [4000, 4000], email: [200, 200], phone: [30, 30], url: [500, 500] };   // [default, max] for "Number of characters allowed"
export const UNIQUE_TYPES = ['text', 'email', 'phone', 'number', 'decimal', 'longint', 'currency', 'url'];
// "Set Default Values" (video 8 module menu): a default pre-fills new records (create form and API create when the field is not sent)
export const DEFAULT_TYPES = ['text', 'textarea', 'email', 'phone', 'url', 'dropdown', 'radio', 'number', 'currency', 'percent', 'decimal', 'longint', 'date', 'checkbox'];
export const ENCRYPT_TYPES = ['text', 'email', 'phone', 'number', 'decimal', 'longint', 'currency', 'percent', 'date'];
export const LOOKUP_TARGETS = [['contacts', 'Clients'], ['leads', 'Leads'], ['accounts', 'Companies'], ['deals', 'Deals'], ['opportunities', 'Opportunities']];
export const ROLLUP_RELATED = { contact: ['deals', 'tasks', 'meetings', 'calls', 'opportunities'], lead: ['tasks', 'meetings', 'calls'], account: ['contacts', 'deals', 'opportunities', 'tasks'], opportunity: ['tasks'] };
export const ROLLUP_FNS = [['count', 'Count'], ['sum', 'Sum'], ['avg', 'Average'], ['min', 'Minimum'], ['max', 'Maximum']];
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
export const ADDRESS_PARTS = [['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip Code'], ['country', 'Country']];
export const PERM_ROLES = ['Sales Person', 'Sales Team', 'Processor'];   // Admin and Super admin always view and edit every field
export const TOOLTIP_MAX = 255;
const fail = (m) => { throw new Error(m); };

// ---------- permissions ----------
// perms = { view: [roles], edit: [roles] } (missing = everyone). A role that may edit may also view. Admins: everything.
export function fieldCan(u, f, what = 'view') {
  if (!u) return false; if (u.isAdmin) return true; const p = f.perms || null; if (!p) return true;
  const list = what === 'edit' ? p.edit : [...(p.view || []), ...(p.edit || [])]; return !Array.isArray(list) || list.includes(u.role);
}
export function cleanPerms(p) {
  if (!p || typeof p !== 'object') return null; const pick = (l) => [...new Set((Array.isArray(l) ? l : []).map(String).filter((r) => PERM_ROLES.includes(r)))];
  const view = pick(p.view); const edit = pick(p.edit).filter((r) => view.includes(r) || !Array.isArray(p.view)); return { view: [...new Set([...view, ...edit])], edit };
}

// ---------- the formula language: numbers, + - * / ( ), ${Field Label}; no functions, no text, nothing evaluated as code ----------
export function tokenize(expr) {
  const s = String(expr == null ? '' : expr); const out = []; let i = 0;
  while (i < s.length) { const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const n = Number(s.slice(i, j)); if (!isFinite(n)) fail(`"${s.slice(i, j)}" is not a number.`); out.push({ t: 'num', v: n }); i = j; continue; }
    if (ch === '$' && s[i + 1] === '{') { const j = s.indexOf('}', i); if (j < 0) fail('A field reference is missing its closing }.'); out.push({ t: 'ref', v: s.slice(i + 2, j).trim() }); i = j + 1; continue; }
    if ('+-*/()'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
    fail(`The formula cannot contain "${ch}". Use numbers, + - * / ( ) and \${Field Label}.`);
  }
  if (out.length > 200) fail('The formula is too long.'); return out;
}
// parse to RPN (shunting-yard) and check it is well formed; returns { rpn, refs }
export function parseFormula(expr) {
  const toks = tokenize(expr); if (!toks.length) fail('Write the formula.'); const out = []; const ops = []; const prec = { '+': 1, '-': 1, '*': 2, '/': 2, 'neg': 3 }; let prev = null;
  for (const t of toks) {
    if (t.t === 'num' || t.t === 'ref') out.push(t);
    else if (t.v === '(') ops.push(t);
    else if (t.v === ')') { while (ops.length && ops[ops.length - 1].v !== '(') out.push(ops.pop()); if (!ops.length) fail('The parentheses do not match.'); ops.pop(); }
    else { const unary = t.v === '-' && (!prev || (prev.t === 'op' && prev.v !== ')')); const op = unary ? { t: 'op', v: 'neg' } : t;
      while (!unary && ops.length && ops[ops.length - 1].v !== '(' && prec[ops[ops.length - 1].v] >= prec[op.v]) out.push(ops.pop()); ops.push(op); }
    prev = t; }
  while (ops.length) { const o = ops.pop(); if (o.v === '(') fail('The parentheses do not match.'); out.push(o); }
  let depth = 0; out.forEach((t) => { if (t.t !== 'op') depth++; else if (t.v === 'neg') { if (depth < 1) fail('The formula is not complete.'); } else { if (depth < 2) fail('The formula is not complete.'); depth--; } });
  if (depth !== 1) fail('The formula is not complete.');
  return { rpn: out, refs: [...new Set(out.filter((t) => t.t === 'ref').map((t) => t.v))] };
}
// value(label) -> number | null. A blank referenced field or a division by zero gives null (shown blank).
export function evalFormula(parsed, value) {
  const st = [];
  for (const t of parsed.rpn) {
    if (t.t === 'num') st.push(t.v);
    else if (t.t === 'ref') { const v = value(t.v); st.push(v == null || v === '' || !isFinite(Number(v)) ? null : Number(v)); }
    else if (t.v === 'neg') { const a = st.pop(); st.push(a == null ? null : -a); }
    else { const b = st.pop(); const a = st.pop(); if (a == null || b == null) { st.push(null); continue; }
      st.push(t.v === '+' ? a + b : t.v === '-' ? a - b : t.v === '*' ? a * b : b === 0 ? null : a / b); } }
  const r = st.pop(); return r == null || !isFinite(r) ? null : Math.round(r * 100) / 100;
}
// the numeric built-in fields a formula may use, per record type
export const FORMULA_BUILTINS = { contact: [['salesVolumeLastYear', 'Sales Volume (Last Year)'], ['dealsClosedLastYear', 'Deals Closed (Last Year)'], ['agentSplit', 'Agent Split (%)'], ['orders', 'Total Orders'], ['volume', 'Order Volume']],
  lead: [['salesVolumeLastYear', 'Sales Volume (Last Year)'], ['dealsClosedLastYear', 'Deals Closed (Last Year)'], ['agentSplit', 'Agent Split (%)']],
  account: [['orders', 'Total Orders'], ['volume', 'Order Volume'], ['contacts', 'Clients']], opportunity: [['estVolume', 'Estimated yearly volume']] };
export const NUMBER_CF = ['number', 'currency', 'percent', 'decimal', 'longint', 'formula', 'rollup'];
// a formula may refer only to number fields of the same record type (built-in or custom, not itself)
export function checkFormulaRefs(parsed, entity, customFields, selfId = null) {
  const names = [...(FORMULA_BUILTINS[entity] || []).map(([, l]) => l.toLowerCase()), ...customFields.filter((f) => f.entity === entity && !f.archivedAt && f.id !== selfId && NUMBER_CF.includes(f.type) && f.type !== 'formula').map((f) => f.label.toLowerCase())];
  parsed.refs.forEach((r) => { if (!names.includes(r.toLowerCase())) fail(`The formula uses \${${r}}, which is not a number field on this record.`); });
}

// ---------- layout sections (video 8: Clients Information, Links and Socials, Sales Info Needed, Sales Numbers - Last 12 Months, Open and Closed Deals,
// Address Information, Description Information). Built-in sections keep their keys; Admins add, rename, reorder and hide sections. ----------
const PERSON_SECTIONS = (L) => [['info', `${L} Information`, true], ['links', 'Links and Socials', true], ['salesInfo', 'Sales Info Needed', false], ['salesNumbers', 'Sales Numbers - Last 12 Months', false],
  ['openClosedDeals', 'Open and Closed Deals', false], ['address', 'Address Information', true], ['description', 'Description', true], ['additional', 'Additional Information', true]];   // Janine, Nov 3: "Description" (was "Description Information")
export const DEFAULT_SECTIONS = { lead: PERSON_SECTIONS('Leads'), contact: PERSON_SECTIONS('Clients'), account: [['info', 'Company details', true], ['additional', 'Additional Information', true]], opportunity: [['info', 'Opportunity details', true]] };
export function defaultSections() { const o = {}; Object.entries(DEFAULT_SECTIONS).forEach(([e, l]) => { o[e] = l.map(([key, label, builtin], i) => ({ key, label, builtin, position: i + 1, hidden: false })); }); return o; }
export function ensureSections(s) { const d = defaultSections(); const out = s && typeof s === 'object' ? s : {};
  ['lead', 'contact'].forEach((e) => (Array.isArray(out[e]) ? out[e] : []).forEach((x) => { if (x.key === 'description' && x.builtin && x.label === 'Description Information') x.label = 'Description'; }));   // Janine, Nov 3 (an Admin's own rename is kept)
  Object.entries(d).forEach(([e, list]) => { out[e] = Array.isArray(out[e]) ? out[e] : []; list.forEach((x) => { if (!out[e].some((z) => z.key === x.key)) out[e].push({ ...x, position: x.position + (out[e].length ? 100 : 0) }); }); out[e].sort((a, b) => a.position - b.position); });
  return out; }
export const sectionsOf = (cfg, entity) => ((cfg && cfg.sections && cfg.sections[entity]) || defaultSections()[entity] || []).slice().sort((a, b) => a.position - b.position);
// sections that only hold custom fields (rendered between the built-in blocks, in their order)
export const customSections = (cfg, entity) => sectionsOf(cfg, entity).filter((s) => !s.builtin && !s.hidden);

// ---------- value helpers for the new types ----------
const realDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };
export function cleanDateTime(s, L) { const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(s)); if (!m || !realDate(m[1]) || +m[2] > 23 || +m[3] > 59) fail(`${L} must be a real date and time.`); return `${m[1]}T${m[2]}:${m[3]}`; }
export function cleanAddress(v, L) { const o = typeof v === 'object' && v ? v : {}; const out = {};
  ADDRESS_PARTS.forEach(([k, label]) => { const s = String(o[k] == null ? '' : o[k]).replace(/[\u0000-\u001f]/g, ' ').trim(); if (s.length > 120) fail(`${L} (${label}) can be at most 120 characters.`); if (s) out[k] = s; });
  if (out.zip && !/^[A-Za-z0-9 -]{3,10}$/.test(out.zip)) fail(`${L} (Zip Code) is not valid.`); return Object.keys(out).length ? out : null; }
export const addressText = (a) => (a && typeof a === 'object' ? [a.street, [a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), a.country].filter(Boolean).join(', ') : '');
export const autoNumberText = (cfgx, n) => `${(cfgx && cfgx.prefix) || ''}${n}${(cfgx && cfgx.suffix) || ''}`;
// duplicate comparison: phones by digits, everything else case-insensitive text
export const dupKey = (type, v) => (v == null || v === '' ? '' : type === 'phone' ? String(v).replace(/\D/g, '') : typeof v === 'number' ? String(v) : String(v).trim().toLowerCase());

// ---------- cleaning the NEW types (the 11 older types stay in crm-config.js cleanCustomValue) ----------
// returns the stored value, null for blank, or undefined when the type is not one of these. ctx: { userOk(id), lookupOk(module, id) }
const optPick = (def, s, current, L) => { const o = (def.options || []).find((z) => z.value === String(s)) || (def.options || []).find((z) => z.label.toLowerCase() === String(s).trim().toLowerCase());
  if (!o) fail(`Pick a ${L} from the list.`); if (o.retired && o.value !== current && !(Array.isArray(current) && current.includes(o.value))) fail(`"${o.label}" is retired; pick another ${L}.`); return o.value; };
export function cleanNewValue(def, v, current, ctx = {}) {
  const L = def.label; const s = typeof v === 'string' ? v.trim() : v;
  if (def.type === 'multiselect') { const list = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[|\n]/)).map((x) => String(x).trim()).filter(Boolean); if (!list.length) return null;
    return [...new Set(list.map((x) => optPick(def, x, current, L)))]; }
  if (def.type === 'address') { if (typeof v === 'string') { const t = v.trim(); return t ? cleanAddress({ street: t }, L) : null; } return cleanAddress(v, L); }
  if (!['radio', 'datetime', 'decimal', 'longint', 'user', 'lookup'].includes(def.type)) return undefined;
  if (s == null || s === '') return null;
  switch (def.type) {
    case 'radio': return optPick(def, s, current, L);
    case 'datetime': return cleanDateTime(s, L);
    case 'decimal': { const n = Number(String(s).replace(/,/g, '')); if (!isFinite(n)) fail(`${L} must be a number.`); if (Math.abs(n) > 1e13) fail(`${L} is too large.`); const p = Math.min(9, Math.max(0, Number((def.config || {}).decimals ?? 2))); return Math.round(n * 10 ** p) / 10 ** p; }
    case 'longint': { const t = String(s).replace(/,/g, ''); if (!/^-?\d+$/.test(t)) fail(`${L} must be a whole number.`); const n = Number(t); if (!Number.isSafeInteger(n)) fail(`${L} is too large.`); return n; }
    case 'user': { const id = String(s).slice(0, 60); if (ctx.userOk && !ctx.userOk(id)) fail(`Pick a CLA user for ${L}.`); return id; }
    case 'lookup': { const id = String(s).slice(0, 60); const target = (def.config || {}).target; if (ctx.lookupOk && !ctx.lookupOk(target, id)) fail(`Pick a record from ${L}.`); return id; }
    default: return undefined;
  }
}
// "Number of characters allowed" (video 8): on top of the type's own limit
export function checkMaxChars(def, v) { if (v == null || v === '' || !CHAR_TYPES[def.type]) return; const max = Number(def.maxChars) || CHAR_TYPES[def.type][0]; if (String(v).length > max) fail(`${def.label} can be at most ${max} characters.`); }
// display of the new types (escaped by the screens). ctx: { nameOf(id), lookupName(module, id), fileName(id), money, date, dateTime }
export function newDisplay(def, v, ctx = {}) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  const opt = (x) => { const o = (def.options || []).find((z) => z.value === String(x)); return o ? (o.retired ? `${o.label} (retired)` : o.label) : String(x); };
  switch (def.type) {
    case 'multiselect': return (Array.isArray(v) ? v : [v]).map(opt).join(', ');
    case 'radio': return opt(v);
    case 'datetime': return ctx.dateTime ? ctx.dateTime(v) : String(v).replace('T', ' ');
    case 'decimal': case 'longint': return Number(v).toLocaleString('en-US', { maximumFractionDigits: 9 });
    case 'user': return ctx.nameOf ? ctx.nameOf(v) : String(v);
    case 'lookup': return ctx.lookupName ? ctx.lookupName((def.config || {}).target, v) : String(v);
    case 'address': return addressText(v);
    case 'autonumber': return String(v);
    case 'formula': case 'rollup': { const rt = (def.config || {}).returnType; const n = Number(v); if (!isFinite(n)) return '';
      return rt === 'currency' ? (ctx.money ? ctx.money(n) : '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })) : rt === 'percent' ? `${n}%` : n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
    case 'file': case 'image': return (Array.isArray(v) ? v : [v]).map((id) => (ctx.fileName ? ctx.fileName(id) : String(id))).join(', ');
    default: return undefined;
  }
}
