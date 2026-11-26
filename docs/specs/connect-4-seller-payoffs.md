# Seller mortgages on Payoffs (CONNECT-4)

Asked by John Coester, Nov 25 2026, 7:49 PM ET (t2081u), from the Connect Live Test Checklist, row 7.2 (Francis, Nov 23 2026): the seller's
lender and loan payoff info was "Not in the Payoff section, but under the seller's tasks, marked as done so the processor can see it." It must
create or fill in the order's Payoffs section, ready for the processor to order the payoff.

Pull request: [PR 452](https://github.com/Johncoester/cla-portal-demo/pull/452). No database file.

## How it works

- Accounting > Payoffs shows a card, **From the seller's Outstanding Mortgage task**, when a seller has saved that task: lender, phone, loan
  number and loan type for each mortgage (version 1 single-mortgage answers and version 2 lists both work; "No mortgage on this property" shows nothing).
- Each row says **On First Payoff** (a link to that tab) when a payoff already has the same loan number, or the same lender when the seller
  gave no loan number. Otherwise a Processor, Admin or Super admin sees **Add as <next free> Payoff**; **Add all N to Payoffs** appears when
  more than one is waiting and there are enough free tabs. Sales and TCs see "Not on Payoffs yet" with no button.
- Adding saves a payoff with the lender name and phone, the loan number, "mortgage: yes", and a note ("From the seller's Outstanding Mortgage
  Information task (HELOC, entered by …)"). It uses the existing payoff save, so the same checks and the payoff change log apply. Amounts stay
  blank for the payoff statement; no fee line is created until there is a total.
- The same loan entered by two sellers is listed once. A fifth payoff is refused in plain words.

## Not done

- No automatic creation without the processor's click (that would need a database trigger and a rule 27 review).

## Files

- `js/data/seller-payoffs.js`, `js/pages/dealpayoffs.js`
- Test: `test/test-connect-4-seller-payoffs.js`
- No database file.
