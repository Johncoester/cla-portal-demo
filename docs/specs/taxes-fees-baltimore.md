# Baltimore City taxes and who pays (FF-091b)

Source: Francis Santos, reply Nov 17 2026, 1:55 PM ET (Gmail message 1a1eaddb3dcfc5d6) to the Taxes & Fees questions on FF-091. She said the calculator figure is not enough: use the correct Baltimore City tax calculation, let staff choose Buyer pays, Seller pays, or 50/50 split from the contract, and apply the Maryland first-time homebuyer exemptions. Tracker FF-091b.

The 2:12 PM message the same day (1a1eaed436b0de49) is the separate address and county error (FF-095). This change does not touch that.

## What was asked

On Taxes & Fees, for a Baltimore City file:

- Transfer tax and recordation tax use CLA's rate sheet. No new rates.
- Each tax can be Buyer pays, Seller pays, or 50/50 split. The start comes from the contract. Staff can change it on that file.
- A Maryland first-time homebuyer exemption applies when the file says the buyer is a first-time buyer and the home is their primary residence. Both fields already exist on the file.

## What it does

Francis Santos, Nov 17 2026, 3:55 PM ET (message 1a1eb4b8017fcabf): figure the tax first, take exemptions off that total, then allocate. The county default is the rate sheet's Paid By. Staff can change it for the executed contract. A line the law fixes stays locked and says why.

Amounts still come from the vendored CLA calculator. This screen does not keep a second rate table.

Baltimore City, from the rate sheet already in the portal:

- Transfer tax is 1.5% up to $1,000,000. An owner-occupant at $249,900 or less has the first $22,000 exempt. At $249,900.01 through $1,000,000 there is no $22,000 exemption. Above $1,000,000 the rate is 2.1%.
- Recordation tax is $5.00 per $500 up to $1,000,000, and $5.75 per $500 above that. The sheet's $22,000 owner-occupant exemption is on those recordation rows. It is not limited to $249,900 on the sheet, so the screen does not add that limit.
- Maryland state transfer tax is 0.5%. For a first-time buyer who will live in the home it is 0.25%, and the seller pays it. That payer cannot be changed. The calculator already locks it (Tax-Property 13-203).

Who pays starts from the rate sheet's Paid By. On Baltimore City transfer tax and recordation tax that is a 50/50 split, after the exemption has already come off the total. Staff can switch each of those taxes to Buyer pays, Seller pays, or 50/50 split for the executed contract. The choice is saved on the calculated fee. There is no new database file.

Maryland state transfer tax for a first-time buyer who will live in the home is locked to the seller. The screen says Tax-Property 13-203 and does not offer the three choices on that line.

The same who-pays choices show for other counties. Their amounts are unchanged. A refinance does not offer them, because the borrower pays the recordation tax.

The owner-occupant exemption is taken off the taxable amount, then the county default splits what is left. Francis's 3:55 PM rule settled that order.

A blank primary residence does not claim the exemption. It also does not raise the deed of trust recording fee. That higher fee is only when the file says the home is not a principal residence.

## What is not in this change

- No database file. Not applied on TEST. Not Live.
- The contract choice is the Buyer pays / Seller pays / 50/50 split on this screen. It is not a separate field on the order.
- Recording the mortgage at the same time as the deed, and any exemption the rate sheet does not list. Those are not asked, because the sheet has no rule for them.
- Editable rate sheets are FF-091c. This change does not build them.
- The address and county message on Calculate (FF-095) stays as it is on main.
- A document with no rate (FF-091a) is unchanged. The screen still does not invent a recording fee for it.
