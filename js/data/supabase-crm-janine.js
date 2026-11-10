/* [SUPABASE] Janine, Nov 3 (migration 37) plus hosted CSV import.
 * Company duplicate check, meeting invite PREVIEW (+ .ics), import log.
 * NOTHING is sent: an invite is a preview row + an .ics built in the browser.
 * CSV import parses in the browser (same limits and mapping as the demo) and
 * asks crm_import_batch to apply the database rules, 500 rows at a time.
 * Preview rolls back inside each call (P0004). A commit reuses one batch id.
 * Nothing is emailed. */
import { buildIcs, INVITE_NOTE, parseCsv, guessMapping, applyMapping, PERSON_IMPORT_FIELDS, NOTE_IMPORT_FIELDS, IMPORT_MAX_ROWS, IMPORT_MAX_BYTES, IMPORT_CHUNK_ROWS, importChunkRanges, importTooBigMessage, leadRequiredMessages, importPartialReport, importErrorCsv, saveImportResume, loadZipTable, countiesFor, IMPORT_DEFAULT_FIELDS, IMPORT_DEFAULT_KEYS } from './crm-janine.js?v=202611101600';
import { US_STATE_NAMES, US_STATES } from './constants.js?v=202611101015';
import { ensureSettings, findOption } from './crm-config.js?v=202611070139';
import { importedStatusDecision } from './crm-import-status.js?v=202611120600';
import { LINK_KEYS } from './crm.js?v=202611070139';

const DEFAULT_LABEL = Object.fromEntries(IMPORT_DEFAULT_FIELDS.map(([k, l]) => [k, l]));
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const stateCode = (v) => {
  const s = clip(v, 40);
  if (!s) return '';
  if (s.length === 2) return s.toUpperCase();
  const hit = US_STATE_NAMES.find(([, name]) => name.toLowerCase() === s.toLowerCase());
  return hit ? hit[0] : s;
};

function readInput(input, fields) {
  const text = input.csv != null ? String(input.csv) : null;
  if (text != null && text.length > IMPORT_MAX_BYTES) throw new Error(`The file is too large (at most ${IMPORT_MAX_BYTES / 1e6} MB).`);
  const rows = Array.isArray(input.rows) ? input.rows.map((r) => r.map((c) => String(c == null ? '' : c))) : parseCsv(text || '');
  if (rows.length < 2) throw new Error('The file needs a header row and at least one row of data.');
  if (rows.length - 1 > IMPORT_MAX_ROWS) throw new Error(importTooBigMessage(rows.length - 1));
  const header = rows[0].map((h) => clip(h, 80));
  const keys = fields.map(([k]) => k);
  const mapping = Array.isArray(input.mapping) ? header.map((_, i) => {
    const k = clip(input.mapping[i], 60);
    if (k && !keys.includes(k)) throw new Error(`Unknown field "${k}".`);
    return k;
  }) : guessMapping(header, fields);
  const used = mapping.filter(Boolean);
  if (new Set(used).size !== used.length) throw new Error('Each field can be mapped from one column only.');
  return { header, mapping, records: applyMapping(rows, mapping).records };
}

function linksOf(rec) {
  const links = {};
  LINK_KEYS.forEach((k) => {
    const raw = rec['links.' + k] != null ? rec['links.' + k] : (rec.links && rec.links[k]);
    const v = clip(raw, 500);
    if (v) links[k] = v;
  });
  return links;
}

function personValues(rec) {
  const state = stateCode(rec.state);
  return {
    firstName: clip(rec.firstName, 80),
    lastName: clip(rec.lastName, 80),
    email: clip(rec.email, 200).toLowerCase(),
    phone: clip(rec.phone, 40),
    mobile: clip(rec.mobile, 40),
    company: clip(rec.company, 160),
    roleInCompany: clip(rec.roleInCompany, 80),
    title: clip(rec.title, 100),
    leadSource: clip(rec.leadSource, 80),
    relationshipStatus: clip(rec.relationshipStatus, 80),
    street: clip(rec.street, 200),
    city: clip(rec.city, 80),
    state,
    zip: clip(rec.zip, 10),
    county: clip(rec.county, 60),
    licenseNo: clip(rec.licenseNo, 60),
    ownerId: clip(rec.ownerId, 200),
    description: clip(rec.description, 4000),
    links: linksOf(rec),
  };
}

async function cleanDefaults(self, raw0, kind, module) {
  if (kind !== 'records' || !raw0) return [];
  const raw = Array.isArray(raw0) ? Object.fromEntries(raw0.map((z) => [z.field, z.value])) : raw0;
  Object.keys(raw).forEach((k) => { if (!IMPORT_DEFAULT_KEYS.includes(k)) throw new Error(`"${k}" cannot have a default value.`); });
  const picked = IMPORT_DEFAULT_FIELDS.map(([k]) => [k, clip(raw[k], 200)]).filter(([, v]) => v);
  if (!picked.length) return [];
  const needsList = picked.some(([k]) => k === 'relationshipStatus' || k === 'roleInCompany' || k === 'leadSource');
  const cfg = needsList ? ensureSettings(JSON.parse(JSON.stringify(await self.getCrmSettings()))) : null;
  const owners = picked.some(([k]) => k === 'ownerId') ? (await self.listCrmOwners()) || [] : [];
  return picked.map(([k, v]) => {
    if (k === 'ownerId') {
      const p = owners.find((o) => o.id === v);
      if (!p || (p.role && !['Sales Person', 'Sales Team'].includes(p.role))) throw new Error('The default Owner must be an active Sales Person or Sales Team user.');
      return { field: k, value: v };
    }
    if (k === 'state') {
      const c = stateCode(v);
      if (!/^[A-Z]{2}$/.test(c) || !US_STATES.includes(c)) throw new Error('Pick a state for the default State.');
      return { field: k, value: c };
    }
    if (k === 'relationshipStatus') {
      const resolved = importedStatusDecision(cfg, module, v);
      if (resolved.error) throw new Error(resolved.error);
      return { field: k, value: resolved.value };
    }
    const listKey = k === 'leadSource' ? 'leadSource' : 'roleInCompany';
    const opt = findOption(cfg, listKey, v);
    if (!opt) throw new Error(`Pick a ${DEFAULT_LABEL[k]} from the list.`);
    if (opt.retired) throw new Error(`"${opt.label}" is retired; pick another ${DEFAULT_LABEL[k]}.`);
    return { field: k, value: opt.value };
  });
}

// P0004 is assert_failure. Only that code is a preview. A timeout or any
// other error is a failure, even when its text happens to contain JSON.
function previewBody(error) {
  if (!error || error.code !== 'P0004') return null;
  const details = error.details != null ? error.details : error.detail;
  if (details && typeof details === 'object') return details;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try { return JSON.parse(details); } catch { return null; }
}

function addCounts(a, b) {
  return {
    total: (a.total || 0) + (b.total || 0),
    ok: (a.ok || 0) + (b.ok || 0),
    duplicates: (a.duplicates || 0) + (b.duplicates || 0),
    errors: (a.errors || 0) + (b.errors || 0),
  };
}

// One retry for a statement timeout, a dropped network call, or a 5xx.
// Validation errors and the preview code are not retried.
function retryableImportError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (code === 'P0004' || code === 'P0001' || code === 'P0002' || code === '42501') return false;
  const status = Number(error.status || error.statusCode || 0);
  if (code === '57014' || (status >= 500 && status < 600)) return true;
  return /failed to fetch|networkerror|network error|load failed|timeout/i.test(String(error.message || ''));
}

function resumeStorage(input) {
  if (input && input.storage) return input.storage;
  try { if (typeof sessionStorage !== 'undefined') return sessionStorage; } catch (e) { /* private mode */ }
  return null;
}

export function crmJanineSupabase({ sb, ok, camel, on, rpc, me, self }) {
  const admin = async () => {
    on();
    const u = await me();
    if (!u || !u.isAdmin) throw new Error('Only an Admin or Super admin can import.');
    return u;
  };
  async function runImport(input = {}, commit) {
    await admin();
    const module = clip(input.module, 20);
    if (module !== 'leads' && module !== 'contacts') throw new Error('Import into Leads or Clients.');
    const kind = input.kind === 'notes' ? 'notes' : 'records';
    const fields = kind === 'notes' ? NOTE_IMPORT_FIELDS : PERSON_IMPORT_FIELDS;
    const { header, mapping, records } = readInput(input, fields);
    if (kind === 'records' && !mapping.includes('lastName')) throw new Error('Map a column to Last Name (required).');
    if (kind === 'notes' && !mapping.includes('note')) throw new Error('Map a column to Note (required).');
    if (kind === 'notes' && !mapping.some((k) => ['email', 'fullName', 'lastName'].includes(k))) {
      throw new Error('Map the Email or the name columns, so each note can find its ' + (module === 'leads' ? 'lead' : 'client') + '.');
    }
    const defaults = await cleanDefaults(self, input.defaults, kind, module);
    let statusCfg = null;
    if (kind === 'records') {
      try { statusCfg = ensureSettings(JSON.parse(JSON.stringify(await self.getCrmSettings()))); } catch (e) { statusCfg = null; }
    }
    const table = kind === 'records' && mapping.includes('zip') ? await loadZipTable() : null;
    const display = new Map();
    const payload = records.map((rec, i) => {
      const line = i + 2;
      display.set(line, { ...rec });
      if (kind === 'notes') {
        return {
          line,
          values: {
            email: clip(rec.email, 200).toLowerCase(),
            firstName: clip(rec.firstName, 80),
            lastName: clip(rec.lastName, 80),
            fullName: clip(rec.fullName, 200),
            noteTitle: clip(rec.noteTitle, 200),
            note: clip(rec.note, 4000),
          },
          prepNotes: [],
        };
      }
      const values = personValues(rec);
      const prepNotes = [];
      if (table && values.zip && !values.county) {
        const cs = countiesFor(table, values.zip).filter((c) => !values.state || c.state === values.state);
        if (cs.length) {
          values.county = cs[0].county;
          prepNotes.push(cs.length > 1
            ? `County ${cs[0].county} from ZIP ${values.zip} (it spans ${cs.length} counties; the main one was used)`
            : `County ${cs[0].county} from ZIP ${values.zip}`);
        }
      }
      return { line, values, prepNotes };
    });
    const ranges = importChunkRanges(payload.length, IMPORT_CHUNK_ROWS);
    const fieldPairs = fields.map(([k, l]) => [k, l]);
    let rows = [];
    let counts = { total: 0, ok: 0, duplicates: 0, errors: 0 };
    let importId = input.importId || null;
    const startChunk = Number(input.startChunk) || 1;
    const saved = [];
    const progress = typeof input.onProgress === 'function' ? input.onProgress : null;
    const store = resumeStorage(input);
    let recorded = new Set();
    if (commit && importId) {
      try {
        const existing = await rpc('crm_list_import_rows', { p_import: importId });
        (Array.isArray(existing) ? existing : []).forEach((r) => { if (r && r.line != null) recorded.add(Number(r.line)); });
      } catch (e) { recorded = new Set(); }
    }
    const finish = (extra) => ({
      module, kind, header, mapping, defaults,
      fields: fieldPairs,
      rows,
      counts,
      importId,
      committed: !!commit,
      errorCsv: importErrorCsv(rows, fieldPairs),
      ...extra,
    });
    for (const range of ranges) {
      const slice = payload.slice(range.from - 1, range.to);
      const already = commit && slice.length > 0 && slice.every((row) => recorded.has(row.line));
      if (range.chunk < startChunk || already) {
        saved.push(range);
        if (progress) progress({ chunk: range.chunk, chunks: ranges.length, from: range.from, to: range.to, done: range.to, total: payload.length, skipped: true });
        continue;
      }
      const local = [];
      const remote = [];
      slice.forEach((row) => {
        const missing = module === 'leads' && kind === 'records' ? leadRequiredMessages(row.values, defaults) : [];
        const statusRaw = kind === 'records' ? row.values.relationshipStatus : '';
        const statusDecision = statusCfg && String(statusRaw || '').trim() ? importedStatusDecision(statusCfg, module, statusRaw) : null;
        if (statusDecision && !statusDecision.error && statusDecision.value) row.values.relationshipStatus = statusDecision.value;
        const problems = [...missing, ...(statusDecision && statusDecision.error ? [statusDecision.error] : [])];
        if (!problems.length) { remote.push(row); return; }
        local.push({
          line: row.line, status: 'error', message: problems.join(' '), id: null, name: '', link: '', notes: [],
          values: display.get(row.line) || {},
        });
      });
      if (progress) progress({ chunk: range.chunk, chunks: ranges.length, from: range.from, to: range.to, done: range.from - 1, total: payload.length });
      let body = { rows: [], counts: { total: 0, ok: 0, duplicates: 0, errors: 0 }, importId: null };
      if (remote.length) {
        const args = {
          p_commit: !!commit,
          p_module: module,
          p_kind: kind,
          p_file_name: clip(input.fileName, 200),
          p_defaults: defaults,
          p_rows: remote,
          p_import: importId,
          p_chunk: range.chunk,
        };
        let res;
        try {
          res = await sb.rpc('crm_import_batch', args);
          if (res && res.error && retryableImportError(res.error)) res = await sb.rpc('crm_import_batch', args);
        } catch (e) {
          if (!retryableImportError(e)) throw e;
          try { res = await sb.rpc('crm_import_batch', args); } catch (again) { res = { data: null, error: again }; }
        }
        if (res.error && res.error.code === 'P0004') {
          body = previewBody(res.error);
          if (!body) throw new Error(res.error.message || 'Import preview failed.');
        } else if (res.error || !res.data) {
          const message = (res.error && res.error.message) || 'Import failed.';
          if (!commit) throw new Error(message);
          const partial = { saved, failed: range, message, code: (res.error && res.error.code) || '', importId, rowsSaved: saved.reduce((n, part) => n + part.count, 0), startChunk: range.chunk };
          const err = new Error(importPartialReport(partial));
          err.partial = partial;
          if (commit && importId) {
            saveImportResume(store, {
              importId, module, kind, fileName: clip(input.fileName, 200), csv: input.csv, mapping: input.mapping, defaults: input.defaults,
              startChunk: range.chunk, message, rowsSaved: partial.rowsSaved,
            });
          }
          throw err;
        } else {
          body = res.data;
        }
        if (commit && body.importId) importId = body.importId;
        saved.push(range);
        slice.forEach((row) => recorded.add(row.line));
      }
      const remoteRows = (body.rows || []).map((r) => ({
        line: r.line,
        status: r.status,
        message: r.message || '',
        id: r.id || null,
        name: r.name || '',
        link: r.link || '',
        notes: Array.isArray(r.notes) ? r.notes : [],
        values: display.get(r.line) || {},
      }));
      const chunkRows = remoteRows.concat(local).sort((a, b) => a.line - b.line);
      rows = rows.concat(chunkRows);
      counts = addCounts(counts, addCounts(body.counts || { total: remoteRows.length, ok: 0, duplicates: 0, errors: 0 }, {
        total: local.length, ok: 0, duplicates: 0, errors: local.length,
      }));
      if (progress) progress({ chunk: range.chunk, chunks: ranges.length, from: range.from, to: range.to, done: range.to, total: payload.length });
    }
    if (commit && importId) {
      try {
        const storage = store;
        if (storage) {
          storage.removeItem('cla-crm-import:' + importId);
          if (storage.getItem('cla-crm-import:active') === String(importId)) storage.removeItem('cla-crm-import:active');
        }
      } catch (e) { /* a finished import can forget its resume note */ }
    }
    return finish();
  }

  return {
    async findCrmCompanyDuplicate({ name = '', exceptId = null } = {}) { return (await rpc('crm_company_duplicate', { p_name: name, p_except: exceptId })) || null; },
    async previewCrmImport(input) { return runImport(input, false); },
    async runCrmImport(input) { return runImport(input, true); },
    async listCrmImports() {
      await admin();
      const rows = await rpc('crm_list_imports');
      return Array.isArray(rows) ? rows : [];
    },
    async listCrmImportRows(importId) {
      await admin();
      const rows = await rpc('crm_list_import_rows', { p_import: importId });
      return Array.isArray(rows) ? rows : [];
    },
    async previewCrmMeetingInvite(id) { on();
      const m = await self.getCrmMeeting(id); const u = await me();
      const people = []; for (const p of m.participants || []) {
        if (p.type === 'lead') { const r = ok(await sb.from('crm_leads').select('first_name, last_name, email').eq('id', p.id).maybeSingle()); if (r) people.push({ key: p.key, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email || '', type: 'Lead' }); }
        else if (p.type === 'contact') { const r = ok(await sb.from('contacts').select('first_name, last_name, email').eq('id', p.id).maybeSingle()); if (r) people.push({ key: p.key, name: `${r.first_name} ${r.last_name}`.trim(), email: r.email || '', type: 'Client' }); }
        else people.push({ key: p.key, name: p.name, email: '', type: 'User' }); }
      const organizer = { name: m.hostName || '', email: m.hostId === (u && u.id) ? (u.email || '') : '' };
      const to = people.filter((p) => p.email && p.email !== organizer.email); const noEmail = people.filter((p) => !p.email);
      const when = m.allDay ? `${m.startsAt} (all day)` : `${String(m.startsAt).replace('T', ' ')} to ${String(m.endsAt).replace('T', ' ')} (Eastern Time)`;
      const subject = `Invitation: ${m.subject} @ ${when}`;
      const body = [`You are invited to: ${m.subject}`, `When: ${when}`, m.location ? `Where: ${m.location}` : '', organizer.name ? `Host: ${organizer.name}` : '', m.body ? `\n${m.body}` : ''].filter(Boolean).join('\n');
      const row = ok(await sb.from('crm_meeting_invites').insert({ meeting_id: id, to_emails: to.map((p) => p.email) }).select('id').single());
      const previews = (ok(await sb.from('crm_meeting_invites').select('id').eq('meeting_id', id)) || []).length;
      return { id: row.id, meetingId: id, status: 'preview', sent: false, note: INVITE_NOTE, organizer, to, noEmail, subject, body, ics: buildIcs(m, organizer, to),
        icsName: `${String(m.subject).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting'}.ics`, previews }; },
    async listCrmMeetingInvites(id) { on(); return camel(ok(await sb.from('crm_meeting_invites').select('*').eq('meeting_id', id).order('created_at')) || []); },
  };
}
