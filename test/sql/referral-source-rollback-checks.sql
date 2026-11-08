-- After the rollback. Stored rows stay. New buyer/seller codes are refused again.
do $$ begin
  if to_regclass('public.deal_business_sources') is null then raise exception 'rollback dropped the table'; end if;
  if (select source from public.deal_business_sources where deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') <> 'homeowner' then
    raise exception 'rollback rewritten homeowner'; end if;
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'buyer:c1111111-1111-1111-1111-111111111112' then
    raise exception 'rollback deleted the saved buyer source'; end if;
  if private.business_source_label('buyer:c1111111-1111-1111-1111-111111111112') like 'Buyer%' then
    raise exception 'rollback still labels the new buyer code'; end if;
  begin
    perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'seller:c1111111-1111-1111-1111-111111111113');
    raise exception 'rollback still accepts a seller contact code';
  exception when sqlstate '23514' then null; end;
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'buyer:c1111111-1111-1111-1111-111111111112' then
    raise exception 'a refused seller code replaced the stored buyer'; end if;
  perform public.referral_as('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'homeowner');
  if (select source from public.deal_business_sources where deal_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') <> 'homeowner' then
    raise exception 'rollback cannot store homeowner'; end if;
end $$;
