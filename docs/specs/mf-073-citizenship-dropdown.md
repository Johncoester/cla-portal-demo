# Citizenship dropdown (MF-073)

Source: Matt Landsberg, Portal Feedback email Nov 25 2026 (item 11 uncommented). Janine replied the same day: "11. Yes, we can switch to the dropdown." Tracker item MF-073, which supersedes JN-CITIZEN-1. PR 334 stays merged; its free-text file is not edited.

## How it should work

On Personal information, for a buyer and for a seller, Citizenship is a dropdown with four options: U.S. Citizen, U.S. National, Lawful Permanent Resident, and Non-Citizen Authorized to Work. The spouse section uses the same list. Leaving it blank is allowed.

An answer already typed (for example "US Citizen", "US", or "Canada") still shows, as the selected option, and can be saved again. It stays until someone picks one of the four options or clears the field. A new value that is not in the list cannot be typed in.

## What this does not do

It does not change `private.validate_form` or any security-function, RLS, or guard. Existing leftover answers stay valid because the database file adds those leftover strings (and a short historical list) to the stored `opts` used by the current validator. The form itself only offers the official four options, plus the leftover already on that file.

It does not rewrite saved answers, and it does not change `spouse_info.citizenship` (still plain text, no enum).
