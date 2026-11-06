// hr.js : HR WORKSPACE, PHASE 1 (John + Francis, Nov 4; modeled on Zoho People). Pure rules shared by the mock adapter, the Supabase adapter,
// the pages and the tests. FAKE DATA ONLY. Mirrored by migration 47 (public.hr_* tables + RLS + RPCs).
//  WHO (hrRole on the session user):
//    'super'      a Super admin: everything, incl. assigning / removing HR managers (only a Super admin can). Sees HR even while the module is off (Beta).
//    'hr_manager' an employee a Super admin made HR manager, or a portal Admin once HR is Live: the directory (all employees),
//                 add / edit / archive, departments, designations, invite links, Export + History Export. Only when the HR module is Live.
//                 Assigning HR managers and switching the HR module stay Super admin only. A portal Admin cannot grant Super admin.
//    'employee'   anyone else with an HR employee record: ONLY their own profile ("My profile"), and their direct reports' BASIC fields
//                 (never pay, address or emergency contact). Edits only phone, address and emergency contact.
//    null         no HR record (agents, clients, staff not on the HR list): no HR at all.
//  HR managers get the HR workspace only, unless their portal role already gives them the CRM or the Portal.
//  No SSNs or other government ID numbers are collected. No hard deletes: archive (deactivate) instead. Every field change is in the history.
export const HR_INVITE_DAYS = 14;   // like the agent invite (agent-profile.js INVITE_DAYS)
export const HR_NO_EMAIL_NOTE = 'Nothing is emailed: the portal does not send email. Copy this one-time link and send it to the employee yourself.';
export const COUNTRIES = [['US', 'United States'], ['PH', 'Philippines']];
export const EMPLOYMENT_TYPES = [['full_time', 'Full time'], ['part_time', 'Part time'], ['contractor', 'Contractor'], ['intern', 'Intern']];
export const EMPLOYMENT_STATUSES = [['active', 'Active'], ['on_leave', 'On leave'], ['separated', 'Separated']];
export const PAY_TYPES = [['salary', 'Salary'], ['hourly', 'Hourly']];
export const PAY_CURRENCIES = [['USD', 'USD'], ['PHP', 'PHP']];
export const WORK_LOCATIONS = ['Rockville, MD (office)', 'Annapolis, MD (office)', 'Remote (US)', 'Remote (Philippines)'];   // fake
export const HR_ROLE_LABEL = { super: 'Super admin', hr_manager: 'HR manager', employee: 'Employee' };
export const EMPLOYEE_ROLE_FILTER = ['Super admin', 'HR manager', 'Employee'];
export const labelOf = (list, code) => (list.find(([c]) => c === code) || [null, code || ''])[1];

// FIELDS. Every one is a real typed column (migration 47 hr_employees). SELF_FIELDS = the only ones an employee edits on their own profile.
export const SELF_FIELDS = ['phone', 'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'addressCountry', 'emergencyName', 'emergencyRelationship', 'emergencyPhone'];
export const HR_FIELDS = ['employeeCode', 'firstName', 'lastName', 'email', 'departmentId', 'designationId', 'jobTitle', 'reportingToId', 'dateOfJoining', 'workLocation',
  'employmentType', 'employmentStatus', 'country', 'workPhone', 'payType', 'payRate', 'payCurrency', 'commissioned', 'commissionNotes'];
export const SENSITIVE_FIELDS = ['phone', 'payType', 'payRate', 'payCurrency', 'commissioned', 'commissionNotes', 'addressLine1', 'addressLine2', 'city', 'stateProvince', 'postalCode', 'addressCountry', 'emergencyName', 'emergencyRelationship', 'emergencyPhone'];
// what a line manager sees of a direct report (mirrored by public.hr_my_reports() in SQL)
export const BASIC_FIELDS = ['id', 'employeeCode', 'firstName', 'lastName', 'email', 'departmentId', 'departmentName', 'designationId', 'designationName', 'jobTitle', 'reportingToId', 'reportingToName',
  'dateOfJoining', 'workLocation', 'employmentType', 'employmentStatus', 'country', 'workPhone', 'archivedAt'];   // work phone only: the personal phone is self + HR
export const basicOf = (e) => Object.fromEntries(BASIC_FIELDS.map((k) => [k, e[k] == null ? (k === 'archivedAt' ? null : '') : e[k]]));
export const FIELD_LABEL = { employeeCode: 'Employee ID', firstName: 'First Name', lastName: 'Last Name', email: 'Email ID', departmentId: 'Department', designationId: 'Designation', jobTitle: 'Job title',
  reportingToId: 'Reporting To', dateOfJoining: 'Date of joining', workLocation: 'Work location', employmentType: 'Employment type', employmentStatus: 'Employment status', country: 'Country',
  workPhone: 'Work phone', phone: 'Phone', addressLine1: 'Address line 1', addressLine2: 'Address line 2', city: 'City', stateProvince: 'State / Province', postalCode: 'Postal code',
  addressCountry: 'Address country', emergencyName: 'Emergency contact name', emergencyRelationship: 'Emergency contact relationship', emergencyPhone: 'Emergency contact phone',
  payType: 'Pay type', payRate: 'Pay rate', payCurrency: 'Pay currency', commissioned: 'Commissioned', commissionNotes: 'Commission structure notes', profileId: 'Portal login', archivedAt: 'Archived', name: 'Name', sort: 'Sort', hrManager: 'HR manager', invite: 'Invite link' };
// the SQL column for each field (History Export and the CSV use the same names a report would)
export const COLUMN_OF = { employeeCode: 'employee_code', firstName: 'first_name', lastName: 'last_name', email: 'email', departmentId: 'department_id', designationId: 'designation_id', jobTitle: 'job_title',
  reportingToId: 'reporting_to_id', dateOfJoining: 'date_of_joining', workLocation: 'work_location', employmentType: 'employment_type', employmentStatus: 'employment_status', country: 'country',
  workPhone: 'work_phone', phone: 'phone', addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city', stateProvince: 'state_province', postalCode: 'postal_code', addressCountry: 'address_country',
  emergencyName: 'emergency_name', emergencyRelationship: 'emergency_relationship', emergencyPhone: 'emergency_phone', payType: 'pay_type', payRate: 'pay_rate', payCurrency: 'pay_currency', commissioned: 'commissioned', commissionNotes: 'commission_notes',
  profileId: 'profile_id', archivedAt: 'archived_at', name: 'name', sort: 'sort', hrManager: 'hr_manager', invite: 'invite' };

const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dateOk = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };
// phones: US (xxx-xxx-xxxx) and PH (+63 ...) numbers, so a loose international pattern (mirrored by private.hr_phone_ok)
export const HR_PHONE_RE = /^[0-9+() .-]{7,25}$/;
export const hrPhoneOk = (v) => !v || (HR_PHONE_RE.test(v) && (String(v).match(/\d/g) || []).length >= 7);
export const EMPLOYEE_CODE_RE = /^[A-Za-z0-9-]{2,20}$/;
const pick = (list, v, label) => { if (v === '' || v == null) return ''; if (!list.some(([c]) => c === v)) throw new Error(`${label} is not one of the choices.`); return v; };

// Clean one patch. full = a new employee (required fields checked). Only keys present are returned (partial update).
export function cleanEmployee(f = {}, { full = false } = {}) {
  const out = {}; const has = (k) => full || Object.prototype.hasOwnProperty.call(f, k);
  const req = (k, n) => { const v = s(f[k], n); if (!v) throw new Error(`${FIELD_LABEL[k]} is required.`); return v; };
  if (has('employeeCode')) { out.employeeCode = req('employeeCode', 20).toUpperCase(); if (!EMPLOYEE_CODE_RE.test(out.employeeCode)) throw new Error('Employee ID: 2 to 20 letters, digits or dashes (e.g. CLA-013).'); }
  if (has('firstName')) out.firstName = req('firstName', 80);
  if (has('lastName')) out.lastName = req('lastName', 80);
  if (has('email')) { out.email = req('email', 160).toLowerCase(); if (!emailRe.test(out.email)) throw new Error('Email ID must be a valid email address.'); }
  for (const k of ['departmentId', 'designationId', 'reportingToId']) if (has(k)) out[k] = s(f[k], 60) || null;
  if (has('jobTitle')) out.jobTitle = s(f.jobTitle, 120);
  if (has('dateOfJoining')) { const v = s(f.dateOfJoining, 10); if (v && !dateOk(v)) throw new Error('Date of joining must be a real date (YYYY-MM-DD).'); out.dateOfJoining = v || null; }
  if (has('workLocation')) out.workLocation = s(f.workLocation, 80);
  if (has('employmentType')) out.employmentType = pick(EMPLOYMENT_TYPES, s(f.employmentType, 20) || 'full_time', 'Employment type');
  if (has('employmentStatus')) out.employmentStatus = pick(EMPLOYMENT_STATUSES, s(f.employmentStatus, 20) || 'active', 'Employment status');
  if (has('country')) { out.country = s(f.country, 2).toUpperCase(); if (!COUNTRIES.some(([c]) => c === out.country)) throw new Error('Country must be US or PH.'); }
  for (const k of ['workPhone', 'phone', 'emergencyPhone']) if (has(k)) { const v = s(f[k], 25); if (!hrPhoneOk(v)) throw new Error(`${FIELD_LABEL[k]}: digits, spaces, + ( ) - only (7 to 25 characters).`); out[k] = v; }
  for (const [k, n] of [['addressLine1', 120], ['addressLine2', 120], ['city', 60], ['stateProvince', 60], ['postalCode', 12], ['addressCountry', 60], ['emergencyName', 120], ['emergencyRelationship', 60]]) if (has(k)) out[k] = s(f[k], n);
  if (has('payType')) out.payType = pick(PAY_TYPES, s(f.payType, 10), 'Pay type') || null;
  if (has('payCurrency')) out.payCurrency = pick(PAY_CURRENCIES, s(f.payCurrency, 3).toUpperCase(), 'Pay currency') || null;
  if (has('payRate')) { const v = s(f.payRate, 20).replace(/[$,]/g, ''); if (!v) out.payRate = null; else { const n = Number(v); if (!isFinite(n) || n < 0 || n > 9999999999) throw new Error('Pay rate must be a positive number.'); out.payRate = Math.round(n * 100) / 100; } }
  // John, Nov 4 HR review: Commissioned Yes / No + Commission structure notes (HR only, like pay). Notes are cleared when Commissioned = No.
  if (has('commissioned')) { const v = f.commissioned; out.commissioned = v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === '1';
    if (!out.commissioned) out.commissionNotes = ''; }
  if (has('commissionNotes') && out.commissionNotes !== '') out.commissionNotes = s(f.commissionNotes, 2000);
  // NO government ID numbers in Phase 1 (SSN, SSS, PhilHealth, Pag-IBIG, TIN ...): any such key is refused, never stored
  for (const k of Object.keys(f)) if (/ssn|social|sss|philhealth|pagibig|pag_ibig|tin\b|taxid|tax_id|passport|national_?id|gov/i.test(k)) throw new Error('Government ID numbers (SSN, SSS, PhilHealth, Pag-IBIG, TIN) are not collected.');
  return out;
}
// the self-service subset: an employee's own patch. Anything outside SELF_FIELDS is refused (not silently dropped).
export function cleanSelfPatch(f = {}) {
  const bad = Object.keys(f).filter((k) => !SELF_FIELDS.includes(k));
  if (bad.length) throw new Error('You can only edit your phone, address and emergency contact. HR changes the rest.');
  return cleanEmployee(f);
}
export const nextEmployeeCode = (codes) => { const nums = codes.map((c) => /^CLA-(\d+)$/i.exec(c || '')).filter(Boolean).map((m) => Number(m[1])); const n = (nums.length ? Math.max(...nums) : 0) + 1; return 'CLA-' + String(n).padStart(3, '0'); };
export const initials = (e) => ((s(e.firstName, 1) + s(e.lastName, 1)).toUpperCase() || '?');
export const fullNameOf = (e) => (e ? `${e.firstName || ''} ${e.lastName || ''}`.trim() : '');

// HR access for one session user (hrRole on the session) + the module switch map entry ('live' | 'beta' | 'off')
export const hrVisibleFor = (u, access) => !!u && !!u.hrRole && !u.accountRole && u.role !== 'Outside user' && (u.hrRole === 'super' ? access !== 'off' : access === 'live');
export const hrCanManage = (u) => !!u && (u.hrRole === 'super' || u.hrRole === 'hr_manager');
export const hrIsSuper = (u) => !!u && u.hrRole === 'super';
// which HR sections a user may open (route guard + nav). 'me' needs an employee record.
export function hrSectionAllowed(u, section) {
  if (!u || !u.hrRole) return false;
  if (['home', 'employees', 'employee', 'add', 'departments', 'designations', 'me'].includes(section) && hrCanManage(u)) return section !== 'me' || !!u.hrEmployeeId;
  if (section === 'settings') return hrIsSuper(u);
  if (section === 'documents') return hrCanManage(u);   // HR Documents page (John, Nov 4): HR managers + Super admins; employees see theirs on My profile
  if (section === 'me' || section === 'home') return !!u.hrEmployeeId;
  if (section === 'team') return !!u.hrEmployeeId && !!u.hrHasReports;
  if (section === 'employee') return !!u.hrEmployeeId;   // own record or a report: the adapter decides (basic fields only for a report)
  return false;
}

// Employee Information list: search + the filter panel (Department, Designation, Location, Employment Status, Employee Role)
export function filterEmployees(rows, f = {}) {
  const q = s(f.q, 100).toLowerCase();
  return rows.filter((e) => (f.includeArchived || !e.archivedAt)
    && (!q || [e.employeeCode, e.firstName, e.lastName, e.email, e.departmentName, e.designationName, e.jobTitle, e.workLocation].some((v) => String(v || '').toLowerCase().includes(q)))
    && (!f.departmentId || e.departmentId === f.departmentId) && (!f.designationId || e.designationId === f.designationId)
    && (!f.workLocation || e.workLocation === f.workLocation) && (!f.employmentStatus || e.employmentStatus === f.employmentStatus)
    && (!f.employeeRole || e.employeeRole === f.employeeRole) && (!f.country || e.country === f.country));
}
// CSV (RFC 4180; a leading = + - @ is prefixed with ' so a spreadsheet never runs it as a formula)
const cell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
export const EXPORT_COLUMNS = [['employee_code', 'employeeCode'], ['first_name', 'firstName'], ['last_name', 'lastName'], ['email', 'email'], ['department', 'departmentName'], ['designation', 'designationName'],
  ['job_title', 'jobTitle'], ['reporting_to', 'reportingToName'], ['date_of_joining', 'dateOfJoining'], ['work_location', 'workLocation'], ['employment_type', 'employmentType'], ['employment_status', 'employmentStatus'],
  ['country', 'country'], ['employee_role', 'employeeRole'], ['work_phone', 'workPhone'], ['phone', 'phone'], ['has_login', 'hasLogin'], ['archived_at', 'archivedAt']];
export const employeesCsv = (rows) => toCsv(EXPORT_COLUMNS.map(([h]) => h), rows.map((e) => EXPORT_COLUMNS.map(([, k]) => (k === 'hasLogin' ? (e.profileId ? 'yes' : 'no') : e[k]))));
export const HISTORY_COLUMNS = ['changed_at', 'changed_by', 'table_name', 'record', 'employee_code', 'field', 'old_value', 'new_value', 'action'];
export const historyCsv = (rows) => toCsv(HISTORY_COLUMNS, rows.map((h) => [h.changedAt, h.changedByName, h.tableName, h.recordLabel, h.employeeCode || '', h.column || h.field, h.oldValue, h.newValue, h.action]));
// John, Nov 4 HR review: job title falls back to the designation when blank (Paula showed "-" for Job title)
export const jobTitleOf = (e) => (e ? (String(e.jobTitle || '').trim() || e.designationName || '') : '');
export const HR_COMPANY_DOC_CATEGORIES = [['handbook', 'Handbook'], ['policy', 'Policy'], ['form', 'Form'], ['benefits', 'Benefits'], ['other', 'Other']];
export const HR_SHARE_SCOPES = [['all', 'All employees'], ['departments', 'Department(s)'], ['employees', 'Specific employees']];
export const HR_EMP_DOC_TYPES = [['offer_letter', 'Offer letter'], ['manual', 'Manual'], ['signed_policy', 'Signed policy'], ['other', 'Other']];
export const HR_SIGN_STATUSES = [['draft', 'Draft'], ['not_sent', 'Not sent'], ['sent', 'Sent'], ['signed', 'Signed'], ['declined', 'Declined']];
export const HR_SIGN_PROVIDERS = [['zoho_sign', 'Zoho Sign'], ['other', 'Other']];
export const HR_ESIGN_NOTE = 'E-signature service not connected yet. Nothing is sent: record the status here by hand.';
export const HR_IDLE_MS = 15 * 60 * 1000;   // 15 minutes without a heartbeat ends a portal session
export const HR_HEARTBEAT_MS = 60 * 1000;   // heartbeat every 60 s while the tab is visible
export const sessionSeconds = (x) => Math.max(0, Math.round((Date.parse(x.endedAt || x.lastActivityAt) - Date.parse(x.startedAt)) / 1000));
export const fmtDuration = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
// totals for today / this week (Mon start) / last 30 days, by session start (local time)
export function sessionTotals(rows, nowIso = new Date().toISOString()) {
  const n = new Date(nowIso); const day0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(); const wd = (n.getDay() + 6) % 7; const week0 = day0 - wd * 864e5; const d30 = n.getTime() - 30 * 864e5;
  const t = { today: 0, week: 0, days30: 0, sessions30: 0 };
  for (const r of rows) { const st = Date.parse(r.startedAt); const sec = sessionSeconds(r); if (st >= day0) t.today += sec; if (st >= week0) t.week += sec; if (st >= d30) { t.days30 += sec; t.sessions30++; } }
  return t;
}
export const csvStamp = (d = new Date()) => d.toISOString().slice(0, 10);
