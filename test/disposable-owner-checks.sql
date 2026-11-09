do $$
declare got uuid;
begin
  select owner_profile_id into got from public.tasks where id = 'b1111111-1111-1111-1111-111111111111';
  if got is distinct from '44444444-4444-4444-4444-444444444444' then
    raise exception 'blank owner was not filled from the matching participant, got %', got;
  end if;
  select owner_profile_id into got from public.tasks where id = 'b2222222-2222-2222-2222-222222222222';
  if got is distinct from '11111111-1111-1111-1111-111111111111' then
    raise exception 'existing owner was changed, got %', got;
  end if;
  select owner_profile_id into got from public.tasks where id = 'b3333333-3333-3333-3333-333333333333';
  if got is not null then
    raise exception 'participant on another file filled the owner, got %', got;
  end if;
  select owner_profile_id into got from public.tasks where id = 'b4444444-4444-4444-4444-444444444444';
  if got is not null then
    raise exception 'participant with no profile filled the owner, got %', got;
  end if;
  select owner_profile_id into got from public.tasks where id = 'b5555555-5555-5555-5555-555555555555';
  if got is not null then
    raise exception 'task with no participant was filled, got %', got;
  end if;
end $$;
