/* File-tab modules. Loading one evaluates local helpers only. It does not check who is signed in and it does not read a file. */
const TABS = {
  tasks: './dealtasks.js?v=202611082000',
  inbox: './dealmsgs.js?v=202611070139',
  documents: './dealdocs.js?v=202611082000',
  contacts: './dealcontacts.js?v=202611070139',
  activity: './dealactivity.js?v=202611070139',
  closing: './dealclosing.js?v=202611070139',
  agreements: './dealagreements.js?v=202611070139',
  accounting: './dealaccounting.js?v=202611071820',
  title: './dealtitle.js?v=202611070139',
  funding: './dealfwp.js?v=202611070139',
  wires: './dealfwp.js?v=202611070139',
  policy: './dealfwp.js?v=202611070139',
};
const TASK_FORM = './dealtaskform.js?v=202611082000';

export function dealTabSpec(tab, sub) {
  if (!tab || tab === 'overview' || !TABS[tab]) return '';
  return tab === 'tasks' && sub ? TASK_FORM : TABS[tab];
}

export function prefetchDealTab(tab, sub) {
  const spec = dealTabSpec(tab, sub);
  return spec ? import(spec) : null;
}
