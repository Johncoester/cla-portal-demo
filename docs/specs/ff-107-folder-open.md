# Open a document folder (FF-107, items 1-5)

Source: Francis Santos, email Nov 20 2026, 9:37 AM ET. She confirmed items 1-4 on Nov 23 2026, 12:04 PM ET (Gmail 1a2095e4887afd30): clickable folders that open and show the documents inside; upload inside an open folder; list and preview the files in each folder; download from inside a folder. She confirmed item 5 on Nov 23 2026, 12:23 PM ET (Gmail 1a2096f682f1ada4): a Move button inside each open folder, and Sales still cannot move files. "Save" means editing a document, which is the held Word editor, so it is not built. Tracker row FF-107.

## What was asked

On an order's Documents page, each folder should be clickable and should open to show the documents inside. A person who can already upload can upload into the open folder. They can list, preview, and download those files. Staff who can already move files get a Move button inside the open folder that moves a file to another folder. Sales still cannot move files. The Word editor stays held. Existing document visibility and permissions per role stay as they are.

## What it does

On the Folders tab, each folder name (including Unfiled) is a link. Opening one shows that folder's files with the same preview and download actions as All files, a way back to the folder list, and Upload here pre-set to that folder for people who can upload. Roles that can already move files also get a Move button inside the open folder, listing that folder's files and the other folders they can move into. The folder list still has its own Move control. Sales can open a folder and see the files; they still cannot add a folder, move a file, or upload. Buyers, sellers, and agents still do not get the Folders tab, including if they follow a folder link. A staff-only file in a folder is still hidden from them.

## What is not in this change

The held Word editor, and any new "save" or edit-document action, are not built. Sales cannot move files. No database file. Folder structure and retention are unchanged. Not Live until the pull request is merged and checked on TEST.
