# Settlement and disbursement dates on File Overview (FF-097)

Source: Francis Santos, email "Closing Date", Nov 17 2026, 2:31 PM ET (Gmail message 1a1eafe6e1a32dde). She was signed in as Processor 2 on TEST. Tracker FF-097.

## What was asked

1. On File Overview there was no way to change the closing date. Staff who can already edit the file can change the settlement date at the top of the file. It saves, stays after a reload, and is the same date tasks, Scheduling Details, Accounting Basic Info, and prorations already read. Agents, buyers, and sellers stay read-only.
2. The disbursement date shows next to the settlement date, and the same people can edit it.

John's separate change, where a buyer's "+ Propose a closing time" would lock the file date, is not part of this item. Proposing a time still does not write the file's settlement date.

## What it does

The sticky file header shows Settlement date and Disbursement date side by side. A processor, a pre-processor, or an admin gets a date field for each. Everyone else sees the dates as text. Demo view stays read-only.

Saving writes `deals.closing_date` and `deals.disbursement_date`, the columns that already exist. A blank disbursement date stays automatic: the closing date on a purchase, and the 4th business day after closing on a refinance. Clearing a stored disbursement date returns to that automatic date.

Tasks, Scheduling Details, Accounting, and prorations already read `deals.closing_date`. Accounting Basic Info (FF-094, a separate open change) reads the same two order fields. This save is what those screens show.

## What is not in this change

No database file. On TEST, `deals_schedule_guard` refuses direct edits of the scheduling columns and does not mention `closing_date` or `disbursement_date`. `deals_update` allows a processor, an admin, or a pre-processor on a file assigned to them (`private.can_run_deal`). Authenticated users already have update on both columns.

A buyer's proposed closing time still does not change the file date. Not Live until someone checks it on TEST.
