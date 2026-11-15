# Recording calculator documents (REC-CALC-2)

Source: John Coester, Nov 14 2026, 6:52 PM ET, item 2 of the recording calculator fixes from Claude's review. Tracker row 298.

## What was asked

On the Accounting tab, Calculate fees from CLA rates should ask which documents are being recorded. There are four: deed, deed of trust, release, and power of attorney. Each one has a count and a number of pages. A purchase with a loan starts at one deed of 3 pages, one deed of trust of 30 pages, and no release or power of attorney. Those answers are used in the fee calculation and are saved so they come back. A value that is not a whole number in range is explained in plain words, and the calculator does not run until it is fixed.

## What it does

The section is Documents to record. Count is a whole number from 0 to 10. Pages is a whole number from 1 to 500. The starting counts are the calculator's own starting counts for that kind of file. A refinance still starts with one release. This change does not set the release count from the payoffs, and it does not connect the live fee sheet.

The counts are stored with the other calculator answers on the calculated fee. Opening Calculate fees again shows the saved counts. There is no new database file.

## What is not in this change

REC-CALC-3 (releases from the payoffs) and REC-CALC-4 (the live fee sheet).
