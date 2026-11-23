# Document folders (FF-104)

Source: Francis Santos, email Nov 19 2026, 1:15 PM ET, "Add Document Folders - No Changes to Existing Features", with the picture "CLA Workspace Documents and Seller Affidavit.png". She confirmed the reading on Nov 19 2026, 2:35 PM ET (Gmail msg 1a1f54e71ce7e8b6). Tracker rows FF-104a and FF-104b. John asked for Phase 1 only.

## What the user sees in Phase 1

On an order's Documents page, the tabs are All files, Received, Sent, and Folders. The first three tabs stay as they are, including search, sort, upload, and share.

Folders lists the folders already on that order, with how many files are in each one, and Unfiled last. A processor, pre-processor, transaction coordinator, admin, or super admin can add a folder and move a document into a folder. Sales staff can open the tab and see the counts. They cannot add or move, the same way they cannot change an order today.

A buyer, seller, agent, or other outside role does not see the Folders tab.

A blank folder name, a name already used on that order, a move with no document chosen, and a move into the folder the file is already in each stay on the form and say what to do next.

## What Phase 1 does not include

These were in Francis's email and picture. John has not decided them, so they are not on the page:

- Master Template Library
- Generate
- Search Packages
- A Word editor, or Download Word / Download PDF
- The toolbar Merge, Delete, Rename, Refresh, Download, Print, Send, eSign
- A Drafts section

There is no new button for any of those.

## Default folders (FF-104b)

A new closing order gets these eight folders, in place of Contract & addenda, IDs & personal, Lender & payoff, HOA, and Closing:

1. 100 Processing
2. 200 Title
3. 300 Payoffs and Invoices
4. 400 Lender Closing Instructions
5. 450 Final Closing Documents
6. 500 Post Closing - Final Signed Docs
7. 600 Funds, Agent Commission Wire Instructions
8. 700 Recorded Documents and Policies

600 is one folder, with that full name. 450 is Final Closing Documents, as in Francis's picture.

Orders, folders, and documents that already exist are not renamed, moved, or removed.

## Who can use it

Francis: super admin and authorized administrators manage the template library (later). All authorized staff can use the Folders tab.

Authorized staff here means a CLA login: Processor, Preprocessor, Transaction Coordinator, Sales Person, Sales Team, Admin, and Super admin. Outside users never see the tab, including when they are the buyer, seller, or agent on the file.

## Decisions

- Phase 1 is two pull requests: the tab (FF-104a), then the eight default folders on new orders only (FF-104b).
- The Title module keeps its own folder names, including "450 Prior Closing Documents", which is not the same folder as "450 Final Closing Documents". Shared names are one folder, not two. FF-104b explains how that is kept.
- eSign provider, the Word editor, and Delete / retention are not decided. They are not built.

## Opening a folder (FF-107)

Francis later confirmed that folders should open to show the files inside. That work is described in [ff-107-folder-open.md](ff-107-folder-open.md).
