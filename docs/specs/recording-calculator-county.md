# Recording calculator county (REC-CALC-1)

Source: John Coester, Nov 14 2026, 6:07 PM ET, item 1 of the recording calculator fixes from Claude's review.

## What was going wrong

On the Accounting tab, Calculate fees from CLA rates used only the state taxes when the order's county was not on the rate sheet. A misspelling such as Mongomery still produced a total. On a $600,000 Montgomery purchase that total was $10,910 short, because the county recordation tax and the county transfer tax were left out. The calculator already knew the county was not on the list (`countyKnown`). Nothing looked at that answer.

## What it does now

1. If the county is not on CLA's rate list, the calculator does not run. It shows: "We couldn't find this county in CLA's rates. Pick the county from the list, then calculate again." It produces no fee lines. A blank county is treated the same way. The District of Columbia still calculates, because it is one jurisdiction.
2. A county that is on the list still calculates as before. Montgomery still includes the county recordation tax and the county transfer tax.
3. Place Order and Edit order details ask for County with a list, not a box you can type in. The list is the rate sheet's counties for the order's state. If the county was already saved and it is not on the list, it stays in the list labeled "(not matched)" so it can be read. The person then picks a county that is on the list. Leaving County blank still fills it from the address or the ZIP.

## What is not in this change

No database file. Other items from the same Nov 14 message are separate. Orders outside Maryland, Virginia, the District of Columbia, and Florida were already outside CLA's rates, and they still are.
