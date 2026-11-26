# MF-065 Preprocessor dropdown

Source: Matt Landsberg, Portal Feedback (Nov 25 2026, 2:47 PM ET): "Have list of pre-processor options in a dropdown."
Answer (Nov 25 2026, 9:29 PM ET, Gmail 1a215b008594e140): many people will get the pre-processor role; any random name is fine for testing.

## Behavior
- Place Order and Edit order details show a Preprocessor dropdown of every active staff login whose role is Preprocessor.
- Option label: `Name (Preprocessor) — email`. First option: `(none)`.
- **Refresh list** reloads the list and keeps the person already picked and everything else on the form.
- Empty list: a hint says an Admin can give a login the Preprocessor role under Users.
- A person already on the file stays selectable if they lose the role; saving without changing the Preprocessor does not send it again, so the order is not rejected and the person is not cleared.
- The hosted list uses the viewer's own demo scope, like the Processor list.
- Ellen's role is not changed.

## Not in this change
- Preprocessors opening any file (today only their own files): reported to Matts Feed Back.
- An action log that cannot be changed or deleted: reported to Matts Feed Back.

## Database
No migration. `supabase/scripts/mf-065-test-preprocessors.sql` adds three fake Preprocessors on TEST only (no login). Undo script alongside.
