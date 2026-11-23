# MF-060: disbursement date follows the settlement date (purchase only)

**Asked by:** Matt Landsberg, "Portal Feedback Nov 22" (notes doc https://docs.google.com/document/d/17GqvpKFugQPTiZRxirUALImu1yCsXZsV3u1fJmWLoYg/edit and recording). Confirmed with corrections in Matt's reply Nov 22 2026, 1:54 PM ET (Gmail 1a2049c9ec631d7b): "THIS IS FOR A PURCHASE ONLY. NOT FOR REFINANCES." Still editable by hand afterward: "YES". Tracker row 438.

## How it works

- On a purchase file, when the settlement (closing) date changes, the disbursement date changes to match it.
- The processor can still type a different disbursement date by hand (top of the file, Basic Info, or Edit order details).
- A hand-set date lasts until the next settlement date change. Then it follows the settlement date again. Matt's email did not say otherwise, so this is the default John set.
- A save that changes both dates at once keeps the disbursement date typed in that save.
- Saving other fields (or re-saving the same settlement date) leaves a hand-set disbursement date alone.
- Refinances are not touched: they keep the 4th-business-day rule or the processor's date.

## Where it is enforced

- Database: trigger `deals_disbursement_follows` (before update of `closing_date` on `public.deals`), migration `20261129040000_disbursement_follows_settlement.sql`, rollback in `supabase/rollbacks/`. It clears `disbursement_date` (blank = automatic = the closing date on a purchase, see FF-071 #23 / `20261119010000`). It covers every screen and any other path that changes the closing date. No policy, grant, or security-definer change.
- Demo data: the mock adapter's `updateDeal` follows the same rule.
- Hints: the disbursement date fields say "Changing the closing date resets this to the closing date" on purchases.

## Not changed

- The buyer closing-date lock (a buyer's proposed time never writes the file closing date) is held and untouched.
