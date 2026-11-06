-- Task template settings are Admin and Super admin only (John, Nov 6).
-- set_template_agent_roles used to allow a Processor (and, through is_processor, a Preprocessor).
-- Publishing a version, task switches, and task admin were already Admin-only.
-- Does not create or alter anything in schema auth. Not applied on TEST by this change.
-- Reading task_templates stays available to managers: order task forms still load their fields.

create or replace function public.set_template_agent_roles(p_code text, p_roles text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare clean text[] := array(select distinct r from unnest(coalesce(p_roles, '{}')) r order by r); tid uuid; title text;
begin
  if not private.is_admin() then raise exception 'Only an Admin or Super admin can change who may complete a task.' using errcode = 'P0001'; end if;
  if not clean <@ array['Buyer Agent', 'Listing Agent']::text[] then raise exception 'Only Buyer Agent or Listing Agent can be allowed.' using errcode = 'P0001'; end if;
  select id, task_templates.title into tid, title from public.task_templates where code = p_code order by version desc limit 1;
  if tid is null then raise exception 'Template not found.' using errcode = 'P0001'; end if;
  update public.task_templates set agent_roles = clean where code = p_code;
  perform private.log_activity(null, 'template.delegation', 'template', tid, title || ': agents who may complete it for their client: ' || coalesce(nullif(array_to_string(clean, ', '), ''), 'none'));
  return clean; end $$;
revoke all on function public.set_template_agent_roles(text, text[]) from public, anon;
grant execute on function public.set_template_agent_roles(text, text[]) to authenticated;

select private.lock_function_search_paths();
