-- Removes suggested Cc roles. To roles stay.
begin;
set local lock_timeout = '3s';
alter table public.email_templates drop constraint if exists email_templates_cc_roles_len;
alter table public.email_templates drop column if exists default_cc_roles;
commit;
