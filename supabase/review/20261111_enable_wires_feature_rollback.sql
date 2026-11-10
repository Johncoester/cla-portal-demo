-- Turn the TEST wires feature back off. Does not drop tables or touch wire rows.

update private.features set enabled = false where name = 'wires';

do $$
begin
  if (select enabled from private.features where name = 'wires') is distinct from false then
    raise exception 'wires did not turn off.';
  end if;
end $$;
