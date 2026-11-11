/* File-tab modules. Loading one evaluates local helpers only. It does not check who is signed in and it does not read a file. */
const TABS = Object.assign(Object.create(null), {
  tasks: './dealtasks.js?v=202611140400',
  spouse: './spouse.js?v=202611120200',
  inbox: './dealmsgs.js?v=202611111700',
  email: './dealemail.js?v=202611140400',   // John, Nov 9: Gmail phase 1 (staff only; the tab module refuses everyone else)
  documents: './dealdocs.js?v=202611131900',
  contacts: './dealcontacts.js?v=202611140400',
  activity: './dealactivity.js?v=202611111700',
  closing: './dealclosing.js?v=202611121300',
  agreements: './dealagreements.js?v=202611111700',
  accounting: './dealaccounting.js?v=202611140400',
  title: './dealtitle.js?v=202611112200',
  funding: './dealfwp.js?v=202611112100',
  wires: './dealfwp.js?v=202611112100',
  policy: './dealfwp.js?v=202611112100',
});
const TASK_FORM = './dealtaskform.js?v=202611140400';

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
