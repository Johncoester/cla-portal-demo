# Recording calculator: Pennsylvania and West Virginia (REC-CALC-8)

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
   - Enhanced costs the sale rate +10% +$400.
   - Refinances use the non-sale rate.
   - CPL is $125.
6. WV title premiums: not yet loaded. Calculate fees warns until Fidelity's WV rate manual is in the sheet.
7. No principal-residence or first-time-buyer questions in PA or WV (they change nothing there).

## Where it lives

- Rows: the live sheet's tabs (Recording_Fees, Transfer_Taxes, Premium_Tiers, Premium_Rules, Endorsements, CLA_Fees, Jurisdictions), added Nov 23 2026. The same rows are in `js/data/vendor/cla-calculator/fee-snapshot.js`.
- Code: calculator [PR 3](https://github.com/Johncoester/cla-closing-cost-calculator/pull/3), copied into `js/data/vendor/cla-calculator/calc-core.js`. `CALC_STATES`, `NO_OO` and the `area` option are in `js/data/fee-engine.js`.

## Not done here

- CLA's own PA/WV settlement fees (Janine and Francis enter them in CLA_Fees).
- WV premiums (waiting on Fidelity's WV manual from John).
- A municipality field on the order.
