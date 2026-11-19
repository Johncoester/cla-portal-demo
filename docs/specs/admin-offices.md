# Admin Offices (FF-102)

Source: John Coester, Nov 18 2026, 2:14 PM ET (via Francis Feedback): "we should be able to create our own offices in an admin section". Tracker row FF-102.

## What already existed

Admin > Offices was already in the portal (John, Nov 4). Admins and Super admins could add, edit, reorder, and retire (not delete) CLA offices. FF-101d (`20261125300000`) added `used_for_settlements` and made settlement pickers read that flag (Towson, Rockville, Bethesda seeded on).

## What this change adds

- A **Used for settlements** checkbox on each office (and a chip on the list).
- `save_office` accepts the flag so an Admin can change it (RPC still Admin / Super admin only).
- Direct insert/update/delete on `public.offices` is revoked for portal roles; select stays for signed-in users.
- Reuses FF-101d's picker code. Does not re-add the column or re-seed the three offices.

## Not in this change

- Applying the database file on TEST.
- Changing which offices are seeded (that is FF-101d).
