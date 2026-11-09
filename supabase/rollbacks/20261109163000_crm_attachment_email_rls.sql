-- Exact rollback of 20261109163000_crm_attachment_email_rls.sql.
-- One transaction. lock_timeout 3s. Refuses unless the two email policies
-- still deparse to the corrected email-id join, then restores the captured
-- preimage (e.id = e.entity_id). No helper and no other policy is changed.

begin;
set local lock_timeout = '3s';
set local search_path = pg_catalog, public, extensions;

do $pre$
declare
  n int;
  q text;
  chk text;
  cmd "char";
  perm boolean;
  roles text[];
begin
  select count(*) into n
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments';
  if n is distinct from 6 then
    raise exception 'drift: public.crm_attachments has % policies, expected 6', n;
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select_email';
  if q is distinct from $q$((entity = 'email'::text) AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = crm_attachments.entity_id) AND private.crm_email_record_visible(e.entity, e.entity_id)))))$q$
     or chk is not null or cmd is distinct from 'r' or perm is distinct from true
     or roles is distinct from array['authenticated'] then
    raise exception 'drift: crm_att_select_email is not the corrected policy';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert_email';
  if chk is distinct from $q$((entity = 'email'::text) AND private.crm_editor() AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = crm_attachments.entity_id) AND (e.created_by = private.effective_uid())))))$q$
     or q is not null or cmd is distinct from 'a' or perm is distinct from true
     or roles is distinct from array['authenticated'] then
    raise exception 'drift: crm_att_insert_email is not the corrected policy';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into q
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select';
  if q is distinct from $q$private.crm_entity_visible(entity, entity_id)$q$ then
    raise exception 'drift: crm_att_select is not the captured neighbor';
  end if;

  select pg_get_expr(pol.polwithcheck, pol.polrelid) into chk
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert';
  if chk is distinct from $q$(private.crm_editor() AND private.crm_entity_visible(entity, entity_id))$q$ then
    raise exception 'drift: crm_att_insert is not the captured neighbor';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into q
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select_tpl';
  if q is distinct from $q$((entity = 'template'::text) AND private.crm_template_visible(entity_id))$q$ then
    raise exception 'drift: crm_att_select_tpl is not the captured neighbor';
  end if;

  select pg_get_expr(pol.polwithcheck, pol.polrelid) into chk
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert_tpl';
  if chk is distinct from $q$((entity = 'template'::text) AND private.crm_template_editable(entity_id))$q$ then
    raise exception 'drift: crm_att_insert_tpl is not the captured neighbor';
  end if;
end
$pre$;

alter policy crm_att_select_email on public.crm_attachments
  using (
    (entity = 'email'::text)
    and exists (
      select 1
      from public.crm_emails e
      where e.id = e.entity_id
        and private.crm_email_record_visible(e.entity, e.entity_id)
    )
  );

alter policy crm_att_insert_email on public.crm_attachments
  with check (
    (entity = 'email'::text)
    and private.crm_editor()
    and exists (
      select 1
      from public.crm_emails e
      where e.id = e.entity_id
        and e.created_by = private.effective_uid()
    )
  );

do $post$
declare
  n int;
  q text;
  chk text;
  cmd "char";
  perm boolean;
  roles text[];
begin
  select count(*) into n
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments';
  if n is distinct from 6 then
    raise exception 'readback: public.crm_attachments has % policies, expected 6', n;
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select_email';
  if q is distinct from $q$((entity = 'email'::text) AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = e.entity_id) AND private.crm_email_record_visible(e.entity, e.entity_id)))))$q$
     or chk is not null or cmd is distinct from 'r' or perm is distinct from true
     or roles is distinct from array['authenticated'] then
    raise exception 'readback: crm_att_select_email did not return to the preimage';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid), pg_get_expr(pol.polwithcheck, pol.polrelid),
         pol.polcmd, pol.polpermissive,
         array(select r.rolname::text from pg_roles r where r.oid = any (pol.polroles) order by 1)
    into q, chk, cmd, perm, roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert_email';
  if chk is distinct from $q$((entity = 'email'::text) AND private.crm_editor() AND (EXISTS ( SELECT 1
   FROM crm_emails e
  WHERE ((e.id = e.entity_id) AND (e.created_by = private.effective_uid())))))$q$
     or q is not null or cmd is distinct from 'a' or perm is distinct from true
     or roles is distinct from array['authenticated'] then
    raise exception 'readback: crm_att_insert_email did not return to the preimage';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into q
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select';
  if q is distinct from $q$private.crm_entity_visible(entity, entity_id)$q$ then
    raise exception 'readback: crm_att_select changed';
  end if;

  select pg_get_expr(pol.polwithcheck, pol.polrelid) into chk
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert';
  if chk is distinct from $q$(private.crm_editor() AND private.crm_entity_visible(entity, entity_id))$q$ then
    raise exception 'readback: crm_att_insert changed';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid) into q
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_select_tpl';
  if q is distinct from $q$((entity = 'template'::text) AND private.crm_template_visible(entity_id))$q$ then
    raise exception 'readback: crm_att_select_tpl changed';
  end if;

  select pg_get_expr(pol.polwithcheck, pol.polrelid) into chk
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'crm_attachments' and pol.polname = 'crm_att_insert_tpl';
  if chk is distinct from $q$((entity = 'template'::text) AND private.crm_template_editable(entity_id))$q$ then
    raise exception 'readback: crm_att_insert_tpl changed';
  end if;
end
$post$;

commit;
