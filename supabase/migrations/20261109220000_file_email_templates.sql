-- File-level email templates (John, Nov 9). Admins build shared templates; staff select them on a file's Email tab.
-- Separate from CRM email templates (public.crm_email_templates). Outside users have no access.
-- TEST only (CLA Portal Live Test). Exact rollback: supabase/rollbacks/20261109220000_file_email_templates.sql

do $guard$ begin
  if to_regclass('public.email_templates') is not null then
    raise exception 'email_templates already exists'; end if;
  if (select md5(prosrc) from pg_proc where oid = to_regprocedure('private.is_staffish()')) is distinct from '35a5e24872638d0fd21ad178f90e72e6' then
    raise exception 'drift: private.is_staffish changed or missing'; end if;
  if to_regprocedure('private.is_admin()') is null then
    raise exception 'private.is_admin() missing'; end if;
end $guard$;

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body_html text not null default '',
  scope text not null default 'shared' check (scope in ('personal', 'shared')),
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  category text not null default '',
  active boolean not null default true,
  -- Match keys for auto-attach (doc type / name / folder), e.g. 'Contract', 'Contract / addendum'
  attach_doc_types text[] not null default '{}',
  -- Suggest To from these deal roles when the template is selected
  default_recipient_roles text[] not null default '{}',
  seed_key text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_name_len check (char_length(name) between 1 and 120),
  constraint email_templates_subject_len check (char_length(subject) <= 250),
  constraint email_templates_body_len check (char_length(body_html) <= 200000),
  constraint email_templates_category_len check (char_length(category) <= 60),
  constraint email_templates_attach_len check (coalesce(cardinality(attach_doc_types), 0) <= 12),
  constraint email_templates_roles_len check (coalesce(cardinality(default_recipient_roles), 0) <= 8),
  constraint email_templates_owner_by_scope check (
    (scope = 'personal' and owner_profile_id is not null) or (scope = 'shared'))
);
create unique index email_templates_seed_key_uidx on public.email_templates (seed_key) where seed_key is not null;
create index email_templates_scope_active_idx on public.email_templates (scope, active);

alter table public.email_templates enable row level security;
revoke all on public.email_templates from public, anon, authenticated;
grant select, insert, update on public.email_templates to authenticated;
grant all on public.email_templates to service_role;

-- Read: staff see active shared templates (to select on a file). Admins also see inactive shared.
-- Personal rows kept for possible later use; only the owner reads them.
create policy email_templates_select on public.email_templates for select to authenticated using (
  (select private.is_staffish())
  and (
    (scope = 'shared' and (active or (select private.is_admin())))
    or (scope = 'personal' and owner_profile_id = (select auth.uid()))
  )
);

-- Insert: Admins create shared templates (the product model). Personal insert kept but unused in UI.
create policy email_templates_insert on public.email_templates for insert to authenticated with check (
  (select private.is_staffish())
  and (
    (scope = 'shared' and (select private.is_admin()) and created_by = (select auth.uid()))
    or (scope = 'personal' and owner_profile_id = (select auth.uid()) and created_by = (select auth.uid()))
  )
);

-- Update: Admin edits shared; owner edits personal. No deletes (deactivate via active = false).
create policy email_templates_update on public.email_templates for update to authenticated using (
  (select private.is_staffish())
  and (
    (scope = 'shared' and (select private.is_admin()))
    or (scope = 'personal' and owner_profile_id = (select auth.uid()))
  )
) with check (
  (select private.is_staffish())
  and (
    (scope = 'shared' and (select private.is_admin()))
    or (scope = 'personal' and owner_profile_id = (select auth.uid()))
  )
);

insert into public.email_templates (name, subject, body_html, scope, owner_profile_id, category, active, attach_doc_types, default_recipient_roles, seed_key, created_by, updated_by)
select v.name, v.subject, v.body_html, 'shared', null, v.category, true, v.attach, v.roles, v.seed_key, null, null
from (values
  ('Processor intro', 'Introduction for {{file_number}}',
   '<p>Hi {{recipient_first_name}},</p><p>My name is {{sender_name}}, and I am your processor at CLA Title &amp; Escrow for {{property_address}} (order {{file_number}}). I will be your point of contact from now until closing.</p><p>Please reply to this email with any questions. If we have a closing date on the file, it currently shows as {{closing_date}}.</p><p><strong>Wire fraud warning:</strong> CLA Title &amp; Escrow will never email you wire instructions or ask you to change them by email.</p><p>Thank you,</p>',
   'Introduction', '{}'::text[], array['Client-Buyer','Client-Seller','Buyer Agent','Listing Agent']::text[], 'processor-intro'),
  ('Order opened / welcome', 'Welcome — we opened {{file_number}}',
   '<p>Hello {{buyer_first_name}},</p><p>We have opened your file <strong>{{file_number}}</strong> for {{property_address}}. Your processor is {{processor_name}} ({{processor_email}}).</p><p>We will be in touch with next steps. If anything looks wrong on the order, reply here.</p><p>Thank you,</p>',
   'Opening', array['Contract']::text[], array['Client-Buyer']::text[], 'order-opened'),
  ('Closing scheduled', 'Closing scheduled for {{file_number}}',
   '<p>Hello {{recipient_first_name}},</p><p>Closing for <strong>{{file_number}}</strong> at {{property_address}} is currently set for <strong>{{closing_date}}</strong>.</p><p>Buyers: {{buyer_names}}<br>Sellers: {{seller_names}}<br>Lender: {{lender}}</p><p>Please reply if this date needs to change.</p><p>Thank you,</p>',
   'Closing', '{}'::text[], array['Client-Buyer','Client-Seller','Buyer Agent','Listing Agent']::text[], 'closing-scheduled')
) as v(name, subject, body_html, category, attach, roles, seed_key)
where not exists (select 1 from public.email_templates e where e.seed_key = v.seed_key);
