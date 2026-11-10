-- FF-020: buyer questions on the existing Personal information template (version 5).
-- Answers stay in tasks.form_data and still come back from get_task_form. No new read.
-- Current address and "Will you attend the closing?" are already on version 4 and are kept.
-- Not applied by this commit.
begin;
set local lock_timeout = '3s';

do $guard$
declare
  active_version integer;
  fields jsonb;
begin
  select t.version, t.fields into active_version, fields
  from public.task_templates t
  where t.code = 'personal_info' and t.active
  order by t.version desc
  limit 1;
  if active_version is distinct from 4 then
    raise exception 'drift: active personal_info version is %', active_version;
  end if;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'entity_rep_name') then
    raise exception 'drift: personal_info v4 is missing the entity representative field';
  end if;
  if exists (select 1 from public.task_templates t where t.code = 'personal_info' and t.version = 5) then
    raise exception 'drift: personal_info version 5 already exists';
  end if;
end
$guard$;

insert into public.task_templates (
  code, version, title, description, roles, due_days, due_anchor, fields, active,
  published_at, agent_roles, client_only, lane, audiences
)
select
  t.code, 5, t.title,
  'Contact details and closing preferences, power of attorney, and whether you are buying or selling as an entity. Buyers also answer citizenship, closing plans, and Maryland questions when the property is in Maryland.',
  t.roles, t.due_days, t.due_anchor,
  t.fields || $buyer$[
    {"k":"citizenship","label":"Citizenship","type":"text","req":false,"roles":["Client-Buyer"]},
    {"k":"gender","label":"Gender","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Female","Male","Nonbinary","Prefer not to say"]},
    {"k":"date_of_birth","label":"Date of birth","type":"date","req":false,"roles":["Client-Buyer"]},
    {"k":"forwarding_address","label":"Forwarding address","type":"text","req":false,"roles":["Client-Buyer"]},
    {"k":"leaving_town","label":"Will you be leaving town before closing?","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Yes","No"]},
    {"k":"divorce","label":"Are you currently going through a divorce?","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Yes","No"]},
    {"k":"primary_residence","label":"Will the property be your primary residence?","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Yes","No"]},
    {"k":"survey","label":"Would you like to obtain a survey?","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Yes","No"]},
    {"k":"md_first_time","label":"Are you a first-time homebuyer in Maryland?","type":"select","req":false,"roles":["Client-Buyer"],"opts":["Yes","No"],"states":["MD"]}
  ]$buyer$::jsonb,
  true, now(), t.agent_roles, t.client_only, t.lane, t.audiences
from public.task_templates t
where t.code = 'personal_info' and t.version = 4;

update public.task_templates set active = false where code = 'personal_info' and version <> 5;

update public.tasks task
set template_id = nxt.id, template_version = nxt.version, title = nxt.title, description = nxt.description
from public.task_templates nxt
where nxt.code = 'personal_info' and nxt.version = 5
  and task.template_code = 'personal_info'
  and task.kind = 'form'
  and task.status = 'todo'
  and task.saved_at is null
  and coalesce(task.form_data, '{}'::jsonb) = '{}'::jsonb
  and task.template_version < 5;

do $readback$
declare
  fields jsonb;
begin
  select t.fields into fields from public.task_templates t where t.code = 'personal_info' and t.active;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'citizenship' and f->'roles' ? 'Client-Buyer') then
    raise exception 'readback: citizenship is not a buyer field';
  end if;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'md_first_time' and f->'states' ? 'MD') then
    raise exception 'readback: the Maryland question is not limited to MD';
  end if;
  if not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'current_address')
     or not exists (select 1 from jsonb_array_elements(fields) f where f->>'k' = 'attending_closing') then
    raise exception 'readback: the existing address or closing question was dropped';
  end if;
  if exists (select 1 from jsonb_array_elements(fields) f where f->>'k' ~* 'ssn|spouse') then
    raise exception 'readback: SSN or spouse match was added';
  end if;
end
$readback$;
commit;
