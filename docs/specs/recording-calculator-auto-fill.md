# Recording calculator: fees fill in by themselves (REC-CALC-9)

**Asked by:** John Coester, Nov 24 2026 (voice): "connect the calculator fees to the portal." The recording questions must be answered first. The number of payoffs is not a question, because it isn't known until title and the seller come in: "the basic stuff is fine."

## How it should work

1. When staff who run orders open a file, the portal fills in its fees from CLA rates without anyone pressing Calculate fees. This covers title premiums, endorsements, CLA's own fees, recording fees and transfer / recordation taxes.
2. It only fills in when the order has the basics:
   - the state (MD, VA, DC, FL, PA, WV or MI)
   - a county from the list
   - purchase or refinance
   - the purchase price (purchase) or the loan amount (refinance)
   - in MD and DC: primary residence, and first-time buyer on a purchase
3. While something is missing, the Accounting ledger says what the order still needs.
4. A purchase with no payoffs entered starts with one release. Payoffs already on the file set the count. The closer fixes it with Calculate fees once title is in.
5. It runs again when the state, county, type, price, loan or answers change after the last run. Lines changed by hand are kept, the same as Calculate fees.
6. It never runs on:
   - a Closed or Cancelled file
   - a file whose title or government fees were typed in by hand and that has no calculated lines yet (older files)
   For those, Calculate fees shows the comparison first.
7. Rates come from the live rate sheet, so Janine's changes apply on the next fill. If the sheet can't be reached, the saved copy is used.

## Where it lives

- `autoFillCheck` in `js/data/fee-engine.js`: whether the order is ready, and whether a fill is due.
- `autoFillFees(dealId)` in `js/data/supabase-accounting.js` and `js/data/mock-part-accounting.js`: runs the check, then the same apply as Calculate fees. One fill runs at a time per file; a second open waits for the first. If two applies still overlap, a conflict on the active calculated-fee key is treated as already present and the existing row is re-read (FEES-AUTOFILL-RACE, e2e runs 360/363/364).
- `js/pages/deal.js` runs it when a file opens (staff who run orders) and shows a message when fees changed.
- `js/pages/dealaccounting.js` runs it when Accounting opens and shows what it did, or what's missing, on the CLA rates card.
- Tests: `test/test-auto-fill-fees.js`, including two fills at once and two applies at once.
