-- Scratch stand-in. The real pg_net sends HTTP. This only lets the migration load.
create schema if not exists net;

create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 1000
) returns bigint
language sql
as $$ select 0::bigint $$;
