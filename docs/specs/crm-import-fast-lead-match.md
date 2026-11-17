# CRM import note match speed

**Requested by:** The portal lead, Nov 17 2026, as its own pull request after CRM-201 (PR 314, commit 057f6da0). No separate tracker row was named.

**Status:** In progress. Not Live until the portal lead applies `supabase/migrations/20261125120000_crm_import_fast_lead_match.sql` on TEST. This change does not apply that file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

Nothing on the screen changes. A note preview still says whether each row is ready, a duplicate, or what to fix, and it still saves nothing. The lead or client attached to a note is the same person as before.

What changes is how long a note preview waits when the lead list is large. Finding the person used to look at the whole lead list once per note row. On a local scratch database with 110,000 leads, 500 note rows took about 15 seconds. After this change the same preview took under half a second. The match itself took a few milliseconds. A 10,000-row people preview stayed about 1.7 seconds, because each new person is still checked and inserted one at a time and that check was already using an index.

## Which person is chosen

Unchanged.

For an email, an open person wins over an archived one. If several are open, or none are, the earliest created date wins. A blank created date would sort last. Stored emails are compared in lower case and are not trimmed. The email typed in the file is trimmed and cut at 200 characters, then lower-cased.

If the email matches nobody, the note falls back to the name. Two people with that name still ask for an email. One person with that name is used, archived or not. The wording of each row's reason is unchanged.

Client notes use the same rule, with the client's archived date instead of the lead's.

## What this does not change

The person duplicate check on a new lead or client is unchanged. It already looks up an open email and a phone number through indexes, one inserted row at a time. A people preview still inserts one person at a time, so a large people file stays slower than a note preview.

No new helper runs once per row. Policies on deals, tasks, and profiles are unchanged. Companies still have no import screen.

The database file is not applied by this change. The portal lead applies it on TEST. It is not applied to production.

## How the lead applies it

Build the two indexes first, outside a transaction, so writing can continue while they are built. Run each statement on its own. Do not wrap them in BEGIN/COMMIT. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, which is why the migration file itself uses an ordinary `CREATE INDEX IF NOT EXISTS`.

```sql
create index concurrently if not exists crm_leads_import_email_idx
  on public.crm_leads (lower(email), (archived_at is null) desc, created_at);
create index concurrently if not exists contacts_import_email_idx
  on public.contacts (lower(email), (crm_archived_at is null) desc, created_at);
```

Then run `supabase/migrations/20261125120000_crm_import_fast_lead_match.sql`. If those indexes already exist, the file leaves them in place and replaces the import function. The file runs only when the current import function body is still the post-PR-314 body, md5 `e5c509d25c438940c4d497d35b7dc485`.

After it commits:

```sql
analyze public.crm_leads;
analyze public.contacts;
```

If the concurrent step is skipped, the migration file builds the same indexes inside its transaction. That takes a short write lock. `lock_timeout` is 3 seconds, so a busy table fails the whole file and changes nothing.

To undo it, run `supabase/rollbacks/20261125120000_crm_import_fast_lead_match.sql`. That puts the PR 314 function back and drops the two indexes, including indexes that were built concurrently under those names.
