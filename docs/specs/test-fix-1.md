# Demo invite dates stay ahead of today (TEST-FIX-1)

Source: John Coester, Nov 17 2026. Tracker item TEST-FIX-1. No video.

## What was asked

The sample pending invite used a fixed expiry, 17 November 2026 at 15:00 UTC. After that moment the sign-in test treated the invite as expired, so the tests check would fail on every pull request. Make the pending sample expire 7 days from now, and the expired sample expire 1 day ago. Do the same for any other sample expiry that runs out within the next 30 days. Do not change what the test checks. Do not apply anything to TEST.

## What it does

A fresh demo builds Lena's invite as still pending and Evan's invite as already expired, whatever today's date is. Eli's HR invite stays pending and Ezra's stays expired the same way. Two email samples that named an expiry in the next 30 days now say 7 days from today. The setup form, the expired explanation, the email subject, and the "not sent" draft are checked the same way as before.

## Why the test files changed

The calendar date went stale. The behavior under test is unchanged. The cache-stamp lists record the new stamp on the two sample-data files (202611242100). Those lists were not loosened.

## What is not in this change

No screen change on testportal.clatitle.com. No database file. No SQL applied. No secrets. Accepted sample invites keep their old dates. Closing dates, task due dates, and the sample payoff good-through date stay as written. The shell cache stamp stays 202611242010.
