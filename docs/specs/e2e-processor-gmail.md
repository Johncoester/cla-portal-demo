# E2E processor Gmail (E2E-PROC-GMAIL)

Source: John Coester, Nov 13 2026, 12:26 PM ET (t1602u). Tracker row E2E-PROC-GMAIL.

## What was going wrong

The walkthrough signs in as clatestportal+e2e-processor@gmail.com and sends a file email from that login's connected Gmail. Connect Gmail refused every address that is not @clatitle.com, so that login could not connect clatestportal@gmail.com. Send stayed disabled.

## What it does now

1. That one portal login may connect clatestportal@gmail.com. The Google screen for that login is not limited to @clatitle.com accounts, and the hint is clatestportal@gmail.com.
2. Every other login still has to connect an @clatitle.com account. A different Gmail address, including a plus-alias of the test inbox, is refused for the test processor too.
3. The database check is the same rule. The button and the database both have to be updated before it works on TEST. This change does not apply the database file and does not deploy the Gmail functions.

## What is not in this change

The staff Google app is an internal @clatitle.com app. Google itself may still refuse clatestportal@gmail.com on that consent screen. Nothing here changes that Google app. The 25 MB upload limit from the same tracker note is not in this change.
