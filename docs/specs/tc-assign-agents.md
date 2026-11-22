# Assign agents and transaction coordinators (TC-ASSIGN-1)

John Coester, Nov 21 2026: "An agent can be assigned to a TC at the admin level, on the TC's contact record, or within a file. The assignment works both ways, and the TC then goes on all of that agent's files." Rule 9 waived by John for the TC fixes, Nov 21 2026.

## What the user sees

- **Admin level (User List > Edit user).** An agent's page already lists their Transaction coordinators (TC-2). A coordinator's page now lists **Agents this coordinator works with**, with an agent picker, Add agent and Remove.
- **Contact record (CRM > Clients > the person).** A coordinator's record shows the same Agents list. An agent's record shows their Transaction coordinators.
- **Within a file (Order Contacts).** Adding someone as the buyer's or listing agent's transaction coordinator links them to that side's agent on the file. Adding an agent next to a coordinator already on that side links them too.
- Either way it is one link. Adding it from the agent's side or the coordinator's side gives the same result, and it shows on both pages.
- After a link, the coordinator is on **every file that agent is on** (open, closed, on hold or cancelled), on the agent's side there. Refinances are left out (no agents).

## What stays the same

- Removing a link keeps both people and takes nobody off a file.
- A CLA staff login is never linked as an agent's coordinator. The same person (or the same email) as the agent is never linked.
- A coordinator put on a file by a link does not get linked to other agents on that file. Only a person's own add on a file links.
- Who can add or remove: a processor or admin, or the agent on their own contact (same as TC-2).

## Database

`supabase/migrations/20261127990000_tc_assign_agents.sql`, rollback `supabase/rollbacks/20261127990000_tc_assign_agents.sql`.

- `private.place_agent_tcs` covers all of the agent's files, not only open ones.
- Trigger `participants_tc_link` on `deal_participants` (function `private.link_tcs_from_file`).
- `public.tc_agents(p_tc)` lists a coordinator's agents.
- One time: coordinators already on a file next to that side's agent are linked, and every link is placed on all of the agent's files. A dry run on TEST (rolled back) on Nov 21 found 5 links to add and no extra file rows (each of those agents is on one file).
