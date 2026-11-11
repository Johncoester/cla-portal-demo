-- Restores citizenship as a text box and the agent card phone from before mobile was included.
begin;
set local lock_timeout = '3s';

update public.task_templates t
set fields = (
  select jsonb_agg(
    case
      when elem->>'k' = 'citizenship' then (elem - 'opts' - 'keep') || jsonb_build_object('type', 'text')
      else elem
    end
    order by ord
  )
  from jsonb_array_elements(t.fields) with ordinality as x(elem, ord)
)
where jsonb_typeof(t.fields) = 'array'
  and exists (
    select 1 from jsonb_array_elements(t.fields) f
    where f->>'k' = 'citizenship' and f->>'type' = 'select'
  );

create or replace function private.rpc_my_agents(p_deal uuid default null)
returns table(agent_contact uuid, side text, first_name text, last_name text, brokerage text, cell_phone text, email text, office_phone text, photo_path text, photo_shape text, deal_ids uuid[])
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
  select c.id, case when ap.role = 'Buyer Agent' then 'buyer' else 'seller' end, coalesce(pr.first_name, c.first_name), coalesce(pr.last_name, c.last_name),
    coalesce(nullif(a.brokerage, ''), c.company), coalesce(nullif(a.cell_phone, ''), c.phone), coalesce(pr.email, c.email), coalesce(a.office_phone, ''), a.photo_path, coalesce(a.photo_shape, 'circle'), array_agg(distinct me.deal_id)
  from public.deal_participants me join public.deal_participants ap on ap.deal_id = me.deal_id and ap.role = case me.role when 'Client-Buyer' then 'Buyer Agent' else 'Listing Agent' end and ap.contact_id <> me.contact_id
  join public.contacts c on c.id = ap.contact_id left join public.profiles pr on pr.id = c.profile_id left join public.agent_profiles a on a.profile_id = c.profile_id
  where me.contact_id = private.my_contact_id() and me.role in ('Client-Buyer', 'Client-Seller') and (p_deal is null or me.deal_id = p_deal) and (pr.id is null or pr.status = 'active')
    and exists (select 1 from public.profiles x where x.id = private.effective_uid() and x.status = 'active')
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
$function$;
commit;
