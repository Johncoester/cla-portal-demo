# Attach a file to a CRM note (Feedback 27 item 2)

**Requested by:** Janine, the CRM user, confirmed Nov 16 2026. CRM Feedback 27, item 2. She also said a file on a note must not show in the record's Attachments section.

**Status:** In progress. A database file is included and has not been applied. Not on TEST until the lead applies it. Not Live.

## What the user sees

On a Lead, a Client, and a Company, Add Note shows a paperclip. Edit shows a paperclip when the signed-in person wrote that note, or when they are an Admin or Super admin.

Choosing a file shows its name next to the paperclip. Save stores the file on that note. The note lists each file with its size and a link that downloads it. Anyone who can see the note can use the link, including someone who cannot edit it and a processor.

The record's Attachments section does not list those files. A file attached there, the old way, still shows only there.

A note still needs words. A blank note is refused, and the file is not stored. A file type the portal does not allow, or a file over 25 MB, is refused in plain words. If saving the words fails, what was typed stays, and so does the chosen file. If the words save and the file does not, the note stays and the message says to open Edit and choose the file again.

There are no bold, italic, or other text tools. There is no Delete.

Until the database file is applied, the paperclip is hidden and the notes list says attaching a file to a note is not available yet. Adding and editing the words still works.

A note the CRM itself wrote has no Edit button and no paperclip.

## What is stored

The note is the same activity row as before. The file is a row in the same CRM attachment table, with `note_id` set to that note. Rows with no `note_id` are the record's Attachments. The screen loads every file for the record in the attachment read it already does, then keeps the note files on the notes. It does not ask again for each note.

The bytes go to the private `crm` storage bucket, in a `notes/` path for that lead, client, or company and that note. Record attachments are not uploaded by this change.

## What this does not change

Notes still cannot be deleted, and a file on a note cannot be removed. Edit does not move a note onto another record. CRM deal records do not use this notes list.

The database file is `supabase/migrations/20261125200000_crm_note_files.sql`. The lead applies it on TEST. The matching undo is `supabase/rollbacks/20261125200000_crm_note_files.sql`. This change does not run that SQL.
