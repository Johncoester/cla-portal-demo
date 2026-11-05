/* mock adapter: HR WORKSPACE, PHASE 1 (John + Francis, Nov 4; Zoho People style). FAKE DATA ONLY; nothing is sent. Mirrored by migration 47 (SQL + RLS).
 * Collections (added by ensureHr, storage v29):
 *   d.hrDepartments / d.hrDesignations  [{id, name, sort, createdAt, createdBy, updatedAt, updatedBy, archivedAt, archivedBy}]
 *   d.hrEmployees        [{id, employeeCode, profileId|null, firstName, lastName, email, departmentId, designationId, jobTitle, reportingToId, dateOfJoining, workLocation,
 *                          employmentType, employmentStatus, country, workPhone, phone, addressLine1, addressLine2, city, stateProvince, postalCode, addressCountry,
 *                          emergencyName, emergencyRelationship, emergencyPhone, payType, payRate, payCurrency, createdAt, createdBy, updatedAt, updatedBy, archivedAt, archivedBy}]
 *   d.hrRoleAssignments  [{id, employeeId, role: 'hr_manager', assignedAt, assignedBy, removedAt, removedBy}]   (only a Super admin writes; never deleted)
 *   d.hrInvites          [{id, employeeId, token, email, createdAt, createdBy, expiresAt, acceptedAt, acceptedProfileId, revokedAt, revokedBy}]   (link only, 14 days)
 *   d.hrChangeHistory    [{id, seq, tableName, rowId, employeeId, field, column, oldValue, newValue, action, changedBy, changedByName, changedAt}]   (append only)
 * Nothing is ever deleted: archive / deactivate instead. No SSNs or other government ID numbers. */
import { isSuperAdmin, isOutside, EMPLOYEE_ROLE } from './constants.js?v=202611052140';
import { ensureHrFeedback, hrFeedbackPart } from './mock-part-hr-feedback.js?v=202611052140';
import { moduleAccess } from './modules.js?v=202611052140';
import { ensureModules } from './mock-part-modules.js?v=202611052140';
import { HR_INVITE_DAYS, SELF_FIELDS, HR_FIELDS, SENSITIVE_FIELDS, FIELD_LABEL, COLUMN_OF, cleanEmployee, cleanSelfPatch, nextEmployeeCode, basicOf, fullNameOf, employeesCsv, historyCsv, csvStamp,
  EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES, PAY_TYPES, labelOf } from './hr.js?v=202611052140';
const rnd = () => { const a = new Uint8Array(16); (globalThis.crypto || { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const plusDays = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString();
const SEED_AT = '2026-11-04T14:00:00Z';
const BLANK = { jobTitle: '', workPhone: '', phone: '', addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', addressCountry: '', emergencyName: '', emergencyRelationship: '', emergencyPhone: '',
  payType: null, payRate: null, payCurrency: null, commissioned: false, commissionNotes: '', employmentType: 'full_time', employmentStatus: 'active', reportingToId: null, profileId: null, archivedAt: null, archivedBy: null, updatedAt: null, updatedBy: null };

// ---------------- FAKE SEED (invented names, example.test emails, 555 / fake PH numbers). Idempotent; nothing existing changes. ----------------
export function ensureHr(d) {
  if (!Array.isArray(d.profiles)) return d;
  const addProfile = (p) => { if (!d.profiles.some((x) => x.id === p.id)) d.profiles.push({ isAdmin: false, status: 'active', createdAt: SEED_AT, ...p }); };
  // two HR-only logins (account role 'Employee'): the seeded HR manager and one Philippines processor who already accepted her invite
  addProfile({ id: 'u-hr1', email: 'hana.hr-manager@example.test', firstName: 'Hana', lastName: 'HR-Manager', phone: '301-555-0115', role: EMPLOYEE_ROLE });
  addProfile({ id: 'u-ph1', email: 'pia.processor-ph@example.test', firstName: 'Pia', lastName: 'Processor-PH', phone: '+63 917 555 0101', role: EMPLOYEE_ROLE });
  if (Array.isArray(d.hrEmployees)) return ensureHrFeedback(d);
  const at = (x) => ({ createdAt: SEED_AT, createdBy: 'u-admin', updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null, ...x });
  d.hrDepartments = [['hrd-proc', 'Processing'], ['hrd-exam', 'Title Examiners'], ['hrd-admin', 'Administrative'], ['hrd-recr', 'Recruiting'], ['hrd-close', 'Closing'], ['hrd-sales', 'Sales']]
    .map(([id, name], i) => at({ id, name, sort: (i + 1) * 10 }));
  d.hrDepartments.push(at({ id: 'hrd-old', name: 'Front Desk (old)', sort: 90, archivedAt: SEED_AT, archivedBy: 'u-admin' }));
  d.hrDesignations = [['hrg-md', 'Managing Director'], ['hrg-pm', 'Processing Manager'], ['hrg-proc', 'Processor'], ['hrg-exam', 'Title Examiner'], ['hrg-sexam', 'Senior Title Examiner'],
    ['hrg-admin', 'Office Administrator'], ['hrg-hr', 'HR Generalist'], ['hrg-recr', 'Recruiter'], ['hrg-close', 'Closing Coordinator'], ['hrg-sales', 'Sales Executive'], ['hrg-inside', 'Inside Sales']]
    .map(([id, name], i) => at({ id, name, sort: (i + 1) * 10 }));
  const pe = (pid) => d.profiles.find((p) => p.id === pid) || {};
  const E = (n, pid, first, last, dept, desig, extra) => { const p = pid ? pe(pid) : {}; return at({ ...BLANK, id: 'hre-' + String(n).padStart(2, '0'), employeeCode: 'CLA-' + String(n).padStart(3, '0'), profileId: pid && p.id ? pid : null,
    firstName: p.firstName || first, lastName: p.lastName || last, email: (p.email || `${first}.${last}@example.test`).toLowerCase(), departmentId: dept, designationId: desig, country: 'US', workLocation: 'Rockville, MD (office)',
    phone: p.phone || '', ...extra }); };
  const US_PAY = (r) => ({ payType: 'salary', payRate: r, payCurrency: 'USD' }); const PH_PAY = (r) => ({ payType: 'salary', payRate: r, payCurrency: 'PHP', country: 'PH', workLocation: 'Remote (Philippines)' });
  d.hrEmployees = [
    E(1, 'u-admin', 'King John', 'Admin', 'hrd-admin', 'hrg-md', { jobTitle: 'Managing Director', dateOfJoining: '2015-03-02', ...US_PAY(150000), city: 'Rockville', stateProvince: 'MD', addressCountry: 'United States' }),
    E(2, 'u-proc', 'Paula', 'Processor', 'hrd-proc', 'hrg-pm', { jobTitle: 'Processing Manager', dateOfJoining: '2018-06-11', reportingToId: 'hre-01', ...US_PAY(72000), addressLine1: '12 Fake Lane', city: 'Rockville', stateProvince: 'MD', postalCode: '20850', addressCountry: 'United States', emergencyName: 'Pat Processor', emergencyRelationship: 'Spouse', emergencyPhone: '301-555-0191' }),
    E(3, 'u-sp', 'Sam', 'Salesperson', 'hrd-sales', 'hrg-sales', { jobTitle: 'Sales Executive', dateOfJoining: '2019-01-07', reportingToId: 'hre-01', ...US_PAY(65000) }),
    E(4, 'u-team', 'Tina', 'Salesteam', 'hrd-sales', 'hrg-inside', { jobTitle: 'Inside Sales', dateOfJoining: '2021-04-19', reportingToId: 'hre-03', workLocation: 'Annapolis, MD (office)', ...US_PAY(52000) }),
    E(5, 'u-tc', 'Terry', 'Coordinator', 'hrd-close', 'hrg-close', { jobTitle: 'Closing Coordinator', dateOfJoining: '2020-09-14', reportingToId: 'hre-02', ...US_PAY(50000) }),
    E(6, 'u-tc2', 'Morgan', 'Coordinator', 'hrd-close', 'hrg-close', { jobTitle: 'Closing Coordinator', dateOfJoining: '2026-09-01', reportingToId: 'hre-02', employmentType: 'part_time', ...US_PAY(26) , payType: 'hourly' }),
    E(7, 'u-adam', 'Adam', 'Admin', 'hrd-admin', 'hrg-admin', { jobTitle: 'Office Administrator', dateOfJoining: '2017-02-20', reportingToId: 'hre-01', ...US_PAY(58000) }),
    E(8, 'u-hr1', 'Hana', 'HR-Manager', 'hrd-recr', 'hrg-hr', { jobTitle: 'HR Generalist', dateOfJoining: '2022-08-01', reportingToId: 'hre-01', workLocation: 'Remote (US)', ...US_PAY(61000) }),
    E(9, 'u-ph1', 'Pia', 'Processor-PH', 'hrd-proc', 'hrg-proc', { jobTitle: 'Processor', dateOfJoining: '2024-02-05', reportingToId: 'hre-02', ...PH_PAY(42000), city: 'Quezon City', addressCountry: 'Philippines' }),
    E(10, null, 'Eli', 'Examiner-PH', 'hrd-exam', 'hrg-exam', { jobTitle: 'Title Examiner', dateOfJoining: '2026-10-20', reportingToId: 'hre-02', phone: '+63 917 555 0102', ...PH_PAY(38000) }),
    E(11, null, 'Rina', 'Recruiter-PH', 'hrd-recr', 'hrg-recr', { jobTitle: 'Recruiter', dateOfJoining: '2026-11-02', reportingToId: 'hre-08', employmentType: 'contractor', ...PH_PAY(30000) }),
    E(12, null, 'Ezra', 'Examiner', 'hrd-exam', 'hrg-sexam', { jobTitle: 'Senior Title Examiner', dateOfJoining: '2016-05-16', reportingToId: 'hre-01', employmentStatus: 'on_leave', ...US_PAY(80000) }),
    E(13, null, 'Owen', 'Oldhire', 'hrd-close', 'hrg-close', { jobTitle: 'Closing Coordinator', dateOfJoining: '2019-03-04', reportingToId: 'hre-02', employmentStatus: 'separated', archivedAt: '2026-06-30T16:00:00Z', archivedBy: 'u-admin' }),
  ];
  d.hrRoleAssignments = [{ id: 'hra-1', employeeId: 'hre-08', role: 'hr_manager', assignedAt: SEED_AT, assignedBy: 'u-admin', removedAt: null, removedBy: null }];
  d.hrInvites = [
    { id: 'hri-1', employeeId: 'hre-09', token: null, email: 'pia.processor-ph@example.test', createdAt: '2026-10-28T13:00:00Z', createdBy: 'u-admin', expiresAt: '2026-11-11T13:00:00Z', acceptedAt: '2026-10-29T02:00:00Z', acceptedProfileId: 'u-ph1', revokedAt: null, revokedBy: null },
    { id: 'hri-2', employeeId: 'hre-10', token: 'demo-hr-eli-pending-0001', email: 'eli.examiner-ph@example.test', createdAt: '2026-11-03T13:00:00Z', createdBy: 'u-hr1', expiresAt: '2026-11-17T13:00:00Z', acceptedAt: null, acceptedProfileId: null, revokedAt: null, revokedBy: null },
    { id: 'hri-3', employeeId: 'hre-12', token: 'demo-hr-ezra-expired-0001', email: 'ezra.examiner@example.test', createdAt: '2026-10-01T13:00:00Z', createdBy: 'u-admin', expiresAt: '2026-10-15T13:00:00Z', acceptedAt: null, acceptedProfileId: null, revokedAt: null, revokedBy: null },
  ];
  d.hrChangeHistory = []; let seq = 0; const H = (x) => d.hrChangeHistory.push({ id: 'hrh-' + (++seq), seq, changedBy: 'u-admin', changedByName: 'King John Admin', changedAt: SEED_AT, oldValue: '', ...x });
  d.hrEmployees.forEach((e) => H({ tableName: 'hr_employees', rowId: e.id, employeeId: e.id, field: 'record', column: 'record', newValue: fullNameOf(e), action: 'create' }));
  H({ tableName: 'hr_role_assignments', rowId: 'hra-1', employeeId: 'hre-08', field: 'hrManager', column: 'hr_manager', oldValue: 'No', newValue: 'Yes', action: 'assign' });
  H({ tableName: 'hr_employees', rowId: 'hre-13', employeeId: 'hre-13', field: 'archivedAt', column: 'archived_at', oldValue: '', newValue: '2026-06-30T16:00:00Z', action: 'archive', changedAt: '2026-06-30T16:00:00Z' });
  d.hrSeq = seq;
  return ensureHrFeedback(d);
}

export function hrPart(x, flags) {
  const { load, save, needUser, fail, now, clone, nameOf, sess, SESSION_KEY } = x;
  const db = () => ensureHr(ensureModules(load()));
  const nextId = (p) => { const d = db(); d.seq += 1; return `${p}-${d.seq}`; };
  const empById = (id) => db().hrEmployees.find((e) => e.id === id);
  const empOfProfile = (pid) => db().hrEmployees.find((e) => e.profileId === pid && !e.archivedAt);
  const isMgr = (eid) => db().hrRoleAssignments.some((a) => a.employeeId === eid && a.role === 'hr_manager' && !a.removedAt);
  function hrRoleOf(u) {
    if (!u || isOutside(u.role) || u.status !== 'active') return null;
    if (isSuperAdmin(u)) return 'super';
    const e = empOfProfile(u.id); if (!e) return null;
    return isMgr(e.id) ? 'hr_manager' : 'employee';
  }
  const access = (u) => moduleAccess('hr', u, flags, db().moduleSettings);
  // module gate: Super admin always (beta while off); HR managers and employees only when HR is Live
  const gate = () => { const u = needUser(); const role = hrRoleOf(u); if (!role) fail('HR is not available for your account.');
    const a = access(u); if (a === 'off' || (role !== 'super' && a !== 'live')) fail('HR is being set up (Beta): only Super admins can use it for now.'); return { u, role }; };
  const needHr = () => { const g = gate(); if (g.role !== 'super' && g.role !== 'hr_manager') fail('Only HR managers and Super admins can do this.'); return g; };
  const needSuper = () => { const g = gate(); if (g.role !== 'super') fail('Only a Super admin can assign or remove HR managers.'); return g; };
  const nameOfLookup = (list, id) => { const r = id && list.find((z) => z.id === id); return r ? r.name : ''; };
  const latestInvite = (eid) => db().hrInvites.filter((i) => i.employeeId === eid).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  const inviteStatus = (i) => (!i ? 'none' : i.acceptedAt ? 'accepted' : i.revokedAt ? 'revoked' : i.expiresAt < now() ? 'expired' : 'pending');
  const employeeRoleOf = (e) => { const p = e.profileId && x.prof(e.profileId); return p && isSuperAdmin(p) ? 'Super admin' : isMgr(e.id) ? 'HR manager' : 'Employee'; };
  function view(e) {
    const d = db(); const mgr = e.reportingToId && empById(e.reportingToId); const inv = latestInvite(e.id);
    return { ...clone(e), departmentName: nameOfLookup(d.hrDepartments, e.departmentId), designationName: nameOfLookup(d.hrDesignations, e.designationId), reportingToName: mgr ? fullNameOf(mgr) : '',
      jobTitleDisplay: String(e.jobTitle || '').trim() || nameOfLookup(d.hrDesignations, e.designationId), employeeRole: employeeRoleOf(e), isHrManager: isMgr(e.id), hasLogin: !!e.profileId, inviteStatus: e.profileId ? 'accepted' : inviteStatus(inv), inviteExpiresAt: inv && !e.profileId ? inv.expiresAt : null,
      reportCount: d.hrEmployees.filter((z) => z.reportingToId === e.id && !z.archivedAt).length };
  }
  const textOf = (field, v) => { const d = db();
    if (field === 'commissioned') return v === true ? 'Yes' : 'No';
    if (v == null || v === '') return '';
    if (field === 'departmentId') return nameOfLookup(d.hrDepartments, v) || String(v);
    if (field === 'designationId') return nameOfLookup(d.hrDesignations, v) || String(v);
    if (field === 'reportingToId') { const m = empById(v); return m ? fullNameOf(m) : String(v); }
    if (field === 'profileId') { const p = x.prof(v); return p ? `${p.firstName} ${p.lastName} (${p.email})` : String(v); }
    if (field === 'employmentType') return labelOf(EMPLOYMENT_TYPES, v); if (field === 'employmentStatus') return labelOf(EMPLOYMENT_STATUSES, v); if (field === 'payType') return labelOf(PAY_TYPES, v); if (field === 'commissioned' || field === 'signatureRequired') return v === true || v === 'Yes' ? 'Yes' : 'No';
    return String(v); };
  function hist(u, tableName, rowId, employeeId, field, oldV, newV, action = 'update') {
    const d = db(); d.hrSeq = (d.hrSeq || d.hrChangeHistory.length) + 1;
    d.hrChangeHistory.push({ id: 'hrh-' + d.hrSeq, seq: d.hrSeq, tableName, rowId, employeeId, field, column: COLUMN_OF[field] || field, oldValue: textOf(field, oldV), newValue: textOf(field, newV), action,
      changedBy: u.id, changedByName: nameOf(u.id), changedAt: now() });
  }
  function applyPatch(u, e, patch, action = 'update') {
    let n = 0;
    for (const [k, v] of Object.entries(patch)) { const old = e[k] == null ? null : e[k]; const nv = v === '' && (k.endsWith('Id') || k === 'dateOfJoining' || k.startsWith('pay')) ? null : v;
      if (String(old == null ? '' : old) === String(nv == null ? '' : nv)) continue;
      e[k] = nv; hist(u, 'hr_employees', e.id, e.id, k, old, nv, action); n++; }
    if (n) { e.updatedAt = now(); e.updatedBy = u.id; }
    return n;
  }
  function checkRefs(e, patch) {
    const d = db();
    if (patch.departmentId && !d.hrDepartments.some((z) => z.id === patch.departmentId && !z.archivedAt)) fail('Pick an active department.');
    if (patch.designationId && !d.hrDesignations.some((z) => z.id === patch.designationId && !z.archivedAt)) fail('Pick an active designation.');
    if (patch.reportingToId) { const m = empById(patch.reportingToId); if (!m || m.archivedAt) fail('Reporting To must be an active employee.');
      if (e && m.id === e.id) fail('An employee cannot report to themselves.');
      for (let c = m, i = 0; c && i < 50; c = c.reportingToId && empById(c.reportingToId), i++) if (e && c.reportingToId === e.id) fail('That would make a reporting loop.'); }
    if (patch.employeeCode && d.hrEmployees.some((z) => z.employeeCode.toUpperCase() === patch.employeeCode && (!e || z.id !== e.id))) fail('That Employee ID is already used.');
    if (patch.email && d.hrEmployees.some((z) => z.email === patch.email && (!e || z.id !== e.id))) fail('An employee with that email already exists.');
  }
  const inviteLink = (i) => '#/hr-invite/' + i.token;
  function makeInvite(u, e) {
    const d = db(); if (e.profileId) fail('This employee already has a portal login.');
    if (e.archivedAt) fail('Restore the employee before inviting them.');
    d.hrInvites.filter((i) => i.employeeId === e.id && !i.acceptedAt && !i.revokedAt).forEach((i) => { i.revokedAt = now(); i.revokedBy = u.id; i.token = null; });
    const inv = { id: nextId('hri'), employeeId: e.id, token: rnd(), email: e.email, createdAt: now(), createdBy: u.id, expiresAt: plusDays(now(), HR_INVITE_DAYS), acceptedAt: null, acceptedProfileId: null, revokedAt: null, revokedBy: null };
    d.hrInvites.push(inv); hist(u, 'hr_invites', inv.id, e.id, 'invite', null, 'Invite link created (expires ' + inv.expiresAt.slice(0, 10) + ', nothing sent)', 'invite');
    return { id: inv.id, employeeId: e.id, link: inviteLink(inv), expiresAt: inv.expiresAt, email: e.email, firstName: e.firstName, lastName: e.lastName, sent: false };
  }
  const lookups = () => { const d = db(); const act = (l) => clone(l).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    return { departments: act(d.hrDepartments), designations: act(d.hrDesignations) }; };
  function lookupPart(coll, label, prefix) {
    return {
      async create(name) { const { u } = needHr(); const d = db(); const n = String(name == null ? '' : name).trim().slice(0, 80); if (!n) fail(`${label} name is required.`);
        if (d[coll].some((z) => z.name.toLowerCase() === n.toLowerCase())) fail(`A ${label.toLowerCase()} with that name already exists (archived ones too).`);
        const r = { id: nextId(prefix), name: n, sort: (Math.max(0, ...d[coll].map((z) => z.sort || 0)) + 10), createdAt: now(), createdBy: u.id, updatedAt: null, updatedBy: null, archivedAt: null, archivedBy: null };
        d[coll].push(r); hist(u, 'hr_' + coll.slice(2).toLowerCase(), r.id, null, 'name', null, n, 'create'); save(); return clone(r); },
      async archive(id, archived = true) { const { u } = needHr(); const d = db(); const r = d[coll].find((z) => z.id === id) || fail(`${label} not found.`);
        if (!!r.archivedAt === !!archived) return clone(r);
        if (archived && d.hrEmployees.some((e) => !e.archivedAt && e[coll === 'hrDepartments' ? 'departmentId' : 'designationId'] === id)) fail(`Move the active employees out of this ${label.toLowerCase()} before archiving it.`);
        const old = r.archivedAt; r.archivedAt = archived ? now() : null; r.archivedBy = archived ? u.id : null; r.updatedAt = now(); r.updatedBy = u.id;
        hist(u, 'hr_' + coll.slice(2).toLowerCase(), r.id, null, 'archivedAt', old, r.archivedAt, archived ? 'archive' : 'restore'); save(); return clone(r); },
    };
  }
  const deps = lookupPart('hrDepartments', 'Department', 'hrd'); const desg = lookupPart('hrDesignations', 'Designation', 'hrg');
  const histRows = (filter) => { const d = db(); return clone(d.hrChangeHistory.filter(filter)).sort((a, b) => b.seq - a.seq)
    .map((h) => { const e = h.employeeId && empById(h.employeeId); const lk = !e && (d.hrDepartments.find((z) => z.id === h.rowId) || d.hrDesignations.find((z) => z.id === h.rowId));
      return { ...h, employeeCode: e ? e.employeeCode : '', recordLabel: e ? fullNameOf(e) : lk ? lk.name : h.rowId, fieldLabel: FIELD_LABEL[h.field] || h.field }; }); };

  const fb = hrFeedbackPart(x, { db, gate, needHr, empById, empOfProfile, hist });
  return {
    ...fb,
    // ---- who am I in HR (the session also carries hrRole / hrEmployeeId / hrHasReports, see mock-adapter getSession) ----
    hrSessionInfo(u) { if (!u) return { hrRole: null, hrEmployeeId: null, hrHasReports: false }; const e = empOfProfile(u.id);
      return { hrRole: hrRoleOf(u), hrEmployeeId: e ? e.id : null, hrHasReports: !!e && db().hrEmployees.some((z) => z.reportingToId === e.id && !z.archivedAt) }; },
    async hrMe() { const { u, role } = gate(); const e = empOfProfile(u.id); const d = db();
      return { hrRole: role, access: access(u), employee: e ? view(e) : null, reports: e ? d.hrEmployees.filter((z) => z.reportingToId === e.id && !z.archivedAt).map((z) => basicOf(view(z))) : [],
        counts: role === 'super' || role === 'hr_manager' ? { employees: d.hrEmployees.filter((z) => !z.archivedAt).length, pendingInvites: d.hrEmployees.filter((z) => !z.archivedAt && !z.profileId && view(z).inviteStatus === 'pending').length,
          noLogin: d.hrEmployees.filter((z) => !z.archivedAt && !z.profileId).length, departments: d.hrDepartments.filter((z) => !z.archivedAt).length, hrManagers: d.hrRoleAssignments.filter((a) => !a.removedAt).length,
          newThisMonth: d.hrEmployees.filter((z) => !z.archivedAt && String(z.dateOfJoining || '').slice(0, 7) === now().slice(0, 7)).length } : null }; },
    async listHrLookups() { gate(); return lookups(); },
    async listHrEmployees({ includeArchived = false } = {}) { needHr(); return db().hrEmployees.filter((e) => includeArchived || !e.archivedAt).map(view).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)); },
    // one profile: HR / Super admin = everything; the employee = their own record (all fields, read); a line manager = a direct report's BASIC fields only
    async getHrEmployee(id) { const { u, role } = gate(); const e = empById(id) || fail('Employee not found.'); const mine = e.profileId === u.id && !e.archivedAt;
      const admin = role === 'super' || role === 'hr_manager'; const me = empOfProfile(u.id);
      if (admin || mine) return { employee: view(e), access: admin ? 'hr' : 'self', canEditHr: admin && !(role === 'hr_manager' && mine), canEditSelf: admin || mine, selfFields: SELF_FIELDS.slice(), hrFields: HR_FIELDS.slice(),
        history: histRows((h) => h.employeeId === e.id), lookups: lookups() };
      if (me && e.reportingToId === me.id && !e.archivedAt) return { employee: basicOf(view(e)), access: 'basic', canEditHr: false, canEditSelf: false, selfFields: [], hrFields: [], history: [], lookups: null };
      fail('You can only see your own profile' + (me && db().hrEmployees.some((z) => z.reportingToId === me.id) ? ' and your direct reports.' : '.'));
    },
    async generateHrEmployeeCode() { needHr(); return nextEmployeeCode(db().hrEmployees.map((e) => e.employeeCode)); },
    // Add Employee: makes the record and, when the person has no portal login yet, a one-time invite link (14 days, nothing sent).
    // An existing active portal login with the same email is linked straight away (no invite needed).
    async createHrEmployee(f = {}) { const { u } = needHr(); const v = cleanEmployee({ employmentType: 'full_time', employmentStatus: 'active', ...f }, { full: true }); checkRefs(null, v);
      const d = db(); const e = { ...BLANK, ...v, id: nextId('hre'), createdAt: now(), createdBy: u.id };
      const login = d.profiles.find((p) => p.email.toLowerCase() === e.email && p.status === 'active' && !isOutside(p.role));
      if (d.profiles.some((p) => p.email.toLowerCase() === e.email && isOutside(p.role))) fail('That email belongs to an agent or client login. Use the employee\'s own work email.');
      if (login && d.hrEmployees.some((z) => z.profileId === login.id)) fail('That portal login is already linked to another employee.');
      if (login) e.profileId = login.id;
      d.hrEmployees.push(e);
      for (const k of HR_FIELDS.concat(SELF_FIELDS)) if (e[k] != null && e[k] !== '') hist(u, 'hr_employees', e.id, e.id, k, null, e[k], 'create');
      if (login) hist(u, 'hr_employees', e.id, e.id, 'profileId', null, login.id, 'create');
      const invite = login ? null : makeInvite(u, e); save();
      return { employee: view(e), invite, linkedLogin: !!login }; },
    async updateHrEmployee(id, patch = {}) { const { u, role } = gate(); const e = empById(id) || fail('Employee not found.'); const admin = role === 'super' || role === 'hr_manager';
      let v;
      // an HR manager edits their OWN record like any employee (no raising their own pay or title); a Super admin's changes to it are the check
      if (admin && role === 'hr_manager' && e.profileId === u.id) { const hrKeys = Object.keys(patch).filter((k) => !SELF_FIELDS.includes(k));
        if (hrKeys.length) fail('HR managers cannot change the HR fields on their own record; a Super admin does that.'); v = cleanSelfPatch(patch); }
      else if (admin) { if (e.archivedAt) fail('Restore the employee before editing.'); v = cleanEmployee(patch); checkRefs(e, v); }
      else if (e.profileId === u.id && !e.archivedAt) v = cleanSelfPatch(patch);
      else fail('You can only edit your own phone, address and emergency contact.');
      if (v.commissionNotes !== undefined && !(v.commissioned !== undefined ? v.commissioned : e.commissioned)) v.commissionNotes = '';
      const n = applyPatch(u, e, v); if (n) save(); return { employee: admin ? view(e) : view(e), changed: n }; },
    async archiveHrEmployee(id, archived = true) { const { u } = needHr(); const d = db(); const e = empById(id) || fail('Employee not found.');
      if (e.profileId === u.id && archived) fail('You cannot archive your own record.');
      if (!!e.archivedAt === !!archived) return view(e);
      if (archived && d.hrEmployees.some((z) => z.reportingToId === e.id && !z.archivedAt)) fail('Move this person\'s direct reports to another manager first.');
      const old = e.archivedAt; e.archivedAt = archived ? now() : null; e.archivedBy = archived ? u.id : null; e.updatedAt = now(); e.updatedBy = u.id;
      hist(u, 'hr_employees', e.id, e.id, 'archivedAt', old, e.archivedAt, archived ? 'archive' : 'restore');
      if (archived) { d.hrRoleAssignments.filter((a) => a.employeeId === e.id && !a.removedAt).forEach((a) => { a.removedAt = now(); a.removedBy = u.id; hist(u, 'hr_role_assignments', a.id, e.id, 'hrManager', 'Yes', 'No', 'remove'); });
        d.hrInvites.filter((i) => i.employeeId === e.id && !i.acceptedAt && !i.revokedAt).forEach((i) => { i.revokedAt = now(); i.revokedBy = u.id; i.token = null; }); }
      save(); return view(e); },
    async createHrInvite(employeeId) { const { u } = needHr(); const e = empById(employeeId) || fail('Employee not found.'); const r = makeInvite(u, e); save(); return r; },
    // ---- the invite link (no sign-in needed to look it up). Accepting creates the employee's login (account role 'Employee') and signs them in. ----
    async getHrInvite(token) { const i = token && db().hrInvites.find((z) => z.token && z.token === String(token)); if (!i) return { status: 'invalid' }; const e = empById(i.employeeId);
      return { status: e && e.archivedAt ? 'invalid' : inviteStatus(i), firstName: e ? e.firstName : '', lastName: e ? e.lastName : '', email: i.email, expiresAt: i.expiresAt }; },
    async acceptHrInvite(token) { const d = db(); const i = token && d.hrInvites.find((z) => z.token && z.token === String(token)); const e = i && empById(i.employeeId);
      if (!i || !e || e.archivedAt || inviteStatus(i) !== 'pending') fail('This invite link is not valid or has expired. Ask HR for a new one.');
      if (e.profileId) fail('This employee already has a portal login.');
      let p = d.profiles.find((z) => z.email.toLowerCase() === e.email && z.status === 'active');
      if (p && isOutside(p.role)) fail('That email belongs to an agent or client login. Ask HR to use your work email.');
      if (!p) { p = { id: nextId('u'), email: e.email, firstName: e.firstName, lastName: e.lastName, phone: e.phone || '', role: EMPLOYEE_ROLE, isAdmin: false, status: 'active', createdAt: now(), createdBy: i.createdBy }; d.profiles.push(p); }
      const actor = { id: p.id };
      e.profileId = p.id; e.updatedAt = now(); e.updatedBy = p.id; i.acceptedAt = now(); i.acceptedProfileId = p.id; i.token = null;
      hist(actor, 'hr_employees', e.id, e.id, 'profileId', null, p.id, 'invite_accepted');
      save(); sess.setItem(SESSION_KEY, p.id); return { profileId: p.id, employeeId: e.id }; },
    // ---- Departments / Designations (list for everyone in HR, add / archive for HR) ----
    createHrDepartment: deps.create, archiveHrDepartment: deps.archive, createHrDesignation: desg.create, archiveHrDesignation: desg.archive,
    // ---- HR managers: ONLY a Super admin assigns or removes one; every change goes to the history ----
    async listHrManagers() { needSuper(); const d = db();
      return { managers: d.hrRoleAssignments.filter((a) => !a.removedAt).map((a) => { const e = empById(a.employeeId); return { assignmentId: a.id, employeeId: a.employeeId, name: fullNameOf(e), employeeCode: e ? e.employeeCode : '', email: e ? e.email : '', hasLogin: !!(e && e.profileId), assignedAt: a.assignedAt, assignedByName: nameOf(a.assignedBy) }; }),
        candidates: d.hrEmployees.filter((e) => !e.archivedAt && !isMgr(e.id)).map((e) => ({ employeeId: e.id, name: fullNameOf(e), employeeCode: e.employeeCode, employeeRole: employeeRoleOf(e) })),
        log: histRows((h) => h.tableName === 'hr_role_assignments') }; },
    async setHrManager(employeeId, on) { const { u } = needSuper(); const d = db(); const e = empById(employeeId) || fail('Employee not found.');
      if (typeof on !== 'boolean') fail('Pick add or remove.');
      const cur = d.hrRoleAssignments.find((a) => a.employeeId === e.id && a.role === 'hr_manager' && !a.removedAt);
      if (on) { if (e.archivedAt) fail('An archived employee cannot be an HR manager.'); if (cur) return { employeeId, hrManager: true };
        const a = { id: nextId('hra'), employeeId: e.id, role: 'hr_manager', assignedAt: now(), assignedBy: u.id, removedAt: null, removedBy: null }; d.hrRoleAssignments.push(a);
        hist(u, 'hr_role_assignments', a.id, e.id, 'hrManager', 'No', 'Yes', 'assign'); }
      else { if (!cur) return { employeeId, hrManager: false }; cur.removedAt = now(); cur.removedBy = u.id; hist(u, 'hr_role_assignments', cur.id, e.id, 'hrManager', 'Yes', 'No', 'remove'); }
      save(); return { employeeId, hrManager: on }; },
    // ---- History + exports (the ... menu): CSV text, the page downloads it ----
    async listHrHistory({ employeeId = null } = {}) { const { u, role } = gate(); const admin = role === 'super' || role === 'hr_manager';
      if (!admin) { const me = empOfProfile(u.id); if (!me || employeeId !== me.id) fail('Only HR managers and Super admins can see the change history.'); }
      return histRows((h) => !employeeId || h.employeeId === employeeId); },
    async exportHrEmployeesCsv({ ids = null, includeArchived = false } = {}) { needHr(); const rows = db().hrEmployees.filter((e) => (includeArchived || !e.archivedAt) && (!ids || ids.includes(e.id))).map(view).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      return { filename: `hr-employees-${csvStamp()}.csv`, csv: employeesCsv(rows), count: rows.length }; },
    async exportHrHistoryCsv({ employeeId = null } = {}) { needHr(); const rows = histRows((h) => !employeeId || h.employeeId === employeeId);
      return { filename: `hr-history-${csvStamp()}.csv`, csv: historyCsv(rows), count: rows.length }; },
  };
}
export const HR_SENSITIVE = SENSITIVE_FIELDS;
