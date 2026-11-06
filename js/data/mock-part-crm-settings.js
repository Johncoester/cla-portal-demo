/* mock adapter: CRM SETTINGS (Janine / John, Nov 2). FAKE DATA ONLY. Admin / Super admin change them; every CRM user reads them.
 * Picklists (add / rename / reorder / retire), custom fields (add / edit / reorder / delete = archive, restore), built-in fields (hide, un-require).
 * Nothing here ever deletes a value stored on a record. Mirrored by migration 25 (crm_picklist_options, crm_custom_fields, crm_field_settings). */
import { PICKLIST_KEYS, picklistDef, optionsOf, addOption, renameOption, retireOption, moveOption, cleanLabel, FIELD_TYPE_CODES, CF_ENTITY_CODES, SECTIONS_FOR, MAX_FIELDS,
  PERSON_FIELDS, ACCOUNT_FIELDS, PROTECTED_FIELDS, BUILTIN_SCOPES, isLocked, cleanCustomValue, isBlankValue } from './crm-config.js?v=202611061707';
import { OPTION_TYPES, COMPUTED_TYPES, CHAR_TYPES, UNIQUE_TYPES, ENCRYPT_TYPES, LOOKUP_TARGETS, ROLLUP_RELATED, ROLLUP_FNS, TOOLTIP_MAX, cleanPerms, fieldCan, parseFormula, checkFormulaRefs,
  sectionsOf, NUMBER_CF, DEFAULT_TYPES } from './crm-fields.js?v=202611061707';
import { moduleFields } from './crm-analytics.js?v=202611061707';

export function crmSettingsPart(x, h) {
  const { save, now, fail, str, clone, nameOf, nid } = x;
  const { db, cfg, crmUser } = h;
  const crmAdmin = () => { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can change the CRM settings.'); return u; };
  const stamp = (u) => { const c = cfg(); c.modifiedAt = now(); c.modifiedBy = u.id; };
  const fieldOf = (id) => cfg().customFields.find((f) => f.id === id) || fail('That custom field does not exist.');
  const listOf = (key) => { const k = str(key, 80);
    if (k.startsWith('cf:')) { const f = fieldOf(k.slice(3)); if (!OPTION_TYPES.includes(f.type)) fail('Only pick list, multi select and radio button fields have options.'); f.options ||= []; return [f.options, f]; }
    if (!PICKLIST_KEYS.includes(k)) fail('Unknown pick list.'); return [cfg().picklists[k], null]; };
  // how many records use each value (shown next to every option, so an Admin sees what a rename or retire touches)
  function usage(key) {
    const d = db(); const n = {}; const inc = (v) => { if (v != null && v !== '') n[v] = (n[v] || 0) + 1; };
    const people = [...d.crmLeads, ...d.contacts.filter((c) => 'crmOwnerId' in c || 'relationshipStatus' in c)];
    const tasks = d.crmActivities.filter((a) => a.kind === 'task'); const meets = d.crmActivities.filter((a) => a.kind === 'meeting');
    if (key === 'relationshipStatus') d.contacts.forEach((c) => inc(c.relationshipStatus));   // Janine, Nov 3: Clients and Leads have their own lists
    else if (key === 'leadRelationshipStatus') d.crmLeads.forEach((l) => inc(l.status));
    else if (key === 'leadSource') { d.crmLeads.forEach((l) => inc(l.source)); d.contacts.forEach((c) => inc(c.leadSource)); }
    else if (key === 'roleInCompany') people.forEach((p) => inc(p.roleInCompany));
    else if (key === 'accountKind') d.crmAccounts.forEach((a) => inc(a.kind));
    else if (key === 'oppStage') d.crmOpportunities.forEach((o) => inc(o.stage));
    else if (key === 'taskSubject') tasks.forEach((t) => inc(t.subject));
    else if (key === 'taskStatus') tasks.forEach((t) => inc(t.status));
    else if (key === 'taskPriority') tasks.forEach((t) => inc(t.priority));
    else if (key === 'meetingType') meets.forEach((m) => inc(m.meetingType));
    else if (key === 'callOutcome') d.crmActivities.filter((a) => a.kind === 'call').forEach((a) => inc(a.callOutcome));   // video 11
    else if (key.startsWith('cf:')) { const id = key.slice(3); recordsOf(fieldOf(id).entity).forEach((r) => { const v = (r.custom || {})[id]; (Array.isArray(v) ? v : [v]).forEach(inc); }); }
    return n;
  }
  const recordsOf = (entity) => { const d = db(); return entity === 'lead' ? d.crmLeads : entity === 'contact' ? d.contacts : entity === 'account' ? d.crmAccounts : d.crmOpportunities; };
  const storedCount = (f) => recordsOf(f.entity).filter((r) => { const v = (r.custom || {})[f.id]; return v != null && v !== '' && v !== false && !(Array.isArray(v) && !v.length); }).length;
  const BUILTIN_LABELS = { lead: [...PERSON_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.person, 'Lead Owner', 'Lead Name'], contact: [...PERSON_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.person, 'Client Owner', 'Client Name', 'Company Name'],
    account: [...ACCOUNT_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.account], opportunity: ['Name', 'Stage', 'Owner', 'Client', 'Company', 'Estimated yearly volume ($)', 'Expected close'] };
  const labelFree = (entity, label, exceptId) => { const l = label.toLowerCase();
    if (BUILTIN_LABELS[entity].some((b) => b.toLowerCase().replace(/ \*$/, '') === l)) fail(`"${label}" is already a built-in field there; pick another name.`);
    const dup = cfg().customFields.find((f) => f.entity === entity && f.id !== exceptId && f.label.toLowerCase() === l);
    if (dup) fail(dup.archivedAt ? `A deleted field is called "${dup.label}"; restore it instead (its values were kept).` : `A field called "${dup.label}" already exists.`); };
  const yes = (v) => v === true || v === '1' || v === 'on' || v === 'true' || v === 1;
  const sectionOk = (entity, s) => { const v = str(s, 40) || (entity === 'opportunity' ? 'info' : 'additional'); const sec = sectionsOf(cfg(), entity).find((z) => z.key === v);
    if (!sec) fail('Pick a section from the list.'); if (sec.hidden) fail(`The section "${sec.label}" is hidden; show it first.`); return v; };
  // Nov 3 (b), video 8: field properties (tooltip, max characters, no duplicates, encrypt, permissions) and the per-type settings (config)
  function props(f, input, create) {
    const has = (k) => create || input[k] !== undefined;
    if (has('tooltip')) { const t = str(input.tooltip, 400).replace(/[\u0000-\u001f]/g, ' '); if (t.length > TOOLTIP_MAX) fail(`The tooltip can be at most ${TOOLTIP_MAX} characters.`); f.tooltip = t; }
    if (has('showTooltip')) f.showTooltip = yes(input.showTooltip) && !!f.tooltip;
    if (has('maxChars')) { const m = input.maxChars == null || input.maxChars === '' ? null : Number(input.maxChars);
      if (m != null) { if (!CHAR_TYPES[f.type]) fail('Only text, email, phone and URL fields have a character limit.'); if (!Number.isInteger(m) || m < 1 || m > CHAR_TYPES[f.type][1]) fail(`Number of characters allowed must be 1 to ${CHAR_TYPES[f.type][1]}.`); }
      f.maxChars = m; }
    if (has('unique')) { const u = yes(input.unique); if (u && !UNIQUE_TYPES.includes(f.type)) fail('Do not allow duplicate values works on text, email, phone, number, currency and URL fields.');
      if (u && !f.unique) { const seen = new Map(); recordsOf(f.entity).forEach((r) => { const k = dupKeyOf(f, (r.custom || {})[f.id]); if (!k) return; if (seen.has(k)) fail(`Two records already hold "${(r.custom || {})[f.id]}"; fix them before turning on Do not allow duplicate values.`); seen.set(k, 1); }); }
      f.unique = u; }
    if (has('encrypted')) { const e = yes(input.encrypted); if (e && !ENCRYPT_TYPES.includes(f.type)) fail('Encrypt field works on text, email, phone, number, currency, percent and date fields.'); f.encrypted = e; }
    if (has('perms')) f.perms = cleanPerms(input.perms);
    if (create || input.config !== undefined) f.config = cleanConfig(f, input.config || {}, create);
    if (COMPUTED_TYPES.includes(f.type) && f.required) fail(`A ${f.type === 'autonumber' ? 'auto-number' : f.type} field is filled by the CRM; it cannot be required.`);
  }
  // default value (checked like a typed value; for pick lists / radio after the options exist)
  function setDefault(f, raw) {
    if (raw === undefined) return; if (raw == null || raw === '' || raw === false) { f.defaultValue = null; return; }
    if (!DEFAULT_TYPES.includes(f.type)) fail('This field type has no default value.');
    const v = cleanCustomValue({ ...f, required: false, maxChars: f.maxChars }, raw, undefined, { phone: (s2, l) => x.phone(s2, l) });
    f.defaultValue = isBlankValue(v) ? null : v;
  }
  const dupKeyOf = (f, v) => (v == null || v === '' ? '' : f.type === 'phone' ? String(v).replace(/\D/g, '') : typeof v === 'number' ? String(v) : String(v).trim().toLowerCase());
  function cleanConfig(f, c, create) {
    const old = f.config || {};
    switch (f.type) {
      case 'lookup': { const t = create ? str(c.target, 20) : old.target; if (!LOOKUP_TARGETS.some(([k]) => k === t)) fail('Pick the module this lookup points to.'); return { target: t }; }
      case 'decimal': { const d = c.decimals === undefined ? old.decimals ?? 2 : Number(c.decimals); if (!Number.isInteger(d) || d < 0 || d > 9) fail('Decimal places must be 0 to 9.'); return { decimals: d }; }
      case 'autonumber': { const pre = str(c.prefix ?? old.prefix ?? '', 20); const suf = str(c.suffix ?? old.suffix ?? '', 20); const start = create ? Number(c.start || 1) : old.start;
        if (!Number.isInteger(start) || start < 0 || start > 1e9) fail('The starting number must be a whole number.'); return { prefix: pre, suffix: suf, start, next: create ? start : old.next }; }
      case 'formula': { const expr = str(c.expression ?? old.expression ?? '', 600); if (!expr) fail('Write the formula, e.g. ${Sales Volume (Last Year)} * 0.01.'); if (expr.length > 500) fail('The formula can be at most 500 characters.');
        const parsed = parseFormula(expr); checkFormulaRefs(parsed, f.entity, cfg().customFields, f.id);
        const rt = str(c.returnType ?? old.returnType ?? 'number', 10); if (!['number', 'currency', 'percent'].includes(rt)) fail('A formula returns a number, currency or percent.'); return { expression: expr, returnType: rt }; }
      case 'rollup': { const rel = create ? str(c.related, 20) : old.related; if (!(ROLLUP_RELATED[f.entity] || []).includes(rel)) fail('Pick the related module to summarize.');
        const fn = str(c.fn ?? old.fn ?? 'count', 10); if (!ROLLUP_FNS.some(([k]) => k === fn)) fail('Pick Count, Sum, Average, Minimum or Maximum.');
        let field = null; if (fn !== 'count') { field = str(c.field ?? old.field ?? '', 80); const ff = moduleFields(rel, cfg()).find((z) => z.key === field); if (!ff || !['number', 'currency', 'percent'].includes(ff.type)) fail('Pick a number field of the related module.'); }
        const rt = fn === 'count' ? 'number' : (moduleFields(rel, cfg()).find((z) => z.key === field) || {}).type === 'currency' ? 'currency' : 'number'; return { related: rel, fn, field, returnType: rt }; }
      default: return {};
    }
  }
  const fieldOut = (f) => ({ ...clone(f), storedValues: storedCount(f), createdByName: f.createdBy ? nameOf(f.createdBy) : '' });
  const PROTECTED_LOOKUPS = { lead: ['Lead Owner'], contact: ['Client Owner', 'Sales Rep'], account: ['Company Owner'], opportunity: ['Owner'] };   // video 8: always there, never removed

  const api = {
    // every CRM user (they all use the configured lists and fields); usage counts and stored-value counts only for Admins
    async getCrmSettings() {
      const u = crmUser(); const c = clone(cfg()); const admin = !!u.isAdmin;
      c.canEdit = admin; c.modifiedByName = c.modifiedBy ? nameOf(c.modifiedBy) : '';
      if (admin) { c.usage = {}; PICKLIST_KEYS.forEach((k) => { c.usage[k] = usage(k); }); c.customFields = cfg().customFields.map((f) => { const o = fieldOut(f); if (OPTION_TYPES.includes(f.type)) c.usage['cf:' + f.id] = usage('cf:' + f.id); return o; }); }
      // Nov 3 (b): per-field permission. A field the user may not view is left out entirely; canEdit tells the forms which ones they may change.
      c.customFields = c.customFields.filter((f) => fieldCan(u, f, 'view')).map((f) => ({ ...f, canView: true, canEdit: fieldCan(u, f, 'edit') }));
      c.protectedLookups = PROTECTED_LOOKUPS;
      return c;
    },
    // ---------- pick lists (built-in key, or 'cf:<fieldId>' for a dropdown field's own options) ----------
    async addCrmOption(key, label) { const u = crmAdmin(); const [list, f] = listOf(key); const o = addOption(list, label, key); if (f) f.modifiedAt = now(); stamp(u); save(); return clone(o); },
    async renameCrmOption(key, value, label) { const u = crmAdmin(); const [list] = listOf(key); const o = renameOption(list, str(value, 80), label); stamp(u); save(); return clone(o); },
    async retireCrmOption(key, value, retired = true) { const u = crmAdmin(); const [list] = listOf(key); const o = retireOption(list, str(value, 80), !!retired, str(key, 80)); stamp(u); save(); return clone(o); },
    async moveCrmOption(key, value, to) { const u = crmAdmin(); const [list] = listOf(key); moveOption(list, str(value, 80), to); stamp(u); save(); return clone(list); },
    // ---------- custom fields ----------
    async createCrmField(input = {}) {
      const u = crmAdmin(); const c = cfg(); const entity = str(input.entity, 20); if (!CF_ENTITY_CODES.includes(entity)) fail('Pick where the field goes (Leads, Clients, Companies or Opportunities).');
      const label = cleanLabel(input.label, 'The field'); labelFree(entity, label);
      const type = str(input.type, 20); if (!FIELD_TYPE_CODES.includes(type)) fail('Pick a field type from the list.');
      if (entity === 'opportunity' && ['file', 'image'].includes(type)) fail('File and image fields are for Leads, Clients and Companies.');
      if (c.customFields.filter((f) => f.entity === entity && !f.archivedAt).length >= MAX_FIELDS) fail(`At most ${MAX_FIELDS} custom fields per record type.`);
      const required = yes(input.required); if (required && type === 'checkbox') fail('A checkbox cannot be required.');
      const f = { id: nid('cf'), entity, label, type, required, section: sectionOk(entity, input.section), showInList: input.showInList === undefined ? !['textarea', 'address', 'file', 'image'].includes(type) : yes(input.showInList),
        position: Math.max(0, ...c.customFields.filter((z) => z.entity === entity).map((z) => z.position)) + 1, options: [], archivedAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now(),
        tooltip: '', showTooltip: false, maxChars: null, unique: false, encrypted: false, perms: null, config: {}, defaultValue: null };
      props(f, input, true);
      if (OPTION_TYPES.includes(type)) { const opts = Array.isArray(input.options) ? input.options : String(input.options || '').split(/\r?\n/);
        opts.map((o) => String(o).trim()).filter(Boolean).forEach((o) => addOption(f.options, o)); if (!f.options.length) fail(`A ${type === 'radio' ? 'radio button' : type === 'multiselect' ? 'multi select' : 'pick list'} needs at least one option.`); }
      setDefault(f, input.defaultValue);
      if (type === 'autonumber') { recordsOf(entity).slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).forEach((r) => { r.custom ||= {}; r.custom[f.id] = `${f.config.prefix}${f.config.next}${f.config.suffix}`; f.config.next += 1; }); }
      c.customFields.push(f); stamp(u); save(); return fieldOut(f);
    },
    // label, required, section, list column. The TYPE never changes (stored values stay valid); make a new field instead.
    async updateCrmField(id, patch = {}) {
      const u = crmAdmin(); const f = fieldOf(str(id, 60));
      if (patch.type !== undefined && patch.type !== f.type) fail('A field\'s type cannot be changed (its stored values would no longer fit). Add a new field instead.');
      if (patch.label !== undefined) { const l = cleanLabel(patch.label, 'The field'); labelFree(f.entity, l, f.id); f.label = l; }
      if (patch.required !== undefined) { const r = yes(patch.required); if (r && f.type === 'checkbox') fail('A checkbox cannot be required.'); if (r && COMPUTED_TYPES.includes(f.type)) fail('This field is filled by the CRM; it cannot be required.'); f.required = r; }
      if (patch.section !== undefined) f.section = sectionOk(f.entity, patch.section);
      if (patch.showInList !== undefined) f.showInList = yes(patch.showInList);
      props(f, patch, false); setDefault(f, patch.defaultValue);
      f.modifiedAt = now(); stamp(u); save(); return fieldOut(f);
    },
    // "Delete" from the CRM side = archive: hidden from forms, pages, lists and CSV; every stored value is kept; Restore brings it all back.
    async archiveCrmField(id, archived = true) {
      const u = crmAdmin(); const f = fieldOf(str(id, 60));
      if (!archived && f.archivedAt) { const l = f.label.toLowerCase(); if (cfg().customFields.some((z) => z.id !== f.id && z.entity === f.entity && !z.archivedAt && z.label.toLowerCase() === l)) fail(`Another field is now called "${f.label}"; rename one of them first.`); }
      f.archivedAt = archived ? f.archivedAt || now() : null; f.archivedBy = archived ? u.id : null; f.modifiedAt = now(); stamp(u); save(); return fieldOut(f);
    },
    async moveCrmField(id, to) {
      const u = crmAdmin(); const f = fieldOf(str(id, 60)); const list = cfg().customFields.filter((z) => z.entity === f.entity && !z.archivedAt).sort((a, b) => a.position - b.position);
      const i = list.indexOf(f); const j = to === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= list.length) return fieldOut(f);
      [list[i].position, list[j].position] = [list[j].position, list[i].position]; if (list[i].position === list[j].position) list[j].position += 1;
      stamp(u); save(); return fieldOut(f);
    },
    // ---------- Nov 3 (b), video 8: Set Permission (per role view / edit; Admin and Super admin always both) ----------
    async setCrmFieldPermission(id, perms) { const u = crmAdmin(); const f = fieldOf(str(id, 60)); f.perms = cleanPerms(perms); f.modifiedAt = now(); stamp(u); save(); return fieldOut(f); },
    // ---------- layout sections: add, rename, reorder, hide / show (never deleted) ----------
    async addCrmSection(entity, label) { const u = crmAdmin(); const e = str(entity, 20); if (!CF_ENTITY_CODES.includes(e)) fail('Unknown record type.'); const l = cleanLabel(label, 'The section');
      const list = cfg().sections[e]; if (list.some((z) => z.label.toLowerCase() === l.toLowerCase())) fail(`A section called "${l}" already exists.`); if (list.length >= 30) fail('At most 30 sections.');
      let key = 's' + l.replace(/[^a-z0-9]+/gi, '').slice(0, 30); if (!/^[a-zA-Z]/.test(key)) key = 's' + key; let k2 = key; let n = 2; while (list.some((z) => z.key === k2)) k2 = key + n++;
      const sec = { key: k2, label: l, builtin: false, position: Math.max(0, ...list.map((z) => z.position)) + 1, hidden: false }; list.push(sec); stamp(u); save(); return clone(sec); },
    async updateCrmSection(entity, key, patch = {}) { const u = crmAdmin(); const e = str(entity, 20); const list = (cfg().sections || {})[e] || fail('Unknown record type.'); const sec = list.find((z) => z.key === str(key, 40)) || fail('That section does not exist.');
      if (patch.label !== undefined) { const l = cleanLabel(patch.label, 'The section'); if (list.some((z) => z !== sec && z.label.toLowerCase() === l.toLowerCase())) fail(`A section called "${l}" already exists.`); sec.label = l; }
      if (patch.hidden !== undefined) { const h2 = yes(patch.hidden); if (h2 && sec.builtin) fail('Built-in sections cannot be hidden.');
        if (h2 && cfg().customFields.some((f) => f.entity === e && !f.archivedAt && f.section === sec.key)) fail(`Move the fields out of "${sec.label}" before hiding it.`); sec.hidden = h2; }
      if (patch.move === 'up' || patch.move === 'down') { const sorted = list.slice().sort((a, b) => a.position - b.position); const i = sorted.indexOf(sec); const j = patch.move === 'up' ? i - 1 : i + 1;
        if (j >= 0 && j < sorted.length) { const p = sorted[i].position; sorted[i].position = sorted[j].position; sorted[j].position = p; if (sorted[i].position === sorted[j].position) sorted[j].position += 1; } }
      stamp(u); save(); return clone(sec); },
    // ---------- Clients & Leads duplicate rules (email always; phone on by default) ----------
    async setCrmDupRule(key, on) { const u = crmAdmin(); const k = str(key, 10); if (k === 'email') fail('Email duplicates are always blocked across Clients and Leads.'); if (k !== 'phone') fail('Unknown rule.');
      cfg().dupRules.phone = yes(on); stamp(u); save(); return clone(cfg().dupRules); },
    // ---------- built-in fields: hide (values kept) / required (only Role in Company, Relationship Status, State) ----------
    async setCrmBuiltinField(scope, key, patch = {}) {
      const u = crmAdmin(); const sc = str(scope, 20); const k = str(key, 60); const defs = BUILTIN_SCOPES[sc] || fail('Unknown field group.');
      const def = defs.find(([z]) => z === k) || fail(`"${k}" is a protected field (the CRM depends on it) and cannot be hidden.`); const opt = def[2] || {};
      const s = cfg().fields[sc][k] ||= { hidden: false, required: false };
      const req = patch.required !== undefined ? yes(patch.required) : s.required; const hid = patch.hidden !== undefined ? yes(patch.hidden) : s.hidden;
      if (req && !opt.requirable) fail(`${def[1]} cannot be made required.`);
      if (req && hid) fail(`${def[1]} is required; un-require it before hiding it.`);
      s.required = req; s.hidden = hid; stamp(u); save(); return clone(s);
    },
  };
  return { api, crmAdmin, usage };
}
export { isLocked, picklistDef, optionsOf };
