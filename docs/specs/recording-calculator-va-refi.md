# Recording calculator: Virginia refinance with no payoff, Hampton Roads fee (REC-CALC-5)

**Asked by:** John Coester, Nov 15 2026, after Claude's Lodestar comparison test (sheet "Calculator vs Lodestar Test", findings F1 and F2): "write them in and code it in".

## How it should work

1. **Virginia refinance with nothing paid off.** The reduced refinance recordation rate ($0.18 state per $100, Va. Code 58.1-803(E)) only applies when an existing loan is refinanced. When the payoff is $0, the loan is a new loan and is taxed at the full deed-of-trust rate: $0.25 state plus the local one-third. Example: Arlington, $350,000 loan, no payoff = $1,166.67 (was $840). A refinance with a payoff is unchanged.
2. **Hampton Roads fee.** Virginia purchases in the Hampton Roads transportation district (Chesapeake, Franklin, Hampton, Newport News, Norfolk, Poquoson, Portsmouth, Suffolk, Virginia Beach, Williamsburg, Isle of Wight, James City, Southampton, York) add the regional transportation improvement fee: $0.06 per $100, paid by the seller (Va. Code 58.1-802.5). Example: Virginia Beach, $515,000 = $309.

## Where it lives

- The rate is a row on the live "CLA Fee Tables (Live - Calculator)" sheet (Transfer_Taxes row 103, added Nov 15). The portal reads the live sheet (REC-CALC-4), so it applies right away.
- The refinance rule is in the calculator's own code (calculator PR #1), copied into `js/data/vendor/cla-calculator/` together with the saved copy of the rates, which now includes the Hampton Roads row.

## Not changed

- Anne Arundel lien certificate stays $0 (Melissa Gamble, Oct 26 2026: CLA does not order one there). Lodestar charges $50.
