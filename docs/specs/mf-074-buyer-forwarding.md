# Remove Forwarding Address from Buyer Intake (MF-074)

Source: Matt Landsberg, Portal Feedback email Nov 25 2026, 2:47 PM ET (Gmail 1a214404e5bc56be). Confirmed 3:02/3:03 PM ET (1a2144e1f7c52248, 1a2144f23e866a64). Tracker row MF-074.

## What it does

Buyer Intake (Personal information) no longer asks for a forwarding address. Sellers still have the field on Personal information, and they still get the separate Forwarding address task (street, city, state, ZIP).

## What stays the same

- Current address on the buyer form stays.
- A buyer copy that already has a saved forwarding address keeps that version and the saved answer.
- Citizenship, and every other personal question, is unchanged.

## Database

`supabase/migrations/20261131080000_personal_info_v9.sql` publishes personal_info v9 from v8 by setting `forwarding_address` roles to Client-Seller only. Only untouched to-do copies with no answers move to v9. Rollback: `supabase/rollbacks/20261131080000_personal_info_v9.sql`. No RLS, GRANT, or function change.
