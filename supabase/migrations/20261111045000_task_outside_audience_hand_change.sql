-- Hand change on TEST between Nov 5 and Nov 11. Already on TEST. Do not apply this file to TEST again.
-- Not in TEST's migration history. Kept so a fresh database reaches the task audience check.
-- private.task_outside_audience body copied exactly from supabase/rollbacks/20261111050000_task_audience_read.sql.
-- The body differs from the Nov 5 statement only where that statement calls auth.uid(). This copy calls private.effective_uid().
-- The create line also sets search_path to pg_catalog, public, extensions. The Nov 5 statement sets search_path to public.
create or replace function private.task_outside_audience(p_task uuid)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
  select exists (select 1 from public.tasks t where t.id = p_task and t.audiences is not null and (
    ('Client-Buyer' = any (private.deal_roles(t.deal_id)) and 'buyer' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Client-Seller' = any (private.deal_roles(t.deal_id)) and 'seller' = any (t.audiences) and t.owner_profile_id = (select private.effective_uid()) and not (t.audiences = array['internal']::text[]))
    or ('Buyer Agent' = any (private.deal_roles(t.deal_id)) and 'buyer_agent' = any (t.audiences))
    or ('Listing Agent' = any (private.deal_roles(t.deal_id)) and 'listing_agent' = any (t.audiences)))) $function$;
