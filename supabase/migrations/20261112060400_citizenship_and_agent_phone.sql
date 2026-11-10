-- Citizenship on Personal information becomes a dropdown. The stored answer "US Citizen"
-- stays valid. The agent card uses the phone already on the contact (cell, phone, or mobile).
-- One update of the template rows, and one replacement of the card query. Not applied by this commit.
begin;
set local lock_timeout = '3s';

update public.task_templates t
set fields = (
  select jsonb_agg(
    case
      when elem->>'k' = 'citizenship' then elem || jsonb_build_object(
        'type', 'select',
        'opts', jsonb_build_array('U.S. Citizen', 'Permanent Resident', 'Non-Resident Alien', 'Other', 'US Citizen')
      )
      else elem
    end
    order by ord
  )
  from jsonb_array_elements(t.fields) with ordinality as x(elem, ord)
)
where jsonb_typeof(t.fields) = 'array'
  and exists (
    select 1 from jsonb_array_elements(t.fields) f
    where f->>'k' = 'citizenship' and coalesce(f->>'type', '') is distinct from 'select'
  );

create or replace function private.rpc_my_agents(p_deal uuid default null)
returns table(agent_contact uuid, side text, first_name text, last_name text, brokerage text, cell_phone text, email text, office_phone text, photo_path text, photo_shape text, deal_ids uuid[])
language sql stable security definer
set search_path to pg_catalog, public, extensions
as $function$
  select c.id, case when ap.role = 'Buyer Agent' then 'buyer' else 'seller' end, coalesce(pr.first_name, c.first_name), coalesce(pr.last_name, c.last_name),
    coalesce(nullif(a.brokerage, ''), c.company),
    coalesce(nullif(btrim(a.cell_phone), ''), nullif(btrim(c.phone), ''), nullif(btrim(c.mobile), '')),
    coalesce(pr.email, c.email), coalesce(a.office_phone, ''), a.photo_path, coalesce(a.photo_shape, 'circle'), array_agg(distinct me.deal_id)
  from public.deal_participants me
  join public.deal_participants ap on ap.deal_id = me.deal_id
    and ap.role = case me.role when 'Client-Buyer' then 'Buyer Agent' else 'Listing Agent' end
    and ap.contact_id <> me.contact_id
  join public.contacts c on c.id = ap.contact_id
  left join public.profiles pr on pr.id = c.profile_id
  left join public.agent_profiles a on a.profile_id = c.profile_id
  where me.contact_id = private.my_contact_id()
    and me.role in ('Client-Buyer', 'Client-Seller')
    and (p_deal is null or me.deal_id = p_deal)
    and (pr.id is null or pr.status = 'active')
    and exists (select 1 from public.profiles x where x.id = private.effective_uid() and x.status = 'active')
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
$function$;

do $readback$
declare
  fields jsonb;
  src text;
begin
  select t.fields into fields
  from public.task_templates t
  where t.code = 'personal_info' and t.active
  order by t.version desc
  limit 1;
  if not exists (
    select 1 from jsonb_array_elements(fields) f
    where f->>'k' = 'citizenship'
      and f->>'type' = 'select'
      and f->'opts' ? 'U.S. Citizen'
      and f->'opts' ? 'Permanent Resident'
      and f->'opts' ? 'Non-Resident Alien'
      and f->'opts' ? 'Other'
      and f->'opts' ? 'US Citizen'
  ) then
    raise exception 'readback: citizenship is not the dropdown';
  end if;
  select p.prosrc into src from pg_proc p where p.oid = 'private.rpc_my_agents(uuid)'::regprocedure;
  if position('c.mobile' in src) = 0 or position('c.phone' in src) = 0 then
    raise exception 'readback: the agent card does not use the phone already on the contact';
  end if;
end
$readback$;
commit;
