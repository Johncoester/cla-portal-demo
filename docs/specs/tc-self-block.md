# A transaction coordinator cannot be the agent (TC-SELF-BLOCK)

On a file, the transaction coordinator and the agent they sit with are two people. The same contact, or the same email, cannot be both.

## What the user sees

On Order Contacts, Add contact to this order, choosing Transaction coordinator and picking or typing the agent they would be linked to is refused. The form stays, including what was typed. The message is: This person is already the Buyer Agent on this order. A transaction coordinator must be a different person. The listing side names Listing Agent.

Place Order, on the Agents step, uses the same check before Next and before the order is placed. Parties uses the same check when a transaction coordinator is added there.

A different person is still added. The buyer's agent can still be the listing coordinator when the listing agent is someone else.

On the transaction coordinator list for an agent (My Agent Profile, Order Contacts, and User List), linking that agent to themselves is refused. Typing that agent's email is refused with: This agent cannot be their own transaction coordinator. The form stays. A different person can still be linked.

The Transaction coordinators button on an agent row is unchanged.

## What is saved

Nothing is saved when the check refuses. A matching person is not added to the file and is not linked. No existing row is changed or removed.

The database file `supabase/migrations/20261125340000_tc_self_block.sql` refuses a new Buyer Agent TC row when that person is already a Buyer Agent on the file, and the same for the listing side. It also refuses a new link from an agent to themselves, including the same email, when the link table is already there. It does not update or delete existing rows. It must be applied on TEST. It is not applied by the pull request.

The TC-2 link save already refuses the same contact. That file is already on TEST, so this change does not rewrite it. Typing the agent's own email is still refused, because that email is already a contact, and the screen says the agent cannot be their own coordinator.

## What this does not change

People already on a file stay there, including a file that already has the agent saved again as the coordinator. Removing that row is a separate cleanup. The CLA Title staff Transaction Coordinator field is unchanged. A refinance still has no coordinator.

Source: John Coester, Nov 19 2026, 10:18 AM ET, screenshot of TEST file MD-26-97260. Tracker TC-SELF-BLOCK.
