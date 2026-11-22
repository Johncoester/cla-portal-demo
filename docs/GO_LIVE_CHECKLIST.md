# CLA portal go-live checklist

**This launch is portal features only, NOT full title production.**

The new CLA portal (C.L.A. Title & Escrow) runs on Supabase. It does not depend on Zoho. This list is the check before people use the portal for everyday work: sign-in, roles, orders, documents, messages, and tasks.

Title production is not part of this launch. The team keeps testing those features (the title commitment, Schedule A, the final policy, recording, funding, and wires) before a full launch. Do not treat a pass on this list as a sign-off of a live closing.

Check it on [testportal.clatitle.com](https://testportal.clatitle.com/) with **fake data only**. Do not type a real client's name, Social Security number, bank account, or wire. There are **46 checks** below.

Role names below are the ones in the portal. An agent or client signs in as an **Outside user**. On a file, the role tag uses the file role: **Buyer Agent**, **Listing Agent**, **Client-Buyer**, or **Client-Seller**. Staff sign in as their own role: **Processor**, **Preprocessor**, **Sales Person**, **Sales Team**, **Transaction Coordinator**, **Admin**, or **Super admin**.

---

## John's checks

1. [ ] Buyer Agent role is approved and working.
   How to check: Sign in as an Outside user who is the Buyer Agent on a fake purchase, confirm the home label is Transactions and the role tag says "Buyer Agent on this file," and confirm a file they are not on is missing from Open Orders.

2. [ ] Listing Agent role is approved and working.
   How to check: Sign in as the Listing Agent on that same fake purchase, confirm the role tag says "Listing Agent on this file," and confirm they see their own side of the file and not the buyer's private documents.

3. [ ] Transaction Coordinator role is approved and working.
   How to check: Sign in as a Transaction Coordinator, open a non-demo file they were not typed onto, and confirm the page says "here's your coordination file" with Tasks, Messages, Documents, Closing, Contacts, and Activity. The top bar does not offer Place Order.

4. [ ] Processor role check.
   How to check: Sign in as a Processor, confirm the home label is Work Queue and Place Order is in the top bar, and confirm Open Orders shows an Unassigned badge on a fake file that has no Processor yet.

5. [ ] Order entry check.
   How to check: As a Processor, open Place Order, enter a fake Maryland purchase with a 10-digit phone, and save. The review step says no emails, texts, or invites are sent. Leave a required field blank and confirm the form keeps what you typed and says what to fix.

6. [ ] Automated emails are working.
   How to check: Invite a fake buyer from the file's Contacts tab and confirm the mail is from testportal@clatitle.com. Open Reminder Outbox and confirm the page says nothing is ever sent and each row says "queued - not sent." A staff Email on a file, if you send one, goes from that person's connected @clatitle.com Gmail, and the screen says when nothing was sent.

## Clients, invites, and who sees a file

7. [ ] Client-Buyer role is approved and working.
   How to check: Sign in as an Outside user whose only file role is Client-Buyer. They land on Open Orders, the home label is My Closing, the light page has Overview, To-do list, Messages, Documents, Closing appointment, and Activity, there is no Contacts tab, and Your agent names the Buyer Agent.

8. [ ] Client-Seller role is approved and working.
   How to check: Sign in as a Client-Seller on the same fake file. Your agent names the Listing Agent, the same light tabs appear, and a document upload offers seller types such as Payoff statement and Deed, not the buyer's list.

9. [ ] Login and invite links work, and invites come from testportal@clatitle.com.
   How to check: Send the invite from Contacts, confirm the From address is testportal@clatitle.com and the subject names the property, open the link and set a password, then open that same link again and confirm it goes to Sign in with the email filled in. A bad or expired link explains what is wrong in plain words.

10. [ ] Password reset works.
    How to check: On Sign in, choose Forgot password, send the reset, and open the link. It opens testportal.clatitle.com and asks for a new password of at least 8 characters. A wrong password stays on the form with the email still filled in.

11. [ ] Each role sees only its own deals and files.
    How to check: On two fake files, a Processor and a Transaction Coordinator see both non-demo files, a Sales Person sees a file only when they are the sales person on it, a Buyer Agent does not see a Seller side only document, and a Client-Buyer who pastes the other file's link does not get in.

## Documents, messages, tasks, and speed

12. [ ] Document upload, download, and sharing permissions work.
    How to check: On Documents, upload a small PDF as Seller side only, download it as the Listing Agent, and confirm the Client-Buyer does not see it. A client who uploads is offered only "Share with CLA Title," which staff and their own agent can see.

13. [ ] Inbox and messaging work.
    How to check: On a file with no messages, the page says "No conversations yet." A Processor's new conversation can include CLA staff and one side, not both. The Client-Buyer can message CLA staff and their own side, an unread thread shows a count, and a Sales Person is not offered Start conversation.

14. [ ] Tasks show up for the right roles.
    How to check: Add a task assigned to Buyer Agent and confirm that agent sees it and the Listing Agent does not. A Client-Buyer sees the tab as To-do list. An empty file says "No tasks have been created on this file yet." All Tasks is in the menu for a Processor and a Transaction Coordinator.

15. [ ] Key pages load in an acceptable time.
    How to check: Open Open Orders, one file overview, and Documents. Each leaves the line "Loading this page." and shows the content, and does not stop on "This page didn't load. Check your connection and try again."

## Sales

16. [ ] Sales Person view is correct.
    How to check: Sign in as a Sales Person. The home label is Team Dashboard, there is no Place Order button, and they cannot upload or start a conversation. CRM Deals says "You see only your own deals" unless a Super admin has turned on "CRM: all deals." Open Orders lists only files where they are the sales person.

17. [ ] Sales Team view is correct.
    How to check: Sign in as a Sales Team user. The home label is Team Dashboard and order work is view only. With CRM on, CRM Deals says "You see every deal owner's deals." Open Orders still lists only files where they are the sales person on the file.

## Finding an order

18. [ ] Search and filters narrow the order list.
    How to check: On Open Orders, search a fake file number and then a nonsense word. The file number shows that order, and the nonsense word says "No orders match your search." Closing from/to, type, and the Open, Close, On Hold, Cancelled, and All tabs change who is listed.

19. [ ] Column sorting works.
    How to check: On Open Orders, click File No, then click it again. The lit arrow flips and the rows reverse. Open Date starts with the newest first.

20. [ ] Pagination works where the portal has it.
    How to check: Open Orders has no page control; filters narrow the one loaded list. In CRM, set Records per page to 10 and confirm the next page is the next rows (the choices are 10, 20, 30, 40, 50, and 100). If CRM is off for that login, mark the CRM half N/A.

## Phones and browsers

21. [ ] The layout works on a phone screen.
    How to check: Narrow the window to a phone width, open a Client-Buyer file and Place Order, and confirm the menu stacks, Show portal menu opens the file menu, the form is one column, and the order table scrolls sideways without covering the buttons.

22. [ ] Chrome, Safari, and Edge all work.
    How to check: In Chrome, Safari, and Edge, sign in, open Open Orders, and open one fake file. The same role tag, file number, and buttons show in each browser.

## When something goes wrong

23. [ ] An expired sign-in sends the person back to Sign in.
    How to check: After the sign-in expires, save something and confirm the message is "Your sign-in has expired. Sign in again, then retry," then sign in and confirm the file is still there. There is no 15-minute sign-out. The 15-minute idle mark is only the HR time log, and it does not sign anyone out.

24. [ ] Error states tell the person what to do next.
    How to check: Open a made-up file link, or retry while offline, and confirm the page says "This page didn't load. Check your connection and try again." with a Reload button. A save the role cannot make says the login is not allowed to change this.

25. [ ] Empty states are plain and expected.
    How to check: On a new fake file, Documents says "No documents have been shared on this file yet," Messages says "No conversations yet," Tasks says "No tasks have been created on this file yet," and an empty Open tab says "No open orders."

26. [ ] Form checks reject bad input and keep what was typed.
    How to check: On Place Order, leave a required field blank and type a short phone. The phone line says it must be a 10-digit number (xxx-xxx-xxxx), and the address you already typed is still in the form.

27. [ ] File size and file type limits are enforced.
    How to check: On Documents, try a .exe and a file over 25 MB. The type message says that file type is not allowed, and the size message says the file is too large for this demo. A PDF, JPG, or HEIC under 25 MB uploads. Allowed types are pdf, doc, docx, xls, xlsx, csv, txt, png, jpg, jpeg, heic, heif, and webp.

28. [ ] Two people can edit the same file. A conflict warning is N/A.
    How to check: The portal has no "someone else saved" warning. Two Processors change the same field and save; after both refresh, the later save is what the file shows, and a different field neither of them changed is still there.

## Notices, history, dates, and print

29. [ ] Notification badges update.
    How to check: Have someone assign this Processor on a fake file, open the bell, and confirm the count includes that notice and the row shows the file number. Mark all read clears the number the next time the page draws. The count does not tick while you sit still.

30. [ ] The activity log records what changed.
    How to check: As a Processor, open Activity Log, assign a Processor on a fake file, and confirm a read-only row says "Processor set to" that person. The file's Activity tab shows the same row. A filter that matches nothing says "Nothing matches."

31. [ ] Dates use Eastern time.
    How to check: Place a fake order after 7 PM Eastern and confirm the open date is today's Eastern date, not the next UTC day. The closing date you pick stays that calendar date. A CRM meeting time is labeled Eastern Time.

32. [ ] Print and PDF export work where the portal has them.
    How to check: As a Processor, on a file where Accounting is on, choose Generate CD and then Save as PDF in the print window. Generate ALTA does the same. The PDF is not added to Documents, and the print header says "TEST - not a legal disclosure." If Accounting is switched off, mark this N/A.

## Everyday use

33. [ ] Keyboard, labels, and contrast are usable. Dark mode is N/A.
    How to check: On Sign in, tab from Email to Password to Sign in without a mouse. Each field is labeled, and the bell's name is Notifications. Dark mode is N/A: the portal uses the light card theme and has no dark switch.

34. [ ] Several people can use the portal at the same time.
    How to check: A Processor, a Buyer Agent, and a Client-Buyer sign in together, and each opens Open Orders and one file. Each page finishes loading, and the client does not see a file they are not on.

35. [ ] A refresh keeps the data.
    How to check: Open a file's Documents page, refresh, and the same documents are there. On Place Order, type a fake street, refresh, and the street is still there. A file you attached is not kept in that draft.

36. [ ] The browser Back button returns to the previous page.
    How to check: From a file, press Back and confirm you return to Open Orders. On a form with unsaved edits, Back asks "You have unsaved changes. Leave this page? Press Cancel to continue editing."

37. [ ] A link opens a specific file or document.
    How to check: While signed in as someone on the file, open #/deals/ and the file id, then #/deals/ that id /documents. The file and the Documents tab open. The same links, as a person who is not on the file, do not show it.

38. [ ] Logout clears the session.
    How to check: Choose Logout in the user menu. The next page is Sign in, and the file link does not open the file until you sign in again. A locked test link has no Logout and says you are signed in as that person only.

39. [ ] Clients do not see staff-only money fields.
    How to check: As a Client-Buyer, open the fake file and confirm there is no Agent fees box, no commission amount, and no Accounting tab. As a Processor, the same file shows Agent fees.

40. [ ] A new order gets a file number in the right form.
    How to check: Save a fake Maryland purchase and confirm the number looks like MD-26- and then the sequence. Save one with state FL and confirm it starts with FL-. The two files do not share a number.

41. [ ] The TEST banner shows on the test portal. Hiding it on a production site is N/A.
    How to check: On testportal.clatitle.com the sign-in page says "TEST ENVIRONMENT · FAKE DATA ONLY" and the title is "CLA Portal Live Test." This repo has no production skin that hides that line. Confirm you are on the test address.

42. [ ] Every check uses fake data only.
    How to check: Use made-up names, a 555 phone number, and a fake address. Do not type a real Social Security number, bank account, or wire. The wire warning's phone, where it shows, is the placeholder 301-555-0100.

43. [ ] A refinance order does not ask for a seller or an agent.
    How to check: Place a fake Refinance. The Client-Buyer is shown as Borrower, and the form will not add a Client-Seller, Buyer Agent, Listing Agent, or Transaction Coordinator. Purchase price and earnest money are not on that order.

## If the launch has to stop

44. [ ] Everyone knows who to tell about a bug.
    How to check: As a client, open Contact Us and confirm it lists the Processor on each of your files and says to message the closing team from the file. It does not show an office phone. Staff on the feedback pilot can also use Portal feedback. Report a portal bug to John Coester.

45. [ ] The rollback plan is agreed before go-live.
    How to check: If this launch must stop, stop sending new invites and keep closings in the current title process. Do not send clients to a production address. This checklist changes no database. A later TEST database undo uses the matching file under supabase/rollbacks, on TEST only, and only after John says so.

46. [ ] Preprocessor role is approved and working.
    How to check: Sign in as a Preprocessor. The home label is Work Queue and Place Order is available. They can work a fake file assigned to them, and a file that is not assigned to them is not theirs to run.

---

## Not in this launch

- **Full title production.** The title commitment, Schedule A, requirements, the final policy, CPL, e-recording, bank accounts, and matching a finished closing's figures. The team keeps testing those before a full launch.
- **Zoho.** The portal does not use it.
- **Reminder emails and task-reminder emails.** Reminder Outbox queues them. CLA Portal Live Test does not send them.
- **E-sign.** The portal says it is not enabled, and nothing is sent.
- **Dark mode.** There is no switch. The portal is the light card theme.
- **A warning when two people edit the same file.** The later save is the one that remains.
- **A production site that hides the TEST banner.** This code is the TEST portal. The banner stays on.
- **Storing the generated CD or ALTA PDF on the file.** The browser saves it. The file's Documents tab does not get a copy.
- **The production database.** This check never uses it.

## Sign-off

Walk the list on TEST. Write Pass or Fail for the whole list. A Fail needs a note that names the check number.

| Name | Role | Date | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
