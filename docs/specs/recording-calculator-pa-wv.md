# Recording calculator: Pennsylvania, West Virginia and Michigan (REC-CALC-8)

**Asked by:** John Coester, Nov 23 2026 (voice): "update the recording spreadsheet and update the calculator so we can now select West Virginia, Pennsylvania." Recording fees and taxes should match CLA's Lodestar calculator. Premiums should follow Fidelity's rates. Janine and Francis enter CLA's own settlement fees.

## How it should work

1. Calculate fees works on PA and WV orders, like MD, VA, DC and FL.
2. Recording fees and transfer/excise taxes come from the live fee sheet (the same rows the website calculator uses). They match Lodestar, for example:
   - PA recording for a 3-page deed and 30-page mortgage: York $264.50, Philadelphia $527.50, Allegheny $400.
   - WV recording: $111.
3. PA realty transfer tax:
   - The state's 1% plus the local rate, split 50/50.
   - Local rate: Philadelphia 3.578%. Some municipalities have their own rate (Pittsburgh 4%, Reading 4%, Scranton 2.7%, ...). Everywhere else it is the standard 1%.
   - These municipality rows are written "County / Municipality" in the sheet's County/City column.
   - The order has no municipality field yet. Calculate fees uses the standard rate and warns, naming the county's municipalities that have their own rate. The engine already takes `area` when a caller passes one.
4. WV excise tax: the state's $1.10 per $500 plus the county rate ($1.10–$2.75 per $500). The seller pays it.
5. PA title premiums follow the TIRBOP rate manual (Nov 1, 2026):
   - Owner's and lender's issued together cost one charge on the higher amount.
   - Homeowner's (enhanced) costs the sale rate +10%. The +$400 applies only to the Expanded Coverage loan policy, which isn't quoted.
   - Refinances use the non-sale rate.
   - CPL is $125.
6. WV title premiums follow Fidelity's WV rate manual (Oct 21, 2026):
   - Owner's: $4.80 per $1,000 to $100k, then $3.60. Homeowner's is 120% of that.
   - Lender's issued with the owner's: $200.
   - Refinance: the full loan rate ($3.45 / $3.00 per $1,000).
   - Reissue: 70%.
   - ALTA 8.1: $15. CPL: $50 lender + $25 buyer.
7. No principal-residence or first-time-buyer questions in PA or WV (they change nothing there).

## Michigan (added Nov 24 2026, calculator PR #4)

- Recording: $30 per document, any number of pages, except deeds at $35 because Lodestar charges $35 in every county checked.
- Transfer tax: the seller pays the state's $3.75 and the county's $0.55 per $500.
- The owner's policy is paid by the seller (Michigan custom).
- Premiums follow Fidelity's Michigan residential manual (Feb 12, 2025):
  - The manual has no discount for a lender's policy issued with the owner's, and none for reissue.
  - Residential endorsements cost nothing.
- Checked against Lodestar for $400k / $320k in 7 counties:
  - Recording: $65.
  - Seller transfer tax: $3,440.
  - Homeowner's policy: $2,374.
  - Lender's policy: $1,222.

## Where it lives

- Rows: the live sheet's tabs (Recording_Fees, Transfer_Taxes, Premium_Tiers, Premium_Rules, Endorsements, CLA_Fees, Jurisdictions), added Nov 23 2026. The same rows are in `js/data/vendor/cla-calculator/fee-snapshot.js`.
- Code: calculator [PR 3](https://github.com/Johncoester/cla-closing-cost-calculator/pull/3), copied into `js/data/vendor/cla-calculator/calc-core.js`. `CALC_STATES`, `NO_OO` and the `area` option are in `js/data/fee-engine.js`.

## Not done here

- CLA's own PA/WV settlement fees (Janine and Francis enter them in CLA_Fees).
- A municipality field on the order.
