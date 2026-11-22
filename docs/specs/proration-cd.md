# Prorations on the Closing Disclosure (FF-098)

Source: Francis Santos, email Nov 17 2026, 2:49 PM ET (Gmail message 1a1eb0eb7ee40f0c, subject "Proration Amount"). She was signed in as Processor 2 on TEST. The screenshot is the K and M screen on file MD-26-97407 (sale price $147,000.00, closing costs $6,636.00). City/Town Taxes, County Taxes, and Assessments under "Adjustments for Items Paid by Seller in Advance" have no amounts.

## What was asked

Property taxes and ground rent that a processor enters as prorations show up in the correct Closing Disclosure sections, the same way Qualia does it.

- An item the seller already paid is a charge to the buyer and a credit to the seller, in "Adjustments for Items Paid by Seller in Advance" (page 3, K and M).
- An unpaid item is a credit to the buyer and a charge to the seller (L and N).
- The same amount is on the settlement statement and the fee ledger.

CLA's defaults, already confirmed for PRORATE-1: tax prorations use a 365-day year, and the buyer pays for the settlement day. HOA fees are prorated the same way. Staff can change either one on a file. Ground rent uses the same day count.

## What was going wrong

On MD-26-97407 the only "Property taxes" line in the database is a $3,568.00 escrow deposit in section G. That amount is inside Closing Costs (K.03). It is not a proration, so K.08, K.09, and K.10 stay blank. No ground-rent proration was stored. The Taxes & Prorations screen calculated an amount on that screen and did not put it on the ledger until Add proration was clicked, so the Closing Disclosure sections stayed empty. A stored ground-rent or HOA proration also missed the named tax lines, and Closing Disclosure page 3 used a shorter list than the K/M screen.

## What it does

When the amount and the period are filled in and the calculation succeeds, the proration is saved on the fee ledger. Changing it saves again. The log keeps the change. Leaving that screen for another Accounting page saves it first, and what was typed stays if the save fails.

City/town taxes, county taxes (including a line described as property taxes), and assessments use those named lines. Ground rent, HOA, and any other proration use the next open line in the same section. The line includes the dates the adjustment covers. Closing Disclosure page 3 uses those same lines.

A section G escrow deposit named Property taxes stays in closing costs. It is not copied onto the proration lines.

## Worked example

Settlement July 1, 2026. The bill is $3,650.00 for calendar year 2026 (365 days). The per diem is $10.00. The buyer pays for July 1.

- Seller already paid the bill: the buyer is charged $1,840.00 (184 days, July 1 through December 31). County Taxes is K.09 and M.10.
- The bill is unpaid: the seller is charged $1,810.00 (181 days, January 1 through June 30). City/Town Taxes in that test is L.12 and N.14.
- Ground rent of $365.00 a year is $184.00, on the next K and M lines (K.11 and M.12).
- HOA dues of $100.00 a month, settlement July 15, 2026: $55.89 (17 buyer days), on K.11 and M.12.
- Charging the settlement day to the seller changes the paid county tax from $1,840.00 to $1,830.00. That file keeps the seller.

Cash to close on the first file, with the $400.00 Maryland water escrow, is $45,214.00. Cash to the seller is $99,814.00.

## What is not in this change

No database file. Nothing was applied on TEST. The escrow property-tax deposit is not turned into a proration by itself. Someone still enters the proration on Taxes & Prorations.
