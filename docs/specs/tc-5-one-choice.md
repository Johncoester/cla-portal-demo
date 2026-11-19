# Transaction coordinator, one choice (TC-5)

A transaction coordinator is an outside person who works for one or more real estate agents. On a file, their side follows whichever side their agent is on.

## What the user sees

Add contact, Place Order, and Parties offer one choice, labelled exactly **Transaction coordinator**. They do not offer "Buyer's transaction coordinator" or "Listing transaction coordinator", and they do not say "works for".

When that choice is used, the side is set from the coordinator's links to the agents on this file (the same links as TC-2, and the same side rule as TC-3):

- Linked only to the buyer's agent: saved as the buyer's side.
- Linked only to the listing agent: saved as the listing side.
- Linked to both agents on this file: saved on both sides.
- Not linked to an agent on this file: a required question, **Which agent are they linked to?**, lists the file's buyer's agent and listing agent. Nothing else is added under that question. Leaving it blank says: Choose which agent they are linked to.

If the file has no buyer's agent and no listing agent, saving says to add one of those agents first. A blank coordinator is still skipped. A refinance still has no transaction coordinator.

On Order Contacts and on the Parties cards, the role reads **Transaction coordinator**. The agent's name may follow when that screen already shows who the person sits with. It does not say "works for".

## What is saved

The stored roles stay Buyer Agent TC and Listing Agent TC. Nothing new is stored, and no one's existing role is rewritten. The old staff role Transaction Coordinator is still not offered when adding someone, and a file that already has it still shows that row.

## What this does not change

The link list on an agent (TC-2). Adding a linked coordinator when the agent is put on a file (TC-3). The contact type (TC-4). The CLA Title staff field on Edit order details.

Source: John Coester, voice call Nov 18 2026, about 1:51 PM ET. Tracker row 370, TC-5.
