# Earnest money holder dropdown (MF-063)

Source: Matt Landsberg, Portal Feedback email Nov 25 2026, 2:47 PM ET (Gmail 1a214404e5bc56be). Confirmed 3:02/3:03 PM ET and 4:35 PM ET (Gmail 1a214a29c1dc75c5). Tracker row MF-063.

## What it does

EMD held by is a dropdown: CLA Title, Listing Agent, Buyer's Agent, No EMD, Other Title Company or Attorney. Choosing No EMD sets the EMD amount to $0 and shows the due date as N/A (the date itself is cleared). Holders that were typed in before this change stay as they are until someone edits the file. Obvious older wording (for example "Listing brokerage") is only mapped on the screen, not rewritten in the database.

## What stays the same

- The holder is still stored as text on the order. There is no new database file and no check constraint.
- A refinance still has no EMD fields.
- There is no extra box for another company's name (Matt did not ask for one).
