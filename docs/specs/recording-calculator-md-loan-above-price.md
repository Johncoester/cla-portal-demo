# Recording calculator: Maryland tax on the loan above the price (REC-CALC-7)

**Asked by:** John Coester, Nov 16 2026, after Claude ran Francis's closed files through the calculator. Melissa Gamble confirmed the rule by email the same day.

## How it should work

1. A Maryland purchase whose loan is bigger than the purchase price (FHA/VA with financed fees, investor rehab loans) pays county recordation tax on the part of the loan above the price. The purchase deed of trust is exempt only up to the price (Tax-Property 12-108(i)).
2. In Prince George's, that part also pays the 1.4% county transfer tax (the county taxes deeds of trust).
3. The buyer pays both. Each is its own line: "<tax name> on loan above price".
4. Rate: the bracket of the price (Whole brackets), or the bands from the price up to the loan (Marginal brackets, Montgomery).
5. No change when the loan is at or below the price, on a cash deal, on a refinance, or outside Maryland.
6. Assignment fees are not added to the price (Melissa Gamble, Nov 16).

## Examples (closed files)

| File | Price | Loan | Above the price | Recordation | PG transfer |
|---|---|---|---|---|---|
| MD-26-32159 (Prince George's) | $525,000 | $536,287 | $11,287 | $63.25 | $158.02 |
| MD-26-32155 (Prince George's) | $270,000 | $372,000 | $102,000 | $561.00 | $1,428.00 |

## Where it lives

- Calculator code: `loanAboveTax` in cla-closing-cost-calculator index.html (PR 2), copied into `js/data/vendor/cla-calculator/calc-core.js`.
- Portal explanation text: `taxExplain` in `js/data/fee-engine.js`.

## Not changed

- The Baltimore City owner-occupant exemption split. Melissa says it goes to the buyer's side; Lodestar and two closed files split it 50/50. Waiting on John.
