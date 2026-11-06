-- An order may be saved with no Processor (John, Nov 6). Unassigned is null, not a placeholder person.
-- A Processor who places an order is not assigned to it automatically.
-- A non-null Processor must still be an active Processor, Preprocessor, Admin or Super admin
-- in the same real/demo world as the order. Does not create or alter anything in schema auth.

create or replace function private.deal_processor_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.processor_id is null then return new; end if;
  if tg_op = 'INSERT' or new.processor_id is distinct from old.processor_id then
    if not exists (select 1 from public.profiles p where p.id = new.processor_id and p.status = 'active'
       and p.role in ('Processor', 'Preprocessor', 'Admin', 'Super admin')
       and p.is_demo is not distinct from coalesce(new.is_demo, false)) then
      raise exception 'The Processor on an order must be an active Processor, Preprocessor, Admin or Super admin.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

select private.lock_function_search_paths();
