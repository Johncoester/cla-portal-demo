# Taxes and fees documents (FF-091)

Source: Francis Santos, email Nov 16 2026, 3:10 PM ET (message 1a1e5fbfe4183a9f), with a Qualia-style Add Documents / View Taxes & Fees screenshot. Tracker FF-091.

## What was asked

On a file's Accounting tab, Taxes & Fees (Closing, Charges, section E) should work like the reference screen.

- Add document offers Affidavit, Assignment of Mortgage or Lease, Deed, Deed of Trust, Lis Pendens, Power of Attorney, Release of Mortgage, UCC, Lease, and Easement.
- Each document has a number of pages, a consideration amount, taxable yes or no, and the exemptions that county's rules actually use (primary residence / owner-occupied, and first-time buyer).
- Calculate fees shows recording fees, recordation tax, and transfer tax (city or county, and state). Each line shows the payee and who pays: Borrower, Seller, or Others, at closing or before closing.
- The choices and the amounts follow the file's state and county.
- A purchase starts with a deed, plus a deed of trust when the file has a loan. A refinance starts with a deed of trust, plus a release when the file has a payoff.
- The file's primary residence and first-time buyer answers fill those exemptions the first time.
- The lines go onto the charges, the settlement statement, and the Closing Disclosure the same way today's recording and tax lines do. A processor can still type over an amount.

## What it does

Calculate fees calls the portal's existing CLA calculator (the vendored calc-core.js, through fee-engine.js). It does not keep a second copy of the rate tables.

Deed, deed of trust, release of mortgage, and power of attorney are the four documents on the rate sheet. The other six can be added. The screen says CLA's rate sheet has no recording fee for that document, and it does not invent an amount. The processor types that fee on a line below if they have it.

Transfer and recordation tax follow the deed's consideration when the deed is taxable, and the deed of trust's consideration when that document is taxable. Marking a document not taxable drops the tax on that basis and still records it. In Maryland and the District of Columbia the deed asks primary residence and, on a purchase, first-time buyer, because those change the tax. The deed of trust asks primary residence because a Maryland deed of trust that is not a principal residence records at the higher fee. Virginia and Florida do not ask those questions, because they do not change the calculator's result. A refinance asks for the payoff of the existing loan. A Virginia purchase asks for assessed value when it is higher than the price.

Nothing is written until Apply. New and changed lines are tagged from CLA rates. A line someone already changed by hand is kept. Title premiums, endorsements, and CLA settlement fees are not replaced by this button. On the Closing Disclosure, the recording fees still share line E.01, and the taxes stay on their own lines.

The document answers are saved on the calculated fee, in the same place as the other calculator answers. Opening Taxes & Fees again shows them. There is no new database file.

## What is not in this change

- REC-CALC-6 (PR 296, merged) is included. A county in Maryland, Virginia, Florida, or the District of Columbia that has no row of its own is still calculated, on the statewide rates. A name that is not a county of that state is still refused.
- The Qualia question "Is the security instrument recorded concurrently with the deed?" is not on CLA's rate sheet, so it is not shown.
- The per-document e-recording fee still comes from Calculate fees from CLA rates on the Fee ledger.
- Running Calculate fees from CLA rates on the Fee ledger can replace these recording and tax lines from that screen's own document counts. A line changed by hand is still kept.
- Not applied on TEST. Not Live.
