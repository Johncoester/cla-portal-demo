# TC dashboard EMD, ALTA review, and admin fees

John Coester, chat, Nov 22 2026, 1:23-1:26 PM ET, from TC feedback Nov 20. Tracker items TC-DASH-EMD-1, TC-DASH-ALTA-1, TC-DASH-EMDSTAT-1, and TC-DASH-FEES-1.

## What it is

On the outside Transaction Coordinator dashboard (the My files home from TC-DASHBOARD-1), two cards sit between Outstanding tasks and File overview, and File overview gains two columns.

## Outstanding / overdue EMDs

The coordinator's open files (the same set the dashboard already loads) where earnest money is not marked received.

- Overdue: `emd_due_date` is before today.
- Outstanding: not received, and either not yet due or there is no due date.
- Shown: file number (opens the file), property, EMD amount, due date, holder, and an Overdue badge when it is late.
- Fields (existing deal columns, no new ones): `emd_received`, `emd_amount`, `emd_due_date`, `emd_holder`.
- A file with no amount, due date, or holder is left off. A refinance has no EMD. Closed, on hold, and cancelled files are left off.

## ALTA review needed

Open files whose closing date is today through today+2 (inclusive). File number (opens the file), property, and closing date.

This is a closing-date reminder only. It does not read `alta_received` or any other ALTA status, and it does not add a TC sign-off. Files already past closing, or closing more than 2 days out, are left off.

## File overview columns

- **EMD Received:** Yes or No from `emd_received`. A refinance shows a dash.
- **Admin fees:** the admin fee and any other fees the agent entered on the file, with a short label when there is more than one (for example `Admin fee $395; Courier $50`). The commission stays in its own column. The column is shown only when the person can already see agent fees on that file (the same rule as Commission). Buyers and sellers never see it. Values come from the same `getAgentFees` read already used for Commission, after the page is drawn, at most 12 files.

## Roles

These cards and columns are on the outside-user dashboard (TCs, and any other outside user who already lands on Outstanding tasks / File overview). A client's File overview still has no Commission or Admin fees column. The processor work queue and the staff Transaction Coordinator dashboard are unchanged.

## Speed

No extra list query. EMD fields are added to the dashboard's existing open-file column list. Fee cells reuse the existing capped per-file fee read.

## What's not in this item

- Renaming My files to Dashboard (separate item).
- ALTA sign-off or "ready to send to the client."
- Alerts when an EMD receipt comes in, or when ALTA is marked received.
