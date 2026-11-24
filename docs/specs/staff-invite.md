# CLA staff can send portal invites (STAFF-INVITE-1)

Source: John Coester, chat Nov 23 2026, 5:07 PM ET: "when inviting someone to the portal, when clicking invite to portal, make sure anyone that's a CLA title employee can say that. Send that, click that button. Not just the processor." Tracker row STAFF-INVITE-1.

## What was asked

Any CLA Title employee should be able to click Invite to portal and send the invite, not just a Processor.

## What it does

Staff who can open orders can click Invite to portal on Order Contacts, and Create or Resend on Agent Invites:

- Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator, Admin, Super admin.

The invite is emailed from testportal@clatitle.com. The person clicking the button does not need to connect their own Gmail. The screens say so.

A CLA staff Transaction Coordinator was previously blocked (John, Nov 4 2026, "No for now"). That block is lifted. Processor, Preprocessor, Sales Person, Sales Team, Admin, and Super admin were already allowed by the database helper; the earlier UI copy that said the email came from "your connected Gmail" was misleading.

## What is not in this change

- HR-only Employee logins still cannot send file invites (they cannot open orders).
- Outside users still cannot send invites: Buyer Agent, Listing Agent, Client-Buyer, Client-Seller, Lender, and an agent's own Buyer Agent TC or Listing Agent TC.
- Who can be invited is unchanged (buyer, seller, buyer agent, listing agent, and those agents' coordinators). Lenders and CLA staff rows still have no button.
- File email from a person's own Gmail is unchanged and still needs a connected mailbox.
- Some older database error messages still list the pre-change staff roles. The check itself uses `private.can_invite_agents`, so a Transaction Coordinator is allowed.

## How to test it

1. On testportal.clatitle.com, sign in as each of: Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator, Admin, Super admin.
2. Open a file (for example MD-26-97260) → Order Contacts.
3. On a buyer, seller, or agent with no portal login, click Invite to portal.
4. The dialog should say the email comes from testportal@clatitle.com and that you do not need to connect Gmail. Create the link. Do not use a real outside email if you are only checking that the button works; cancel or use a test address.
5. Sign in as a buyer, seller, or agent on that file. Confirm Invite to portal is not shown, and that they cannot send an invite.

Failure case: a contact with no email and nothing typed in the dialog is not emailed, and the dialog says to enter an email.
