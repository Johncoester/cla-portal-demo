-- FF-034 / FF-035. A file email template can store Cc roles beside To.
-- Welcome Opening (seed_key order-opened) stays addressed to the buyer only.
-- The Email tab already loads the template row, so Cc is not a second read.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

alter table public.email_templates
  add column if not exists default_cc_roles text[] not null default '{}';

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_templates_cc_roles_len' and conrelid = 'public.email_templates'::regclass
  ) then
    alter table public.email_templates
      add constraint email_templates_cc_roles_len check (coalesce(cardinality(default_cc_roles), 0) <= 8);
  end if;
end
$constraint$;

update public.email_templates
   set default_recipient_roles = array['Client-Buyer']::text[]
 where seed_key = 'order-opened'
   and default_recipient_roles is distinct from array['Client-Buyer']::text[];

do $readback$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_templates' and column_name = 'default_cc_roles'
  ) then
    raise exception 'readback: default_cc_roles is missing';
  end if;
  if exists (
    select 1 from public.email_templates
    where seed_key = 'order-opened'
      and default_recipient_roles is distinct from array['Client-Buyer']::text[]
  ) then
    raise exception 'readback: Welcome Opening is not buyer only';
  end if;
end
$readback$;
commit;
