# Gmail on Messages (CONNECT-6)

**Requested by:** John Coester, Nov 25 2026, 7:49 PM ET, Connect Live Test Checklist row 9.3. Francis Santos failed the row on Nov 25 2026: emails sent from staff Gmail through the portal arrived in the buyers', sellers', and agents' Gmail inboxes, but they were not visible in the Messages section of the portal. Expected result: the email arrives, and the reply shows on the order.

**Status:** In progress (pull request open). Database file `supabase/migrations/20261131270000_connect_6_gmail_messages.sql` is not applied on TEST until the pull request merges (rule 27 review first). Tracker row to be added when the pull request opens.

## What it does

Staff already send from their own connected @clatitle.com Gmail on the file Email tab. Those sends, and replies in the same Gmail thread (picked up every few minutes, or with Check for replies), are stored on `public.deal_emails`. Until this item, only the Email tab listed them. The Email tab is staff-only, so a buyer, seller, or agent looking at Messages never saw that mail.

This item lists those Gmail threads on the order's Messages / Inbox tab, together with in-portal conversations, newest first, with an Email badge. Opening a thread shows the sent email and any replies already stored for that Gmail thread. Staff with Gmail connected can reply from Messages (same compose as the Email tab) or check for new replies. A buyer, seller, or agent can read mail they are on, and is told to reply from the email they received; that reply appears here after it is delivered.

## How to test it (TEST, fake data only)

Use only `clatestportal+e2e-*@gmail.com` addresses for any test send. Do not email a real client or a non-test address.

1. Sign in as a staff member with Gmail connected (Profile Setting > Gmail).
2. Open a test order. On Email (or Messages), send a short test email to a `clatestportal+e2e-*@gmail.com` party on the file. Confirm it arrived in that Gmail inbox.
3. Open the same order's Inbox / Messages tab. The email is in the list, marked Email. Open it: the sent message is there.
4. From the test Gmail inbox, reply to that email. On the order, click Check for replies (or wait a few minutes). The reply appears in the same Messages conversation.
5. Sign in as that buyer, seller, or agent. Messages shows the same thread. There is no Reply-from-Gmail button. A seller-only email to someone else does not appear.
6. Wrong path: open a Messages link for a Gmail thread you are not on. The page says that email is not on this file, or you do not have access.

## What's not done

- The staff Email tab is unchanged and still lists the same mail.
- Open Orders icons still count Gmail unread through table row security (staff only). The Messages badge on the file itself includes Gmail the viewer can see.
- Check at / composing a new Gmail email still starts from the Email tab (or, for staff, Reply on a Messages Gmail thread). "Start conversation" is still in-portal only.
- Answered nothing about portal@ fallback or Remind (those are other items).

## Technical notes

- `public.list_deal_emails(p_deal uuid)` is SECURITY DEFINER, `search_path` fixed, execute granted to `authenticated` only. It checks `private.can_access_deal` and that the file's `is_demo` flag matches `private.viewer_is_demo()`, so a demo staff login cannot read a real file's emails. Staff (`private.is_staffish`) see every email on a matching file, including bcc. Other people who can open the file see rows where their profile email is on From, To, Cc, or Bcc; `bcc_emails` is always `{}`, and `sent_by`, `mailbox_profile_id`, and `template_key` are null.
- Table RLS on `public.deal_emails` is not changed (staff select only). `private.validate_form`, send/sync functions, and deals RLS are not changed. Rule 27 applies because of the new security-definer function.
- The page never holds a Gmail token. Sync already uses `gmail.send` and `gmail.readonly`, which are already granted on the connected TEST mailboxes. No new secrets.
