/* Buyer Social Security number. Not a task-form answer. Fake numbers only in tests. */
export const SSN_STAFF_ROLES = ['Super admin', 'Admin', 'Processor', 'Preprocessor', 'Transaction Coordinator', 'Sales Person', 'Sales Team'];

export function ssnDigits(raw) {
  const digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (digits.length !== 9) {
    const err = new Error('Enter a 9-digit Social Security number.');
    err.ssn = true;
    throw err;
  }
  return digits;
}

export function ssnMask(digits) {
  return `***-**-${String(digits).slice(-4)}`;
}

export function ssnGrouped(digits) {
  const d = String(digits);
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function ssnStaff(user) {
  return !!(user && (SSN_STAFF_ROLES.includes(user.role) || user.isAdmin));
}

/* Drop keys that must never be stored with the other task answers. */
export function withoutSsn(input) {
  const data = { ...(input || {}) };
  for (const key of Object.keys(data)) {
    if (/ssn|social.?security/i.test(key)) delete data[key];
  }
  return data;
}
