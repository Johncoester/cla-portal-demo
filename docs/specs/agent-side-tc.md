# Agent-side transaction coordinator (FF-088)

A processor can save the buyer's agent's transaction coordinator and the listing agent's transaction coordinator on an order. That person is an outside contact. They may already have a portal login, or they may not. This is not the CLA Title Transaction Coordinator.

## What the user sees

On Place Order, step 5 (Agents), each side has person, company, phone, and email, plus a list of people already saved. Both are optional. A bad email or a partial phone is pointed out, and what was typed stays.

On an open file, Parties shows both coordinators. Add or Change is on that row and in the buttons under the list. Order Contacts → Add contact has the same two roles. Type the person, or pick someone saved. Edit on that row changes the name, email, phone, and company.

Add contact no longer offers the old role name Transaction Coordinator (TC-1). A file that already has that role still shows the person. Edit order details still has the file-level Transaction Coordinator field from before TC-1.

## What is saved

The buyer's coordinator is stored as Buyer Agent TC. The listing coordinator is stored as Listing Agent TC. A typed person is a contact with no portal login. Since TC-INVITE-1 (Nov 20 2026) staff can invite them from Order Contacts; see Portal invite below. Picking someone who already has an outside login uses that contact. Neither role sets the file's CLA Transaction Coordinator.

The file's people list allows those two roles and every role it already allowed, including the CLA Transaction Coordinator, the lender, and the abstractor. Place Order opens the new file after the coordinator is saved.

## What this does not change

Who can be the CLA Title Transaction Coordinator. An outside person in that role is still refused. A refinance still has no sellers, agents, or coordinators. (Until Nov 20 2026 Invite to portal was not offered on these two roles. TC-INVITE-1 changed that; see below.)

Source: Francis Santos, Nov 16 2026, 3:10 PM ET (message 1a1e5fbfe4183a9f), screenshot of order MD-26-97386. Tracker item FF-088.

## Portal invite (TC-INVITE-1, changed Nov 20 2026)

John Coester asked for this in chat on Nov 20 2026, 10:41 AM ET, from his screenshot of Order Contacts on MD-26-97260: "yes of course a TC needs an invite." It reverses the FF-088 decision that these two roles get no invite.

- Order Contacts shows Invite to portal on a Buyer Agent TC or Listing Agent TC row when that person has no portal login and is not removed, the same as for a buyer, seller or agent. Any CLA Title employee who can open orders can press it: Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator, Admin and Super admin (STAFF-INVITE-1, John, Nov 23 2026 5:07 PM ET). HR-only Employee and outside users still cannot.
- The dialog names the role as Transaction coordinator. The email comes from testportal@clatitle.com like every portal invite.
- The coordinator gets the short client login (name, email, cell phone, password). They sign in as an Outside user on that file. There is no agent profile, brokerage or license form.
- Share Files can invite a coordinator who has no login, the same way.
- The invite email greets them by name and says which property it is for. It does not name their role (the email names only buyer, seller and agent today).
- Not changed: changing a coordinator's email on the file does not send an invite by itself (that automatic invite still covers buyers, sellers and agents only). The TC self-block (PR 372) and the agent links (agent_tc_links) are unchanged. Lenders and other roles still get no invite.
- Database file: `supabase/migrations/20261125360000_tc_portal_invite.sql` (rollback in `supabase/rollbacks/`).
