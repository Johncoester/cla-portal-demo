# Tax rate sheets by place (FF-091c)

Source: Francis Santos, email Nov 17 2026, 3:55 PM ET (Gmail message 1a1eb4b8017fcabf), subject "Re: [Written by AI] Francis: portal items to check on TEST". Tracker FF-091c. The same thread's 1:55 PM reply is FF-091b (pull request 326), which is still open.

**Status:** In progress. Not Live. Database file `supabase/migrations/20261125170000_tax_rate_sheets.sql` (rollback beside it). Not applied on TEST. Do not mark Live until that file is applied on TEST and someone checks a file there.

## What she asked for

1. Each state, county, and city has its own rate sheet and its own questions. Taxes & Fees shows that place's questions once the state and county (and city, when there is one) are chosen.
2. The order of the math is: figure the taxes and fees, take off the exemptions, then split what is left between buyer and seller. The rate sheet supplies the starting split. Staff can change it to match the signed contract, unless the law fixes that line. A locked line stays put.
3. An Admin can change rates, exemptions, and rules without a code change.

Baltimore City is the example. The questions are consideration, loan amount, deed and mortgage pages, whether each document is taxable, primary residence, the owner-occupied exemption, the first-time buyer exemption, whether the mortgage is recorded with the deed, any other statutory exemption, and who pays under the contract.

## What this change does

Five tables hold the sheet: places, rate lines, exemptions, questions, and the default split. The default split has a "set by law" flag. Staff can read the tables. Only an Admin or Super admin can change them. Row security enforces that.

Taxes & Fees reads the tables when they are present. If the tables are not on the database yet, it keeps using the rates already compiled into the portal. A rate that is blank shows **Rate Not Set**. Staff type the fee. Nothing is saved until they do, so a charge is not skipped in silence.

The numbers that were already in the fee sheet are copied in. No rate was guessed. Where the sheet has no figure, the amount is left blank.

## Worked example

Baltimore City purchase, price $200,000, the buyer will live there, not a first-time buyer:

- State transfer tax $1,000.00, then split $500.00 / $500.00.
- City transfer tax $2,670.00. The first $22,000 comes off, then 1.5%, then split $1,335.00 / $1,335.00.
- Recordation tax $1,780.00. The same $22,000 comes off, then $5.00 per $500, then split $890.00 / $890.00.

Same file, first-time buyer who will live there:

- State transfer tax $500.00, all on the seller. That line is locked.
- City transfer tax and recordation start with the seller, because that is what the sheet says. Staff can move those two. They cannot move the state tax.

## Rates left unset

- Calvert, Carroll, Frederick, Somerset, and Wicomico have no county transfer tax row in the fee sheet. No line was added.
- Baltimore City asks whether the mortgage is recorded with the deed. The sheet has no dollar rate for that, so the answer does not change the fee.
- Baltimore City asks whether another statutory exemption applies. The sheet has no amount, so answering Yes does not reduce the tax until an Admin sets one.
- Anne Arundel’s lien certificate is $0.00 in the sheet. That is a real zero, not Rate Not Set.

## Decisions

- The owner-occupied amount comes off the tax first. The split divides what is left. That matches the sheet and the open question on FF-091b.
- Maryland state transfer tax for a first-time buyer who will live in the home stays with the seller (Tax-Property 13-203). The flag is on so an Admin could change that rule later without a code change. It starts locked.
- A county uses its own rows and, for anything it does not override, the statewide rows. That is how the calculator already works.
- The migration is not applied here. TEST stays read-only.
