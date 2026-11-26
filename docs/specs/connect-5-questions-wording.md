# Personal information questions and Seller Proceeds wording (CONNECT-5)

Asked by John Coester, Nov 25 2026, 7:49 PM ET (t2081u), from the Connect Live Test Checklist, rows 2.1 and 2.2 (Francis, Nov 25 2026). Francis reported that some buyer tasks were missing, that Personal Information needed the listed Yes/No questions, and that Seller Proceeds wording should be updated.

Pull request: [PR 456](https://github.com/Johncoester/cla-portal-demo/pull/456). Database file: `supabase/migrations/20261131240000_connect_5_questions_wording.sql`.

## How it works

These questions already existed on personal_info v5–v9, with longer or shorter labels. CONNECT-5 publishes **personal_info v10** (from v9) and **seller_proceeds v3** (from v2) with the wording Francis asked for. Nothing else about the forms changes.

Buyer Personal information (Yes/No):

- Attending the closing?
- Leaving town before closing?
- Currently getting divorced?
- Property will be primary residence?
- Wants survey?
- First-time home buyer in MD? (Maryland files only)

Seller Personal information (Yes/No):

- Subject to ground rent?
- Subject to front foot benefit?
- Property is homestead?
- Property has tenants at/after closing?

Seller Proceeds:

- The method question reads **Proceeds Instructions: Overnight Check or Wire?**
- The acknowledgment reads: "Any seller proceeds are required to be disbursed to the SELLER OF RECORD. If the seller is an Entity/Trust, the proceeds will be disbursed to the Entity/Trust only."
- The existing options stay: Wire transfer, Check sent by FedEx, and Check at settlement. The $5,000 wire note and the acknowledgment checkbox stay.

Only untouched to-do copies with no answers move to the new versions. Copies with saved answers keep their version and answers.

Forwarding address stays seller-only (MF-074). Citizenship stays a typed line (JN-CITIZEN-1; MF-073 will switch it back to a dropdown later). The form is still validated by `private.validate_form`; this change does not edit the validator, RLS, or any function.

## Buyer task list

A buyer should see every active template whose roles include Client-Buyer: Upload identification, Personal information, Title vesting, Lender information, and Home warranty. A check on TEST (buyer copies vs those five templates) found no missing copies on files that have a buyer. The "missing tasks" Francis noted match the Personal Information questions whose wording was updated here. A regression test opens a purchase file as the buyer and checks the visible list against the active templates.

## What is not done

- Check at settlement remains a third proceeds option, because the request changed the wording, not the set of methods.
- Existing answered copies stay on the previous wording until they are retired or staff republish a later version onto them.
