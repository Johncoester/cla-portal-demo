/* File-tab modules. Loading one evaluates local helpers only. It does not check who is signed in and it does not read a file. */
const TABS = Object.assign(Object.create(null), {
  tasks: './dealtasks.js?v=202611092320',
  inbox: './dealmsgs.js?v=202611091030',
  email: './dealemail.js?v=202611092210',   // John, Nov 9: Gmail phase 1 (staff only; the tab module refuses everyone else)
  documents: './dealdocs.js?v=202611091030',
  contacts: './dealcontacts.js?v=202611091616',
  activity: './dealactivity.js?v=202611070139',
  closing: './dealclosing.js?v=202611090935',
  agreements: './dealagreements.js?v=202611070139',
  accounting: './dealaccounting.js?v=202611091730',
  title: './dealtitle.js?v=202611090935',
  funding: './dealfwp.js?v=202611090935',
  wires: './dealfwp.js?v=202611090935',
  policy: './dealfwp.js?v=202611090935',
});
const TASK_FORM = './dealtaskform.js?v=202611092320';

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
