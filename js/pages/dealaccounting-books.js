/* Accounting section pages (FF-061): Receipts, Disbursements, Account Balances, Balancing.
   The numbers are the file's test ledger. Nothing here is a bank balance, a deposit, a check, or a wire. */
import { html } from '../ui.js?v=202611161500';

const cents = (n) => Math.round((Number(n) || 0) * 100);
const money = (c) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const add = (list, label, amount, who) => { if (amount) list.push({ label, cents: amount, who: who || '' }); };

// The same money the balance check already counts. Receipt lines add up to totals.receipts.
// Disbursement lines add up to totals.disbursements. Retired lines are left out.
export function bookLines(entries, totals = {}) {
  const receipts = [];
  const disbursements = [];
  const buyer = totals.refi ? 'Borrower' : 'Buyer';
  for (const e of entries || []) {
    if (!e || e.retired) continue;
    const amt = cents(e.amount);
    if (e.kind === 'charge') {
      if (e.timing === 'before' || e.poc) continue;
      const sp = e.split || {};
      const g = e.reduces ? -1 : 1;
      add(receipts, e.description, cents(sp.lender) + cents(sp.other), 'Lender / other');
      add(disbursements, e.description, g * amt, e.payee || '');
    } else if (e.autoKey === 'excessDeposit') add(receipts, e.description, -amt, 'Already with the seller');
    else if (e.from !== 'buyer' && e.from !== 'seller') add(receipts, e.description, amt, e.from || '');
  }
  add(receipts, `Due from ${buyer.toLowerCase()} at closing`, cents(totals.dueFromBuyer), buyer);
  add(receipts, 'Due from seller at closing', cents(totals.dueFromSeller), 'Seller');
  add(disbursements, `Due to ${buyer.toLowerCase()}`, cents(totals.dueToBuyer), buyer);
  add(disbursements, 'Due to seller', cents(totals.dueToSeller), 'Seller');
  return { receipts, disbursements };
}

const table = (rows, whoLabel, totalCents, hook) => html`<table class="tbl striped" data-book-table="${hook}"><thead><tr><th>Description</th><th>${whoLabel}</th><th class="num">Amount</th></tr></thead><tbody>
  ${rows.length ? rows.map((r) => html`<tr><td>${r.label}</td><td>${r.who || ''}</td><td class="num">${money(r.cents)}</td></tr>`) : html`<tr><td colspan="3" class="muted">None.</td></tr>`}
  <tr><td><strong>Total</strong></td><td></td><td class="num" data-book-total="${hook}"><strong>${money(totalCents)}</strong></td></tr></tbody></table>`;

export function booksHtml(view, acc, base) {
  const totals = (acc && acc.totals) || {};
  const lines = bookLines(acc && acc.entries, totals);
  const none = !(acc && acc.entries && acc.entries.some((e) => e && !e.retired));
  const receiptCents = cents(totals.receipts);
  const disbCents = cents(totals.disbursements);
  const diff = receiptCents - disbCents;
  if (view === 'receipts') {
    return html`<div class="card" data-book="receipts"><h3>Receipts</h3>
      <p class="muted small">Money coming into this file, taken from the test ledger. This is not a deposit at the bank, and nothing is received from this page.</p>
      ${none && !lines.receipts.length ? html`<p class="notice info" data-book-empty>No receipts on this file yet. A deposit, a loan, or other money in shows up here once it is on the ledger.</p>` : table(lines.receipts, 'From', receiptCents, 'receipts')}
      <p class="small"><a href="${base}?v=ledger">Open the Ledger</a> to add or change a line.</p></div>`;
  }
  if (view === 'disbursements') {
    return html`<div class="card" data-book="disbursements"><h3>Disbursements</h3>
      <p class="muted small">Money going out of this file, taken from the test ledger. This page does not print a check or send a wire.</p>
      ${none && !lines.disbursements.length ? html`<p class="notice info" data-book-empty>No disbursements on this file yet. Fees and proceeds show up here once they are on the ledger.</p>` : table(lines.disbursements, 'Payee', disbCents, 'disbursements')}
      <p class="small"><a href="${base}?v=ledger">Open the Ledger</a> to add or change a line.</p></div>`;
  }
  if (view === 'balances') {
    const state = none ? 'none' : totals.balanced ? 'ok' : 'out';
    return html`<div class="card" data-book="balances" data-balance="${state}"><h3>Account balances</h3>
      <p class="muted small">The book balance for this file, from the test ledger. This is not a balance at the bank.</p>
      ${none ? html`<p class="notice info" data-book-empty>No book balance yet. Contract figures are not posted here, and a blank is not zero.</p>` : html`<table class="tbl" data-book-table="balances"><tbody>
        <tr><th>Funds in</th><td class="num" data-book-in>${money(receiptCents)}</td></tr>
        <tr><th>Funds out</th><td class="num" data-book-out>${money(disbCents)}</td></tr>
        <tr><th>Difference</th><td class="num" data-balance-diff>${money(diff)}</td></tr>
      </tbody></table>`}
      <p class="small"><a href="${base}?v=balancing">Open Balancing</a> to see whether the file matches.</p></div>`;
  }
  const state = none ? 'none' : totals.balanced ? 'ok' : 'out';
  const issues = totals.issues || [];
  return html`<div class="card" data-book="balancing" data-balance="${state}"><h3>Balancing</h3>
    <p class="muted small">Whether the money in and the money out on this file match. These are test figures, not a bank reconciliation.</p>
    ${none ? html`<p class="notice info" data-book-empty>No verified ledger lines. Enter the sale price and the loan amount on File Overview, then add the fees on the Ledger.</p>`
      : totals.balanced ? html`<p class="notice info" data-book-ok>This file is in balance. Funds in ${money(receiptCents)} match funds out ${money(disbCents)}.</p>`
      : html`<div class="notice warn" data-balance-issues><strong>This file is out of balance.</strong> Funds in are ${money(receiptCents)} and funds out are ${money(disbCents)}.
        ${issues.length ? html`<ul>${issues.map((i) => html`<li>${i}</li>`)}</ul>` : ''}</div>`}
    ${!none && !totals.balanced ? html`<p>Open the <a href="${base}?v=ledger">Ledger</a>, correct the lines named above, then open Balancing again.</p>` : html`<p class="small"><a href="${base}?v=ledger">Open the Ledger</a></p>`}
  </div>`;
}
