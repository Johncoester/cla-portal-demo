-- Turn the TEST funding feature back off. Does not drop tables or funding rows.

update private.features set enabled = false where name = 'funding';

do $$
begin
  if (select enabled from private.features where name = 'funding') is distinct from false then
    raise exception 'funding did not turn off.';
  end if;
end $$;
