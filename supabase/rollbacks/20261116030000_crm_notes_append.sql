-- Restores mass update so Notes is replaced by the submitted text.
begin;
set local lock_timeout = '3s';

create or replace function public.crm_mass_update(p_module text, p_filter jsonb, p_field text, p_value text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  m text := case lower(btrim(coalesce(p_module, '')))
    when 'leads' then 'lead' when 'contacts' then 'contact' when 'clients' then 'contact'
    when 'accounts' then 'account' when 'companies' then 'account'
    when 'opportunities' then 'opportunity' when 'deals' then 'deal' else lower(btrim(coalesce(p_module, ''))) end;
  field text := btrim(coalesce(p_field, ''));
  val text := btrim(coalesce(p_value, ''));
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('Processor', 'Preprocessor')) then
    raise exception 'The Processor has read-only access to the CRM.' using errcode = '42501';
  end if;
  if val = '' then raise exception 'Enter the new value.' using errcode = '22023'; end if;
  if m = 'lead' and field not in ('notes', 'relationshipStatus', 'leadSource') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'contact' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'account' and field not in ('notes', 'kind') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'opportunity' and field not in ('notes', 'stage') then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'deal' and field <> 'notes' then raise exception 'That field cannot be changed for every selected record.' using errcode = '22023'; end if;
  if m = 'lead' and field = 'notes' then update public.crm_leads set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'relationshipStatus' then update public.crm_leads set status = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'leadSource' then update public.crm_leads set source = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'contact' then update public.contacts set crm_notes = val, modified_at = now(), modified_by = auth.uid() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'notes' then update public.crm_accounts set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'kind' then update public.crm_accounts set kind = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'notes' then update public.crm_opportunities set notes = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'stage' then update public.crm_opportunities set stage = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'deal' then update public.deals set notes = val where id in (select public.crm_match_ids(m, p_filter));
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'updated', n, 'failed', 0);
end
$$;

revoke all on function public.crm_mass_update(text, jsonb, text, text) from public, anon;
grant execute on function public.crm_mass_update(text, jsonb, text, text) to authenticated;
commit;
