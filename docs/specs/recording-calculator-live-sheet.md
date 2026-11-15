# Recording calculator live sheet (REC-CALC-4)

Source: John Coester, Nov 14 2026, 6:52 PM ET, item 4 of the recording calculator fixes from Claude's review. Tracker row 300.

## What was asked

The portal was using a saved copy of CLA's rates from November 2 (calculator commit 69568a9). When CLA updates the "CLA Fee Tables (Live - Calculator)" sheet, the portal should pick up the change. If the sheet cannot be reached, keep using the saved copy and say so. Show when the live rates were loaded.

## What it does

Opening Calculate fees reads the live sheet with the calculator's own loader. On the form it says "Rates from the live sheet, loaded [date and time]" in Eastern time. The preview and the applied fees use those rates.

If the sheet cannot be reached, the form says "Using the saved copy from Nov 15 because the live sheet couldn't be reached" and the fees come from that saved copy.

The portal's fee numbers are checked against the calculator's own calculation for Montgomery, Prince George's, Baltimore City, DC under and over $400,000, Fairfax, and a Maryland refinance. Those checks use the saved copy and do not call the sheet.

## What is not in this change

The calculator and the sheet are not changed. No new database file. The sheet is read without a password because it is shared to anyone with the link.
