-- Rollback for 20261117010000_mortgage_answer_length.sql: put back the 300-character cut for mortgages answers.
begin;
create or replace function private.validate_form(p_fields jsonb, p_data jsonb, p_complete boolean, p_deal uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare f jsonb; k text; typ text; v text; clean jsonb := '{}'; errs text[] := '{}'; active boolean;
begin
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    if typ = 'checkbox' then if coalesce(p_data->>k, '') in ('true', 'on') then clean := clean || jsonb_build_object(k, true); end if; continue; end if;
    if typ = 'info' then continue; end if;   -- text shown on the form, never an answer
    v := trim(coalesce(p_data->>k, ''));
    if v = '' then continue; end if;
    v := left(v, case when typ = 'textarea' then 2000 else 300 end);
    if typ = 'phone' and private.fmt_phone(v) is not null then v := private.fmt_phone(v); end if;
    if typ = 'state' then v := upper(v); end if;
    if typ in ('routing', 'account') then v := regexp_replace(v, '[\s-]', '', 'g'); end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  for f in select * from jsonb_array_elements(p_fields) loop
    k := f->>'k'; typ := f->>'type';
    active := not (k <> 'none' and clean ? 'none') and (f->'when' is null or coalesce(clean->>(f->'when'->>0) = f->'when'->>1, false));
    if typ = 'info' then continue; end if;
    if typ = 'checkbox' then
      if not active then clean := clean - k;
      elsif p_complete and coalesce((f->>'req')::boolean, false) and not (clean ? k) then errs := errs || ('Please tick: ' || (f->>'label') || '.'); end if;
      continue; end if;
    if not active then clean := clean - k; continue; end if;
    v := clean->>k;
    if v is null then if p_complete and coalesce((f->>'req')::boolean, false) then errs := errs || ((f->>'label') || ' is required.'); end if; continue; end if;
    if typ = 'select' and not (f->'opts' ? v) then errs := errs || ((f->>'label') || ': pick one of the options.');
    elsif typ = 'email' and v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then errs := errs || ((f->>'label') || ' must be a valid email.');
    elsif typ = 'phone' and v !~ '^\d{3}-\d{3}-\d{4}$' then errs := errs || ((f->>'label') || ' must be a 10-digit phone number (xxx-xxx-xxxx).');
    elsif typ = 'date' and v !~ '^\d{4}-\d{2}-\d{2}$' then errs := errs || ((f->>'label') || ' must be a date.');
    elsif typ = 'money' and replace(replace(v, '$', ''), ',', '') !~ '^\d+(\.\d+)?$' then errs := errs || ((f->>'label') || ' must be a positive amount.');
    elsif typ = 'digits4' and v !~ '^\d{4}$' then errs := errs || ((f->>'label') || ' must be exactly 4 digits.');
    elsif typ = 'routing' and not private.routing_ok(v) then errs := errs || ((f->>'label') || ' must be a valid 9-digit routing number.');
    elsif typ = 'account' and v !~ '^\d{4,17}$' then errs := errs || ((f->>'label') || ' must be 4 to 17 digits.');
    elsif typ = 'state' and v !~ '^[A-Z]{2}$' then errs := errs || ((f->>'label') || ' must be a 2-letter code (e.g. MD).');
    elsif typ = 'zip' and v !~ '^\d{5}(-\d{4})?$' then errs := errs || ((f->>'label') || ' must be a 5-digit ZIP.');
    elsif typ = 'doc' and (v !~ '^[0-9a-f-]{36}$' or not exists (select 1 from public.documents d where d.id = v::uuid and d.deal_id = p_deal)) then errs := errs || ((f->>'label') || ': upload the file again.');
    end if;
  end loop;
  if cardinality(errs) > 0 then raise exception '%', array_to_string(errs, ' ') using errcode = 'P0001'; end if;
  return clean; end $function$;
commit;
