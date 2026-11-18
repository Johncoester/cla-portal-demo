# Who is listed under Salespeople on this order (FF-092a)

**Requested by:** Janine, written answer Nov 17 2026, 6:26 PM ET. Follow-up to FF-092 (PR 322).

**Tracker:** FF-092a.

**Status:** In review. Pull request [335](https://github.com/Johncoester/cla-portal-demo/pull/335). No database file. Not Live until someone checks it on TEST.

## What the user sees

On Place Order, "Salespeople on this order" lists only people whose role is Sales Person or Sales Team. Type a name or one of those roles. A Processor, Preprocessor, Transaction Coordinator, Admin, or Super admin is not in that list.

On an open file, Add a salesperson uses the same list. That is the current file page and the older file page.

A salesperson already saved on a file still shows there, with their name, even when their role is not Sales Person or Sales Team. They can still be removed.

Task Builder still names a salesperson already saved on a flow, even when that person is no longer in the sales list. A person who cannot be found still reads "a sales person no longer active."

## What is saved

The same salesperson ids as before. No new table and no new column. Saving still accepts an active staff login, and a user who can own CRM records. The database check is unchanged.

## What this does not change

The Processor list, the Transaction Coordinator list, and who can be the Processor. The "Can own CRM records" checkbox and the CRM owner lists. The Users page checkboxes that link a client to salespeople.
