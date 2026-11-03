/* mock adapter: CRM SETTINGS (Janine / John, Nov 2). FAKE DATA ONLY. Admin / Super admin change them; every CRM user reads them.
 * Picklists (add / rename / reorder / retire), custom fields (add / edit / reorder / delete = archive, restore), built-in fields (hide, un-require).
 * Nothing here ever deletes a value stored on a record. Mirrored by migration 25 (crm_picklist_options, crm_custom_fields, crm_field_settings). */
import { PICKLIST_KEYS, picklistDef, optionsOf, addOption, renameOption, retireOption, moveOption, cleanLabel, FIELD_TYPE_CODES, CF_ENTITY_CODES, SECTIONS_FOR, MAX_FIELDS,
  PERSON_FIELDS, ACCOUNT_FIELDS, PROTECTED_FIELDS, BUILTIN_SCOPES, isLocked } from './crm-config.js?v=202611031316';

export function crmSettingsPart(x, h) {
  const { save, now, fail, str, clone, nameOf, nid } = x;
  const { db, cfg, crmUser } = h;
  const crmAdmin = () => { const u = crmUser(); if (!u.isAdmin) fail('Only an Admin or Super admin can change the CRM settings.'); return u; };
  const stamp = (u) => { const c = cfg(); c.modifiedAt = now(); c.modifiedBy = u.id; };
  const fieldOf = (id) => cfg().customFields.find((f) => f.id === id) || fail('That custom field does not exist.');
  const listOf = (key) => { const k = str(key, 80);
    if (k.startsWith('cf:')) { const f = fieldOf(k.slice(3)); if (f.type !== 'dropdown') fail('Only dropdown fields have options.'); f.options ||= []; return [f.options, f]; }
    if (!PICKLIST_KEYS.includes(k)) fail('Unknown pick list.'); return [cfg().picklists[k], null]; };
  // how many records use each value (shown next to every option, so an Admin sees what a rename or retire touches)
  function usage(key) {
    const d = db(); const n = {}; const inc = (v) => { if (v != null && v !== '') n[v] = (n[v] || 0) + 1; };
    const people = [...d.crmLeads, ...d.contacts.filter((c) => 'crmOwnerId' in c || 'relationshipStatus' in c)];
    const tasks = d.crmActivities.filter((a) => a.kind === 'task'); const meets = d.crmActivities.filter((a) => a.kind === 'meeting');
    if (key === 'relationshipStatus') { d.crmLeads.forEach((l) => inc(l.status)); d.contacts.forEach((c) => inc(c.relationshipStatus)); }
    else if (key === 'leadSource') { d.crmLeads.forEach((l) => inc(l.source)); d.contacts.forEach((c) => inc(c.leadSource)); }
    else if (key === 'roleInCompany') people.forEach((p) => inc(p.roleInCompany));
    else if (key === 'accountKind') d.crmAccounts.forEach((a) => inc(a.kind));
    else if (key === 'oppStage') d.crmOpportunities.forEach((o) => inc(o.stage));
    else if (key === 'taskSubject') tasks.forEach((t) => inc(t.subject));
    else if (key === 'taskStatus') tasks.forEach((t) => inc(t.status));
    else if (key === 'taskPriority') tasks.forEach((t) => inc(t.priority));
    else if (key === 'meetingType') meets.forEach((m) => inc(m.meetingType));
    else if (key.startsWith('cf:')) { const id = key.slice(3); recordsOf(fieldOf(id).entity).forEach((r) => inc((r.custom || {})[id])); }
    return n;
  }
  const recordsOf = (entity) => { const d = db(); return entity === 'lead' ? d.crmLeads : entity === 'contact' ? d.contacts : entity === 'account' ? d.crmAccounts : d.crmOpportunities; };
  const storedCount = (f) => recordsOf(f.entity).filter((r) => { const v = (r.custom || {})[f.id]; return v != null && v !== '' && v !== false; }).length;
  const BUILTIN_LABELS = { lead: [...PERSON_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.person, 'Lead Owner', 'Lead Name'], contact: [...PERSON_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.person, 'Client Owner', 'Client Name', 'Company Name'],
    account: [...ACCOUNT_FIELDS.map(([, l]) => l), ...PROTECTED_FIELDS.account], opportunity: ['Name', 'Stage', 'Owner', 'Client', 'Company', 'Estimated yearly volume ($)', 'Expected close'] };
  const labelFree = (entity, label, exceptId) => { const l = label.toLowerCase();
    if (BUILTIN_LABELS[entity].some((b) => b.toLowerCase().replace(/ \*$/, '') === l)) fail(`"${label}" is already a built-in field there; pick another name.`);
    const dup = cfg().customFields.find((f) => f.entity === entity && f.id !== exceptId && f.label.toLowerCase() === l);
    if (dup) fail(dup.archivedAt ? `A deleted field is called "${dup.label}"; restore it instead (its values were kept).` : `A field called "${dup.label}" already exists.`); };
  const yes = (v) => v === true || v === '1' || v === 'on' || v === 'true' || v === 1;
  const sectionOk = (entity, s) => { const v = str(s, 20) || (entity === 'opportunity' ? 'info' : 'additional'); if (!SECTIONS_FOR[entity].some(([k]) => k === v)) fail('Pick a section from the list.'); return v; };
  const fieldOut = (f) => ({ ...clone(f), storedValues: storedCount(f), createdByName: f.createdBy ? nameOf(f.createdBy) : '' });

  const api = {
    // every CRM user (they all use the configured lists and fields); usage counts and stored-value counts only for Admins
    async getCrmSettings() {
      const u = crmUser(); const c = clone(cfg()); const admin = !!u.isAdmin;
      c.canEdit = admin; c.modifiedByName = c.modifiedBy ? nameOf(c.modifiedBy) : '';
      if (admin) { c.usage = {}; PICKLIST_KEYS.forEach((k) => { c.usage[k] = usage(k); }); c.customFields = cfg().customFields.map((f) => { const o = fieldOut(f); if (f.type === 'dropdown') c.usage['cf:' + f.id] = usage('cf:' + f.id); return o; }); }
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
      if (c.customFields.filter((f) => f.entity === entity && !f.archivedAt).length >= MAX_FIELDS) fail(`At most ${MAX_FIELDS} custom fields per record type.`);
      const required = yes(input.required); if (required && type === 'checkbox') fail('A checkbox cannot be required.');
      const f = { id: nid('cf'), entity, label, type, required, section: sectionOk(entity, input.section), showInList: input.showInList === undefined ? true : yes(input.showInList),
        position: Math.max(0, ...c.customFields.filter((z) => z.entity === entity).map((z) => z.position)) + 1, options: [], archivedAt: null, createdBy: u.id, createdAt: now(), modifiedAt: now() };
      if (type === 'dropdown') { const opts = Array.isArray(input.options) ? input.options : String(input.options || '').split(/\r?\n/);
        opts.map((o) => String(o).trim()).filter(Boolean).forEach((o) => addOption(f.options, o)); if (!f.options.length) fail('A dropdown needs at least one option.'); }
      c.customFields.push(f); stamp(u); save(); return fieldOut(f);
    },
    // label, required, section, list column. The TYPE never changes (stored values stay valid); make a new field instead.
    async updateCrmField(id, patch = {}) {
      const u = crmAdmin(); const f = fieldOf(str(id, 60));
      if (patch.type !== undefined && patch.type !== f.type) fail('A field\'s type cannot be changed (its stored values would no longer fit). Add a new field instead.');
      if (patch.label !== undefined) { const l = cleanLabel(patch.label, 'The field'); labelFree(f.entity, l, f.id); f.label = l; }
      if (patch.required !== undefined) { const r = yes(patch.required); if (r && f.type === 'checkbox') fail('A checkbox cannot be required.'); f.required = r; }
      if (patch.section !== undefined) f.section = sectionOk(f.entity, patch.section);
      if (patch.showInList !== undefined) f.showInList = yes(patch.showInList);
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
