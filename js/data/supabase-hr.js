/* [SUPABASE] HR WORKSPACE, PHASE 1 (John + Francis, Nov 4; migration 47). Same names / shapes as mock-part-hr.js. NOT run against a hosted project
 * (best effort; the mock adapter is the tested one, migration 47 has its own DB test 127). Every rule is enforced in the database:
 * RLS (HR admins read every employee, an employee reads only their own row), column grants (an employee UPDATEs only phone / address /
 * emergency contact), a guard trigger (HR fields only by an HR manager or Super admin; an HR manager never changes their own HR fields),
 * security-definer RPCs for HR writes, and history triggers. NOTHING IS SENT: invites return a one-time link. No SSNs / government IDs. */
import { hrFeedbackSupabase } from './supabase-hr-feedback.js?v=202611041931';
import { HR_INVITE_DAYS, COLUMN_OF, FIELD_LABEL, SELF_FIELDS, HR_FIELDS, basicOf, fullNameOf, nextEmployeeCode, cleanEmployee, cleanSelfPatch, employeesCsv, historyCsv, csvStamp } from './hr.js?v=202611041931';

const FIELD_OF = Object.fromEntries(Object.entries(COLUMN_OF).map(([k, c]) => [c, k]));
const EMP_COLS = 'id,employee_code,profile_id,first_name,last_name,email,department_id,designation_id,job_title,reporting_to,date_of_joining,work_location,employment_type,employment_status,country,work_phone,phone,'
  + 'address_line1,address_line2,city,state_province,postal_code,address_country,emergency_name,emergency_relationship,emergency_phone,pay_type,pay_rate,pay_currency,commissioned,commission_notes,created_at,updated_at,archived_at';
const camelEmp = (r) => ({ id: r.id, employeeCode: r.employee_code, profileId: r.profile_id, firstName: r.first_name, lastName: r.last_name, email: r.email, departmentId: r.department_id,
  designationId: r.designation_id, jobTitle: r.job_title, reportingToId: r.reporting_to, dateOfJoining: r.date_of_joining, workLocation: r.work_location, employmentType: r.employment_type,
  employmentStatus: r.employment_status, country: r.country, workPhone: r.work_phone, phone: r.phone, addressLine1: r.address_line1, addressLine2: r.address_line2, city: r.city,
  stateProvince: r.state_province, postalCode: r.postal_code, addressCountry: r.address_country, emergencyName: r.emergency_name, emergencyRelationship: r.emergency_relationship,
  emergencyPhone: r.emergency_phone, payType: r.pay_type, payRate: r.pay_rate == null ? null : Number(r.pay_rate), payCurrency: r.pay_currency, commissioned: !!r.commissioned, commissionNotes: r.commission_notes || '', createdAt: r.created_at, updatedAt: r.updated_at, archivedAt: r.archived_at });
const lk = (r) => ({ id: r.id, name: r.name, sort: r.sort, createdAt: r.created_at, archivedAt: r.archived_at });
const now = () => new Date().toISOString();

export function hrSupabase({ sb, ok, me }) {
  const role = async () => ok(await sb.rpc('hr_role'));
  const lookups = async () => ({ departments: (ok(await sb.from('hr_departments').select('*').order('sort')) || []).map(lk), designations: (ok(await sb.from('hr_designations').select('*').order('sort')) || []).map(lk) });
  const managers = async () => new Set((ok(await sb.from('hr_role_assignments').select('employee_id').is('removed_at', null)) || []).map((a) => a.employee_id));
  const invites = async () => ok(await sb.from('hr_invites').select('employee_id,created_at,expires_at,accepted_at,revoked_at').order('created_at', { ascending: false })) || [];
  // the same view shape as the mock (names, role, login / invite status)
  async function views(rows, { admin = true } = {}) {
    const L = await lookups(); const mg = admin ? await managers() : new Set(); const inv = admin ? await invites() : [];
    const all = admin ? rows : rows; const byId = new Map(all.map((e) => [e.id, e]));
    return rows.map((e) => { const i = inv.find((z) => z.employee_id === e.id); const m = e.reportingToId && byId.get(e.reportingToId);
      const st = !i ? 'none' : i.accepted_at ? 'accepted' : i.revoked_at ? 'revoked' : i.expires_at < now() ? 'expired' : 'pending';
      return { ...e, departmentName: (L.departments.find((d) => d.id === e.departmentId) || {}).name || '', designationName: (L.designations.find((d) => d.id === e.designationId) || {}).name || '',
        reportingToName: m ? fullNameOf(m) : '', jobTitleDisplay: String(e.jobTitle || '').trim() || (L.designations.find((d) => d.id === e.designationId) || {}).name || '', isHrManager: mg.has(e.id), employeeRole: mg.has(e.id) ? 'HR manager' : 'Employee', hasLogin: !!e.profileId,
        inviteStatus: e.profileId ? 'accepted' : st, inviteExpiresAt: i && !e.profileId ? i.expires_at : null, reportCount: rows.filter((z) => z.reportingToId === e.id && !z.archivedAt).length }; });
  }
  const allEmployees = async () => (ok(await sb.from('hr_employees').select(EMP_COLS).order('employee_code')) || []).map(camelEmp);
  const toJson = (v) => { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = x == null ? '' : x; return o; };
  const history = async (employeeId) => { let q = sb.from('hr_change_history').select('*').order('id', { ascending: false }); if (employeeId) q = q.eq('employee_id', employeeId);
    return (ok(await q) || []).map((h) => ({ id: h.id, seq: h.id, tableName: h.table_name, rowId: h.row_id, employeeId: h.employee_id, field: FIELD_OF[h.field] || h.field, column: h.field,
      fieldLabel: FIELD_LABEL[FIELD_OF[h.field]] || h.field, oldValue: h.old_value, newValue: h.new_value, action: h.action, changedBy: h.changed_by, changedByName: h.changed_by_name,
      changedAt: h.changed_at, employeeCode: '', recordLabel: h.row_id })); };
  async function mine() { const u = await me(); if (!u) return null; const r = ok(await sb.from('hr_employees').select(EMP_COLS).eq('profile_id', u.id).is('archived_at', null).maybeSingle()); return r ? camelEmp(r) : null; }
  const isAdmin = (r) => r === 'super' || r === 'hr_manager';
  return {
    ...hrFeedbackSupabase({ sb, ok }),   // John, Nov 4 HR review (migration 59)
    async hrSessionExtras() { const r = await role().catch(() => null); const e = r ? await mine().catch(() => null) : null;
      const reps = e ? (ok(await sb.rpc('hr_my_reports')) || []) : []; return { hrRole: r || null, hrEmployeeId: e ? e.id : null, hrHasReports: reps.length > 0 }; },
    async hrMe() { const r = await role(); if (!r) throw new Error('HR is being set up (Beta): only Super admins can use it for now.'); const e = await mine();
      const reps = (ok(await sb.rpc('hr_my_reports')) || []).map((x) => ({ id: x.id, employeeCode: x.employee_code, firstName: x.first_name, lastName: x.last_name, email: x.email, departmentName: x.department,
        designationName: x.designation, jobTitle: x.job_title, dateOfJoining: x.date_of_joining, workLocation: x.work_location, employmentType: x.employment_type, employmentStatus: x.employment_status, country: x.country, workPhone: x.work_phone }));
      let counts = null;
      if (isAdmin(r)) { const v = await views(await allEmployees()); const act = v.filter((z) => !z.archivedAt); const L = await lookups();
        counts = { employees: act.length, pendingInvites: act.filter((z) => z.inviteStatus === 'pending').length, noLogin: act.filter((z) => !z.profileId).length, departments: L.departments.filter((d) => !d.archivedAt).length,
          hrManagers: (await managers()).size, newThisMonth: act.filter((z) => String(z.dateOfJoining || '').slice(0, 7) === now().slice(0, 7)).length }; }
      return { hrRole: r, access: ok(await sb.rpc('module_access', { p_module: 'hr' })), employee: e ? (await views([e], { admin: isAdmin(r) }))[0] : null, reports: reps, counts }; },
    listHrLookups: lookups,
    async listHrEmployees({ includeArchived = false } = {}) { const v = await views(await allEmployees()); return v.filter((e) => includeArchived || !e.archivedAt); },
    async getHrEmployee(id) { const r = await role(); const e = ok(await sb.from('hr_employees').select(EMP_COLS).eq('id', id).maybeSingle());
      if (e) { const v = isAdmin(r) ? (await views(await allEmployees())).find((z) => z.id === id) : (await views([camelEmp(e)], { admin: false }))[0]; const self = !isAdmin(r) || v.profileId === (await me()).id;
        return { employee: v, access: isAdmin(r) ? 'hr' : 'self', canEditHr: r === 'super' || (r === 'hr_manager' && !self), canEditSelf: true, selfFields: SELF_FIELDS.slice(), hrFields: HR_FIELDS.slice(), history: await history(id), lookups: await lookups() }; }
      const rep = (ok(await sb.rpc('hr_my_reports')) || []).find((x) => x.id === id);
      if (rep) return { employee: basicOf({ id: rep.id, employeeCode: rep.employee_code, firstName: rep.first_name, lastName: rep.last_name, email: rep.email, departmentName: rep.department, designationName: rep.designation,
        jobTitle: rep.job_title, dateOfJoining: rep.date_of_joining, workLocation: rep.work_location, employmentType: rep.employment_type, employmentStatus: rep.employment_status, country: rep.country, workPhone: rep.work_phone }),
        access: 'basic', canEditHr: false, canEditSelf: false, selfFields: [], hrFields: [], history: [], lookups: null };
      throw new Error('You can only see your own profile and your direct reports.'); },
    async generateHrEmployeeCode() { return nextEmployeeCode((ok(await sb.from('hr_employees').select('employee_code')) || []).map((r) => r.employee_code)); },
    async createHrEmployee(f = {}) { const v = cleanEmployee({ employmentType: 'full_time', employmentStatus: 'active', ...f }, { full: true });
      const r = (ok(await sb.rpc('hr_create_employee', { p: toJson(v) })) || [])[0]; const e = (await views(await allEmployees())).find((z) => z.id === r.employee_id);
      return { employee: e, linkedLogin: !!r.linked_login, invite: r.token ? { employeeId: r.employee_id, link: '#/hr-invite/' + r.token, expiresAt: r.expires_at, email: e.email, firstName: e.firstName, lastName: e.lastName, sent: false } : null }; },
    async updateHrEmployee(id, patch = {}) { const r = await role(); const v = isAdmin(r) ? cleanEmployee(patch) : cleanSelfPatch(patch);
      const n = ok(await sb.rpc('hr_update_employee', { p_id: id, p: toJson(v) })); return { employee: (await this.getHrEmployee(id)).employee, changed: n }; },
    async archiveHrEmployee(id, archived = true) { ok(await sb.rpc('hr_archive_employee', { p_id: id, p_archived: archived })); return (await views(await allEmployees())).find((z) => z.id === id); },
    async createHrInvite(employeeId) { const r = (ok(await sb.rpc('hr_create_invite', { p_employee: employeeId })) || [])[0]; return { employeeId, link: '#/hr-invite/' + r.token, expiresAt: r.expires_at, sent: false, days: HR_INVITE_DAYS }; },
    async getHrInvite(token) { const r = (ok(await sb.rpc('hr_invite_lookup', { p_token: token })) || [])[0] || { status: 'invalid' };
      return { status: r.status, firstName: r.first_name || '', lastName: r.last_name || '', email: r.email || '', expiresAt: r.expires_at }; },
    // the employee first creates their sign-in (Supabase Auth sign-up with the invited email), then this makes / links the portal login
    async acceptHrInvite(token) { const { data } = await sb.auth.getUser(); if (!data || !data.user) throw new Error('Create your sign-in first (the invited email + a password), then open this link again.');
      const id = ok(await sb.rpc('hr_accept_invite', { p_token: token })); return { profileId: data.user.id, employeeId: id }; },
    async createHrDepartment(name) { return lk(ok(await sb.from('hr_departments').insert({ name: String(name || '').trim() }).select('*').single())); },
    async archiveHrDepartment(id, archived = true) { return lk(ok(await sb.from('hr_departments').update({ archived_at: archived ? now() : null }).eq('id', id).select('*').single())); },
    async createHrDesignation(name) { return lk(ok(await sb.from('hr_designations').insert({ name: String(name || '').trim() }).select('*').single())); },
    async archiveHrDesignation(id, archived = true) { return lk(ok(await sb.from('hr_designations').update({ archived_at: archived ? now() : null }).eq('id', id).select('*').single())); },
    async listHrManagers() { if ((await role()) !== 'super') throw new Error('Only a Super admin can assign or remove HR managers.');
      const v = await views(await allEmployees()); const act = ok(await sb.from('hr_role_assignments').select('*').is('removed_at', null)) || [];
      const log = (await history(null)).filter((h) => h.tableName === 'hr_role_assignments');
      return { managers: act.map((a) => { const e = v.find((z) => z.id === a.employee_id) || {}; return { assignmentId: a.id, employeeId: a.employee_id, name: fullNameOf(e), employeeCode: e.employeeCode || '', email: e.email || '', hasLogin: !!e.profileId, assignedAt: a.assigned_at, assignedByName: '' }; }),
        candidates: v.filter((e) => !e.archivedAt && !e.isHrManager).map((e) => ({ employeeId: e.id, name: fullNameOf(e), employeeCode: e.employeeCode, employeeRole: e.employeeRole })), log }; },
    async setHrManager(employeeId, on) { return { employeeId, hrManager: ok(await sb.rpc('hr_set_manager', { p_employee: employeeId, p_on: on })) }; },
    async listHrHistory({ employeeId = null } = {}) { return history(employeeId); },
    async exportHrEmployeesCsv({ ids = null, includeArchived = false } = {}) { const rows = (await this.listHrEmployees({ includeArchived })).filter((e) => !ids || ids.includes(e.id));
      return { filename: `hr-employees-${csvStamp()}.csv`, csv: employeesCsv(rows), count: rows.length }; },
    async exportHrHistoryCsv({ employeeId = null } = {}) { const rows = await history(employeeId); return { filename: `hr-history-${csvStamp()}.csv`, csv: historyCsv(rows), count: rows.length }; },
  };
}
