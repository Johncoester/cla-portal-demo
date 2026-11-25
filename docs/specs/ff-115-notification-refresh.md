# Notifications appear without a refresh (FF-115)

**Requested by:** Francis Santos. Source: Gemini notes of the Nov 23 2026 2:35 PM ET meeting (Gmail 1a20abbd6b7e823a). Confirm-back 1a20af12dc3a104a. She confirmed "Both" (bell/badge and inbox/activity list) on Nov 24 2026 at 6:18 PM ET, via Francis Feedback.

**Status:** In progress. Tracker row 468. Not Live until this is merged, the database file is applied on TEST, and someone checks it on TEST. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

A processor (or anyone signed in) no longer has to refresh the page to see a new notification.

- The number on the bell updates when a new unread notification arrives, and when one is marked read.
- The list under the bell (the notifications inbox) also updates on its own when that menu is open.
- This happens on both the bell badge and the list.

## How it stays fast

The first count is the one the shell already loads. The live update does not add a second read when the page first draws. On TEST, the page listens for changes to the signed-in person's rows in `notifications` (Supabase Realtime, after the database file is applied). If that listen is not available (for example in the mock demo, or if the listen fails), the page checks again every 30 seconds, and pauses that check while the tab is hidden. The listen is closed on logout and when the signed-in person changes (including View as).

## What this does not change

- Who can see which notifications (Row Level Security is unchanged).
- Clicking a notification still closes the menu and opens the item (FF-064 / FF-065).
- The Activity Log page (`#/activity`) is a different list (file and user activity) and is not part of this item.
- The database file is not applied by the pull request itself.
