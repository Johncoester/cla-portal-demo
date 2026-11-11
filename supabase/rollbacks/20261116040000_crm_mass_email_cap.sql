-- Restores mass email with no recipient cap. Drafts only. The id list and the dry-run count are removed.
begin;
set local lock_timeout = '3s';

drop function if exists public.crm_mass_email(text, jsonb, text, text, uuid[], boolean);
drop function if exists public.crm_mass_email(text, jsonb, text, text);

create function public.crm_mass_email(p_module text, p_filter jsonb, p_subject text, p_html text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  -- EMAIL_DRAFT_BATCH: drafts inserted per statement. Not a cap on the send.
  batch_size constant int := 500;
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  subject text := left(regexp_replace(btrim(coalesce(p_subject, '')), '[\r\n]+', ' ', 'g'), 250);
  body text := left(coalesce(p_html, ''), 200000);
  sender text;
  wrote int := 0;
  n int;
  off int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if subject = '' then raise exception 'Subject is required.' using errcode = '22023'; end if;
  select lower(btrim(coalesce(p.email, ''))) into sender from public.profiles p where p.id = auth.uid();
  create temp table if not exists crm_mass_recip (
    n int generated always as identity,
    entity text not null,
    entity_id uuid not null,
    email text not null
  ) on commit drop;
  truncate crm_mass_recip restart identity;
  if m = 'lead' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'lead', l.id, lower(btrim(l.email)) from public.crm_leads l
    where l.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(l.email, '')) <> '' and position('@' in l.email) > 0;
  elsif m = 'contact' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.contacts c
    where c.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'account' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'account', a.id, lower(btrim(c.email)) from public.crm_accounts a
    join public.contacts c on c.account_id = a.id
    where a.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'opportunity' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.crm_opportunities o
    join public.contacts c on c.id = o.contact_id
    where o.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'deal' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'deal', g.id, lower(btrim(c.email)) from public.deals g
    join public.deal_participants p on p.deal_id = g.id
    join public.contacts c on c.id = p.contact_id
    where g.id in (select public.crm_match_ids(m, p_filter)) and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  delete from crm_mass_recip r using crm_mass_recip e where r.email = e.email and r.n > e.n;
  loop
    insert into public.crm_emails (entity, entity_id, from_email, to_emails, cc_emails, bcc_emails, subject, body_html, status, scheduled_at, created_by)
    select r.entity, r.entity_id, coalesce(sender, ''), array[r.email], '{}', '{}', subject, body, 'drafted', null, auth.uid()
    from crm_mass_recip r where r.n > off and r.n <= off + batch_size;
    get diagnostics n = row_count;
    exit when n = 0;
    wrote := wrote + n;
    off := off + batch_size;
  end loop;
  return jsonb_build_object('count', wrote, 'drafted', wrote, 'skipped', 0);
end
$$;

revoke all on function public.crm_mass_email(text, jsonb, text, text) from public, anon;
grant execute on function public.crm_mass_email(text, jsonb, text, text) to authenticated;
commit;
