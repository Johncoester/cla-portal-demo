# File processor on Parties and Contacts (PROC-1 / PROC-2)

**Requested by:** John Coester, screen recording "Adding a processor" (Nov 14 2026, 1:55 PM ET; Drive file 19lS81bxUsHUwQPRdLXIGi79dmpFhXdn7). Confirmed Nov 14, 2:00 PM ET. Order MD-26-97260 on TEST.

**Status:** PROC-1 and PROC-2 in progress. See [ROADMAP.md](../../ROADMAP.md).

## What John saw

On the order's Contacts screen he added himself, a Super admin, with the role Processor. On File Overview > Parties the PROCESSOR row still said "Not specified" and the file still showed the red warning that it has no processor. Clicking that row did nothing.

## Why the two screens disagreed

Contacts writes a person onto the file (`deal_participants`, role Processor). File Overview reads the file's processor field (`deals.processor_id`) and the name that goes with it. Adding someone on Contacts did not set that field. Setting the field did not add the Contacts row.

## What PROC-1 does

The file's processor field stays the Processor the rest of the portal already uses. A database trigger keeps a matching Contacts row:

- Adding a Processor on Contacts sets the field, and drops any other Processor row on that file so there is one.
- Removing that person from Contacts clears the field.
- Setting or clearing the field (Edit order details, Place Order) adds or removes the Contacts row.
- The person must be an active staff login: Super admin, Admin, Processor, Preprocessor, Sales Person, Sales Team, or Transaction Coordinator (ANYROLE-1). A contact with no portal login can still be listed on Contacts as Processor. That listing is not the file's Processor. A demo login and a real file stay apart.

The one-time copy only updates files that look like seeded fake TEST data. It does not rewrite a file that has some other email on it. It does not run on production.

## What PROC-2 does

On File Overview, a person who can already edit parties clicks the Processor row, or Choose processor / Change processor. The list is every active staff login. Saving uses the same order update as Edit order details, so Contacts stays in step. Unassigned clears the Processor. Saving Unassigned when nobody is assigned says to choose a staff login or close the window, and leaves the form open. Anyone who cannot edit parties sees the row with no button.

## Not in this change

Clicking the row is PROC-2. Marking the item Live waits until the database file is applied on TEST.
