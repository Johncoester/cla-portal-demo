# Taxes and fees address (FF-095)

Source: Francis Santos, email Nov 17 2026, 2:12 PM ET (Gmail message 1a1eaed436b0de49), subject "Recording Fees- Taxes & Fees Section". Tracker FF-095. High, bug. She was signed in as Processor 2 on TEST.

## What was going wrong

On Taxes & Fees, Calculate showed two messages at once, and every total stayed $0.00. Line 01 stayed "Recording fees (add them in Settings)".

The red message said a complete property address was still needed. The amber message said the county was not in CLA's rates. The street, city, and ZIP were already on the file.

The screen treated a blank county as a missing address. A blank county is also not a county the rate sheet can price, so both messages appeared and no fee was calculated.

County is stored as a name, not an id. Processors can read the address columns. The rate tables are the vendored calculator, not a database table, so row security on a rate table was not the cause.

Two Processor 2 files matter:

- MD-26-97386 already has street, city, ZIP, and county "Baltimore City". Baltimore City and Baltimore County stay different places. That file already calculated.
- MD-26-97407, opened Nov 17 2026 at 1:17 PM ET, about an hour before the email, has the street, city, and ZIP filled and the county blank. The file state is Maryland. ZIP 33319 is Broward County, Florida, so the ZIP filler did not invent a Maryland county.

## What it does

The red message shows only when the street, the city, or the ZIP is missing.

A county saved on the file is used as written. "Baltimore City" stays Baltimore City. "Baltimore County" stays Baltimore County. A saved county that is not a county of that state is still refused.

When the county is blank and the ZIP is in the file's state, Calculate uses that county and says so. ZIP 21223 is Baltimore City, not Baltimore County. When there is no ZIP, and the city itself is a county (Baltimore City), Calculate uses the city.

When the ZIP is in a different state, Calculate does not guess. It says the address is on the file, names the county and state the ZIP belongs to, and asks the processor to set the state or pick the county. No fee is invented.

Nothing is written back to the file. There is no database file.

## What is not in this change

- The file's state is not changed to match the ZIP.
- A county someone saved that is not a real county of that state is still refused.
- Not applied on TEST. Not Live.
