# Agreement acknowledgement wording (FF-112)

**Requested by:** Francis Santos. Source: Gemini notes of the Nov 23 2026 2:35 PM ET meeting (Gmail 1a20abbd6b7e823a): "Agreement Formatting: Correct the proper casing of letters and add missing periods within the agreement acknowledgement popups." Confirm-back 1a20af12dc3a104a, item 9: fix capitals and periods on agreement popups? Francis Yes, 11:40 AM ET Nov 27, Gmail 1a21de1d2f8fc9d5. Tracker row 460.

**Status:** Building. Not Live until this is merged, the TEST database file is applied once, and Francis checks it on TEST. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On a file's **Agreements** tab, the three acknowledgement cards are:

- Wire Fraud Warning
- Privacy Notice
- Consent to Electronic Records and Signatures

The status pills use a capital letter and end with a period:

- Please read and acknowledge.
- Acknowledged.

On the staff "Who has acknowledged" table, an empty cell says "Not yet."

A Buyer Agent, Listing Agent, Transaction Coordinator, and staff login all see the same titles and pill wording. Staff still do not need to acknowledge; they see who already has.

## What this does not change

- The body text of the three agreements is unchanged (it already uses complete sentences with periods).
- The agreement version stays 1, so anyone who already acknowledged still counts as acknowledged.
- Who can see or acknowledge an agreement is unchanged. This is typography only.

## Database

Migration `supabase/migrations/20261131410000_ff112_agreement_wording.sql` updates the titles on TEST `public.agreements` for version 1 of `privacy` and `e_consent`. `wire_fraud` already had the correct title. Rollback: `supabase/rollbacks/20261131410000_ff112_agreement_wording.sql`. Apply once on TEST after merge. Do not apply on production.
