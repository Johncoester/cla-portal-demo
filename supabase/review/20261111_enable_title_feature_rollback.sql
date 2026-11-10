-- Turn the TEST title feature back off. Does not drop tables or title rows.

update private.features set enabled = false where name = 'title';

do $$
begin
  if (select enabled from private.features where name = 'title') is distinct from false then
    raise exception 'title did not turn off.';
  end if;
end $$;
