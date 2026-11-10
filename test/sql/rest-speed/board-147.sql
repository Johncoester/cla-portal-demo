-- The task_board body from 20261111060000, for the "147 already applied" path.
create or replace function private.participant_visible(d uuid, prole text)
returns boolean
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $$
  select private.can_access_deal(d)
     and not (private.deal_role(d) in ('Client-Buyer', 'Client-Seller') and prole like 'Client-%' and prole <> private.deal_role(d))
     and not (prole = 'Listing Agent' and private.is_pure_buyer(d))
     and not (prole = 'Buyer Agent' and private.is_pure_seller(d))
$$;

create function private.task_owner_name(p_participant uuid, p_deal uuid)
returns text
language sql stable security definer
set search_path = pg_catalog, public, extensions
as $fnbody$
  select trim(c.first_name || ' ' || c.last_name)
  from public.deal_participants dp join public.contacts c on c.id = dp.contact_id
  where dp.id = p_participant and dp.deal_id = p_deal and private.participant_visible(p_deal, dp.role)
  limit 1 $fnbody$;

create or replace function public.task_board(p_file_status text DEFAULT 'All'::text)
returns TABLE(id uuid, deal_id uuid, title text, description text, assigned_role text, status text, due_date date, completed_at timestamp with time zone, completed_by uuid, kind text, participant_id uuid, owner_profile_id uuid, template_code text, template_version integer, created_at timestamp with time zone, file_number text, street text, city text, state text, zip text, closing_date date, deal_status text, owner_name text, overdue boolean)
language sql stable security invoker
set search_path = pg_catalog, public, extensions
as $fnbody$
  select t.id, t.deal_id, t.title, t.description, t.assigned_role, t.status, t.due_date, t.completed_at, t.completed_by,
         t.kind, t.participant_id, t.owner_profile_id, t.template_code, t.template_version, t.created_at,
         d.file_number, d.street, d.city, d.state, d.zip, d.closing_date, d.status,
         case when t.participant_id is not null then private.task_owner_name(t.participant_id, t.deal_id) end,
         (t.status in ('todo', 'in_progress', 'blocked') and t.due_date is not null and t.due_date < private.office_today())
  from public.tasks t join public.deals d on d.id = t.deal_id
  where coalesce(p_file_status, 'All') = 'All' or d.status = p_file_status
  order by d.file_number, t.due_date nulls last, t.title $fnbody$;
