# Documents From column shows the real sender (FF-113)

Source: Francis Santos, Gemini notes of the Nov 23 2026 2:35 PM ET meeting (Gmail 1a20abbd6b7e823a). Confirm-back 1a20af12dc3a104a. She confirmed "Both" on Nov 24 2026 at 6:18 PM ET: emailed attachments and documents uploaded by agents or clients should both show the real sender. Tracker item FF-113.

## What the user sees

On a file's Documents list, the **From** column shows who actually sent the file:

- An attachment that arrived by email shows the email's From name. If that address is someone on the file, their name and file role are used (for example "Pat Agent" with "Buyer's agent" under it). If they are not on the file, the name is shown with the email address under it.
- A document an agent or client uploaded in the portal still shows that person (for example "Bea Buyer" with "Buyer" under it). This is the same as MF-045.
- A document with no sender on record still says "Not recorded".
- A buyer or seller still sees "CLA Title & Escrow" for a document another party uploaded, the same as today.

## Who can see it

The same people who can already open the file's Documents list. Staff (a Processor, for example) see the email sender on Gmail-copied attachments. Buyers, sellers, and agents do not read the file's email records; those Gmail copies are staff-only, so this does not change what an outside person can see.

## What this does not change

- Who can open or share a document. The stored `uploaded_by` on an emailed attachment stays the processor's mailbox, because sharing and access rules use that field.
- No database file. The email's From is already stored on the file's email record (`deal_emails`). The Documents list reads it when it names the sender. Existing attachment rows that still have that email record show the real sender without a backfill. If the email record is missing or From is blank, the column falls back to the stored uploader (usually the processor) or "Not recorded".

## How to test it

1. Sign in on testportal.clatitle.com as a Processor.
2. Open a file that has both a document an agent or client uploaded and a document that arrived as an email attachment (for example, an inbound email on the Email tab with a file saved to Documents).
3. Open Documents. The upload should show the agent or client in From, not the processor.
4. The emailed attachment should show the email's sender (their name and, if they are not on the file, their address), not the processor who owns the mailbox.
5. A document with no sender on record should still say "Not recorded".
