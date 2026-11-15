# Recording calculator releases (REC-CALC-3)

Source: John Coester, Nov 14 2026, 6:52 PM ET, item 3 of the recording calculator fixes from Claude's review. Tracker row 299.

## What was asked

On a purchase, the Release row in Documents to record should start at the number of payoffs on the file. The person can change it. A count they already saved is kept. A Montgomery County purchase with one payoff should show a Recording fees – Release line of $50, paid by the seller.

## What it does

The starting release count on a purchase is how many payoffs are still on the file (0, 1, or 2, and so on, up to 10). Pages stay at 3. Calculating with one release on a Montgomery purchase adds Recording fees – Release for $50, paid by the seller. Two releases are $100, still paid by the seller. None means no release line.

If Calculate fees was already saved with a release count, that saved count is shown again. It is not replaced by a later change in the number of payoffs.

A refinance is not changed. It still starts with the calculator's own release count.

## What is not in this change

The live fee sheet (REC-CALC-4). No new database file. Payoffs were already stored.
