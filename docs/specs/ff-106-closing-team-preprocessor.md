# Preprocessor on the Closing Team card (FF-106 / FF-106b)

Source: Francis Santos, email Nov 20 2026, 9:13 AM ET. She confirmed the confirm-back on Nov 23 2026, 11:59 AM ET (Gmail 1a209598512b3bd1): on File Overview > Closing Team, today's "Transaction Coordinator" label is the preprocessor on CLA files; the label will read Preprocessor and show the CLA preprocessor assigned on the file (Edit order details); layout, styling, other roles, and the agent's own TC role and link stay unchanged.

FF-106 first added a fifth Preprocessor card and left the Transaction Coordinator card in place. Francis retested on Nov 23 2026, 2:33 PM ET (Gmail 1a209e6c78047e5d) as Processor 1 on DC-26-78512 and reported "Still Transaction Coordinator not Preprocessor." FF-106b corrects that: relabel the existing CLA slot, and remove the extra card.

## What was asked

On the staff File Overview Closing Team row, the slot that was labelled Transaction Coordinator is the CLA preprocessor slot. Relabel it Preprocessor and show the person set as Preprocessor in Edit order details. If nobody is assigned, the name is blank and the role title stays Preprocessor. Do not change layout or styling of the other cards, and do not change the agent's own Transaction Coordinator role or how it links to an agent.

## What it does

Staff see Closing Team cards in this order: Processor, Preprocessor, Licensed Settlement Agent, and Sales Person (one card per salesperson). The Preprocessor name comes from `preprocessorUserId` already saved on the file. A missing assignment leaves a blank name. The former Transaction Coordinator card is not shown on this row. The CLA Transaction Coordinator field remains in Edit order details. Buyers, sellers, and agents still do not get the staff Closing Team row. Hosted files fill the Preprocessor's display name the same way they already fill the Processor name.

## What is not in this change

No database file for FF-106. FF-109 later fills Licensed Settlement Agent from an Order Contacts assignment (see ff-109-licensed-settlement-agent.md). The agent's own TC on Order Contacts is unchanged. This change does not assign Ellen or anyone else as a Preprocessor on TEST. Not Live until the pull request is merged and checked on TEST.


## FF-106c (Francis retest Nov 23 2026, 4:17 PM ET, Gmail 1a20a453c50c3fd5)

On DC-26-78512 the label was Preprocessor but the name was blank. Ellen Ahern was already assigned as a `deal_participants` row with role Preprocessor (Order Contacts > Add contact), while `deals.preprocessor_user_id` was null. The card now shows the CLA Preprocessor from Edit order details when that field is set, and otherwise from a participant with role Preprocessor. An agent's Buyer Agent TC or Listing Agent TC is never used for this card. No database file.
