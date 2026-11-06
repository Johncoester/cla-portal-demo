/* mock adapter: Janine's Nov 3 CRM feedback (John approved). FAKE DATA ONLY. NOTHING IS SENT (Gmail is not connected).
 *   - IMPORT LEADS / IMPORT CLIENTS / IMPORT NOTES: Admin / Super admin only. A CSV is parsed, mapped to fields, PREVIEWED (every row run through the
 *     real create rules without saving: errors and duplicates are listed) and then imported row by row (a bad row is skipped, never half-saved).
 *     Notes are linked to an existing lead / client by email, else by name (one match only). Every run is logged (crmImports; never deleted).
 *   - MEETING "Send invite": builds an invite PREVIEW + .ics file and records that a preview was made (crmMeetingInvites, status 'preview').
 *     No email is sent, no calendar is touched.
 *   - Company duplicate lookup for the Company form (live warning with a link to the existing record).
 *   - janineLazyUpgrade: Zillow URL -> Zillow Profile, leads linked to their company. No storage-key bump: lazy, idempotent, lossless. */
import { parseCsv, guessMapping, applyMapping, PERSON_IMPORT_FIELDS, NOTE_IMPORT_FIELDS, IMPORT_MAX_ROWS, IMPORT_MAX_BYTES, loadZipTable, countiesFor, buildIcs, INVITE_NOTE, IMPORT_DEFAULT_FIELDS, IMPORT_DEFAULT_KEYS } from './crm-janine.js?v=202611062120';
import { resolveImportedStatus } from './nov5-rules.js?v=202611062120';
import { ensureSettings } from './crm-config.js?v=202611062120';
import { companyKey, CRM_OWNER_ROLES } from './crm.js?v=202611062120';
import { US_STATE_NAMES } from './constants.js?v=202611062120';

const seenData = new WeakSet();
// runs on every CRM read (cheap after the first time for one in-memory copy); changes are saved with the next save. Never removes a value.
export function janineLazyUpgrade(d) {
  if (seenData.has(d)) return d; seenData.add(d);
  d.crmImports ||= []; d.crmMeetingInvites ||= []; d.crmImportRows ||= [];
  // Zillow URL is retired: its value is copied into Zillow Profile when that is empty; the old value stays on the record (hidden), flagged so it is copied once only
  const move = (r) => { if (!r.zillowUrl || r.zillowMoved) return; r.links ||= {}; if (!r.links.zillowProfile) r.links.zillowProfile = r.zillowUrl; r.zillowMoved = true; };
  (d.crmLeads || []).forEach(move); (d.contacts || []).forEach((c) => { if ('zillowUrl' in c) move(c); });
  // a lead's Company is now a lookup: an older lead whose typed company matches exactly one active company is linked to it (the typed text is kept)
  (d.crmLeads || []).forEach((l) => { if (l.accountId !== undefined) return; const k = companyKey(l.company);
    const hits = k ? (d.crmAccounts || []).filter((a) => !a.archivedAt && companyKey(a.name) === k) : []; l.accountId = hits.length === 1 ? hits[0].id : null; });
  return d;
}

export function crmJaninePart(x, ctx) {
  const { fail, str, nid, now, nameOf, fullName, prof, save, localDate } = x;
  const { db, crmUser, crmEditor, seen, contactSeen, leadSeen, inCrm, dry, baseApi, companyDup } = ctx;
  const admin = () => { const u = crmEditor(); if (!u.isAdmin) fail('Only an Admin or Super admin can import.'); return u; };
  const MODULES = { leads: 'Leads', contacts: 'Clients' };
  const stateCode = (v) => { const s = str(v, 40); if (!s) return ''; if (s.length === 2) return s.toUpperCase(); const hit = US_STATE_NAMES.find(([, n]) => n.toLowerCase() === s.toLowerCase()); return hit ? hit[0] : s; };
  const isDup = (m) => /already (used|exists|a client)|duplicate/i.test(String(m || ''));
  const ownerByText = (t) => { const s = str(t, 200).toLowerCase(); if (!s) return '';
    const p = db().profiles.find((z) => z.status === 'active' && CRM_OWNER_ROLES.includes(z.role) && (String(z.email || '').toLowerCase() === s || `${z.firstName} ${z.lastName}`.trim().toLowerCase() === s));
    if (!p) fail(`Owner "${t}" is not an active Sales Person or Sales Team user.`); return p.id; };

  function readInput(input, fields) {
    const text = input.csv != null ? String(input.csv) : null;
    if (text != null && text.length > IMPORT_MAX_BYTES) fail(`The file is too large (at most ${IMPORT_MAX_BYTES / 1e6} MB).`);
    const rows = Array.isArray(input.rows) ? input.rows.map((r) => r.map((c) => String(c == null ? '' : c))) : parseCsv(text || '');
    if (rows.length < 2) fail('The file needs a header row and at least one row of data.');
    if (rows.length - 1 > IMPORT_MAX_ROWS) fail(`At most ${IMPORT_MAX_ROWS} rows per import.`);
    const header = rows[0].map((h) => str(h, 80));
    const keys = fields.map(([k]) => k);
    const mapping = Array.isArray(input.mapping) ? header.map((_, i) => { const k = str(input.mapping[i], 60); if (k && !keys.includes(k)) fail(`Unknown field "${k}".`); return k; }) : guessMapping(header, fields);
    const used = mapping.filter(Boolean); if (new Set(used).size !== used.length) fail('Each field can be mapped from one column only.');
    return { header, mapping, records: applyMapping(rows, mapping).records };
  }

  // defaults (Janine, Nov 4): { key: value } -> a checked [{ field, value }] list ('' = no default). Owner must be an active Sales Person / Sales Team user.
  function cleanDefaults(raw0, kind, module) {
    if (kind !== 'records' || !raw0) return [];
    const raw = Array.isArray(raw0) ? Object.fromEntries(raw0.map((z) => [z.field, z.value])) : raw0;
    Object.keys(raw).forEach((k) => { if (!IMPORT_DEFAULT_KEYS.includes(k)) fail(`"${k}" cannot have a default value.`); });
    const cfg = ensureSettings(db().crmSettings || null);
    return IMPORT_DEFAULT_FIELDS.map(([k]) => [k, str(raw[k], 200)]).filter(([, v]) => v).map(([k, v]) => {
      if (k === 'ownerId') { const p = prof(v); if (!p || p.status !== 'active' || !CRM_OWNER_ROLES.includes(p.role)) fail('The default Owner must be an active Sales Person or Sales Team user.'); }
      if (k === 'state') { const c = stateCode(v); if (!/^[A-Z]{2}$/.test(c)) fail('Pick a state for the default State.'); return { field: k, value: c }; }
      if (k === 'relationshipStatus') { const resolved = resolveImportedStatus(cfg, module, v);
        if (resolved.error) fail(resolved.error);
        if (resolved.historical) fail('A default Relationship Status must be a current choice. Retired choices stay on records that already have them and can still arrive in the file.');
        return { field: k, value: resolved.value }; }
      return { field: k, value: v }; });
  }
  const DEFAULT_LABEL = Object.fromEntries(IMPORT_DEFAULT_FIELDS.map(([k, l]) => [k, l]));
  // one CSV row -> a lead / client, through the normal create rules (required fields, pick lists, one email / phone across leads + clients, links ...)
  async function createPerson(module, rec0, table, defaults = []) {
    const notes = []; const rec = { ...rec0 }; let defOwner = '';
    defaults.forEach(({ field, value }) => { if (String(rec[field] == null ? '' : rec[field]).trim() !== '') return;
      if (field === 'ownerId') { defOwner = value; notes.push(`Owner: ${nameOf(value)} (default)`); return; }
      rec[field] = value; notes.push(`${DEFAULT_LABEL[field]}: ${value} (default)`); });
    const input = { ...rec };
    ['firstName', 'lastName', 'email', 'phone', 'mobile', 'title', 'street', 'city', 'licenseNo', 'description'].forEach((k) => { if (input[k] === undefined) input[k] = ''; });
    input.state = stateCode(rec.state);
    input.ownerId = defOwner || ownerByText(rec.ownerId);
    if (rec.zip && !str(rec.county, 60)) { const cs = countiesFor(table, rec.zip).filter((c) => !input.state || c.state === input.state);
      if (cs.length) { input.county = cs[0].county; notes.push(cs.length > 1 ? `County ${cs[0].county} from ZIP ${rec.zip} (it spans ${cs.length} counties; the main one was used)` : `County ${cs[0].county} from ZIP ${rec.zip}`); } }
    const cfg = ensureSettings(db().crmSettings || null);
    if (String(rec.relationshipStatus || '').trim()) { const resolved = resolveImportedStatus(cfg, module, rec.relationshipStatus);
      if (resolved.error) fail(resolved.error); input.relationshipStatus = resolved.value; input.retainHistoricalStatus = resolved.historical;
      if (resolved.historical) notes.push(`Relationship Status kept as the historical value ${resolved.value}`); }
    const co = str(rec.company, 160); delete input.company;
    if (co) { const acc = companyDup(co); if (acc && !acc.archivedAt) { input.accountId = acc.id; notes.push(`Company: ${acc.name}`); }
      else { input.company = co; notes.push(`No company called "${co}" yet: kept as text${module === 'leads' ? ' (pick it from Companies later)' : ''}`); } }
    const r = module === 'leads' ? await baseApi.createCrmLead(input) : await baseApi.createCrmContact(input);
    return { id: r.id, name: r.name, link: `#/crm/${module}/${r.id}`, notes };
  }
  // one CSV row -> a note on an existing lead / client: by email first, else by name (exactly one match)
  function noteTargets(u, module) { const d = db();
    return module === 'leads' ? d.crmLeads.filter((l) => leadSeen(u, l)).map((l) => ({ entity: 'lead', id: l.id, email: String(l.email || '').toLowerCase(), name: `${l.firstName || ''} ${l.lastName || ''}`.trim(), archived: !!l.archivedAt }))
      : d.contacts.filter((c) => inCrm(c) && contactSeen(u, c)).map((c) => ({ entity: 'contact', id: c.id, email: String(c.email || '').toLowerCase(), name: fullName(c), archived: !!c.crmArchivedAt })); }
  async function createNote(module, rec, targets) {
    const L = module === 'leads' ? 'lead' : 'client'; const body = str(rec.note, 4000); if (!body) fail('Note is required.');
    const em = str(rec.email, 200).toLowerCase(); const nm = (str(rec.fullName, 200) || `${str(rec.firstName, 80)} ${str(rec.lastName, 80)}`).replace(/\s+/g, ' ').trim().toLowerCase();
    let t = null;
    if (em) { t = targets.find((z) => z.email === em) || null; if (!t && !nm) fail(`No ${L} has the email ${em}.`); }
    if (!t) { if (!nm) fail('Give the email or the name of the ' + L + ' for this note.'); const hits = targets.filter((z) => z.name.toLowerCase() === nm);
      if (hits.length > 1) fail(`${hits.length} ${L}s are named "${nm}"; add the email to pick one.`); if (!hits.length) fail(`No ${L} ${em ? `has the email ${em} or ` : ''}is named "${nm}".`); t = hits[0]; }
    const subject = str(rec.noteTitle, 200) || body.split('\n')[0].slice(0, 80);
    if (db().crmActivities.some((a) => a.kind === 'note' && a.entity === t.entity && a.entityId === t.id && a.body === body && a.subject === subject)) fail(`Duplicate: this note is already on ${t.name}.`);
    await baseApi.logCrmActivity({ entity: t.entity, entityId: t.id, kind: 'note', subject, body });
    return { id: t.id, name: t.name, link: `#/crm/${t.entity === 'lead' ? 'leads' : 'contacts'}/${t.id}`, notes: [t.archived ? `on an archived ${L}` : `linked by ${em && t.email === em ? 'email' : 'name'}`] };
  }
  async function run(input = {}, commit) {
    const u = admin(); const module = str(input.module, 20); if (!MODULES[module]) fail('Import into Leads or Clients.');
    const kind = input.kind === 'notes' ? 'notes' : 'records'; const fields = kind === 'notes' ? NOTE_IMPORT_FIELDS : PERSON_IMPORT_FIELDS;
    const { header, mapping, records } = readInput(input, fields);
    if (kind === 'records' && !mapping.includes('lastName')) fail('Map a column to Last Name (required).');
    if (kind === 'notes' && !mapping.includes('note')) fail('Map a column to Note (required).');
    if (kind === 'notes' && !mapping.some((k) => ['email', 'fullName', 'lastName'].includes(k))) fail('Map the Email or the name columns, so each note can find its ' + (module === 'leads' ? 'lead' : 'client') + '.');
    const table = kind === 'records' && mapping.includes('zip') ? await loadZipTable() : null;
    const defaults = cleanDefaults(input.defaults, kind, module);
    const targets = kind === 'notes' ? noteTargets(u, module) : null;
    const out = []; dry.on = !commit;
    try {
      for (let i = 0; i < records.length; i++) { const rec = records[i];
        try { const r = kind === 'notes' ? await createNote(module, rec, targets) : await createPerson(module, rec, table, defaults); out.push({ line: i + 2, status: 'ok', ...r, values: rec }); }
        catch (e) { out.push({ line: i + 2, status: isDup(e.message) ? 'duplicate' : 'error', message: e.message, values: rec }); } }
    } finally { dry.on = false; if (!commit) x.forget(); }
    const counts = { total: out.length, ok: out.filter((r) => r.status === 'ok').length, duplicates: out.filter((r) => r.status === 'duplicate').length, errors: out.filter((r) => r.status === 'error').length };
    let importId = null;
    if (commit) { importId = nid('imp'); db().crmImports.push({ id: importId, module, kind, fileName: str(input.fileName, 200), by: u.id, at: now(), ...counts, created: counts.ok, defaults: defaults.map((z) => ({ ...z })) });
      // one row per CSV line (typed: line, status, message, the record it made / touched), kept for good like the log itself
      out.forEach((r) => db().crmImportRows.push({ importId, line: r.line, status: r.status, message: r.message || '', recordId: r.status === 'ok' ? r.id : null, recordName: r.status === 'ok' ? r.name || '' : '' }));
      save(); }
    return { module, kind, header, mapping, defaults, fields: fields.map(([k, l]) => [k, l]), rows: out, counts, importId, committed: !!commit };
  }

  const api = {
    async previewCrmImport(input) { return run(input, false); },
    async runCrmImport(input) { return run(input, true); },
    async listCrmImports() { admin(); const rows = db().crmImportRows || [];
      return db().crmImports.slice().reverse().map((r) => ({ ...r, defaults: (r.defaults || []).map((z) => ({ ...z, text: z.field === 'ownerId' ? nameOf(z.value) : z.value })), rowCount: rows.filter((z) => z.importId === r.id).length, byName: nameOf(r.by) })); },
    // the per-row results of one import (Admin / Super admin, like the log)
    async listCrmImportRows(importId) { admin(); const id = str(importId, 60); if (!db().crmImports.some((r) => r.id === id)) fail('Import not found.');
      return (db().crmImportRows || []).filter((z) => z.importId === id).sort((a, b) => a.line - b.line).map((z) => ({ ...z })); },
    // Company form: is there already a company with this (normalised) name? Archived ones count too (restore instead).
    async findCrmCompanyDuplicate({ name = '', exceptId = null } = {}) { const u = crmUser(); const a = companyDup(str(name, 160), exceptId); if (!a) return null;
      return { id: a.id, name: a.name, state: a.state || '', archived: !!a.archivedAt, canOpen: seen(u, 'account', a.id), link: `#/crm/accounts/${a.id}` }; },
    // MEETING "Send invite": a PREVIEW (To, subject, body, .ics). Nothing is sent. Each preview is recorded on the meeting (status 'preview').
    async previewCrmMeetingInvite(id) {
      const u = crmEditor(); const d = db(); const m = d.crmActivities.find((z) => z.id === id && z.kind === 'meeting'); if (!m || !seen(u, m.entity, m.entityId)) fail('Meeting not found.');
      const person = (key) => { const [type, pid] = String(key).split(':');
        if (type === 'user') { const p = prof(pid); return p ? { key, name: `${p.firstName} ${p.lastName}`.trim(), email: p.email || '', type: 'User' } : null; }
        if (type === 'lead') { const l = d.crmLeads.find((z) => z.id === pid); return l ? { key, name: `${l.firstName || ''} ${l.lastName || ''}`.trim(), email: l.email || '', type: 'Lead' } : null; }
        if (type === 'contact') { const c = d.contacts.find((z) => z.id === pid); return c ? { key, name: fullName(c), email: c.email || '', type: 'Client' } : null; } return null; };
      const people = (m.participants || []).map(person).filter(Boolean); const host = prof(m.hostId) || {};
      const organizer = { name: `${host.firstName || ''} ${host.lastName || ''}`.trim(), email: host.email || '' };
      const to = people.filter((p) => p.email && p.email !== organizer.email); const noEmail = people.filter((p) => !p.email);
      const when = m.allDay ? `${m.startsAt}${m.endsAt && m.endsAt !== m.startsAt ? ' to ' + m.endsAt : ''} (all day)` : `${String(m.startsAt).replace('T', ' ')} to ${String(m.endsAt).replace('T', ' ')} (Eastern Time)`;
      const subject = `Invitation: ${m.subject} @ ${when}`;
      const body = [`You are invited to: ${m.subject}`, `When: ${when}`, m.location ? `Where: ${m.location}` : '', organizer.name ? `Host: ${organizer.name}` : '', m.meetingType ? `Type: ${m.meetingType}` : '', m.body ? `\n${m.body}` : '',
        `\nGuests: ${people.map((p) => p.name).join(', ') || '(none yet)'}`].filter(Boolean).join('\n');
      const ics = buildIcs(m, organizer, to);
      const rec = { id: nid('inv'), meetingId: m.id, status: 'preview', to: to.map((p) => p.email), createdBy: u.id, createdAt: now() }; d.crmMeetingInvites.push(rec); save();
      return { id: rec.id, meetingId: m.id, status: 'preview', sent: false, note: INVITE_NOTE, organizer, to, noEmail, subject, body, ics,
        icsName: `${String(m.subject).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting'}.ics`, previews: d.crmMeetingInvites.filter((z) => z.meetingId === m.id).length };
    },
    async listCrmMeetingInvites(id) { const u = crmUser(); const d = db(); const m = d.crmActivities.find((z) => z.id === id && z.kind === 'meeting'); if (!m || !seen(u, m.entity, m.entityId)) fail('Meeting not found.');
      return d.crmMeetingInvites.filter((z) => z.meetingId === id).map((z) => ({ ...z, createdByName: nameOf(z.createdBy) })); },
  };
  return { api, localDate };
}
