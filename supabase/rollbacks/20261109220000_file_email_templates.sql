-- Rollback file-level email templates (20261109220000). Drops the table and its policies.
drop policy if exists email_templates_update on public.email_templates;
drop policy if exists email_templates_insert on public.email_templates;
drop policy if exists email_templates_select on public.email_templates;
drop table if exists public.email_templates;
