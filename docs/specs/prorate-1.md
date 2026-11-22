# Prorations and water escrow (PRORATE-1)

Source: Caroline Kim's email, Nov 16 2026, 2:18 PM ET (Gmail message 1a1e5cced6d02205), answering John's questions from Nov 15. John Coester confirmed this list on Nov 16 2026, 2:50 PM ET. Tracker row 322.

## What was asked

1. Tax prorations use a 365-day year. That was already the starting point. Keep it. The buyer pays for the settlement day. The screen was starting with the seller.
2. HOA fees are prorated the same way: a 365-day year, and the buyer pays for the settlement day.
3. Water escrow starts at $400 for Maryland and DC, $250 for Florida, and no water escrow for Virginia.

Staff can change any of these on one file. A file that already has a saved choice keeps that choice.

## What it does

On Taxes & Prorations, a new tax or HOA line starts on 365 days and "Proration date debited to: Buyer". HOA uses per diem, so the daily amount is the yearly dues divided by 365. Taxes still start on Installment (the days in that bill) with the year set to 365, which is how that screen already started. Switching the year to 360 or 366, or switching who pays the settlement day, still works and is saved on that file.

A new purchase file gets one Water escrow line when the state has one. Maryland and DC are $400. Florida is $250. Virginia gets no line. A refinance gets no line. The seller pays it at closing. It is held for the final water bill. It shows on the fee ledger, on Closing Disclosure section H, and on the Settlement Statement under Miscellaneous.

Changing the amount, who pays, or retiring the line is kept. Opening an older file does not add a water escrow, and it does not flip a proration that was already saved with the seller paying the settlement day.

## What is not in this change

The database file is in this pull request, with a rollback. It is not applied on TEST. Until it is applied, a new file on the test portal does not get the water escrow by itself. The demo portal used for the tests does.

Changing the property's state after the file is open does not rewrite a water escrow that is already saved.

ROADMAP.md is not updated in this pull request. Claude's open pull request 296 is already editing that file.
