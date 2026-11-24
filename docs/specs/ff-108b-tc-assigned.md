# Assigned to on Add and Edit Contact (FF-108b)

Source: Francis Santos, follow-up to FF-108. She asked for a selector when adding a transaction coordinator so staff can choose whether the TC belongs to the buyer's agent or the listing agent. Confirmed "Yes" on Nov 23 2026 at 5:21 PM ET (Gmail 1a20a80a4cca28a6), including the mockup of the Edit contact form. Tracker item FF-108b.

## What the user sees

On Order Contacts, when someone adds or edits a **Transaction coordinator**:

- A required **Assigned to \*** dropdown is shown, with **Buyer's Agent TC** and **Listing Agent TC**.
- The dropdown is always visible for that role (Add contact) or contact type (Edit contact), including when staff pick an existing coordinator who already has a link in `agent_tc_links`. If a side is already known, it is pre-selected. Staff can still change it.
- Saving puts the coordinator on the chosen side, so they list under that agent on Order Contacts. The other side's row for this person on this file is removed if they are moved.
- Leaving Assigned to on "Select..." is refused, in plain words.
- Choosing a side whose agent is not on the file is refused, and the message says to add that agent first.

Place Order and Parties are unchanged: they still ask "Which agent are they linked to?"

## Who can see it

The same people who can already add or edit contacts on the file (staff who run orders). A CLA staff contact has no contact type and does not get this dropdown (the staff role "Transaction Coordinator" is not this outside assistant).

## What this does not change

- The one role choice is still **Transaction coordinator**. The stored roles remain Buyer Agent TC and Listing Agent TC.
- No database file. Existing `deal_participants` roles and `agent_tc_links` already support the two sides. Saving the role on the file still links the coordinator to that side's agent.
- "Only communicate with TC", Place Order, and Parties are unchanged.

## How to test it

1. Sign in on testportal.clatitle.com as a Processor.
2. Open a purchase file that has both a buyer's agent and a listing agent, then Order Contacts.
3. Click + Add contact, set Role to Transaction coordinator, and confirm Assigned to appears with Buyer's Agent TC and Listing Agent TC.
4. Try Save without choosing a side: it should refuse and tell you to choose.
5. Add a new coordinator as Listing Agent TC. They should sit under the listing agent.
6. Edit that coordinator, confirm Assigned to is pre-selected as Listing Agent TC, change it to Buyer's Agent TC, and Save. They should now sit under the buyer's agent.
7. Add an existing coordinator who is already linked to one agent: Assigned to should stay visible and pre-select that side, and you can change it before saving.
