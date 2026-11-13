/* File-tab modules. Loading one evaluates local helpers only. It does not check who is signed in and it does not read a file. */
const TABS = Object.assign(Object.create(null), {
  tasks: './dealtasks.js?v=202611171040',
  inbox: './dealmsgs.js?v=202611162200',
  email: './dealemail.js?v=202611161500',   // John, Nov 9: Gmail phase 1 (staff only; the tab module refuses everyone else)
  documents: './dealdocs.js?v=202611162200',
  contacts: './dealcontacts.js?v=202611171040',
  activity: './dealactivity.js?v=202611161500',
  closing: './dealclosing.js?v=202611162300',
  agreements: './dealagreements.js?v=202611161500',
  accounting: './dealaccounting.js?v=202611171040',
  title: './dealtitle.js?v=202611161500',
  funding: './dealfwp.js?v=202611161500',
  wires: './dealfwp.js?v=202611161500',
  policy: './dealfwp.js?v=202611161500',
});
const TASK_FORM = './dealtaskform.js?v=202611171040';

function ownSpec(tab) {
  if (typeof tab !== 'string' || !Object.prototype.hasOwnProperty.call(TABS, tab)) return '';
  const spec = TABS[tab];
  return typeof spec === 'string' && spec ? spec : '';
}

export function dealTabSpec(tab, sub) {
  const spec = ownSpec(tab);
  if (!spec) return '';
  return tab === 'tasks' && sub ? TASK_FORM : spec;
}

let loadTab = (spec) => import(spec);

export function useDealTabLoader(next) {
  const prev = loadTab;
  loadTab = typeof next === 'function' ? next : prev;
  return () => { loadTab = prev; };
}

export function prefetchDealTab(tab, sub) {
  const spec = dealTabSpec(tab, sub);
  if (!spec) return null;
  let flight;
  try { flight = Promise.resolve(loadTab(spec)); }
  catch (err) { flight = Promise.reject(err); }
  flight.catch(() => {});
  return flight;
}
