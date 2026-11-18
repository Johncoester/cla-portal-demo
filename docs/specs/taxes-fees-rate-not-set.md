# Rate Not Set on Taxes & Fees (FF-091a)

Source: Francis Santos, Nov 17 2026, 1:55 PM ET, reply on "Francis: portal items to check on TEST" (Gmail message 1a1eaddb3dcfc5d6). She answered question 5a: a document with no rate must not be left blank. It should say "Rate Not Set" and let staff type the fee, so a charge is not missed. The same day's 2:12 PM ET note (Gmail message 1a1eaed436b0de49) is the recording-fees follow-up. Tracker FF-091a. The address and county error in that 2:12 PM note is FF-095 and is not this change.

## What was asked

On the Taxes & Fees screen (FF-091), any document or line with no rate in CLA's rates must not be left blank.

- Show Rate Not Set on that line.
- Let staff type the fee by hand.
- A typed amount saves, comes back after a reload, counts in the totals, and is marked entered by hand.
- Calculating again does not wipe a typed amount unless staff choose to replace it.

## What it does

Calculate fees still uses CLA's rate sheet. Deed, deed of trust, release, and power of attorney keep their calculated amounts.

A document the rate sheet does not price (affidavit, assignment of mortgage or lease, lis pendens, UCC, lease, easement), or a recording document the sheet has no fee for in that county, becomes its own line: "Recording fee: [document]". The line says Rate Not Set. The payee is the same recording office as the other recording lines. Nothing is invented.

Staff type the fee in that line before Apply, or later in the amount column on the charges. The amount is a dollar figure, or blank. Blank stays Rate Not Set and the line remains, so the document is not missed. A value that is not a dollar amount stays on the form and says to enter an amount like 45.00.

Apply saves the typed fee on the charge. The row says Entered by hand. The amount is included in the Taxes & Fees totals, and it follows the charge onto the settlement statement and the Closing Disclosure the same way the other section E lines do.

Calculate fees again shows the saved amount and leaves it. The checkbox "Replace the amount entered by hand" is what lets a new figure replace it. Clearing the amount returns the line to Rate Not Set. Removing the document keeps a fee that was entered by hand. A Rate Not Set line that never had an amount comes off when that document is removed.

## What is not in this change

- No new database file. Not applied on TEST. Not Live.
- Baltimore City transfer tax (buyer, seller, or 50/50, and the first-time buyer exemptions) was in the same reply and is not this change.
- FF-095, Calculate saying the address or county is missing, is not this change.
- Title premiums are not changed.
