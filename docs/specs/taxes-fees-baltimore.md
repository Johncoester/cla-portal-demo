# Baltimore City taxes and who pays (FF-091b)

Source: Francis Santos, reply Nov 17 2026, 1:55 PM ET (Gmail message 1a1eaddb3dcfc5d6) to the Taxes & Fees questions on FF-091. She said the calculator figure is not enough: use the correct Baltimore City tax calculation, let staff choose Buyer pays, Seller pays, or 50/50 split from the contract, and apply the Maryland first-time homebuyer exemptions. Tracker FF-091b.

The 2:12 PM message the same day (1a1eaed436b0de49) is the separate address and county error (FF-095). This change does not touch that.

## What was asked

On Taxes & Fees, for a Baltimore City file:

- Transfer tax and recordation tax use CLA's rate sheet. No new rates.
- Each tax can be Buyer pays, Seller pays, or 50/50 split. The start comes from the contract. Staff can change it on that file.
- A Maryland first-time homebuyer exemption applies when the file says the buyer is a first-time buyer and the home is their primary residence. Both fields already exist on the file.

## What it does

Amounts still come from the vendored CLA calculator. This screen does not keep a second rate table.

Baltimore City, from the rate sheet already in the portal:

- Transfer tax is 1.5% up to $1,000,000. An owner-occupant at $249,900 or less has the first $22,000 exempt. At $249,900.01 through $1,000,000 there is no $22,000 exemption. Above $1,000,000 the rate is 2.1%.
- Recordation tax is $5.00 per $500 up to $1,000,000, and $5.75 per $500 above that. The sheet's $22,000 owner-occupant exemption is on those recordation rows. It is not limited to $249,900 on the sheet, so the screen does not add that limit.
- Maryland state transfer tax is 0.5%. For a first-time buyer who will live in the home it is 0.25%, and the seller pays it. That payer cannot be changed. The calculator already locks it (Tax-Property 13-203).

Who pays starts from the rate sheet's Paid By. For a first-time buyer who will live in the home, it starts from the sheet's FTHB Paid By when that cell is Buyer, Seller, or Split. On Baltimore City transfer tax and recordation tax that cell is Seller. Staff can switch each of those taxes to Buyer pays, Seller pays, or 50/50 split. The choice is saved on the calculated fee with the rest of the worksheet. There is no new database file.

The same who-pays choices show for other counties. Their amounts are unchanged. A refinance does not offer them, because the borrower pays the recordation tax.

The owner-occupant exemption is taken off the taxable amount, then a 50/50 split divides what is left. That is what the rate sheet's columns support. Which side the exemption belongs to on a split is still an open question.

A blank primary residence does not claim the exemption. It also does not raise the deed of trust recording fee. That higher fee is only when the file says the home is not a principal residence.

## What is not in this change

- No database file. Not applied on TEST. Not Live.
- The contract's written split is not read from a field. See the open questions.
- The address and county message on Calculate (FF-095) is unchanged.
- A document with no rate (FF-091a) is unchanged. The screen still does not invent a recording fee for it.
- The state transfer tax for a first-time buyer stays with the seller. The three choices are not offered on that one tax.

## Open questions for John

1. Where does the contract's Buyer pays / Seller pays / 50/50 split live? `CONTRACT_TAX_PAYER_FIELD` in `js/data/taxes-fees.js` is blank. `title_reviews.transfer_tax_split` is free text and is empty on TEST. Until that field is named, the rate sheet is the start and staff change it on the file.
2. Which side does the owner-occupant exemption reduce when the tax is split? `OWNER_OCCUPANT_EXEMPTION_SIDE` is `exempted-total`. Melissa Gamble (Nov 16) said the buyer side unless the seller pays 100%. The sheet has no column for that. Do not switch it until John answers.
3. Should staff be able to move the Maryland state transfer tax off the seller for a first-time buyer? The calculator locks it. This change does not unlock it.
