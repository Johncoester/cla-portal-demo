# Agent-side transaction coordinator (FF-088)

A processor can save the buyer's agent's transaction coordinator and the listing agent's transaction coordinator on an order. That person is an outside contact. They may already have a portal login, or they may not. This is not the CLA Title Transaction Coordinator.

## What the user sees

On Place Order, step 5 (Agents), each side has person, company, phone, and email, plus a list of people already saved. Both are optional. A bad email or a partial phone is pointed out, and what was typed stays.

On an open file, Parties shows both coordinators. Add or Change is on that row and in the buttons under the list. Order Contacts → Add contact has the same two roles. Type the person, or pick someone saved. Edit on that row changes the name, email, phone, and company.

The CLA Title Transaction Coordinator, in Edit order details and as the Contacts role "Transaction Coordinator", is still an active staff login.

## What is saved

The buyer's coordinator is stored as Buyer Agent TC. The listing coordinator is stored as Listing Agent TC. A typed person is a contact with no portal login and no invite. Picking someone who already has an outside login uses that contact. Neither role sets the file's CLA Transaction Coordinator.

The file's people list allows those two roles and every role it already allowed, including the CLA Transaction Coordinator, the lender, and the abstractor. Place Order opens the new file after the coordinator is saved.

## What this does not change

Who can be the CLA Title Transaction Coordinator. An outside person in that role is still refused. A refinance still has no sellers, agents, or coordinators. Invite to portal is not offered on these two roles.

Source: Francis Santos, Nov 16 2026, 3:10 PM ET (message 1a1e5fbfe4183a9f), screenshot of order MD-26-97386. Tracker item FF-088.
