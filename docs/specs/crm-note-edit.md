# Edit a CRM note (Feedback 27 item 1)

**Requested by:** Janine, the CRM user, confirmed Nov 16 2026. CRM Feedback 27, item 1.

**Status:** In progress. Pull request [338](https://github.com/Johncoester/cla-portal-demo/pull/338). No database file. Not on TEST until that pull request is merged. Not Live.

## What the user sees

On a Lead, a Client, and a Company, each note in the Notes list has an **Edit** button when the signed-in person wrote that note, or when they are an Admin or Super admin.

Edit opens the note with the words already filled in. Save keeps the correction on that same record. Cancel puts the original words back. If Save fails, the words they typed stay in the box, and the message says what went wrong.

A new note is not marked edited. After a real change, the note shows **Edited** and the time.

A note the CRM itself wrote (for example Archived) has no Edit button.

A processor does not get Edit, and does not get Add Note. Someone who can add notes, but did not write that note and is not an admin, sees the note and does not see Edit.

There is no Delete. The list still says notes are kept permanently.

## What is stored

The note is the same activity row. Save replaces the words. The database already stores who last changed an activity and when. The screen uses that time for the Edited line.

The person who first wrote the note stays the author.

## What this does not change

Notes still cannot be deleted. Edit does not move a note onto a different lead, client, or company. A note pasted on the wrong person can be corrected in place. It is not moved.

CRM deal records do not use this notes list. Nothing changes on a deal.

No database file is included. The Edit button and the portal save allow the author or an admin. A processor remains read-only.
