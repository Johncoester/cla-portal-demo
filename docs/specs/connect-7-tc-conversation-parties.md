# CONNECT-7: a transaction coordinator can add their side to a conversation

John Coester, Nov 25 2026, 7:49 PM ET, Connect Live Test Checklist row 4.3. Francis Santos reported that when she started a conversation as the buyer's agent TC, she could only select the Sales Person and the Processor.

## How it should work

An outside transaction coordinator (the agent's coordinator, not the CLA staff Transaction Coordinator) can start a conversation with CLA Title staff on the file and with the parties on their side:

- Buyer-side coordinator: the buyer, the buyer agent, and the buyer's lender.
- Seller-side coordinator: the seller and the listing agent.

They cannot add the other side. A conversation still cannot mix buyer-side and seller-side people. People with no portal login stay off the list for a coordinator (staff can still invite them).

## What was wrong

The Start conversation screen lists every person returned by `public.message_recipients` → `private.rpc_message_recipients`. The page does not hide parties for a coordinator.

That function is SECURITY DEFINER. It decided the viewer's side only from deal participant roles in Buyer Agent, Listing Agent, Client-Buyer, and Client-Seller. It did not use `private.outside_roles` or `private.linked_agent_roles`, so a Buyer Agent TC or Listing Agent TC had no side and only saw CLA staff.

`private.person_side` and `private.can_message` (used when the conversation is actually created) already treated a linked coordinator as their agent's side. Adding a listed buyer or buyer agent would already have been allowed. The lender was still missing because `private.side_of` and `private.person_side` do not treat Lender as a side (and they stay that way, so a lender does not gain buyer-side read, contact, or notification rights).

## What's built

- `private.rpc_message_recipients` uses `private.outside_roles` (which includes `private.linked_agent_roles`) and the coordinator file roles, and treats Lender as buyer-side only inside that list.
- `private.side_of` and `private.person_side` are unchanged. A buyer-side coordinator (or staff) can add a Lender through a narrow `private.can_message` / `rpc_create_thread` exception for conversation membership only. `can_message` returns false, not null, when the viewer has no side.
- Recipients are limited to the viewer's demo scope (`deals.is_demo` vs `private.viewer_is_demo()`).
- The mock list and membership checks match. A lender still has no side for documents, settlement, or contact cards.
- Staff and pure-client recipient rules, and the this-file-only list of people with no login, are unchanged.

## What's not done

- Applying the database file on TEST waits on a rule 27 review (SECURITY DEFINER / guard change) and on the usual green checks.
- A coordinator still cannot invite a person who has no portal login; that stays a staff path.
- Open Orders / unread counts are unchanged.
