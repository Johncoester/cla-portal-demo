# Transaction coordinator contact type (TC-4)

A transaction coordinator is an outside assistant who works for one or more real estate agents. On a file, that person can do what their agent can do. Those permissions are a separate item (TC-3). This item only adds the contact type.

This is not the CLA Title staff role named Transaction Coordinator. CLA staff still have no contact type.

Source: John Coester, live call Nov 18 2026, 11:27 AM ET, confirmed 11:35 AM ET, clarified 11:37 AM ET. Tracker row 368.

## What the user sees

Contact type lists offer **Transaction coordinator (outside, works for agents)**. Under the list, the page says: "An outside assistant who works for one or more real estate agents. Not a CLA Title staff role."

That choice is on a contact (User List, the contact edit on a file, Place Order's Add new user, and the CRM contact form). The contacts list on a file, the user list, and the CRM client and lead lists can filter or group by it.

When someone types a new buyer's transaction coordinator or listing transaction coordinator on Place Order, Parties, or Order Contacts, the new contact is saved as that type. The screen says the new person is a Transaction coordinator, not a Realtor, and not a CLA Title staff role.

Choosing someone who is already saved does not change that person's type. A person who was a Realtor stays a Realtor.

The directory on a coordinator row groups Transaction coordinators separately from Agents. Buyers and CLA staff are not in that list. The CLA staff role filter on User List is unchanged.

## What is saved

The stored code is `agent_tc`. Realtor, Lender, and Buyer/Seller stay as they are.

The database file `supabase/migrations/20261125230000_tc_contact_type.sql` adds `agent_tc` to the contact type check on contacts and on CRM leads. It does not update existing rows. It is not applied by the pull request. The rollback puts the old list back and refuses while any contact or lead is already a transaction coordinator.

## What this does not change

Who can be the CLA Title Transaction Coordinator. Removing that staff role, linking a coordinator to an agent's profile, and adding a coordinator automatically are other items. What a coordinator can do on a file is TC-3.
