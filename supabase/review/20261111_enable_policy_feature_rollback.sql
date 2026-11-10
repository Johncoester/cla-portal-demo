-- Turn the TEST final-policy feature back off. Does not drop tables or policy rows.

update private.features set enabled = false where name = 'policy';

do $$
begin
  if (select enabled from private.features where name = 'policy') is distinct from false then
    raise exception 'policy did not turn off.';
  end if;
end $$;
