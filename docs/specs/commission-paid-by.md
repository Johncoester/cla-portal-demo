# Commission Paid By (FF-089)

Source: Francis Santos, tracker row 325 (FF-089). Email Nov 16 2026, 3:10 PM ET (msg 1a1e5fbfe4183a9f), while signed in as Processor 2 on TEST file MD-26-97386. She was creating a new file.

## What was asked

On Earnest money & agent fees, Commission Paid By is missing for the listing agent and the selling agent. Add Buyer, Seller, and Split. For Split, enter what the buyer pays and what the seller pays. The commission then shows on the matching side or sides of the settlement statement and the Closing Disclosure.

## Where it already lived

FF-051 asked for Paid by Buyer, Seller, or Split. [PR 285](https://github.com/Johncoester/cla-portal-demo/pull/285) put that on the Agent fees box on the file overview (the Edit window), stored on `deal_agent_fees.payer`, `split_buyer`, and `split_seller`. The fee ledger already posts those amounts to CD section H, and the settlement statement and the CD already put the buyer share and the seller share on their own columns. [PR 287](https://github.com/Johncoester/cla-portal-demo/pull/287) did not change the screen. It only pointed the walkthrough at the panels and fixed the payer-rule check.

That field was left off the screen Francis used. Place Order, step Lender & Loan, heading "Earnest money & agent fees", had Commission % , Commission $, and Admin fee, and no Commission Paid By. It was not hidden. The same choice was only on a different screen, the Agent fees box, after the file already existed.

## What it does

Each agent panel on Earnest money & agent fees has Commission Paid By: Buyer, Seller, or Split. The listing agent starts as Seller. The buyer's agent panel is the selling agent, and it starts as Buyer. Split shows a buyer amount and a seller amount. Those two amounts must add up to the commission. The figures save into the same Agent fees records the file overview already uses, so the commission line lands on the buyer side, the seller side, or both, on the settlement statement and on CD section H.

The Agent fees edit window uses the same words, Commission Paid By, for the same field.

## What is not in this change

No new database columns. A split, or a commission with its own base, is still not rewritten when the sales price changes. The admin fee is still Buyer or Seller only. Not Live until this is on TEST. Nothing is applied to TEST by this change.
