# Cash to close from the order (QF-1)

Source: Francis's Qualia Fees / Closing Disclosure video, file MD-26-32954. John Coester, Nov 14 2026, 10:42 PM ET, "Fix it", option (a) in the write-up email (Gmail 1a1dd49d924d8841), section 6.2 item 1.

## What was asked

Sale price, deposit and loan amount must show on the Closing Disclosure the way Qualia shows them: read-only lines that come from the order. They must be counted in Cash to Close. They must not be saved as extra fee rows.

## What it does

On a purchase, K.01 and M.01 are the sale price, L.01 is the deposit, and L.02 is the loan amount. They are teal and say "From the order". Changing them is done on File Overview.

Cash to Close, the page 3 table, and the balance check use those amounts. On Francis's example the cash to close is $149,458.03.

If the sale price or the loan amount is missing on a purchase, the balance check does not say Balanced. A refinance still has no sale price or deposit. A loan of 0 is a cash purchase and is allowed.

If the fee ledger already has a typed line named Sale Price of Property, Deposit, or Loan Amount, that typed line is kept and the order figure is not added a second time. The balance check says so.

## What is not in this change

No database file. Agent fees and commissions are not changed. The other Qualia gaps in that email are not in this change.
