// File sidebar inside an order (FF-103). Rearranges links the portal already has.
// General, Title and Charges fold. Section headings are labels, not links.
// A role that could not open a page still does not see that link.
import { html, raw } from './ui.js?v=202611161500';
import { QC_SECTIONS } from './data/qualia-charges.js?v=202611243300';

const FOLD_KEY = 'cla-portal-new:file-nav-fold';
const BOOKS = { ledger: 1, receipts: 1, disbursements: 1, balances: 1, balancing: 1 };

function storedFold(name) {
  try {
    const map = JSON.parse(sessionStorage.getItem(FOLD_KEY) || '{}');
    if (map && map[name] === '0') return false;
  } catch (e) { /* private mode, or no sessionStorage in a test */ }
  return true;
}

function fold(name, title, inner, current) {
  if (!inner) return '';
  const open = current || storedFold(name);
  return html`<li class="nav-fold"><details data-nav-fold="${name}"${open ? raw(' open') : ''}><summary>${title}</summary><ul class="nav nav-pills">${inner}</ul></details></li>`;
}

function item(href, label, on, attrs, lbl, tip, iconId, betaId, betaTag) {
  return html`<li class="nav-item"><a class="nav-link documents${on ? ' active' : ''}" href="${href}"${raw(attrs)}${betaId ? raw(' data-beta-nav') : ''}${tip(label, !!betaId)}>${lbl(iconId || 'documents', label)}${betaId && betaTag ? betaTag(betaId) : ''}</a></li>`;
}

// Staff who can already open Accounting. Buyers, sellers and agents stay on the shorter menu in app.js.
export function staffDealNav(o) {
  const dealId = o.dealId;
  const tab = o.tab || 'overview';
  const view = o.view || '';
  const section = o.section || '';
  const focus = o.focus || '';
  const base = `#/deals/${dealId}`;
  const acct = `${base}/accounting`;
  const chargeSec = section || (view === 'charges' ? 'A' : '');
  const lbl = o.lbl;
  const tip = o.tip;
  const betaTag = o.betaTag;
  const onView = (v, s) => tab === 'accounting' && view === v && (s == null || chargeSec === s) && !focus;
  const go = (href, label, on, attrs, iconId, betaId) => item(href, label, on, attrs, lbl, tip, iconId, betaId, betaTag);

  const basic = go(`${acct}?v=contract`, 'Basic Info', onView('contract'), ' data-nav-basic', 'orders');
  const contacts = o.link('contacts', 'Contacts', 'contact-us');
  // Loan (John, Nov 19 2026): the loan details the Closing Disclosure prints. Title's "Loan check" is still a step inside the Title tab.
  const loan = go(`${acct}?v=loan`, 'Loan', onView('loan'), ' data-nav-loan', 'documents');
  const earnest = go(`${acct}?v=contract&focus=earnest`, 'Earnest & Commissions', tab === 'accounting' && view === 'contract' && focus === 'earnest', ' data-nav-earnest', 'documents');
  const taxes = o.payoffsReach ? go(`${acct}?v=taxes`, 'Taxes & Prorations', onView('taxes'), ' data-nav-taxes', 'documents') : '';
  const payoffs = o.payoffsReach && o.payoffsOn ? go(`${acct}?v=payoffs`, 'Payoffs', onView('payoffs'), ' data-nav-payoffs', 'documents', o.payoffsBeta ? 'payoffs' : '') : '';
  const other = o.payoffsReach ? go(`${acct}?v=othercontacts`, 'Other Contacts', onView('othercontacts'), ' data-nav-othercontacts', 'contact-us') : '';
  const generalCurrent = (tab === 'contacts') || (tab === 'accounting' && (view === 'contract' || view === 'loan' || view === 'taxes' || view === 'payoffs' || view === 'othercontacts'));
  const general = fold('general', 'General', html`${basic}${contacts}${loan}${earnest}${taxes}${payoffs}${other}`, generalCurrent);

  const titleBeta = o.titleBeta ? 'title' : '';
  const cpl = o.titleOn ? go(`${base}/title?v=cpl`, 'CPL', tab === 'title' && view === 'cpl', ' data-nav-cpl', 'documents', titleBeta) : '';
  const policyInfo = o.titleOn ? go(`${base}/title?v=policies`, 'Policy Info & Rates', tab === 'title' && view === 'policies', ' data-nav-policy-info', 'documents', titleBeta) : '';
  const commitment = o.titleOn ? go(`${base}/title?v=schedulea`, 'Commitment', tab === 'title' && view === 'schedulea', ' data-nav-commitment', 'documents', titleBeta) : '';
  const finalPolicy = o.policyOn ? go(`${base}/policy`, 'Final Policy', tab === 'policy' && !view, ' data-nav-final-policy', 'documents', o.policyBeta ? 'policy' : '') : '';
  const titleCurrent = (tab === 'title' && (view === 'cpl' || view === 'policies' || view === 'schedulea' || view === 'loan')) || (tab === 'policy' && !view);
  const title = (o.titleOn || o.policyOn) ? fold('title', 'Title', html`${cpl}${policyInfo}${commitment}${finalPolicy}`, titleCurrent) : '';

  const chargesInner = QC_SECTIONS.map(([key, chip, label]) => go(`${acct}?v=charges&s=${key}`, `${chip} ${label}`, tab === 'accounting' && view === 'charges' && chargeSec === key, ` data-qc-nav-sec="${key}"${key === 'A' ? ' data-acct-tab="charges"' : ''}`, 'documents')).join('');
  const charges = fold('charges', 'Charges', raw(chargesInner), tab === 'accounting' && view === 'charges');

  const acctBeta = o.acctBeta ? raw(' data-beta-nav') : '';
  const accounting = html`<li class="nav-item"><a class="nav-link documents${tab === 'accounting' && BOOKS[view] ? ' active' : ''}" href="${acct}?v=ledger" data-nav-accounting${acctBeta}${tip('Accounting')}>${lbl('accounting', 'Accounting')}${o.acctBeta ? betaTag('accounting') : ''}</a></li>`;

  const cd = go(`${acct}?v=cd`, 'Closing Disclosure', onView('cd'), ' data-nav-cd data-acct-tab="cd"', 'documents');
  const alta = go(`${acct}?v=alta`, 'Settlement Statement', onView('alta'), ' data-nav-alta data-acct-tab="alta"', 'documents');
  const tools = html`${go(`${acct}?v=prorations`, 'Prorations', onView('prorations'), ' data-nav-prorations data-acct-tab="prorations"', 'documents')}${go(`${acct}?v=cddetails`, 'CD details & escrow', onView('cddetails'), ' data-nav-cddetails data-acct-tab="cddetails"', 'documents')}${go(`${acct}?v=payments`, 'Payment summary', onView('payments'), ' data-nav-payments data-acct-tab="payments"', 'documents')}${go(`${acct}?v=history`, 'Edit history', onView('history'), ' data-nav-history data-acct-tab="history"', 'documents')}`;

  const funding = o.fundingOn ? go(`${base}/funding`, 'Loan Funding', tab === 'funding', ' data-nav-acct="funding"', 'documents', o.fundingBeta ? 'funding' : '') : '';
  const post = o.postClosingOn ? go(`${acct}?v=postclosing`, 'Post-Closing', onView('postclosing'), ' data-nav-postclosing', 'documents') : '';
  const recording = o.recordingOn ? go(`${acct}?v=postclosing`, 'E-Recording', false, ' data-nav-recording', 'documents') : '';
  const wires = o.wiresOn ? o.link('wires', 'Wires', 'documents', o.wiresBeta) : '';

  return html`<li class="nav-sep" data-nav-section="order">Order</li>${general}${title}<li class="nav-sep" data-nav-section="closing">Closing</li>${charges}${accounting}<li class="nav-sep" data-nav-section="preview">Preview</li>${cd}${alta}<li class="nav-sep" data-nav-section="tools">CLA tools</li>${tools}${o.link('closing', 'Scheduling Details', 'task')}${o.link('agreements', 'Agreements', 'documents')}${o.link('activity', 'Activity', 'activity')}${post}${recording}${wires}${funding}`;
}

export function wireFileFolds() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-nav-fold]').forEach((d) => {
    d.addEventListener('toggle', () => {
      const map = {};
      document.querySelectorAll('[data-nav-fold]').forEach((x) => { map[x.getAttribute('data-nav-fold')] = x.open ? '1' : '0'; });
      try { sessionStorage.setItem(FOLD_KEY, JSON.stringify(map)); } catch (e) { /* private mode */ }
    });
  });
}
