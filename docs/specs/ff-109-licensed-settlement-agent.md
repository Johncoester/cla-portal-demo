# Licensed Settlement Agent on CLA Team and Closing Team (FF-109)

Source: Francis Santos, confirmed Nov 23 2026, 5:21 PM ET (Gmail 1a20a7ff3dfc931d). She asked to add Licensed Settlement Agent to Order Contacts > CLA Team, and when a Processor selects one, have the name auto-appear under File Overview > Closing Team.

## What was asked

Add Licensed Settlement Agent to Order Contacts > CLA Team and the Add Contact role list. When staff assign one on a file, their name appears in the existing File Overview > Closing Team Licensed Settlement Agent slot (that card was previously a hardcoded blank with no saved field).

## What it does

Licensed Settlement Agent is a per-file Order Contacts role in the CLA Team group, next to Processor, Preprocessor, Sales Person, Sales Team, and Transaction Coordinator. It is not a new login or HR role, and it is not a task-assignee role. The Add Contact picker treats it like the other CLA Team roles (CLA staff, no contact type). Francis's confirm-back did not say whether external contacts should also be allowed; this defaults to the same CLA staff path as those other CLA Team roles.

File Overview > Closing Team keeps a single Licensed Settlement Agent card (no duplicate). The name comes from a `deal_participants` row with role Licensed Settlement Agent. If nobody is assigned, the name is blank and the role title stays. The scheduling settlement agent/notary, the Closer, and an agent's Buyer Agent TC or Listing Agent TC are not used.

## What stays the same

Layout and styling of the other Closing Team cards stay the same. Processor, Preprocessor, Sales Person, Transaction Coordinator, Closer, and the scheduling settlement agent/notary fields are unchanged. Buyers, sellers, and agents still do not get the staff Closing Team row.

## Database

`deal_participants_role_check` did not allow Licensed Settlement Agent, so adding one on TEST would be refused. Migration `20261130240000_ff109_licensed_settlement_agent.sql` adds that role to the check constraint only. No column on `deals`, no RLS, GRANT, or function change. Rollback: `supabase/rollbacks/20261130240000_ff109_licensed_settlement_agent.sql`. Not applied by this commit. Rule 27 is not required (constraint value list only; who can read or write is unchanged).

Not Live until the pull request is merged, the database file is applied on TEST, and someone checks it there.
