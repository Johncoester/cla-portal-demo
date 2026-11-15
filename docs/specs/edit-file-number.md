# Edit File Number (FF-050)

Source: Francis's email, tracker row 176. John Coester asked for it as the next weekend item on Nov 15 2026. No video.

## What was asked

Keep giving new files a number automatically. Add Edit File Number under Configuration so staff can change a file's number to match CLA's internal numbering or a transaction reference.

## What it does

On a file, staff who can already edit that file see Configuration, and under it Edit File Number. They type the new number and save. Open Orders, the file header, and search then show that number.

A blank number is refused. A number already on another file is refused, and the old number stays. The activity log records the old number and the new one.

A sales person, a buyer, a seller, or an agent does not get the button, and the save is refused if they try it.

## What is not in this change

New files are still numbered automatically. This does not renumber every file. The database file must be applied on TEST before the activity note is written there.
