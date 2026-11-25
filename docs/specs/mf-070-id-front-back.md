# Require ID front and back (MF-070)

Source: Matt Landsberg, Portal Feedback email Nov 25 2026, 2:47 PM ET (Gmail 1a214404e5bc56be). Confirmed 3:02/3:03 PM ET. Passport one image confirmed 4:35 PM ET (Gmail 1a214a29c1dc75c5). Tracker row MF-070.

## What it does

The Upload identification task now asks for the front and the back of the ID. A passport needs only one image. This is the same form for buyers and sellers.

## What stays the same

- ID type and expiration date stay required.
- A copy that already has a saved ID stays on its old version, with the saved file.
- Image file names are unchanged here (that is MF-071).

## Database

`supabase/migrations/20261131090000_id_upload_v3.sql` publishes id_upload v3 from v2 and moves only untouched to-do copies with no answers. It also extends `private.validate_form` so a `when` condition can list more than one value, which is how the back field is hidden for a passport on the hosted save path. Rollback: `supabase/rollbacks/20261131090000_id_upload_v3.sql`.
