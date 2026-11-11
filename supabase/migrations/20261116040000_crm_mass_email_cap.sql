-- Mass email stays a draft. A deduplicated recipient list over 250 is refused
-- before any row is inserted. The same list is counted when p_dry_run is true,
-- so the confirmation and the save cannot disagree. One constant is the cap.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

drop function if exists public.crm_mass_email(text, jsonb, text, text);
drop function if exists public.crm_mass_email(text, jsonb, text, text, uuid[], boolean);

create function public.crm_mass_email(p_module text, p_filter jsonb, p_subject text, p_html text, p_ids uuid[] default null, p_dry_run boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  -- EMAIL_DRAFT_BATCH: drafts inserted per statement. Not the recipient cap.
  batch_size constant int := 500;
  -- EMAIL_RECIPIENT_CAP: deduplicated addresses. Change this one number to move the limit.
  recipient_cap constant int := 250;
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  subject text := left(regexp_replace(btrim(coalesce(p_subject, '')), '[\r\n]+', ' ', 'g'), 250);
  body text := left(coalesce(p_html, ''), 200000);
  sender text;
  wrote int := 0;
  n int;
  recip_n int;
  off int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if not coalesce(p_dry_run, false) and subject = '' then raise exception 'Subject is required.' using errcode = '22023'; end if;
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
    where case when p_ids is null then l.id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else l.id = any(p_ids) end
      and btrim(coalesce(l.email, '')) <> '' and position('@' in l.email) > 0;
  elsif m = 'contact' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.contacts c
    where case when p_ids is null then c.id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else c.id = any(p_ids) end
      and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'account' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'account', a.id, lower(btrim(c.email)) from public.crm_accounts a
    join public.contacts c on c.account_id = a.id
    where case when p_ids is null then a.id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else a.id = any(p_ids) end
      and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'opportunity' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'contact', c.id, lower(btrim(c.email)) from public.crm_opportunities o
    join public.contacts c on c.id = o.contact_id
    where case when p_ids is null then o.id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else o.id = any(p_ids) end
      and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  elsif m = 'deal' then
    insert into crm_mass_recip (entity, entity_id, email)
    select 'deal', g.id, lower(btrim(c.email)) from public.deals g
    join public.deal_participants p on p.deal_id = g.id
    join public.contacts c on c.id = p.contact_id
    where case when p_ids is null then g.id in (select public.crm_match_ids(m, coalesce(p_filter, '{}'::jsonb))) else g.id = any(p_ids) end
      and btrim(coalesce(c.email, '')) <> '' and position('@' in c.email) > 0;
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  delete from crm_mass_recip r using crm_mass_recip e where r.email = e.email and r.n > e.n;
  select count(*) into recip_n from crm_mass_recip;
  if coalesce(p_dry_run, false) then
    return jsonb_build_object('count', recip_n, 'recipients', recip_n, 'drafted', 0, 'cap', recipient_cap, 'over', recip_n > recipient_cap);
  end if;
  if recip_n = 0 then
    raise exception 'None of these records have an email address. Nothing was saved.' using errcode = '22023';
  end if;
  if recip_n > recipient_cap then
    raise exception '% recipients is over the limit of %. Nothing was saved.', recip_n, recipient_cap using errcode = '22023';
  end if;
  loop
    insert into public.crm_emails (entity, entity_id, from_email, to_emails, cc_emails, bcc_emails, subject, body_html, status, scheduled_at, created_by)
    select r.entity, r.entity_id, coalesce(sender, ''), array[r.email], '{}', '{}', subject, body, 'drafted', null, auth.uid()
    from crm_mass_recip r where r.n > off and r.n <= off + batch_size;
    get diagnostics n = row_count;
    exit when n = 0;
    wrote := wrote + n;
    off := off + batch_size;
  end loop;
  return jsonb_build_object('count', wrote, 'drafted', wrote, 'recipients', recip_n, 'cap', recipient_cap, 'over', false);
end
$$;

revoke all on function public.crm_mass_email(text, jsonb, text, text, uuid[], boolean) from public, anon;
grant execute on function public.crm_mass_email(text, jsonb, text, text, uuid[], boolean) to authenticated;

do $readback$
declare src text;
begin
  if to_regprocedure('public.crm_mass_email(text, jsonb, text, text)') is not null then
    raise exception 'readback: the old mass email is still callable';
  end if;
  select pg_get_functiondef('public.crm_mass_email(text, jsonb, text, text, uuid[], boolean)'::regprocedure) into src;
  if position('private.' in src) > 0 then
    raise exception 'readback: mass email calls private';
  end if;
  if position('recipient_cap constant int := 250' in src) = 0 then
    raise exception 'readback: the recipient cap is missing';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.crm_mass_email(text, jsonb, text, text, uuid[], boolean)'::regprocedure) then
    raise exception 'readback: mass email is security definer';
  end if;
  if (select proconfig::text from pg_proc where oid = 'public.crm_mass_email(text, jsonb, text, text, uuid[], boolean)'::regprocedure) not like '%search_path%' then
    raise exception 'readback: search_path is not pinned';
  end if;
  if position('recipients is over the limit' in src) = 0
     or position('recipients is over the limit' in src) > position('insert into public.crm_emails' in src) then
    raise exception 'readback: the cap does not run before the insert';
  end if;
  if position('p_dry_run' in src) = 0 or position('id = any(p_ids)' in src) = 0 then
    raise exception 'readback: the count and the id list are missing';
  end if;
end
$readback$;
commit;
