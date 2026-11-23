# Open a document folder (FF-107, items 1-4)

Source: Francis Santos, email Nov 20 2026, 9:37 AM ET. She confirmed items 1-4 on Nov 23 2026, 12:04 PM ET (Gmail 1a2095e4887afd30): clickable folders that open and show the documents inside; upload inside an open folder; list and preview the files in each folder; download from inside a folder. Item 5 (move from inside a folder, and whether Sales can move) and the "save" question are still unclear and are not in this change. Tracker row FF-107. The Word editor stays held.

## What was asked

On an order's Documents page, each folder should be clickable and should open to show the documents inside. A person who can already upload can upload into the open folder. They can list, preview, and download those files. Do not build move-from-inside-a-folder or anything about "save". Sales still cannot move files. Existing document visibility and permissions per role stay as they are.

## What it does

On the Folders tab, each folder name (including Unfiled) is a link. Opening one shows that folder's files with the same preview and download actions as All files, a way back to the folder list, and Upload here pre-set to that folder for people who can upload. The Move control stays on the folder list only, and only for the same roles that can move today. Sales can open a folder and see the files; they still cannot add a folder, move a file, or upload. Buyers, sellers, and agents still do not get the Folders tab, including if they follow a folder link. A staff-only file in a folder is still hidden from them.

## What is not in this change

Move from inside an open folder, any new "save" action, and the held Word editor are not built. Sales cannot move files. No database file. Folder structure and retention are unchanged. Not Live until the pull request is merged and checked on TEST.
