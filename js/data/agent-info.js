// AGENT BIRTHDATE (John, Nov 3 call): optional date on an agent's setup. Visible to the agent and CLA staff only; nothing requires it.
import { isStaff } from './constants.js?v=202611060013';
export const BIRTHDATE_NOTE = 'Optional. Seen only by you and CLA Title staff.';
export const canSeeBirthdate = (viewer, targetId) => !!(viewer && (viewer.id === targetId || viewer.isAdmin || isStaff(viewer.role)));
export const canSetBirthdate = (viewer, targetId) => !!(viewer && (viewer.id === targetId || viewer.isAdmin));
export function cleanBirthdate(v, today = new Date().toISOString().slice(0, 10)) {
  const s = String(v == null ? '' : v).trim(); if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) throw new Error('Birthdate must be a real date (YYYY-MM-DD).');
  if (s > today) throw new Error('Birthdate cannot be in the future.'); if (s < '1900-01-01') throw new Error('Birthdate must be after 1900.');
  return s;
}
