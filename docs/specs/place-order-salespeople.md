# Salespeople on Place Order (FF-092)

On Place Order, Team & Notes, the salesperson field is a search box. Chosen people show as chips. The order still saves the same salesperson ids as before.

## What the user sees

The heading stays "Salespeople on this order." Type a name or a role. The matching people open in a list. Pick one with the mouse, or with the arrow keys and Enter. Each person you pick shows as a chip with Remove. You can pick more than one. A name that is not on the list says "No match. Try another name." If this login has no salespeople, the box says none are available.

Add new user still works the way it does today. Only an Admin sees Salesperson there. A new salesperson login is still created in HR, not from this box. If the email is already an active salesperson, that person is added to the chips.

## What is saved

The same `salesIds` values as the old checkbox list. One id per chosen person. No new database table and no new column. Who is allowed on the order does not change: an active staff login for this demo or real session, checked again when the order is saved.

A draft in this browser keeps every chosen person, not only the last one.

## What this does not change

The Users page still uses checkboxes for salespeople linked to a client. That is a different screen. Refinance still shows this field. Sales Team is still not a separate field on Place Order.
