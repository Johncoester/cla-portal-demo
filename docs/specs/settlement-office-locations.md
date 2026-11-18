# Settlement office locations (FF-101d)

Source: Francis Santos, Gemini notes "Portal review" Nov 18 2026, 11 AM (Gmail 1a1ef9d3d862da08). John confirmed Nov 18 2026, 2:13 PM ET. Tracker FF-101d. Notes said "Talson" / "Rockwell"; those mean Towson and Rockville.

## What the user sees

On Schedule the Settlement (agent task) and on Scheduling Details (processor and party links), when someone picks a CLA office, the list is only the offices marked **used for settlements**. After this change that starts as Towson, Rockville and Bethesda. Rockville is the main office. Other CLA offices stay in Admin > Offices but are not offered for new settlement picks. A retired office never appears. If a pending proposal already names another office, that name still shows on the file.

## Decisions

- Drive the picker from `public.offices.used_for_settlements`, not from hard-coded names in the page.
- Do not delete office rows. Turn the flag on for Towson, Rockville and Bethesda; leave it off for the rest.
- FF-102 (separate pull request, migration `20261125310000`) adds the Admin UI to tick that flag.
- Nearest-office default for settlement uses only offices with the flag on.

## Not in this change

- Admin checkbox to edit the flag (FF-102).
- Applying the database file on TEST.
