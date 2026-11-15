# Unused money-input files (TEST-CLEANUP-MONEY)

Source: John Coester, Nov 14 2026, 1:41 PM ET, after Claude approved PR 269 (TEST-CLEANUP-4). Tracker row 292.

## What was asked

Remove the unused money-input files. The page file only passed the money helpers through from the shared constants. The two test loaders that pretended that page file had failed were only there for that extra file. Nothing on a screen should change.

## What it does

The money helpers stay in the shared constants, which is where the portal already reads them. The money-save check reads them from there too. The extra page file and the two unused test loaders are gone.

## What is not in this change

No screen change. No cache stamp. No database file.
