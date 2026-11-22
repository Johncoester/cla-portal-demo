/* Home copies of dashboard charts (Janine, CRM Feedback 31 item 1, confirmed Nov 18 2026).
 * One person, one chart: a custom title and an order. The dashboard chart is not stored here.
 * The page remembers a probe in this tab so Home does not ask again when there is nothing to show. */
const PROBE_KEY = 'crm-home:chart-probe:';
export function pageSession() {
  try { if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage; } catch { /* not a browser global */ }
  try { if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage; } catch { /* no window */ }
  return null;
}
let unavailable = false;
const probeKey = (userId) => PROBE_KEY + String(userId || '');

export function cleanHomeTitle(title) {
  const name = String(title == null ? '' : title).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length > 100) throw new Error('The Home name can be at most 100 characters.');
  return name;
}

export function homeChartsMissing(err) {
  const code = String(err && err.code || '');
  const msg = String(err && (err.message || err) || '');
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204') return true;
  return /crm_home_charts/i.test(msg) && /does not exist|schema cache|Could not find the table|relation/i.test(msg);
}

export function homeChartMessage(err) {
  const msg = String(err && err.message || err || '');
  if (homeChartsMissing(err)) return 'Add to Home is not ready on this portal yet.';
  if (/duplicate key|23505/i.test(msg)) return 'That chart is already on your Home.';
  if (/The Home name can be at most 100 characters/.test(msg)) return msg;
  if (/^That chart /.test(msg) || /^This chart /.test(msg) || /^The Home name /.test(msg) || /^Add to Home /.test(msg) || /^Those charts /.test(msg)) return msg;
  return 'That could not be saved. Try again.';
}

export function readProbe(storage, userId) {
  try { return storage && storage.getItem ? storage.getItem(probeKey(userId)) : null; } catch { return null; }
}

export function writeProbe(storage, value, userId) {
  if (value === 'off') { unavailable = true; return; }
  try {
    if (!storage || !storage.setItem) return;
    if (value) storage.setItem(probeKey(userId), value);
    else storage.removeItem(probeKey(userId));
  } catch { /* private mode: this visit only */ }
}

/* The missing table is remembered only until the next full reload, so applying it and refreshing shows Add to Home.
 * 'empty' is kept for this tab, including a reload, so Home does not ask again when there is nothing to show. */
export function homeChartsDown() { return unavailable; }
export function resetHomeChartsProbe() { unavailable = false; }

export function homeChartsSkip(storage, userId) {
  return unavailable || readProbe(storage, userId) === 'empty';
}
