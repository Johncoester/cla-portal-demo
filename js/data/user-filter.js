// User List filter/search (Admin users page, John Nov 2). Pure functions so they are unit-tested (test/test-mock-admin-nov2.js).
// Input rows come from adminListUsers(): { firstName, lastName, email, phone, role, isAdmin, status, files: [{ role, fileNumber }],
// salesReps: [{ name }], clients: [{ name }], teams: [name], isClient }.
import { STAFF_ACCOUNT_ROLES, OUTSIDE, OUTSIDE_FILE_ROLES, outsideTypeLabel } from './constants.js?v=202611061918';

// [value, label] for the Role filter: staff account roles, any outside user, each per-file role, clients, Admin access
export const USER_ROLE_FILTERS = [
  ...STAFF_ACCOUNT_ROLES.map((r) => [r, r]),
  [OUTSIDE, 'Realtors & clients (any)'],
  ['type:Realtor', 'Realtor'], ['type:Client', 'Client'],   // live40, display only: within outside users, by the friendly type (contact type, else per-file roles)
  ...OUTSIDE_FILE_ROLES.map((r) => ['file:' + r, `${r} on any file`]),
  ['client', 'Client (on a file or linked to a salesperson)'],
  ['linked', 'Client linked to a salesperson'],
  ['admin', 'Has Admin access'],
];
export const USER_STATUS_FILTERS = [['', 'Any status'], ['active', 'Active'], ['disabled', 'Disabled'], ['removed', 'Removed']];

export const userRoleText = (u) => {
  if (u.role !== OUTSIDE) return u.role;
  return `${outsideTypeLabel(u)}: ${(u.files || []).length ? u.files.map((f) => `${f.role} on ${f.fileNumber}`).join(', ') : 'not on any order yet'}`;
};

export function matchesRole(u, role) {
  if (!role) return true;
  if (role === 'admin') return !!u.isAdmin;
  if (role === 'client') return !!u.isClient;
  if (role === 'linked') return (u.salesReps || []).length > 0;
  if (role.startsWith('type:')) return u.role === OUTSIDE && outsideTypeLabel(u) === role.slice(5);
  if (role.startsWith('file:')) { const r = role.slice(5); return u.role === OUTSIDE && (u.files || []).some((f) => f.role === r); }
  return u.role === role;
}

export function matchesSearch(u, q) {
  const t = String(q || '').trim().toLowerCase(); if (!t) return true;
  const hay = [u.firstName, u.lastName, `${u.firstName} ${u.lastName}`, u.email, u.phone, u.role, ...(u.files || []).flatMap((f) => [f.fileNumber, f.role]),
    ...(u.salesReps || []).map((s) => s.name), ...(u.clients || []).map((c) => c.name), ...(u.teams || [])].filter(Boolean).join(' | ').toLowerCase();
  return t.split(/\s+/).every((w) => hay.includes(w));
}

// contact type (John, Nov 2): '' = any, 'none' = not set, else the code
export const matchesContactType = (u, t) => !t || (t === 'none' ? !u.contactType : u.contactType === t);
export const filterUsers = (users, { q = '', role = '', status = '', contactType = '' } = {}) =>
  users.filter((u) => matchesSearch(u, q) && matchesRole(u, role) && (!status || u.status === status) && matchesContactType(u, contactType));
