-- Mass update appends Notes. The notes already on the row stay, then a separator,
-- the New York date and the signed-in person's name, then the new text.
-- One update of the matched ids. The author is read once, not once per row.
-- Other fields still replace. Not applied by this commit.
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
  author text;
  stamp text;
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
  if field = 'notes' then
    select case
      when btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) <> ''
        then btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      else coalesce(nullif(btrim(p.email), ''), 'CLA Title')
    end into author
    from public.profiles p where p.id = auth.uid();
    stamp := to_char(timezone('America/New_York', clock_timestamp()), 'FMMon FMDD, YYYY') || ' — ' || coalesce(author, 'CLA Title');
  end if;
  if m = 'lead' and field = 'notes' then
    update public.crm_leads set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'relationshipStatus' then update public.crm_leads set status = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'lead' and field = 'leadSource' then update public.crm_leads set source = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'contact' then
    update public.contacts set crm_notes = case when btrim(coalesce(crm_notes, '')) = '' then stamp || E'\n' || val else btrim(crm_notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now(), modified_by = auth.uid()
    where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'notes' then
    update public.crm_accounts set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'account' and field = 'kind' then update public.crm_accounts set kind = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'notes' then
    update public.crm_opportunities set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end, modified_at = now()
    where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'opportunity' and field = 'stage' then update public.crm_opportunities set stage = val, modified_at = now() where id in (select public.crm_match_ids(m, p_filter));
  elsif m = 'deal' then
    update public.deals set notes = case when btrim(coalesce(notes, '')) = '' then stamp || E'\n' || val else btrim(notes) || E'\n\n---\n' || stamp || E'\n' || val end
    where id in (select public.crm_match_ids(m, p_filter));
  else raise exception 'Unknown list.' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('count', n, 'updated', n, 'failed', 0);
end
$$;

revoke all on function public.crm_mass_update(text, jsonb, text, text) from public, anon;
grant execute on function public.crm_mass_update(text, jsonb, text, text) to authenticated;

do $readback$
declare src text;
begin
  select pg_get_functiondef('public.crm_mass_update(text, jsonb, text, text)'::regprocedure) into src;
  if position('private.' in src) > 0 then
    raise exception 'readback: mass update calls private';
  end if;
  if position('---' in src) = 0 or position('notes = val' in src) > 0 or position('crm_notes = val' in src) > 0 then
    raise exception 'readback: notes are still replaced';
  end if;
  if position('for r in' in lower(src)) > 0 then
    raise exception 'readback: notes are appended one record at a time';
  end if;
end
$readback$;
commit;
