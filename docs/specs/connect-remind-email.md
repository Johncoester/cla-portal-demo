# Remind emails the client (CONNECT-REMIND)

Pull request: [PR 454](https://github.com/Johncoester/cla-portal-demo/pull/454). Checklist row 6.3.

Asked by John Coester, Nov 25 2026, 9:02 PM ET (voice call), from the team's Connect Live Test Checklist, row 6.3: the processor's
Remind on a buyer task said "CLA Portal Live Test does not send email. Nothing was queued." Make Remind queue a real outbox email,
using the existing Gmail-connected sender. portal@clatitle.com stays a From-name stamp only; no portal@ fallback.

## How it works

- Order > Tasks: processors and coordinators (and Admin) see **Remind** on each open task.
- Remind calls `queue_task_reminder(task)` (already on TEST). It refuses a task you can not open, a closed task, and anyone who is not
  a processor, coordinator or Admin. It adds one outbox email per person the task is for (the task's owner, or every active portal user
  in the task's role on the file), at most one per person per task per day, plus a bell notice, and logs "Reminder queued" in Activity.
- outbox-send (every minute) sends the row from the **file's processor's connected Gmail**. The From is the processor's name and Gmail address.
- If the processor's Gmail is not connected (or needs reconnecting), the row is marked Failed with
  "Not sent: <name>'s Gmail is not connected to the portal (Profile Setting > Gmail > Connect)." and is not retried, the same as every outbox email.
- Toasts: "Reminder email queued. It goes out from this file's processor's Gmail within a few minutes. Outbox shows whether it was sent." or
  "No reminder was queued. This task already got one today, or the person it is for has no active portal login yet."

## The email

- Subject: `Reminder: <task title> (<file number>)`
- Body: "Hello <first name>, This is a reminder about "<task title>" on order <file number>, due <date>. Please sign in to the portal to finish it. CLA Title & Escrow"
- Earnest money deposit receipt tasks, to a buyer: subject "Reminder: earnest money deposit not received yet (<file number>)" and a deposit-specific body.

## Not done

- Dashboard "Remind overdue" is unchanged (still the no-email message).
- No portal link in the body.
