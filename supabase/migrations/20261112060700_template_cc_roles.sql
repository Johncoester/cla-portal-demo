-- Suggested Cc roles on a file email template. Read with the template row the Email tab already loads.
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

do $readback$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'email_templates' and column_name = 'default_cc_roles'
  ) then
    raise exception 'readback: default_cc_roles is missing';
  end if;
end
$readback$;
commit;
